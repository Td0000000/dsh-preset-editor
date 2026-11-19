// dsh-preset-editor 核心逻辑（DSH 0.2.x）
//
// 0.1.x 的“目录即预设”模型（$DSH_HOME/.agent-presets/<id>/ + preset.yml + agent.cordis.yml）
// 在 0.2 已被官方移除：注册表不扫描任何目录。现在的唯一真源是本插件自己的
// 存储文件，预设通过官方 agentPresets.register() 声明并挂载，因此会直接出现在
// 官方的「自定义预设」名册与右上角预设选择器中。
//
// 存储：<DSH_HOME>/preset-editor.json
// 声明：{ id, name, description, order, plugins: [...] }
//   - system 条目  -> @deepseek-ai/dsh-persona 的 prefix（预设自身的隔离域，天然只对该预设生效）
//   - user/assistant 条目 -> 由 lib/index.js 在运行时按会话注入
//   - 工具条目 -> lib/tools.js 生成的官方插件行
//
// 0.2.2-rc.1 核对结论：本文件的存储格式与声明结构（id/name/description/order/plugins）
// 无需变化；变化集中在 lib/tools.js 的工具行（子代理包结构、插件管理工具行）。

import { promises as fsp } from "node:fs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AVAILABLE_TOOLS, getDefaultToolIds, buildToolRows } from "./tools.js";

export const VALID_ROLES = ["system", "user", "assistant"];
// v3：新增 projectDefaults（按项目文件夹指定默认预设）。v2 文档读入时自动补默认值。
export const DOC_VERSION = 3;

// DSH 0.2.x 的模板变量由核心 agent loop 注册（0.2.2-rc.1 仍只注册 provider / model）；
// 自定义 persona/preset 只能可靠使用下面两个。工作目录、时间、沙箱/审批策略等由
// “运行时上下文”自动注入，不是 {{}} 变量。
export const SUPPORTED_TEMPLATE_VARIABLES = ["model", "provider"];
const TEMPLATE_GROUP_RE = /\{\{([^{}]*)\}\}/g;

/** 找出 text 里不被 DSH 核心支持的模板变量引用（只用于会走 persona 插值的 system 文本）。 */
export function findUnsupportedTemplateVariables(text) {
  const found = new Set();
  if (typeof text !== "string" || text.length === 0) return [];
  for (const match of text.matchAll(TEMPLATE_GROUP_RE)) {
    const raw = String(match[1] ?? "");
    // DSH 要求变量名精确匹配 ^[a-z][a-z0-9_]*$：带空格、带大写都算格式错误。
    if (!/^[a-z][a-z0-9_]*$/.test(raw) || !SUPPORTED_TEMPLATE_VARIABLES.includes(raw)) {
      found.add(match[0]);
    }
  }
  return [...found];
}

/** 保存/导入前校验 system 条目：未知模板变量会让 DSH 组装提示词时直接抛错、整预设不可用。 */
export function assertSupportedTemplateVariables(preset) {
  for (const entry of preset?.entries || []) {
    if (entry?.role !== "system" || entry?.enabled === false) continue;
    const bad = findUnsupportedTemplateVariables(entry.text);
    if (bad.length > 0) {
      throw new Error(
        `system 提示词里包含不支持的模板变量 ${bad.join("、")}。` +
          "DSH 0.2 只支持 {{model}}、{{provider}}；当前工作目录、时间、沙箱与审批策略由系统自动注入，" +
          "不需要模板变量，请删掉这些占位符。",
      );
    }
  }
}

/** 跨平台的 DSH 主目录。 */
export function findDshHome() {
  const env = process.env.DSH_HOME;
  if (env && env.trim()) return path.resolve(env.trim());
  return path.resolve(os.homedir(), ".dsh");
}

/** 本插件的存储文件（唯一真源）。 */
export function storePath() {
  return path.join(findDshHome(), "preset-editor.json");
}

/** 0.1.x 遗留的预设目录，仅用于一次性迁移与展示。 */
export function legacyPresetsRootDir() {
  return path.join(findDshHome(), ".agent-presets");
}

function parseSimpleYaml(content) {
  const result = {};
  if (typeof content !== "string") return result;
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (match) {
      let val = match[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[match[1]] = val;
    }
  }
  return result;
}

/** 规范化单个 entry：role 必须是 system | user | assistant。 */
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

/** 校验预设 ID（小写字母、数字、短横线，必须以字母数字开头）。 */
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
 * 规范化预设的默认模型绑定（可缺省）。
 * 形状：{ provider, model, reasoningEffort? }；provider/model 必填，effort 可选。
 * 只做形状校验，不在这里校验模型是否仍在上游目录里（运行时应用前会再校验）。
 */
