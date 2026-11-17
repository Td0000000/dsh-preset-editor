// dsh-preset-editor 宿主插件（DSH 0.2.x）
//
// 核心机制：
// 1. 预设 = 官方 @deepseek-ai/dsh-agent-preset 声明。本插件把编辑器中的预设通过
//    官方 agentPresets 服务的 register() 注册进运行时，因此会直接出现在官方
//    设置页的「自定义预设」和会话右上角的 Agent 预设选择器中，并随预设挂载自己的
//    隔离插件域（persona 系统提示词 + 勾选的工具）。
// 2. system 条目 -> 预设自身 persona 的 prefix（DSH 0.2.x 只注册 {{model}}/{{provider}}
//    两个模板变量；工作目录、时间、沙箱等信息由“运行时上下文”自动注入，不要写 {{cwd}}）。
//    天然只对该预设生效，不污染官方内置预设。
// 3. user / assistant 条目 -> 每次主模型调用前通过 llm/stream 请求级注入：
//    不进会话日志，因此不会被上下文压缩吃掉；代价是它们不会出现在对话记录里。
// 4. 存储为唯一真源：<DSH_HOME>/preset-editor.json（0.1.x 的 .agent-presets 目录
//    官方已不再读取，仅做一次性迁移）。
//
// 0.2.2-rc.1 适配要点：
// - 预设挂载失败（child row 解析/激活失败）会让整个预设变成 broken，官方
//   agentPresets.list()/resolve() 会返回 broken 诊断且会话无法绑定该预设；
//   因此工具行必须与官方包结构完全对齐（见 lib/tools.js）。
// - agentPresets.register()/composedPreset()、ctx.agents.get()、ctx.tools.schemas()、
//   ctx.webServer.register() 的调用方式在 0.2.2 未变；llm/stream 仍是 waterfall，
//   但 loop 构造的请求是 deep-frozen 的：这里只读取、不修改原对象，用新对象重新发起。

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import * as core from "./core.js";
import { AVAILABLE_TOOLS, DSH_BUILTIN_TOOL_NAMES, filterRuntimeTools } from "./tools.js";

export const name = "dsh-preset-editor";
export const inject = ["agentPresets", "llm", "tools", "agents"];

// 宿主插件不支持热重载：改了 lib/*.js 必须重启 DSH 才会生效。
// 这个标记会出现在 /dsh-preset-editor/state 的 build 字段里，
// 用来确认"当前运行的到底是什么版本"，不要再靠猜。
export const BUILD =
  "2026-11-18 v1.10.0：项目默认规则默认包含子文件夹（就近规则优先，可为单条规则关闭）；自定义/官方预设的默认模型都可以在「当前预设」页统一绑定；修复手动新建会话在子文件夹不套用规则的问题";

/** DSH 官方内置预设的中文显示名（只影响本插件 UI，不改官方定义）。 */
const OFFICIAL_PRESET_LABELS = {
  standard: {
    name: "标准",
    description: "官方标准预设：完整的编码工具与提示词组合。",
  },
  minimal: {
    name: "极简",
    description: "官方极简预设：最小工具集，回答更直接。",
  },
  ptc: {
    name: "PTC 程序化工具调用",
    description: "官方 PTC 预设：通过代码方式调用工具。",
  },
  cordis: {
    name: "Cordis 内核",
    description: "官方 Cordis 预设：内核与插件调试用。",
  },
};

/**
 * 判断一次 `agent-preset/selected` 是否由宿主“复用 blank 会话时的重置”引发。
 *
 * 背景：New Session 复用 live blank 会话时，sessionController.create() 内部会把
 * 预设改回官方默认；这与用户手选官方默认产生同一个事件，无法从参数区分。
 * 唯一可靠信号是调用栈：复用路径的栈里包含 `@deepseek-ai/dsh-api-session-controller`。
 * 命中 → 视为宿主重置，目录规则可以纠正；未命中 → 视为用户主动选择，一律尊重。
 * 官方包路径变化时最坏退化为“不纠正复用”（用户选择永远优先），不会误覆盖用户。
 */
export function presetSelectionCameFromSessionCreate(sourceStack) {
  const stack = typeof sourceStack === "string" ? sourceStack : "";
  return stack.includes("dsh-api-session-controller");
}

function makeUserMessage(text) {
  return {
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "user" },
  };
}

function makeAssistantMessage(text, provider, model) {
  return {
    id: randomUUID(),
    role: "assistant",
    content: [{ type: "text", text }],
    source: {
      kind: "model",
      provider: provider || name,
      model: model || name,
    },
  };
}

/** 集中报告所有预设里不被支持的系统提示词变量，供 UI / 外部 AI 自检。 */
function collectTemplateWarnings(doc) {
  const warnings = [];
  for (const preset of Object.values(doc?.presets || {})) {
    for (const entry of preset.entries || []) {
      if (entry.role !== "system" || entry.enabled === false) continue;
      const variables = core.findUnsupportedTemplateVariables(entry.text);
      if (variables.length > 0) warnings.push({ presetId: preset.id, variables });
    }
  }
  return warnings;
}

/**
 * 返回预设可安全挂载的工具清单（名称/说明优先官方中文文案）+
 * 运行中由其它插件提供的工具（只读展示，过滤掉 DSH 自带工具）。
 */
function collectAllTools(ctx) {
  let schemas = [];
  try {
    schemas = ctx.tools?.schemas?.() || [];
  } catch (error) {
    console.warn("[dsh-preset-editor] read runtime tool schemas failed:", error);
  }
  const runtimeTools = filterRuntimeTools(schemas);
  const filteredDshCount = new Set(
    schemas
      .map((schema) => (typeof schema?.name === "string" ? schema.name.trim() : ""))
      .filter((toolName) => toolName && DSH_BUILTIN_TOOL_NAMES.has(toolName)),
  ).size;
  return {
    tools: AVAILABLE_TOOLS.map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      isOfficial: true,
      defaultEnabled: t.defaultEnabled,
    })),
    runtimeTools,
    filteredDshCount,
  };
}

