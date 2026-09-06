// dsh-preset-editor 核心逻辑
// 负责数据规范化、持久化存储以及与 DSH 官方 Agent 预设系统（~/.dsh/.agent-presets/<id>/）的深度集成
// 核心原则：以文件系统中真实存在的预设目录为唯一真源（Single Source of Truth），实现跨平台、跨环境双向同步

import { promises as fsp } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
function parseSimpleYaml(content) {
  const result = {};
  if (typeof content !== "string") return result;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}
import { AVAILABLE_TOOLS, getDefaultToolIds, generateCordisYaml } from "./tools.js";

export const VALID_ROLES = ["system", "user", "assistant"];
export const DOC_VERSION = 1;

/**
 * 获取跨平台的 DSH 主目录路径
 */
export function findDshHome() {
  const env = process.env.DSH_HOME;
  if (env && env.trim()) return path.resolve(env.trim());
  return path.resolve(os.homedir(), ".dsh");
}

/**
 * 获取官方用户自定义预设根目录（自适应不同平台、容器与部署配置）
 */
export function agentPresetsRootDir(ctx) {
  // 1. 优先从官方宿主 agentPresets 服务中获取 user root 配置
  try {
    const ap = ctx?.get?.("agentPresets");
    if (ap?.resolvedRoots && Array.isArray(ap.resolvedRoots)) {
      const userRoot = ap.resolvedRoots.find((r) => r.trust === "user");
      if (userRoot?.path) {
        return path.resolve(userRoot.path);
      }
    }
  } catch {}

  // 2. 标准自适应回退：DSH_HOME/.agent-presets 或 $HOME/.dsh/.agent-presets
  return path.resolve(findDshHome(), ".agent-presets");
}

export function agentPresetDir(presetId, ctx) {
  return path.join(agentPresetsRootDir(ctx), presetId);
}

export function storePath() {
  return path.join(findDshHome(), "preset-editor.json");
}

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

  // 严格规则：顶级必须有一个 system 为启用状态
  if (entries.length === 0) {
    entries.push({
      id: randomUUID(),
      role: "system",
      text: "",
      enabled: true,
    });
  } else {
    // 顶级第一条强制为启用的 system
    entries[0] = {
      ...entries[0],
      role: "system",
      enabled: true,
    };
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

  return {
    version: DOC_VERSION,
    presets,
  };
}

/**
 * 同步单个自定义预设到预设文件夹：
 * 1. preset.yml (官方元数据)
 * 2. agent.cordis.yml (官方插件组合)
 * 3. preset.editor.json (本插件自包含的消息条目与工具配置)
 */
export async function syncPresetToAgentPreset(preset, ctx) {
  const targetDir = agentPresetDir(preset.id, ctx);
  await fsp.mkdir(targetDir, { recursive: true });

  // 1. 生成 preset.yml (官方元数据)
  const presetYmlContent = [
    `name: ${JSON.stringify(preset.name)}`,
    `description: ${JSON.stringify(preset.description || "")}`,
  ].join("\n") + "\n";
  await fsp.writeFile(path.join(targetDir, "preset.yml"), presetYmlContent, "utf8");

  // 2. 生成 agent.cordis.yml (Cordis 插件组合)
  const cordisYamlContent = generateCordisYaml(preset.enabledTools);
  await fsp.writeFile(path.join(targetDir, "agent.cordis.yml"), cordisYamlContent, "utf8");

  // 3. 在预设目录内写入自包含配置 preset.editor.json (文件夹即预设，便于跨系统迁移与同步)
  await fsp.writeFile(
    path.join(targetDir, "preset.editor.json"),
    JSON.stringify(preset, null, 2),
    "utf8",
  );
}

/**
 * 删除预设目录（递归物理删除）
 */
export async function removeAgentPresetDir(presetId, ctx) {
  const targetDir = agentPresetDir(presetId, ctx);
  try {
    await fsp.rm(targetDir, { recursive: true, force: true });
  } catch {}
}

/**
 * 核心双向同步引擎：以真实文件系统目录为真源
 * 1. 物理目录已被删除的项，立即自动从缓存中清除；
 * 2. 物理目录真实存在但尚未在缓存中的项（如在官方界面复制新建的预设），自动发现并吸纳。
 */