export function normalizePresetModel(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  const provider = typeof raw.provider === "string" ? raw.provider.trim() : "";
  const model = typeof raw.model === "string" ? raw.model.trim() : "";
  if (!provider || !model) return undefined;
  const effort = typeof raw.reasoningEffort === "string" ? raw.reasoningEffort.trim() : "";
  return {
    provider,
    model,
    ...(effort ? { reasoningEffort: effort } : {}),
  };
}

/** 规范化单个预设对象。 */
export function normalizePreset(preset, fallbackId = "custom-preset") {
  const id = validatePresetId(preset?.id || fallbackId);
  const name =
    typeof preset?.name === "string" && preset.name.trim() ? preset.name.trim() : id;
  const description = typeof preset?.description === "string" ? preset.description.trim() : "";

  const enabledTools = Array.isArray(preset?.enabledTools)
    ? preset.enabledTools.filter((t) => typeof t === "string" && t !== "tool-cordis")
    : getDefaultToolIds();

  const rawEntries = Array.isArray(preset?.entries) ? preset.entries : [];
  const entries = rawEntries.map((e, i) => normalizeEntry(e, i));

  // 严格规则：顶级第一条必须是启用的 system 消息
  if (entries.length === 0) {
    entries.push({ id: randomUUID(), role: "system", text: "", enabled: true });
  } else {
    entries[0] = { ...entries[0], role: "system", enabled: true };
  }

  const model = normalizePresetModel(preset?.model);

  return {
    id,
    name,
    description,
    order: Number.isFinite(preset?.order) ? preset.order : 100,
    enabledTools,
    entries,
    ...(model ? { model } : {}),
  };
}

/** 官方内置预设 ID：agentPresets.register() 对重复 ID 直接抛错，编辑器必须提前拦截。 */
export const RESERVED_PRESET_IDS = new Set(["standard", "ptc", "minimal", "cordis"]);

/** 保存/导入前校验预设 ID 不与官方内置预设冲突。 */
export function assertPresetIdAvailable(id) {
  if (RESERVED_PRESET_IDS.has(id)) {
    throw new Error(`预设 ID "${id}" 与官方内置预设冲突，请换一个 ID（如 "${id}-my"）`);
  }
}

// ── 项目文件夹默认预设（project defaults） ──────────────────────────────────
//
// 数据形状：
//   projectDefaults: {
//     enabled: boolean,                  // 功能总开关（默认关闭，绝不碰 DSH 官方默认预设）
//     rules: [{ id, path, presetId, enabled }]
//   }
// 匹配语义：会话的 SessionHeader.cwd 与规则 path 完全一致（Windows 不区分大小写）。
// 优先级：用户在新会话里手选的预设 > 文件夹规则 > DSH 官方默认预设。
// 本字段只影响“会话创建后、开第一轮之前”的默认选择，不改写 DSH 自己的
// agent-preset-registry 配置，因此不会与官方默认预设冲突。

/** 校验并规范化单个项目目录：必须是绝对路径。 */
export function normalizeProjectPath(raw) {
  const value0 = typeof raw === "string" ? raw.trim() : "";
  if (!value0) throw new Error("项目文件夹路径不能为空");
  let value = value0;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1).trim();
  }
  if (value === "~" || value.startsWith("~/") || value.startsWith("~\\")) {
    value = path.join(os.homedir(), value.slice(1));
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`项目文件夹必须填写绝对路径（当前是 ${JSON.stringify(value0)}）`);
  }
  return path.resolve(value);
}

/** 路径比较键：Windows 下不区分大小写，并去掉末尾分隔符。 */
export function projectPathKey(raw) {
  let key = path.resolve(String(raw));
  key = key.replace(/[\\/]+$/, "");
  if (process.platform === "win32") key = key.toLowerCase();
  return key;
}

/** 规范化单条规则；非法时抛错。 */
export function normalizeProjectRule(rule, index = 0) {
  const rulePath = normalizeProjectPath(rule?.path);
  const presetId = typeof rule?.presetId === "string" ? rule.presetId.trim() : "";
  if (!presetId) throw new Error(`第 ${index + 1} 条规则缺少预设 ID`);
  const id =
    typeof rule?.id === "string" && rule.id.trim()
      ? rule.id.trim()
      : `pd-${randomUUID()}`;
  return {
    id,
    path: rulePath,
    presetId,
    enabled: rule?.enabled !== false,
    // 是否把该文件夹下的所有子文件夹也纳入匹配（默认开启）
    subfolders: rule?.subfolders !== false,
  };
}

