// dsh-preset-editor 核心逻辑
// 负责数据规范化、持久化存储以及与 DSH 官方 Agent 预设系统（~/.dsh/.agent-presets/<id>/）的深度集成

import { promises as fsp } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { AVAILABLE_TOOLS, getDefaultToolIds, generateCordisYaml } from "./tools.js";

export function findDshHome() {
  const env = process.env.DSH_HOME;
  if (env && env.trim()) return path.normalize(env.trim());
  return path.join(os.homedir(), ".dsh");
}

export function agentPresetsRootDir() {
  return path.join(findDshHome(), ".agent-presets");
}

export function agentPresetDir(presetId) {
  return path.join(agentPresetsRootDir(), presetId);
}

export function storePath() {
  return path.join(findDshHome(), "preset-editor.json");
}

export const VALID_ROLES = ["system", "user", "assistant"];
export const DOC_VERSION = 1;

const BUILTIN_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "presets");

/**
 * 规范化单个 entry：role 必须是 system | user | assistant
 */
export function normalizeEntry(entry, index) {
  const role = String(entry?.role ?? "").toLowerCase();
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`第 ${index + 1} 条消息的角色必须是 system、user 或 assistant（当前是 ${JSON.stringify(role)}）`);
  }
  return {
    id: typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : randomUUID(),
    role,
    text: typeof entry?.text === "string" ? entry.text : "",
    enabled: entry?.enabled !== false,
  };
}

/**
 * 校验预设 ID（小写字母、数字、短横线，必须以字母数字开头）
 */
export function validatePresetId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("预设 ID 不能为空");
  }
  const clean = id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(clean)) {
    throw new Error("预设 ID 只能包含小写字母、数字和连字符，且必须以字母或数字开头");
  }
  return clean;
}

/**
 * 规范化单个预设对象
 */
export function normalizePreset(preset, fallbackId = "custom-preset") {
  const id = validatePresetId(preset?.id || fallbackId);
  const name = typeof preset?.name === "string" && preset.name.trim()
    ? preset.name.trim()
    : id;
  const description = typeof preset?.description === "string" ? preset.description.trim() : "";

  const enabledTools = Array.isArray(preset?.enabledTools)
    ? preset.enabledTools.filter((t) => typeof t === "string" && t !== "tool-cordis")
    : getDefaultToolIds();

  const rawEntries = Array.isArray(preset?.entries) ? preset.entries : [];
  const entries = rawEntries.map((e, i) => normalizeEntry(e, i));

  // 如果条目为空，默认给一条 system 提示词
  if (entries.length === 0) {
    entries.push({
      id: randomUUID(),
      role: "system",
      text: "You are a helpful coding assistant.",
      enabled: true,
    });
  }

  return {
    id,
    name,
    description,
    enabledTools,
    entries,
  };
}

/**
 * 规范化完整文档对象
 */
export function normalizeDoc(rawDoc) {
  const presetsRaw = rawDoc?.presets && typeof rawDoc.presets === "object" ? rawDoc.presets : {};
  const presets = {};

  for (const [key, p] of Object.entries(presetsRaw)) {
    try {
      const norm = normalizePreset({ ...p, id: p?.id || key }, key);
      presets[norm.id] = norm;
    } catch {
      // 跳过损坏项
    }
  }

  if (Object.keys(presets).length === 0) {
    const builtin = loadDefaultBuiltin();
    if (builtin) {
      presets[builtin.id] = builtin;
    }
  }

  return {
    version: DOC_VERSION,
    presets,
  };
}

/**
 * 读取内置默认预设
 */
export function loadDefaultBuiltin() {
  const defaultFile = path.join(BUILTIN_DIR, "default.json");
  try {
    if (fs.existsSync(defaultFile)) {
      const parsed = JSON.parse(fs.readFileSync(defaultFile, "utf8"));
      return normalizePreset(parsed, "custom-assistant");
    }
  } catch {}
  return {
    id: "custom-assistant",
    name: "智能助手预设",
    description: "自定义智能助手预设，包含系统设定与示例问答结构。",
    enabledTools: getDefaultToolIds(),
    entries: [
      { id: randomUUID(), role: "system", text: "你是一个严谨、专业且高效的智能助手。", enabled: true },
      { id: randomUUID(), role: "user", text: "请以最高标准回答问题，先分析后执行。", enabled: true },
      { id: randomUUID(), role: "assistant", text: "明白，我将始终坚持清晰的逻辑分析为您提供方案。", enabled: true },
    ],
  };
}