/**
 * 宿主能力快照：用于生成与官方条件行对齐的预设行。
 * `profileContext` 由 profile-boot 在根上下文 provide（桌面 / CLI 都有；纯库环境可能没有），
 * 官方 standard 预设用它做 `@deepseek-ai/dsh-plugin-manager/tools` 的启用条件。
 */
function environmentSnapshot(ctx) {
  let profileContext = false;
  try {
    profileContext = ctx.get("profileContext") !== undefined;
  } catch {
    profileContext = false;
  }
  return { profileContext };
}

/**
 * 预设注册表管理：把编辑器中的预设同步为官方 Agent 预设声明。
 */
function createRegistry(ctx) {
  const disposers = new Map(); // presetId -> dispose()
  const failures = new Map(); // presetId -> message
  const signatures = new Map(); // presetId -> 已挂载声明的签名
  let latest = { version: core.DOC_VERSION, presets: {} };
  let chain = Promise.resolve();
  let disposed = false;

  function owns(presetId) {
    return typeof presetId === "string" && disposers.has(presetId);
  }

  function preset(presetId) {
    return owns(presetId) ? latest.presets[presetId] : undefined;
  }

  function presetIdOf(agent) {
    try {
      const agentPresets = ctx.get("agentPresets");
      if (!agentPresets || !agent) return undefined;
      return agentPresets.composedPreset(agent.ctx);
    } catch {
      return undefined;
    }
  }

  async function registerOne(definition) {
    const existing = disposers.get(definition.id);
    if (existing) {
      disposers.delete(definition.id);
      try {
        await existing();
      } catch {}
    }
    try {
      const dispose = await ctx.agentPresets.register(definition);
      disposers.set(definition.id, dispose);
      failures.delete(definition.id);
      return true;
    } catch (error) {
      failures.set(definition.id, String(error?.message || error));
      console.warn(`[dsh-preset-editor] register preset ${definition.id} failed:`, error);
      return false;
    }
  }

  function sync() {
    const run = chain.then(async () => {
      if (disposed) return latest;
      // 存储文件损坏（例如 AI 写到一半）时保留上一次的注册结果，绝不因解析失败而清空预设
      if (core.storeStatus() === "corrupt") {
        console.warn(
          "[dsh-preset-editor] preset store is unparsable; keeping the previous registrations",
        );
        return latest;
      }

      const doc = core.loadPresetsDoc();
      latest = doc;

      for (const id of [...disposers.keys()]) {
        if (!doc.presets[id]) {
          const dispose = disposers.get(id);
          disposers.delete(id);
          failures.delete(id);
          signatures.delete(id);
          try {
            await dispose();
          } catch {}
        }
      }

      // 只对「内容真的变了」的预设重新挂载：存储文件被外部触碰（编辑器保存、AI 直接写入、
      // 文件监听触发）时不必要地重挂所有预设树。
      const env = environmentSnapshot(ctx);
      for (const preset of Object.values(doc.presets)) {
        if (disposed) break;
        const definition = core.toPresetDefinition(preset, env);
        const signature = JSON.stringify(definition);
        if (disposers.has(preset.id) && signatures.get(preset.id) === signature) continue;
        if (await registerOne(definition)) signatures.set(preset.id, signature);
        else signatures.delete(preset.id);
      }
      return doc;
    });
    chain = run.catch(() => {});
    return run;
  }

  /**
   * 插件卸载 / HMR 重载时的清理：先停掉后续同步，再注销本插件注册过的所有官方预设。
   * 0.2.2 的插件页支持热更新与启用/禁用；不注销会留下 "Duplicate agent preset" 与
   * 重复 HTTP 路由，导致重载后的新实例无法挂载。
   */
  async function dispose() {
    disposed = true;
    await chain.catch(() => {});
    const pending = [...disposers.entries()];
    disposers.clear();
    failures.clear();
    signatures.clear();
    for (const [id, disposeOne] of pending) {
      try {
        await disposeOne();
      } catch (error) {
        console.warn(`[dsh-preset-editor] unregister preset ${id} failed:`, error);
      }
    }
  }

  /** 上报每个预设的挂载诊断（官方 resolve() 会返回 broken 原因）。 */
  async function report() {
    const out = [];
    for (const id of disposers.keys()) {
      let error;
      try {
        const resolved = await ctx.agentPresets.resolve(id);
        error = resolved?.broken;
      } catch (e) {
        error = String(e?.message || e);
      }
      out.push({ id, ok: !error, ...(error ? { error } : {}) });
    }
    for (const [id, message] of failures) {
      out.push({ id, ok: false, error: message });
    }
    return out;
  }

  return { sync, report, dispose, owns, preset, presetIdOf, disposers, failures };
}

/**
 * 运行时注入引擎，只对本插件注册的预设生效。
 *
 * 关键：**每一次**主模型调用都把预设的 user / assistant 条目前置注入。
 *
 * 为什么必须每次注入、而不是"会话开头种一次"：
 * DSH 的压缩（compaction）会把「最旧的一段表层历史」替换成一条摘要 user 消息，
 * 只逐字保留近期约 16% 的历史。凡是进入会话日志的内容，早晚都会被压缩掉；
 * 而 system 条目走的是 persona → 系统提示词，官方明确「压缩绝不缩减系统提示词」。
 * 因此 user / assistant 条目只能走请求级注入：不进日志、不受压缩影响，每次请求都在场。
 * 这与 0.1.x 原版插件的行为一致。
 *
 * 0.2.2-rc.1 的 llm/stream 仍是 waterfall，但 agent-loop 构造的请求对象是 deep-frozen 的，
 * 官方约定“listener 只读、不改写原请求”。本实现严格遵守：从不修改 options，
 * 而是用 { ...options, messages: [...] } 构造新请求后调用 ctx.llm.stream(newOptions)。
 * 重入由 inFlight 这个 WeakSet 精确识别（新对象只会在本函数里加进去一次）。
 */