/** 宽松规范化 projectDefaults（读盘时使用：坏规则跳过，不影响其它规则）。 */
export function normalizeProjectDefaults(raw) {
  const enabled = raw?.enabled === true;
  const rules = [];
  const seen = new Set();
  const rawRules = Array.isArray(raw?.rules) ? raw.rules : [];
  for (let index = 0; index < rawRules.length; index += 1) {
    let rule;
    try {
      rule = normalizeProjectRule(rawRules[index], index);
    } catch (error) {
      console.warn(`[dsh-preset-editor] skip invalid project rule #${index + 1}:`, error);
      continue;
    }
    const key = projectPathKey(rule.path);
    if (seen.has(key)) {
      console.warn(`[dsh-preset-editor] skip duplicate project rule for ${rule.path}`);
      continue;
    }
    seen.add(key);
    rules.push(rule);
  }
  return { enabled, rules };
}

/** 严格校验待保存的 projectDefaults：任何一条规则非法都报错，不静默丢数据。 */
export function assertProjectDefaults(raw) {
  if (raw !== undefined && raw !== null && typeof raw !== "object") {
    throw new Error("projectDefaults 必须是对象");
  }
  const rawRules = Array.isArray(raw?.rules) ? raw.rules : [];
  const seen = new Set();
  const rules = [];
  for (let index = 0; index < rawRules.length; index += 1) {
    const rule = normalizeProjectRule(rawRules[index], index);
    const key = projectPathKey(rule.path);
    if (seen.has(key)) {
      throw new Error(`项目文件夹重复：${rule.path}（同一个目录只能配置一条规则）`);
    }
    seen.add(key);
    rules.push(rule);
  }
  return { enabled: raw?.enabled === true, rules };
}

/**
 * 找出会话目录命中的规则。
 *
 * 匹配范围：会话目录等于规则目录，**或位于规则目录之下**（子文件夹继承）。
 * 多条规则同时命中时取路径最长（最具体）的那条，例如：
 *   - 规则 AiWork → pi-spider，规则 AiWork\项目A → test-a；
 *   - 会话 AiWork\项目A\子目录 → 命中 AiWork\项目A（更长）。
 *
 * @returns {object|undefined} 命中的规则（原始对象，含 enabled/presetId 等）
 */
export function findProjectRule(projectDefaults, cwd) {
  if (!projectDefaults || !Array.isArray(projectDefaults.rules) || projectDefaults.rules.length === 0) {
    return undefined;
  }
  if (typeof cwd !== "string" || !cwd.trim()) return undefined;
  let key;
  try {
    key = projectPathKey(cwd);
  } catch {
    return undefined;
  }
  let best;
  let bestLength = -1;
  for (const rule of projectDefaults.rules) {
    if (!rule || rule.enabled === false) continue;
    let ruleKey;
    try {
      ruleKey = projectPathKey(rule.path);
    } catch {
      continue;
    }
    if (!ruleKey) continue;
    const inside =
      key === ruleKey ||
      (rule.subfolders !== false &&
        (key.startsWith(ruleKey + path.sep) || key.startsWith(ruleKey + "/")));
    if (inside && ruleKey.length > bestLength) {
      best = rule;
      bestLength = ruleKey.length;
    }
  }
  return best;
}

/** 规范化完整文档对象。 */
export function normalizeDoc(rawDoc) {
  const presetsRaw = rawDoc?.presets && typeof rawDoc.presets === "object" ? rawDoc.presets : {};
  const presets = {};
  for (const [key, p] of Object.entries(presetsRaw)) {
    try {
      const norm = normalizePreset({ ...p, id: p?.id || key }, key);
      presets[norm.id] = norm;
    } catch {
      // 跳过损坏项（由 collectInvalidPresets 收集，写入时原样保留）
    }
  }
  return {
    version: DOC_VERSION,
    presets,
    // 任意预设（含官方内置）的默认模型绑定：{ [presetId]: { provider, model, reasoningEffort? } }
    presetModels: normalizePresetModels(rawDoc?.presetModels),
    projectDefaults: normalizeProjectDefaults(rawDoc?.projectDefaults),
    // 无法规范化、但必须原样写回的条目：[{ key, error, raw }]
    invalidPresets: Array.isArray(rawDoc?.invalidPresets) ? rawDoc.invalidPresets : [],
  };
}

/** 规范化 presetModels 映射（读盘时使用：坏项跳过）。 */
export function normalizePresetModels(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [presetId, value] of Object.entries(raw)) {
    if (typeof presetId !== "string" || !presetId.trim()) continue;
    const binding = normalizePresetModel(value);
    if (binding) out[presetId.trim()] = binding;
  }
  return out;
}

/**
 * 取一个预设（自定义或官方）生效的默认模型绑定。
 * 自定义预设自身 `model` 优先；否则看 `presetModels[presetId]`。
 */