export function loadPresetsDoc(ctx) {
  const rootDir = agentPresetsRootDir(ctx);
  const cachePath = storePath();

  // 读取已有的缓存文档
  let cachedPresets = {};
  try {
    if (fs.existsSync(cachePath)) {
      const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      cachedPresets = (parsed && typeof parsed.presets === "object") ? parsed.presets : {};
    }
  } catch {}

  // 扫描物理目录中真实存在的自定义预设文件夹
  const existingDirs = new Set();
  try {
    if (fs.existsSync(rootDir)) {
      const dirEntries = fs.readdirSync(rootDir, { withFileTypes: true });
      for (const ent of dirEntries) {
        if (ent.isDirectory() && /^[a-z0-9][a-z0-9-]*$/.test(ent.name)) {
          existingDirs.add(ent.name);
        }
      }
    } else {
      fs.mkdirSync(rootDir, { recursive: true });
    }
  } catch (err) {
    console.warn("[dsh-preset-editor] readdir rootDir failed:", err);
  }

  const syncedPresets = {};

  // 遍历所有物理存在的预设目录
  for (const presetId of existingDirs) {
    const pDir = path.join(rootDir, presetId);
    const editorConfigPath = path.join(pDir, "preset.editor.json");
    const presetYmlPath = path.join(pDir, "preset.yml");

    let presetData = null;

    // 优先读取目录自包含的 preset.editor.json
    if (fs.existsSync(editorConfigPath)) {
      try {
        presetData = JSON.parse(fs.readFileSync(editorConfigPath, "utf8"));
      } catch {}
    }

    // 其次看缓存中是否有该项记录
    if (!presetData && cachedPresets[presetId]) {
      presetData = cachedPresets[presetId];
    }

    // 检查官方 preset.yml 中的最新名称与描述（以官方界面的改动为准）
    let officialName = "";
    let officialDesc = "";
    if (fs.existsSync(presetYmlPath)) {
      try {
        const ymlContent = fs.readFileSync(presetYmlPath, "utf8");
        const parsedYml = parseSimpleYaml(ymlContent);
        if (parsedYml && typeof parsedYml === "object") {
          officialName = typeof parsedYml.name === "string" ? parsedYml.name : "";
          officialDesc = typeof parsedYml.description === "string" ? parsedYml.description : "";
        }
      } catch {}
    }

    if (presetData) {
      if (officialName) presetData.name = officialName;
      if (officialDesc !== undefined) presetData.description = officialDesc;
    } else {
      // 物理存在但无 editor 配置（外部创建或官方复制），自动创建标准纳管配置
      presetData = {
        id: presetId,
        name: officialName || presetId,
        description: officialDesc || "",
        enabledTools: getDefaultToolIds(),
        entries: [
          { id: randomUUID(), role: "system", text: "", enabled: true },
          { id: randomUUID(), role: "user", text: "", enabled: true },
          { id: randomUUID(), role: "assistant", text: "", enabled: true },
        ],
      };
    }

    try {
      const normalized = normalizePreset(presetData, presetId);
      syncedPresets[normalized.id] = normalized;

      // 异步补齐该目录下的自包含文件
      if (!fs.existsSync(editorConfigPath)) {
        fsp.writeFile(editorConfigPath, JSON.stringify(normalized, null, 2), "utf8").catch(() => {});
      }
    } catch {}
  }

  // 此时：任何在 cachedPresets 中存在但不在 existingDirs 中的预设，均已被自然剔除（同步了官方删除）！
  const finalDoc = {
    version: DOC_VERSION,
    presets: syncedPresets,
  };

  // 保持全局索引缓存写回
  fsp.mkdir(path.dirname(cachePath), { recursive: true }).then(() => {
    fsp.writeFile(cachePath, JSON.stringify(finalDoc, null, 2), "utf8").catch(() => {});
  }).catch(() => {});

  return finalDoc;
}

/**
 * 保存全部文档并同步到文件系统
 */
export async function savePresetsDoc(rawDoc, ctx) {
  const doc = normalizeDoc(rawDoc);
  const fp = storePath();
  await fsp.mkdir(path.dirname(fp), { recursive: true });

  // 临时文件原子写入全局缓存
  const tmp = `${fp}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(doc, null, 2), "utf8");
  await fsp.rename(tmp, fp);

  // 同步每个预设到独立目录中
  for (const preset of Object.values(doc.presets)) {
    await syncPresetToAgentPreset(preset, ctx).catch((err) => {
      console.warn(`[dsh-preset-editor] sync preset ${preset.id} failed:`, err);
    });
  }

  return doc;
}

/**
 * 保存或更新单个预设
 */
export async function savePreset(presetData, ctx) {
  const norm = normalizePreset(presetData);
  // 1. 同步写入该预设的物理目录
  await syncPresetToAgentPreset(norm, ctx);

  // 2. 重新扫描同步完整文档
  const doc = loadPresetsDoc(ctx);
  return { doc, preset: norm };
}

/**
 * 删除单个预设
 */
export async function deletePreset(presetId, ctx) {
  // 1. 物理删除预设文件夹
  await removeAgentPresetDir(presetId, ctx);

  // 2. 重新扫描同步，文件夹没了自然就从文档中消失
  return loadPresetsDoc(ctx);
}

/**
 * 导出单个预设
 */
export function exportPreset(presetId, ctx) {
  const doc = loadPresetsDoc(ctx);
  return doc.presets[presetId] || null;
}

/**
 * 导入预设（支持单预设对象或包含 presets 的多预设对象）
 */
export async function importPresetData(data, ctx) {
  if (!data || typeof data !== "object") {
    throw new Error("导入的数据不是有效的 JSON 对象");
  }

  const doc = loadPresetsDoc(ctx);

  if (data.presets && typeof data.presets === "object") {
    for (const [key, p] of Object.entries(data.presets)) {
      try {
        const norm = normalizePreset({ ...p, id: p?.id || key }, key);
        await syncPresetToAgentPreset(norm, ctx);
      } catch {}
    }
  } else if (data.entries && Array.isArray(data.entries)) {
    const norm = normalizePreset(data);
    await syncPresetToAgentPreset(norm, ctx);
  } else {
    throw new Error("未识别的预设文件格式，需包含 entries 消息数组或 presets 对象");
  }

  return loadPresetsDoc(ctx);
}