function installInjectors(ctx, registry) {
  const inFlight = new WeakSet();
  const injectedIds = new Map(); // sessionId -> Set<messageId>
  const MAX_TRACKED_SESSIONS = 200;

  ctx.on("llm/stream", (options, next) => {
    // 重入保护：我们自己发起的这次流不能再被本监听器处理一次
    if (inFlight.has(options)) return next();
    // 只处理主对话请求，跳过压缩摘要 / 会话标题这类内部调用
    if (options?.purpose !== undefined) return next();

    try {
      const sessionId = options?.sessionId;
      const agent = sessionId ? ctx.agents?.get?.(sessionId) : undefined;
      const presetId = registry.presetIdOf(agent);
      if (!registry.owns(presetId)) return next();

      const preset = registry.preset(presetId);
      // 按条目原始顺序构造假消息；system 条目由 persona 承担，此处不重复注入
      const fakes = [];
      for (const entry of preset?.entries || []) {
        if (entry?.enabled === false) continue;
        const text = typeof entry?.text === "string" ? entry.text : "";
        if (!text.trim()) continue;
        if (entry.role === "user") {
          fakes.push(makeUserMessage(text));
        } else if (entry.role === "assistant") {
          fakes.push(makeAssistantMessage(text, options.provider, options.model));
        }
      }
      if (fakes.length === 0) return next();

      // 同一会话内，上一次注入过的假消息不再重复叠加
      const previous = injectedIds.get(sessionId) || new Set();
      const source = (options.messages || []).filter((m) => !previous.has(m?.id));
      injectedIds.set(sessionId, new Set(fakes.map((m) => m.id)));
      if (injectedIds.size > MAX_TRACKED_SESSIONS) {
        for (const key of injectedIds.keys()) {
          if (injectedIds.size <= MAX_TRACKED_SESSIONS) break;
          if (key !== sessionId) injectedIds.delete(key);
        }
      }

      const mutableOptions = { ...options, messages: [...fakes, ...source] };
      inFlight.add(mutableOptions);
      return ctx.llm.stream(mutableOptions);
    } catch (error) {
      console.warn("[dsh-preset-editor] llm stream injection failed:", error);
      return next();
    }
  });
}

/**
 * 「按项目文件夹默认预设」运行时。
 *
 * 实现方式（DSH 0.2.2 官方扩展点）：
 * - 新会话创建时，宿主先把 SessionHeader.agentPreset 记为 DSH 官方默认预设
 *   （或调用方显式指定的预设），再挂载对应预设域；随后派发 serial 事件
 *   `agent/created`。此时会话仍是 blank（未开始第一轮），官方服务
 *   `agentPresets.select(agent, id)` 正是给 blank 会话换预设的合法入口。
 * - 因此在 `agent/created` 里按工作目录匹配规则，再调用 select()，等价于用户
 *   在「新会话」顶部手动选了该预设；DSH 会把选择记入会话日志。
 * - 只影响“默认选择”：如果会话已显式记录了一个不同于 DSH 默认值的预设，
 *   说明用户手选过，规则不覆盖。我们从不写 agent-preset-registry 的配置，
 *   官方默认预设保持原样。
 * - 子代理 / fork 派生会话（origin=subagent 或带 parentSession）继承父级组合，
 *   一律不动。
 */