export function findPresetModelBinding(doc, presetId) {
  if (!presetId || typeof presetId !== "string") return undefined;
  const custom = normalizePresetModel(doc?.presets?.[presetId]?.model);
  if (custom) return custom;
  return normalizePresetModel(doc?.presetModels?.[presetId]);
}

/**
 * 保存/清除某个预设的默认模型绑定。
 *
 * - 自定义预设：写回预设对象自己的 `model` 字段（与预设编辑页一致）；
 * - 官方内置预设：官方定义只读，写到文档级 `presetModels[presetId]`。
 * 同一预设不会同时存在两种绑定；写自定义预设时会清掉 presetModels 里的旧值。
 *
 * @param {string} presetId
 * @param {object|null} rawModel - { provider, model, reasoningEffort? } 或 null 清除
 * @param {{ isPresetAvailable?: (id: string) => boolean }} [options]
 */
export async function savePresetModel(presetId, rawModel, options = {}) {
  const id = typeof presetId === "string" ? presetId.trim() : "";
  if (!id) throw new Error("缺少 presetId");
  return serializedWrite(async () => {
    const doc = loadForWrite();
    const isPresetAvailable =
      typeof options.isPresetAvailable === "function"
        ? options.isPresetAvailable
        : (candidate) =>
            Boolean(doc.presets[candidate]) || Boolean(doc.presetModels[candidate]);
    if (!isPresetAvailable(id)) {
      throw new Error(`预设不存在或不可用: ${id}`);
    }
    let binding = null;
    if (rawModel !== null && rawModel !== undefined) {
      binding = normalizePresetModel(rawModel);
      if (!binding) throw new Error("模型绑定需要同时提供 provider 和 model");
    }
    const custom = doc.presets[id];
    if (custom) {
      if (binding) custom.model = binding;
      else delete custom.model;
      delete doc.presetModels[id];
    } else if (binding) {
      doc.presetModels[id] = binding;
    } else {
      delete doc.presetModels[id];
    }
    await writeStoreNow(doc);
    return { doc, presetId: id, model: binding };
  });
}

// ── 存储读写 ────────────────────────────────────────────────────────────────

function readStoreSync() {
  const file = storePath();
  if (!fs.existsSync(file)) return { status: "missing" };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { status: "corrupt" };
    return { status: "ok", doc: parsed };
  } catch {
    return { status: "corrupt" };
  }
}

function corruptStoreError() {
  return new Error(`存储文件无法解析，已保留原文件未做任何改动: ${storePath()}`);
}

/** 存储状态：missing（尚未创建）/ ok / corrupt（存在但无法解析）。 */
export function storeStatus() {
  return readStoreSync().status;
}

/** 原始 presets 映射（非对象时视为空表）。 */
function rawPresetsMap(rawDoc) {
  const raw = rawDoc?.presets;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw;
}

/**
 * 找出「无法规范化」的预设条目（角色非法、ID 非法等）。
 *
 * 这些条目不会被运行时加载，但**绝不静默丢弃**：写入时原样保留在存储文件里，
 * 由 UI 展示、用户显式清理（purgeInvalidPresets）。旧实现会在下一次任意保存时
 * 把它们永久删掉，等于无声数据丢失。
 */
export function collectInvalidPresets(rawDoc) {
  const invalid = [];
  for (const [key, value] of Object.entries(rawPresetsMap(rawDoc))) {
    try {
      normalizePreset({ ...value, id: value?.id || key }, key);
    } catch (error) {
      invalid.push({ key: String(key), error: String(error?.message || error), raw: value });
    }
  }
  return invalid;
}

/** 写操作前的读取：文件损坏时宁可报错，也绝不用空文档覆盖用户/AI 的预设。 */
function loadForWrite() {
  if (readStoreSync().status === "corrupt") throw corruptStoreError();
  return loadPresetsDoc();
}

/**
 * 取「本次写入需要原样带回存储文件」的损坏条目。
 *
 * - 调用方显式带了 invalidPresets（来自 loadForWrite / loadPresetsDoc）→ 用它；
 * - 完全没带（外部直接构造 doc 调 savePresetsDoc 等）→ 从磁盘现读一次，
 *   避免把用户的坏条目当成「已清理」丢掉。
 */
function invalidPresetsForWrite(doc) {
  if (Array.isArray(doc?.invalidPresets)) return doc.invalidPresets;
  const read = readStoreSync();
  if (read.status !== "ok") return [];
  return collectInvalidPresets(read.doc);
}

/**
 * 一次性迁移：store 尚不存在时，把 0.1.x 的 .agent-presets/<id>/preset.editor.json
 * 目录内容吸纳入新存储。之后目录不再被读取（官方也不再读取它）。
 */