/**
 * 同步单个自定义预设到 ~/.dsh/.agent-presets/<id>/
 * 生成 preset.yml 和 agent.cordis.yml，使其完全符合官方自定义预设规范
 */
export async function syncPresetToAgentPreset(preset) {
  const targetDir = agentPresetDir(preset.id);
  await fsp.mkdir(targetDir, { recursive: true });

  // 1. 生成 preset.yml (元数据)
  const presetYmlContent = [
    `name: ${JSON.stringify(preset.name)}`,
    `description: ${JSON.stringify(preset.description || "")}`,
  ].join("\n") + "\n";
  await fsp.writeFile(path.join(targetDir, "preset.yml"), presetYmlContent, "utf8");

  // 2. 生成 agent.cordis.yml (Cordis 插件组合)
  const cordisYamlContent = generateCordisYaml(preset.enabledTools);
  await fsp.writeFile(path.join(targetDir, "agent.cordis.yml"), cordisYamlContent, "utf8");
}

/**
 * 删除 ~/.dsh/.agent-presets/<id>/ 目录
 */
export async function removeAgentPresetDir(presetId) {
  const targetDir = agentPresetDir(presetId);
  try {
    await fsp.rm(targetDir, { recursive: true, force: true });
  } catch {}
}

/**
 * 读取所有预设文档
 */
export function loadPresetsDoc() {
  const fp = storePath();
  try {
    if (fs.existsSync(fp)) {
      const parsed = JSON.parse(fs.readFileSync(fp, "utf8"));
      return normalizeDoc(parsed);
    }
  } catch {}

  // 不存在或损坏，走默认初始化
  const doc = normalizeDoc({});
  // 首次写回并同步
  fsp.mkdir(path.dirname(fp), { recursive: true }).then(async () => {
    await fsp.writeFile(fp, JSON.stringify(doc, null, 2), "utf8");
    for (const p of Object.values(doc.presets)) {
      await syncPresetToAgentPreset(p).catch(() => {});
    }
  }).catch(() => {});

  return doc;
}

/**
 * 保存全部文档并同步到文件系统
 */
export async function savePresetsDoc(rawDoc) {
  const doc = normalizeDoc(rawDoc);
  const fp = storePath();
  await fsp.mkdir(path.dirname(fp), { recursive: true });

  // 临时文件原子写入
  const tmp = `${fp}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
  await fsp.rename(tmp, fp);

  // 同步每个预设到 .agent-presets/<id>/
  for (const preset of Object.values(doc.presets)) {
    await syncPresetToAgentPreset(preset).catch((err) => {
      console.warn(`[dsh-preset-editor] sync preset ${preset.id} failed:`, err);
    });
  }

  return doc;
}

/**
 * 保存或更新单个预设
 */
export async function savePreset(presetData) {
  const norm = normalizePreset(presetData);
  const doc = loadPresetsDoc();
  doc.presets[norm.id] = norm;

  await savePresetsDoc(doc);
  return { doc, preset: norm };
}

/**
 * 删除单个预设
 */
export async function deletePreset(presetId) {
  const doc = loadPresetsDoc();
  if (doc.presets[presetId]) {
    delete doc.presets[presetId];
    await savePresetsDoc(doc);
    await removeAgentPresetDir(presetId);
  }
  return doc;
}

/**
 * 导出单个预设
 */
export function exportPreset(presetId) {
  const doc = loadPresetsDoc();
  return doc.presets[presetId] || null;
}

/**
 * 导入预设（支持单预设对象或包含 presets 的多预设对象）
 */
export async function importPresetData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("导入的数据不是有效的 JSON 对象");
  }

  const doc = loadPresetsDoc();

  // 判断是单个预设还是多预设文档
  if (data.presets && typeof data.presets === "object") {
    // 多预设结构
    for (const [key, p] of Object.entries(data.presets)) {
      try {
        const norm = normalizePreset({ ...p, id: p?.id || key }, key);
        doc.presets[norm.id] = norm;
      } catch {}
    }
  } else if (data.entries && Array.isArray(data.entries)) {
    // 单预设结构
    const norm = normalizePreset(data);
    doc.presets[norm.id] = norm;
  } else {
    throw new Error("未识别的预设文件格式，需包含 entries 消息数组或 presets 对象");
  }

  await savePresetsDoc(doc);
  return doc;
}