function createProjectDefaultsRuntime(ctx, registry) {
  const MAX_LOG = 30;
  const appliedLog = [];
  const skippedLog = [];
  /** 正在做“预设切换后维护”的会话，避免同一批事件递归调度。 */
  const scheduled = new Set();
  /**
   * 本插件自动套用过的模型（会话级、仅内存）。…… */
  const autoAppliedModels = new Map();
  /**
   * 近期由 sessionController.create() 复用过的 blank 会话（sessionId → 过期时间）。
   * 复用路径的“重置回官方默认”与用户手选默认产生同一个异步事件，调用栈也会在
   * await 边界后丢失调用方，因此用一个短生命周期的标记来识别：
   * 只有 create() 传入 sessionId（= 复用已有 blank）时才会打标记。
   */
  const recentCreateSessions = new Map();

  function markCreateForSession(sessionId) {
    if (typeof sessionId !== "string" || !sessionId) return;
    const now = Date.now();
    recentCreateSessions.set(sessionId, now + 8000);
    if (recentCreateSessions.size > 200) {
      for (const [key, expiry] of recentCreateSessions) {
        if (expiry <= now) recentCreateSessions.delete(key);
      }
    }
  }

  function consumeCreateMark(sessionId) {
    const expiry = recentCreateSessions.get(sessionId);
    if (expiry === undefined) return false;
    recentCreateSessions.delete(sessionId);
    return expiry > Date.now();
  }

  function push(list, entry) {
    list.unshift({ time: Date.now(), ...entry });
    if (list.length > MAX_LOG) list.length = MAX_LOG;
  }

  function recordSkip(reason, extra = {}) {
    push(skippedLog, { kind: "skipped", reason, ...extra });
  }

  function officialDefaultPreset() {
    try {
      return ctx.agentPresets?.defaultId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 预设能不能被本插件 select：
   * - 本插件注册的自定义预设：看是否注册成功且无挂载失败诊断；
   * - DSH 官方内置预设：用官方 resolve() 检查是否 broken / 不存在。
   */
  async function presetSelectable(presetId) {
    if (typeof presetId !== "string" || !presetId) return false;
    if (registry.owns(presetId)) return !registry.failures.has(presetId);
    try {
      const resolved = await ctx.agentPresets.resolve(presetId);
      return Boolean(resolved) && !resolved.broken;
    } catch {
      return false;
    }
  }

  function isRootSession(header) {
    return (
      Boolean(header) &&
      header.origin !== "subagent" &&
      !header.parentSession &&
      header.isSeeded !== true
    );
  }

  /** 与官方 select() 的 blank 判定一致：未开轮、lastTurn=0。 */
  function isBlank(session) {
    try {
      const boundary = ctx.agents.turnBoundaryOf(session);
      return Boolean(boundary) && boundary.openTurnStartSeq === null && boundary.lastTurn === 0;
    } catch {
      return false;
    }
  }

  /** 读取会话 projection 里已记录的模型选择（lastUsed 或 next）。 */
  function recordedModelSelection(session) {
    try {
      const projections = ctx.get("sessionProjections");
      if (!projections || typeof projections.snapshot !== "function") return null;
      const snapshot = projections.snapshot(session, ["modelSelection"]);
      const value = snapshot?.values?.modelSelection;
      if (!value) return null;
      return value.next || value.lastUsed || null;
    } catch {
      return null;
    }
  }

  function sameModelSelection(left, right) {
    if (!left || !right) return false;
    return (
      left.provider === right.provider &&
      left.model === right.model &&
      (left.reasoningEffort ?? "") === (right.reasoningEffort ?? "")
    );
  }

  /** 会话是否已有“用户自己选”的模型（不是本插件自动写入的默认值）。 */
  function hasUserModelChoice(session) {
    const recorded = recordedModelSelection(session);
    if (!recorded) return false;
    const auto = autoAppliedModels.get(String(session.id));
    return !(auto && sameModelSelection(recorded, auto));
  }

  /**
   * 把预设绑定的默认模型写进会话（append `model/selection`，durable）。
   *
   * 语义：这只是“默认值”，用户改过就不走默认：
   * - 会话没有记录模型 → 套用；
   * - 会话记录的模型就是本插件上一次自动写入的默认值 → 允许按新预设更新默认；
   * - 会话记录的模型与自动默认值不同（用户手动改过）→ 保持用户选择。
   * 模型必须仍能通过 llm.resolveCallConfig() 校验，否则跳过并记诊断。
   * 这里只写会话级选择，不改全局默认模型。
   */
  async function applyPresetModelBinding(agent, presetId, reason) {
    try {
      const session = agent?.session;
      if (!session) return;
      let doc;
      try {
        doc = core.loadPresetsDoc();
      } catch {
        return;
      }
      // 官方内置预设没有自定义定义，模型绑定存在 doc.presetModels 映射里。
      const binding = core.findPresetModelBinding(doc, presetId);
      if (!binding) return;
      if (hasUserModelChoice(session)) return;
      const selection = {
        provider: binding.provider,
        model: binding.model,
        ...(binding.reasoningEffort ? { reasoningEffort: binding.reasoningEffort } : {}),
      };
      const recorded = recordedModelSelection(session);
      if (recorded && sameModelSelection(recorded, selection)) {
        autoAppliedModels.set(String(session.id), selection);
        return;
      }
      try {
        await ctx.llm.resolveCallConfig(selection);
      } catch (error) {
        recordSkip(`预设绑定的模型不可用，保留会话当前模型: ${String(error?.message || error)}`, {
          sessionId: String(session.id),
          cwd: session.header?.cwd ?? null,
          presetId,
          model: selection.provider + "/" + selection.model,
        });
        return;
      }
      if (typeof agent.model?.select !== "function") return;
      agent.model.select(selection);
      autoAppliedModels.set(String(session.id), selection);
      if (autoAppliedModels.size > 500) {
        // 简单防泄漏：超量后清掉最早的一半（只影响“默认值”判定，不影响会话记录）
        const keys = [...autoAppliedModels.keys()];
        for (const key of keys.slice(0, Math.floor(keys.length / 2))) autoAppliedModels.delete(key);
      }
      push(appliedLog, {
        kind: "model",
        reason,
        sessionId: String(session.id),
        cwd: session.header?.cwd ?? null,
        presetId,
        model:
          selection.provider +
          "/" +
          selection.model +
          (selection.reasoningEffort ? " (" + selection.reasoningEffort + ")" : ""),
      });
    } catch (error) {
      console.warn("[dsh-preset-editor] apply preset model binding failed:", error);
    }
  }

  // 会话销毁时清理“自动默认模型”记录
  ctx.on("agent/disposed", ({ agent }) => {
    try {
      if (agent?.id !== undefined) autoAppliedModels.delete(String(agent.id));
    } catch {}
  });

  /**
   * 给 sessionController.create() 包一层，记录“这次是在复用哪个 blank 会话”。
   * 只做标记读取，不改请求/返回值；插件卸载时还原原方法。
   */
  try {
    const controller = ctx.get("sessionController");
    if (controller && typeof controller.create === "function" && !controller.__dshPresetEditorCreateWrapped) {
      const original = controller.create.bind(controller);
      const wrapped = function (request) {
        try {
          if (request && typeof request.sessionId === "string") markCreateForSession(request.sessionId);
        } catch {}
        return original(request);
      };
      controller.create = wrapped;
      controller.__dshPresetEditorCreateWrapped = true;
      ctx.effect(() => () => {
        try {
          if (controller.create === wrapped) {
            controller.create = original;
            delete controller.__dshPresetEditorCreateWrapped;
          }
        } catch {}
      });
    }
  } catch (error) {
    console.warn("[dsh-preset-editor] wrap sessionController.create failed:", error);
  }

  async function applyForAgent(agent) {
    const session = agent?.session;
    const header = session?.header;
    if (!session || !header) return;
    if (!isRootSession(header)) return;
    if (!isBlank(session)) return;

    let doc;
    try {
      doc = core.loadPresetsDoc();
    } catch (error) {
      console.warn("[dsh-preset-editor] read store for project defaults failed:", error);
      return;
    }
    const projectDefaults = doc.projectDefaults;
    const cwd = header.cwd;

    // 1) 项目目录规则（功能开启、有 cwd、命中规则时才参与）
    if (projectDefaults?.enabled && typeof cwd === "string" && cwd.trim()) {
      const rule = core.findProjectRule(projectDefaults, cwd);
      if (rule) {
        const base = {
          sessionId: String(session.id),
          cwd,
          ruleId: rule.id,
          presetId: rule.presetId,
        };
        if (!(await presetSelectable(rule.presetId))) {
          recordSkip(
            "规则引用的预设不可用（未注册 / 挂载失败 / 不存在），回退 DSH 默认预设",
            base,
          );
        } else {
          let current = null;
          try {
            current = ctx.agentPresets.presetForSession(session);
          } catch {
            current = null;
          }
          const fallback = officialDefaultPreset();

          // 用户在新会话界面手选了另一个预设：尊重显式选择，规则不覆盖。
          if (
            typeof current === "string" &&
            current &&
            current !== rule.presetId &&
            fallback &&
            current !== fallback
          ) {
            recordSkip("会话已显式记录其他预设，尊重用户手选", {
              ...base,
              currentPreset: current,
            });
          } else if (current !== rule.presetId) {
            try {
              const committed = await ctx.agentPresets.select(agent, rule.presetId);
              push(appliedLog, {
                kind: "applied",
                ...base,
                presetId: typeof committed === "string" && committed ? committed : rule.presetId,
                previousPreset: typeof current === "string" ? current : null,
              });
            } catch (error) {
              recordSkip(`应用预设失败，保留 DSH 默认预设: ${String(error?.message || error)}`, {
                ...base,
                currentPreset: current ?? null,
              });
              console.warn("[dsh-preset-editor] apply project default preset failed:", error);
            }
          }
        }
      }
    }

    // 2) 当前预设绑定的默认模型（官方预设没有模型绑定，自定义预设才可能有）
    let currentPreset = null;
    try {
      currentPreset = ctx.agentPresets.presetForSession(session);
    } catch {
      currentPreset = null;
    }
    if (typeof currentPreset === "string" && currentPreset) {
      await applyPresetModelBinding(agent, currentPreset, "会话创建时套用预设默认模型");
    }
  }

  // serial 事件：创建流程会等待本监听器结束，因此客户端拿到的新会话状态
  // 已经是我们选好的预设（与用户手动点选同一条记录路径）。
  ctx.on("agent/created", ({ agent }) => applyForAgent(agent).catch(() => undefined));

  /**
   * 监听 `agent-preset/selected`，做两件事：
   *
   * 1) 兜底：blank 会话被“重置回官方默认”时按目录规则重新套用。
   *    场景：DSH 的 New Session 会优先复用同一个 workspace 里已存在的 blank 会话。
   *    复用一个「活着的」blank Agent 不会触发 agent/created；宿主会按请求/默认把它的
   *    预设改回官方默认（`select(default)`），于是目录规则刚选好的预设会被冲掉。
   *    只有新预设等于官方默认、会话仍是 blank、目录命中规则时才纠正；
   *    用户手选“另一个预设”不会命中，保持用户选择。
   *
   * 2) 预设切换（包括用户在新会话顶部手选）完成后，套用该预设绑定的默认模型；
   *    会话已有显式模型选择时不动。
   *
   * 我们自己 select 写入的事件：新预设等于规则值，第 1 步直接跳过，不会递归。
   */
  ctx.on("session/event", (session, event) => {
    try {
      if (!session || event?.type !== "agent-preset/selected") return;
      const header = session.header || {};
      if (!isRootSession(header)) return;
      const cwd = header.cwd;
      if (typeof cwd !== "string" || !cwd.trim()) return;
      const sessionId = String(session.id);
      if (scheduled.has(sessionId)) return;
      const agent = ctx.agents?.get?.(session.id);
      if (!agent) return;
      scheduled.add(sessionId);
      // 判断这次“重置”是宿主复用 blank 会话引发的，还是用户自己手选官方默认。
      // 复用标记由包装过的 sessionController.create() 打（事件在 await 之后派发，栈不可靠）。
      const fromSessionCreate =
        consumeCreateMark(sessionId) || presetSelectionCameFromSessionCreate(new Error().stack);
      // 延后到当前 append/事件派发之后，避免在写入会话日志的过程中再写一次。
      queueMicrotask(async () => {
        try {
          if (!isBlank(session)) return;
          const selected =
            typeof event?.data?.agentPreset === "string" ? event.data.agentPreset : null;

          // 1) 宿主复用 blank 会话导致的“重置回官方默认” -> 按目录规则纠正。
          //    用户自己手选官方默认（fromSessionCreate=false）一律尊重，不纠正。
          if (fromSessionCreate && selected !== null && selected === officialDefaultPreset()) {
            const doc = core.loadPresetsDoc();
            const projectDefaults = doc.projectDefaults;
            if (projectDefaults?.enabled) {
              const rule = core.findProjectRule(projectDefaults, cwd);
              if (
                rule &&
                selected !== rule.presetId &&
                (await presetSelectable(rule.presetId))
              ) {
                const current = ctx.agentPresets.presetForSession(session);
                if (current !== rule.presetId) {
                  try {
                    const committed = await ctx.agentPresets.select(agent, rule.presetId);
                    push(appliedLog, {
                      kind: "applied",
                      reason: "blank 会话被重置回官方默认，重新套用目录规则",
                      sessionId,
                      cwd,
                      ruleId: rule.id,
                      presetId:
                        typeof committed === "string" && committed ? committed : rule.presetId,
                      previousPreset: selected,
                    });
                  } catch (error) {
                    recordSkip(
                      `重新套用目录规则失败，保留官方默认: ${String(error?.message || error)}`,
                      {
                        sessionId,
                        cwd,
                        ruleId: rule.id,
                        presetId: rule.presetId,
                        currentPreset: selected,
                      },
                    );
                    console.warn(
                      "[dsh-preset-editor] reapply project default preset failed:",
                      error,
                    );
                  }
                }
              }
            }
          }

          // 2) 当前预设的默认模型
          let currentPreset = null;
          try {
            currentPreset = ctx.agentPresets.presetForSession(session);
          } catch {
            currentPreset = null;
          }
          if (typeof currentPreset === "string" && currentPreset) {
            await applyPresetModelBinding(agent, currentPreset, "预设切换后套用预设默认模型");
          }
        } catch (error) {
          console.warn("[dsh-preset-editor] preset change maintenance failed:", error);
        } finally {
          scheduled.delete(sessionId);
        }
      });
    } catch {
      // 事件监听绝不能影响会话写入
    }
  });

  return { appliedLog, skippedLog, officialDefaultPreset, presetSelectable };
}

function installWebServer(ctx, registry, projectRuntime) {
  /** 当前宿主可选的预设清单：本插件注册的自定义预设 + DSH 官方内置预设。 */
  const collectPresetRoster = async () => {
    let rows = [];
    try {
      rows = await ctx.agentPresets.list();
    } catch (error) {
      console.warn("[dsh-preset-editor] list agent presets failed:", error);
    }
    let defaultId = null;
    try {
      defaultId = ctx.agentPresets.defaultId;
    } catch {
      defaultId = null;
    }
    return rows
      .map((row) => {
        const source = registry.owns(row.id) ? "custom" : "official";
        const label = source === "official" ? OFFICIAL_PRESET_LABELS[row.id] : undefined;
        return {
          id: row.id,
          name: row.name || row.id,
          displayName: label?.name || row.name || row.id,
          description: row.description || "",
          displayDescription: label?.description || row.description || "",
          order: Number.isFinite(row.order) ? row.order : null,
          broken: row.broken ?? null,
          isDefault: row.id === defaultId,
          source,
        };
      })
      .map((row) => {
        // 附加默认模型绑定信息，供 UI 展示（官方预设也能绑定）
        let boundModel = null;
        try {
          boundModel = core.findPresetModelBinding(core.loadPresetsDoc(), row.id) ?? null;
        } catch {
          boundModel = null;
        }
        return { ...row, boundModel };
      })
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        const ao = a.order ?? Infinity;
        const bo = b.order ?? Infinity;
        return ao - bo || a.id.localeCompare(b.id);
      });
  };

  /** 把 projectDefaults 规则与当前预设名册合并，供 UI 展示/编辑。 */
  const projectDefaultsInfo = (doc, roster = []) => {
    const projectDefaults = doc?.projectDefaults || { enabled: false, rules: [] };
    const rosterById = new Map(roster.map((row) => [row.id, row]));
    return {
      enabled: projectDefaults.enabled === true,
      rules: (projectDefaults.rules || []).map((rule) => {
        const customPreset = doc?.presets?.[rule.presetId];
        const rosterRow = rosterById.get(rule.presetId);
        const official = Boolean(rosterRow && !customPreset);
        return {
          ...rule,
          presetExists: Boolean(customPreset || rosterRow),
          presetSource: customPreset ? "custom" : official ? "official" : null,
          presetName: rosterRow?.displayName ?? customPreset?.name ?? null,
          presetBroken: rosterRow?.broken ?? null,
          presetRegistered: customPreset
            ? !registry.failures.has(rule.presetId)
            : Boolean(rosterRow && !rosterRow.broken),
          pathExists: (() => {
            try {
              return fs.existsSync(rule.path);
            } catch {
              return false;
            }
          })(),
        };
      }),
      officialDefaultPreset: projectRuntime.officialDefaultPreset(),
      officialDefaultName:
        rosterById.get(projectRuntime.officialDefaultPreset())?.name ?? null,
    };
  };

  const presetAvailability = (roster) => {
    const ids = new Set(roster.map((row) => row.id));
    let customDoc = null;
    try {
      customDoc = core.loadPresetsDoc();
    } catch {
      customDoc = null;
    }
    return (presetId) => ids.has(presetId) || Boolean(customDoc?.presets?.[presetId]);
  };

  ctx.inject(["webServer"], (host) => {
    host.effect(() => {
      // 0.2.2 的 WebServer.register 仍是 node 风格的 (req, res) handler，
      // 返回 disposer；统一收集起来，插件卸载时按注册逆序释放。
      // 单个路由注册失败（例如旧版本实例遗留的重复路由）不应拖垮整个插件。
      const disposers = [];
      const retryTimers = new Set();
      // 插件热更新时，新实例的注册可能早于旧实例的 dispose，导致“重复路由”抛错。
      // 这里短暂重试，避免一次更新后路由永久缺失（本次调试就踩到过）。
      const registerRoute = (route, attempt = 0) => {
        try {
          disposers.push(host.webServer.register(route));
          return true;
        } catch (error) {
          if (attempt < 6) {
            const timer = setTimeout(() => {
              retryTimers.delete(timer);
              registerRoute(route, attempt + 1);
            }, 120 * (attempt + 1));
            retryTimers.add(timer);
            return false;
          }
          console.warn(`[dsh-preset-editor] register route ${route?.path} failed:`, error);
          return false;
        }
      };

      const json = (res, status, payload) => {
        res.writeHead(status, {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8",
        });
        res.end(JSON.stringify(payload));
      };

      const readBody = async (req) => {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          size += buf.length;
          if (size > 1024 * 1024) throw new Error("Payload too large");
          chunks.push(buf);
        }
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      };

      // 1. GET: 读取所有预设与状态
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/state",
        handler: async (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          try {
            const doc = core.loadPresetsDoc();
            const url = new URL(req.url || "", "http://localhost");
            const roster = await collectPresetRoster();
            const registrations =
              url.searchParams.get("diagnostics") === "1" ? await registry.report() : undefined;
            json(res, 200, {
              ok: true,
              build: BUILD,
              doc,
              storeStatus: core.storeStatus(),
              dshHome: core.findDshHome(),
              storePath: core.storePath(),
              legacyRootDir: core.legacyPresetsRootDir(),
              supportedVariables: core.SUPPORTED_TEMPLATE_VARIABLES,
              templateWarnings: collectTemplateWarnings(doc),
              registered: [...registry.disposers.keys()],
              presetRoster: roster,
              projectDefaultsInfo: projectDefaultsInfo(doc, roster),
              projectRuntime: {
                applied: projectRuntime.appliedLog,
                skipped: projectRuntime.skippedLog,
              },
              ...(registrations ? { registrations } : {}),
            });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 2. GET: 读取所有可用工具列表
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/tools",
        handler: async (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          try {
            const { tools, runtimeTools, filteredDshCount } = collectAllTools(ctx);
            json(res, 200, { ok: true, tools, runtimeTools, filteredDshCount });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 3. POST: 保存单个预设（并立即重新注册为官方预设声明）
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/save",
        handler: async (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405, { allow: "POST" });
            res.end();
            return;
          }
          try {
            const body = await readBody(req);
            const preset = body?.preset;
            if (!preset || typeof preset !== "object") {
              json(res, 400, { ok: false, error: "缺少 preset 对象" });
              return;
            }
            const { doc, preset: savedPreset } = await core.savePreset(preset);
            await registry.sync();
            const registration = (await registry.report()).find((r) => r.id === savedPreset.id);
            if (registration && !registration.ok) {
              json(res, 200, {
                ok: true,
                doc,
                preset: savedPreset,
                warning: `预设已保存，但挂载校验未通过: ${registration.error}`,
              });
              return;
            }
            json(res, 200, { ok: true, doc, preset: savedPreset });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 4. POST: 删除预设
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/delete",
        handler: async (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405, { allow: "POST" });
            res.end();
            return;
          }
          try {
            const body = await readBody(req);
            const id = body?.id;
            if (!id || typeof id !== "string") {
              json(res, 400, { ok: false, error: "缺少预设 id" });
              return;
            }
            const doc = await core.deletePreset(id);
            await registry.sync();
            json(res, 200, { ok: true, doc });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 5. GET: 导出预设
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/export",
        handler: async (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          try {
            const url = new URL(req.url || "", "http://localhost");
            const isAll = url.searchParams.get("all") === "1";
            if (isAll) {
              const doc = core.loadPresetsDoc();
              res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "content-disposition": 'attachment; filename="presets-all.json"',
              });
              res.end(JSON.stringify(doc, null, 2));
              return;
            }

            const id = url.searchParams.get("id");
            if (!id) {
              json(res, 400, { ok: false, error: "缺少 id 参数" });
              return;
            }
            const single = core.exportPreset(id);
            if (!single) {
              json(res, 404, { ok: false, error: "预设不存在: " + id });
              return;
            }
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "content-disposition": `attachment; filename="preset-${encodeURIComponent(single.name || id)}.json"`,
            });
            res.end(JSON.stringify(single, null, 2));
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 6. POST: 导入预设
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/import",
        handler: async (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405, { allow: "POST" });
            res.end();
            return;
          }
          try {
            const body = await readBody(req);
            let parsed;
            if (typeof body?.raw === "string") {
              parsed = JSON.parse(body.raw);
            } else if (body?.data && typeof body.data === "object") {
              parsed = body.data;
            } else {
              json(res, 400, { ok: false, error: "需要 raw(JSON文本) 或 data(对象)" });
              return;
            }
            const roster = await collectPresetRoster();
            const updatedDoc = await core.importPresetData(parsed, {
              isPresetAvailable: (presetId) =>
                presetAvailability(roster)(presetId) ||
                Boolean(parsed?.presets && parsed.presets[presetId]) ||
                parsed?.id === presetId,
            });
            await registry.sync();
            json(res, 200, { ok: true, doc: updatedDoc, presetRoster: await collectPresetRoster() });
          } catch (e) {
            json(res, 500, { ok: false, error: "导入失败: " + String(e) });
          }
        },
      });

      // 7. POST: 保存「按项目文件夹默认预设」设置（总开关 + 规则列表）
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/projects",
        handler: async (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405, { allow: "POST" });
            res.end();
            return;
          }
          try {
            const body = await readBody(req);
            if (!body?.projectDefaults || typeof body.projectDefaults !== "object") {
              json(res, 400, { ok: false, error: "缺少 projectDefaults 对象" });
              return;
            }
            const roster = await collectPresetRoster();
            const { doc } = await core.saveProjectDefaults(body.projectDefaults, {
              isPresetAvailable: presetAvailability(roster),
            });
            json(res, 200, {
              ok: true,
              doc,
              presetRoster: roster,
              projectDefaultsInfo: projectDefaultsInfo(doc, roster),
            });
          } catch (e) {
            json(res, 400, { ok: false, error: String(e?.message || e) });
          }
        },
      });

      // 8. GET: 预览某个工作目录会命中哪条规则（诊断 / 外部工具用）
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/project-default",
        handler: async (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          try {
            const url = new URL(req.url || "", "http://localhost");
            const cwd = url.searchParams.get("cwd") || "";
            const doc = core.loadPresetsDoc();
            const projectDefaults = doc.projectDefaults;
            const rule = cwd ? core.findProjectRule(projectDefaults, cwd) : undefined;
            const officialDefault = projectRuntime.officialDefaultPreset();
            const roster = await collectPresetRoster();
            const ruleSelectable = rule
              ? await projectRuntime.presetSelectable(rule.presetId)
              : false;
            const rosterRow = rule ? roster.find((row) => row.id === rule.presetId) : undefined;
            json(res, 200, {
              ok: true,
              cwd,
              enabled: projectDefaults?.enabled === true,
              officialDefaultPreset: officialDefault,
              officialDefaultName:
                roster.find((row) => row.id === officialDefault)?.name ?? null,
              matched: rule
                ? {
                    ...rule,
                    presetExists: Boolean(doc.presets[rule.presetId] || rosterRow),
                    presetSource: doc.presets[rule.presetId]
                      ? "custom"
                      : rosterRow
                      ? "official"
                      : null,
                    presetName: rosterRow?.displayName ?? doc.presets[rule.presetId]?.name ?? null,
                    presetSelectable: ruleSelectable,
                  }
                : null,
              effectivePreset:
                projectDefaults?.enabled === true && rule && ruleSelectable
                  ? rule.presetId
                  : officialDefault,
              note:
                "effectivePreset 是新建 blank 会话时的默认预设；用户在新会话界面手动选择其他预设时以用户选择为准。",
            });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 9. GET: 当前可选预设名册（自定义 + 官方内置）
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/presets",
        handler: async (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          try {
            const roster = await collectPresetRoster();
            json(res, 200, {
              ok: true,
              officialDefaultPreset: projectRuntime.officialDefaultPreset(),
              presets: roster,
            });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 10. GET: 当前 DSH 已配置上游的模型目录（供预设绑定默认模型/思考强度）
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/models",
        handler: async (req, res) => {
          if (req.method !== "GET") {
            res.writeHead(405, { allow: "GET" });
            res.end();
            return;
          }
          try {
            const controller = ctx.get("sessionController");
            let catalog = null;
            let error;
            try {
              catalog = await controller?.modelCatalog?.();
            } catch (e) {
              error = String(e?.message || e);
            }
            const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
            json(res, 200, {
              ok: !error,
              ...(error ? { error } : {}),
              default: catalog?.default ?? null,
              providers: groups.map((group) => ({
                id: group.id,
                name: group.name || group.id,
                models: (group.models || []).map((model) => ({
                  id: model.id,
                  name: model.name || model.id,
                  description: model.description ?? null,
                  reasoning: model.reasoning
                    ? {
                        defaultEffort: model.reasoning.defaultEffort ?? null,
                        efforts: (model.reasoning.efforts || []).map((effort) => ({
                          id: effort.id,
                          name: effort.name || effort.id,
                          description: effort.description ?? null,
                        })),
                      }
                    : null,
                })),
              })),
              failures: Array.isArray(catalog?.failures) ? catalog.failures : [],
            });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 11. POST: 保存/清除任意预设（含官方内置）的默认模型绑定
      registerRoute({
        kind: "exact",
        path: "/dsh-preset-editor/preset-model",
        handler: async (req, res) => {
          if (req.method !== "POST") {
            res.writeHead(405, { allow: "POST" });
            res.end();
            return;
          }
          try {
            const body = await readBody(req);
            const roster = await collectPresetRoster();
            const result = await core.savePresetModel(body?.presetId, body?.model ?? null, {
              isPresetAvailable: presetAvailability(roster),
            });
            json(res, 200, {
              ok: true,
              doc: result.doc,
              presetId: result.presetId,
              model: result.model,
              presetRoster: await collectPresetRoster(),
            });
          } catch (e) {
            json(res, 400, { ok: false, error: String(e?.message || e) });
          }
        },
      });

      return () => {
        for (const timer of retryTimers) clearTimeout(timer);
        retryTimers.clear();
        for (const dispose of disposers.reverse()) {
          try {
            dispose();
          } catch (error) {
            console.warn("[dsh-preset-editor] route dispose failed:", error);
          }
        }
      };
    });
  });
}

export function apply(ctx) {
  const registry = createRegistry(ctx);
  // 项目文件夹默认预设：在 agent/created 时按会话 cwd 自动套用（可开关）。
  const projectRuntime = createProjectDefaultsRuntime(ctx, registry);

  installInjectors(ctx, registry);
  installWebServer(ctx, registry, projectRuntime);

  // 插件卸载 / HMR 重载时注销本插件注册的全部官方预设，避免留下孤儿预设与重复路由。
  ctx.effect(() => () => registry.dispose());

  // 直接编辑存储文件（例如由 AI 生成预设、或用编辑器同步过来的文件）也会自动重新注册，
  // 不需要重启 Harness，也不需要经过本插件的 HTTP API。
  try {
    const storeFile = core.storePath();
    fs.watchFile(storeFile, { interval: 1000 }, () => {
      registry
        .sync()
        .catch((error) => console.warn("[dsh-preset-editor] store-change sync failed:", error));
    });
    ctx.effect(() => () => fs.unwatchFile(storeFile));
  } catch (error) {
    console.warn("[dsh-preset-editor] store watch failed:", error);
  }

  // 启动时把已保存的预设注册为官方 Agent 预设声明
  registry.sync().catch((error) => {
    console.warn("[dsh-preset-editor] initial preset sync failed:", error);
  });
}