function migrateLegacyDirsSync() {
  const root = legacyPresetsRootDir();
  const presets = {};
  let found = false;
  try {
    if (!fs.existsSync(root)) return null;
    for (const ent of fs.readdirSync(root, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const dir = path.join(root, ent.name);
      const editorFile = path.join(dir, "preset.editor.json");
      const ymlFile = path.join(dir, "preset.yml");
      let data = null;
      try {
        if (fs.existsSync(editorFile)) data = JSON.parse(fs.readFileSync(editorFile, "utf8"));
      } catch {}
      let officialName = "";
      let officialDesc = "";
      try {
        if (fs.existsSync(ymlFile)) {
          const parsed = parseSimpleYaml(fs.readFileSync(ymlFile, "utf8"));
          officialName = typeof parsed.name === "string" ? parsed.name : "";
          officialDesc = typeof parsed.description === "string" ? parsed.description : "";
        }
      } catch {}
      if (!data) {
        if (!officialName && !fs.existsSync(ymlFile)) continue;
        data = {
          id: ent.name,
          name: officialName || ent.name,
          description: officialDesc || "",
          enabledTools: getDefaultToolIds(),
          entries: [
            { id: randomUUID(), role: "system", text: "", enabled: true },
            { id: randomUUID(), role: "user", text: "", enabled: true },
            { id: randomUUID(), role: "assistant", text: "", enabled: true },
          ],
        };
      }
      if (officialName) data.name = officialName;
      if (officialDesc !== undefined) data.description = officialDesc;
      try {
        const norm = normalizePreset({ ...data, id: data.id || ent.name }, ent.name);
        presets[norm.id] = norm;
        found = true;
      } catch {}
    }
  } catch {}
  return found ? { version: DOC_VERSION, presets } : null;
}

/** 读取全部预设（存储为唯一真源，首次运行做一次旧目录迁移）。 */
export function loadPresetsDoc() {
  const read = readStoreSync();
  if (read.status === "ok") {
    const doc = normalizeDoc(read.doc);
    // 损坏条目原样带回：供 UI 展示与显式清理，写入时再原样写回，绝不静默丢数据
    doc.invalidPresets = collectInvalidPresets(read.doc);
    return doc;
  }
  if (read.status === "corrupt") {
    console.warn(
      "[dsh-preset-editor] preset store is unparsable; keeping the previous registrations and leaving the file untouched",
    );
    return { version: DOC_VERSION, presets: {}, invalidPresets: [] };
  }

  const migrated = migrateLegacyDirsSync();
  const doc = normalizeDoc(migrated ?? { presets: {} });
  doc.invalidPresets = [];
  writeStoreSync(doc);
  return doc;
}

function serialize(doc) {
  // 损坏条目原样写回：它们是用户在文件里已有的内容，跳过加载但绝不静默删除。
  const out = { ...doc };
  delete out.invalidPresets;
  const invalid = Array.isArray(doc?.invalidPresets) ? doc.invalidPresets : [];
  if (invalid.length > 0) {
    const presets = { ...(out.presets || {}) };
    for (const entry of invalid) {
      const key = typeof entry?.key === "string" ? entry.key : "";
      if (!key || Object.prototype.hasOwnProperty.call(presets, key)) continue;
      presets[key] = entry.raw;
    }
    out.presets = presets;
  }
  return JSON.stringify(out, null, 2);
}

/** Windows 上对已被占用的目标做 rename 会偶发 EPERM/EBUSY，退避重试。 */
async function renameWithRetry(tmp, file) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fsp.rename(tmp, file);
      return;
    } catch (error) {
      const code = error?.code;
      if ((code === "EPERM" || code === "EBUSY" || code === "EACCES") && attempt < 6) {
        await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}

/** 所有写入串行化：并发写同一目标在 Windows 上会互相打断。 */
let writeChain = Promise.resolve();

/**
 * 串行执行一次「读-改-写」。
 *
 * 旧实现在写入队列之外先读文件，两次几乎同时的保存会各自基于同一份旧快照写入，
 * 后一次把前一次的修改整个覆盖掉（实测可复现丢预设）。这里把读取也放进同一条
 * 队列，保证每一次修改都基于上一次已落盘的结果。
 *
 * @template T
 * @param {() => Promise<T>} operation 在队列内执行的操作（内部自行读盘）
 * @returns {Promise<T>}
 */
function serializedWrite(operation) {
  const run = writeChain.then(operation);
  writeChain = run.then(() => undefined, () => undefined);
  return run;
}

async function writeStoreNow(doc) {
  const file = storePath();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fsp.writeFile(tmp, serialize(doc), "utf8");
  await renameWithRetry(tmp, file);
}

function writeStore(doc) {
  const run = writeChain.then(() => writeStoreNow(doc));
  writeChain = run.catch(() => {});
  return run;
}

/** 首次创建存储用同步写：避免「读了空 → 异步写」并发出的重命名冲突。 */
function writeStoreSync(doc) {
  const file = storePath();
  const tmp = `${file}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, serialize(doc), "utf8");
    fs.renameSync(tmp, file);
  } catch {
    try {
      fs.writeFileSync(file, serialize(doc), "utf8");
    } catch (error) {
      console.warn("[dsh-preset-editor] initial store write failed:", error);
    }
  }
}

function writeStoreAsync(doc) {
  writeStore(doc).catch((err) => console.warn("[dsh-preset-editor] write store failed:", err));
}

export async function savePresetsDoc(rawDoc) {
  return serializedWrite(async () => {
    const doc = normalizeDoc(rawDoc);
    for (const preset of Object.values(doc.presets)) {
      assertPresetIdAvailable(preset.id);
      assertSupportedTemplateVariables(preset);
    }
    doc.projectDefaults = assertProjectDefaults(doc.projectDefaults);
    doc.invalidPresets = invalidPresetsForWrite(rawDoc);
    await writeStoreNow(doc);
    return doc;
  });
}

/**
 * 保存「按项目文件夹默认预设」设置（总开关 + 规则列表）。
 * 规则引用的预设必须存在（自定义预设，或宿主当前注册的官方预设）；
 * 目录只要求是绝对路径（Session 创建时 DSH 会自动建目录，因此允许提前配置
 * 尚未创建的文件夹）。
 *
 * @param {object} raw - { enabled: boolean, rules: Array<{ id?, path, presetId, enabled? }> }
 * @param {{ isPresetAvailable?: (id: string) => boolean }} [options] - 预设可用性判定（含官方预设）
 * @returns {Promise<{ doc: object, projectDefaults: object }>}
 */
export async function saveProjectDefaults(raw, options = {}) {
  return serializedWrite(async () => {
    const doc = loadForWrite();
    const next = assertProjectDefaults(raw);
    const isPresetAvailable =
      typeof options.isPresetAvailable === "function"
        ? options.isPresetAvailable
        : (id) => Boolean(doc.presets[id]);
    for (const rule of next.rules) {
      if (!isPresetAvailable(rule.presetId)) {
        throw new Error(`规则引用的预设不存在或不可用: ${rule.presetId}（${rule.path}）`);
      }
    }
    doc.projectDefaults = next;
    await writeStoreNow(doc);
    return { doc, projectDefaults: next };
  });
}

/** 同 ID 写入时的策略：error（默认，拒绝覆盖）/ overwrite（显式覆盖）/ rename（自动加后缀）。 */
export const SAVE_CONFLICT_MODES = ["error", "overwrite", "rename"];

/** 为一个已存在的 ID 生成不冲突的新 ID（<id>-2、<id>-3 …）。 */
export function nextAvailablePresetId(id, taken) {
  const base = String(id);
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`无法为预设 ID "${base}" 生成可用后缀`);
}

/**
 * 保存或更新单个预设。
 *
 * 旧实现直接 `doc.presets[id] = norm`：新建时填了已存在的 ID 会**静默覆盖**旧预设，
 * 旧提示词与工具配置无提示丢失。现在必须显式说明冲突策略：
 * - onConflict: "error"（默认）→ 已存在则抛错，调用方提示用户；
 * - onConflict: "overwrite" → 明确覆盖（编辑页保存走这条）；
 * - onConflict: "rename" → 自动加后缀另存为新预设。
 *
 * @param {object} presetData
 * @param {{ onConflict?: "error"|"overwrite"|"rename", isPresetAvailable?: (id: string) => boolean }} [options]
 */
export async function savePreset(presetData, options = {}) {
  const mode = SAVE_CONFLICT_MODES.includes(options.onConflict) ? options.onConflict : "error";
  return serializedWrite(async () => {
    const doc = loadForWrite();
    let norm = normalizePreset(presetData);
    const isPresetAvailable =
      typeof options.isPresetAvailable === "function"
        ? options.isPresetAvailable
        : (id) => Boolean(doc.presets[id]) || Boolean(doc.presetModels[id]);

    const existsCustom = Boolean(doc.presets[norm.id]);
    const existsElsewhere = !existsCustom && isPresetAvailable(norm.id);
    if (existsCustom || existsElsewhere) {
      if (mode === "error") {
        throw new Error(
          existsCustom
            ? `预设 ID "${norm.id}" 已存在（${doc.presets[norm.id].name}）。修改请用编辑，另存请换一个 ID。`
            : `预设 ID "${norm.id}" 已被占用，请换一个 ID。`,
        );
      }
      if (mode === "rename") {
        const taken = new Set([...Object.keys(doc.presets), ...Object.keys(doc.presetModels)]);
        norm = { ...norm, id: nextAvailablePresetId(norm.id, taken) };
      }
    }

    assertPresetIdAvailable(norm.id);
    assertSupportedTemplateVariables(norm);
    doc.presets[norm.id] = norm;
    await writeStoreNow(doc);
    return { doc, preset: norm };
  });
}

/** 首次创建：ID 必须全新（等价于 savePreset({ onConflict: "error" })，供 UI 语义化调用）。 */
export async function createPreset(presetData, options = {}) {
  return savePreset(presetData, { ...options, onConflict: "error" });
}

/**
 * 列出删除某个预设会被连带清理的东西，供删除确认弹窗展示。
 * @returns {{ preset: object|undefined, rules: Array, modelBinding: object|undefined }}
 */
export function planPresetDeletion(presetId) {
  const doc = loadPresetsDoc();
  const id = typeof presetId === "string" ? presetId.trim() : "";
  const rules = (doc.projectDefaults?.rules || []).filter((rule) => rule.presetId === id);
  return {
    preset: doc.presets[id],
    rules,
    modelBinding: doc.presetModels[id],
  };
}

/**
 * 删除单个预设，并**级联清理**所有跟随它的设置。
 *
 * 旧实现只 `delete doc.presets[id]`，于是：
 * - 目录规则仍指向已删除的预设 → 每次新建会话都被跳过、回退 DSH 默认，
 *   且「项目默认」表单再也保存不了（校验失败），只能逐条手删；
 * - 若之后又新建了同 ID 预设，旧规则会**静默复活**，给新预设套上不该有的目录。
 * 现在一并删除引用它的目录规则与 presetModels 残留。
 *
 * @param {string} presetId
 * @param {{ keepRules?: boolean }} [options] - keepRules: 保留目录规则（规则会显示为失效）
 * @returns {Promise<{ doc, removedRules: Array, removedModelBinding: object|null }>}
 */
export async function deletePreset(presetId, options = {}) {
  const id = typeof presetId === "string" ? presetId.trim() : "";
  if (!id) throw new Error("缺少预设 ID");
  return serializedWrite(async () => {
    const doc = loadForWrite();
    const existed = Boolean(doc.presets[id]) || Boolean(doc.presetModels[id]);
    if (!existed) throw new Error(`预设不存在: ${id}`);

    delete doc.presets[id];
    const removedModelBinding = doc.presetModels[id] ?? null;
    delete doc.presetModels[id];

    let removedRules = [];
    if (options.keepRules !== true) {
      const rules = doc.projectDefaults?.rules || [];
      removedRules = rules.filter((rule) => rule.presetId === id);
      doc.projectDefaults = {
        enabled: doc.projectDefaults?.enabled === true,
        rules: rules.filter((rule) => rule.presetId !== id),
      };
    }

    await writeStoreNow(doc);
    return { doc, removedRules, removedModelBinding };
  });
}

/**
 * 显式清理无法规范化的预设条目（用户确认后调用）。
 *
 * 平时它们只会被跳过加载、原样留在文件里；只有这里会真正删除，
 * 避免「一次任意保存 = 静默丢数据」。
 *
 * @returns {Promise<{ doc, removed: string[] }>}
 */
export async function purgeInvalidPresets(keys) {
  return serializedWrite(async () => {
    const read = readStoreSync();
    if (read.status === "corrupt") throw corruptStoreError();
    const doc = loadForWrite();
    const requested = Array.isArray(keys) ? keys.map((k) => String(k)) : null;
    const removed = [];
    for (const entry of Array.isArray(doc.invalidPresets) ? doc.invalidPresets : []) {
      if (requested && !requested.includes(entry.key)) continue;
      removed.push(entry.key);
    }
    doc.invalidPresets = [];
    await writeStoreNow(doc);
    return { doc, removed };
  });
}

export function exportPreset(presetId) {
  const doc = loadPresetsDoc();
  return doc.presets[presetId] || null;
}

/**
 * 导入预设（支持单预设对象或包含 presets 的多预设对象）。
 *
 * 冲突策略默认值按语义区分：
 * - 整包（带 presets 对象）= 恢复备份 → 默认 "overwrite"，与旧行为一致；
 * - 单预设（带 entries 数组）= 往库里加一个 → 默认 "error"，绝不静默覆盖已有预设。
 * 显式传 options.onConflict 时以传入值为准。
 *
 * @param {object} data
 * @param {{ isPresetAvailable?: (id: string) => boolean, onConflict?: "error"|"overwrite"|"rename" }} [options]
 */
export async function importPresetData(data, options = {}) {
  if (!data || typeof data !== "object") {
    throw new Error("导入的数据不是有效的 JSON 对象");
  }
  const defaultMode =
    data.presets && typeof data.presets === "object" ? "overwrite" : "error";
  const mode = SAVE_CONFLICT_MODES.includes(options.onConflict)
    ? options.onConflict
    : defaultMode;
  return serializedWrite(async () => {
    const doc = loadForWrite();
    const isPresetAvailable =
      typeof options.isPresetAvailable === "function"
        ? options.isPresetAvailable
        : (id) => Boolean(doc.presets[id]);

    /** 按冲突策略落一个规范化预设，返回最终写入的 ID。 */
    const commit = (norm, label) => {
      const existsCustom = Boolean(doc.presets[norm.id]);
      const existsElsewhere = !existsCustom && isPresetAvailable(norm.id);
      if (existsCustom || existsElsewhere) {
        if (mode === "error") {
          throw new Error(
            `预设 ${label} 的 ID "${norm.id}" 已存在。如需覆盖请显式选择「覆盖同名预设」，` +
              "或改名后再导入。",
          );
        }
        if (mode === "rename") {
          const taken = new Set([...Object.keys(doc.presets), ...Object.keys(doc.presetModels)]);
          norm = { ...norm, id: nextAvailablePresetId(norm.id, taken) };
        }
      }
      assertPresetIdAvailable(norm.id);
      assertSupportedTemplateVariables(norm);
      doc.presets[norm.id] = norm;
      return norm.id;
    };

    if (data.presets && typeof data.presets === "object") {
      for (const [key, p] of Object.entries(data.presets)) {
        try {
          commit(normalizePreset({ ...p, id: p?.id || key }, key), key);
        } catch (error) {
          throw new Error(`预设 ${key} 校验失败: ${String(error?.message || error)}`);
        }
      }
    } else if (data.entries && Array.isArray(data.entries)) {
      commit(normalizePreset(data), data?.id ?? "（未命名）");
    } else {
      throw new Error("未识别的预设文件格式，需包含 entries 消息数组或 presets 对象");
    }

    // 整体导出文件里可能带 projectDefaults：作为备份恢复的一部分一并导入。
    if (data.projectDefaults !== undefined && data.projectDefaults !== null) {
      const imported = assertProjectDefaults(data.projectDefaults);
      for (const rule of imported.rules) {
        if (!isPresetAvailable(rule.presetId) && !doc.presets[rule.presetId]) {
          throw new Error(`导入的项目规则引用了不存在的预设: ${rule.presetId}（${rule.path}）`);
        }
      }
      doc.projectDefaults = imported;
    }

    await writeStoreNow(doc);
    return normalizeDoc(doc);
  });
}

// ── 预设声明 ────────────────────────────────────────────────────────────────

export function activeEntries(preset, role) {
  return (preset?.entries || []).filter(
    (e) => e.role === role && e.enabled !== false && typeof e.text === "string" && e.text.trim(),
  );
}

/** system 条目文本（用于 persona prefix）。 */
export function systemTextOf(preset) {
  return activeEntries(preset, "system")
    .map((e) => e.text)
    .join("\n\n");
}

/**
 * 组装预设声明的 plugins 行：
 * persona(system，仅在 system 文本非空时) + agent-instructions + 工具行。
 *
 * DSH 0.2.x 的 @deepseek-ai/dsh-persona Config 中 prefix 是必填的非空字符串；
 * 空 system 若生成 `config: {}`，Loader 校验失败会让整个预设 broken。
 * 因此 system 为空时直接不插入 persona 行（预设沿用部署默认人格），而不是给一个空 prefix。
 *
 * @param {object} preset - 规范化后的预设对象。
 * @param {{ profileContext?: boolean }} [env] - 宿主能力快照，透传给工具行生成器。
 */
export function buildPresetPlugins(preset, env = {}) {
  const plugins = [];

  const systemText = systemTextOf(preset);
  if (systemText) {
    plugins.push({
      id: "persona",
      name: "@deepseek-ai/dsh-persona",
      config: { prefix: systemText },
    });
  }

  plugins.push({
    id: "agent-instructions",
    name: "@deepseek-ai/dsh-agent-instructions",
    config: { maxBytes: 65536 },
  });

  plugins.push(...buildToolRows(preset.enabledTools, env));

  return plugins;
}

/**
 * 把编辑器里的预设对象转换为官方 agentPresets.register() 的声明。
 * 0.2.2-rc.1 的 PresetDefinition 仍为 { id, name?, description?, order?, plugins }。
 */
export function toPresetDefinition(preset, env = {}) {
  return {
    id: preset.id,
    name: preset.name,
    description: preset.description || undefined,
    order: Number.isFinite(preset.order) ? preset.order : 100,
    plugins: buildPresetPlugins(preset, env),
  };
}
