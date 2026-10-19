// dsh-preset-editor 宿主插件（DSH 0.2.x）
//
// 核心机制：
// 1. 预设 = 官方 @deepseek-ai/dsh-agent-preset 声明。本插件把编辑器中的预设通过
//    官方 agentPresets 服务的 register() 注册进运行时，因此会直接出现在官方
//    设置页的「自定义预设」和会话右上角的 Agent 预设选择器中，并随预设挂载自己的
//    隔离插件域（persona 系统提示词 + 勾选的工具）。
// 2. system 条目 -> 预设自身 persona 的 prefix（DSH 0.2.1 只注册 {{model}}/{{provider}}
//    两个模板变量；工作目录、时间、沙箱等信息由“运行时上下文”自动注入，不要写 {{cwd}}）。
//    天然只对该预设生效，不污染官方内置预设。
// 3. user / assistant 条目 -> 每次主模型调用前通过 llm/stream 请求级注入：
//    不进会话日志，因此不会被上下文压缩吃掉；代价是它们不会出现在对话记录里。
// 4. 存储为唯一真源：<DSH_HOME>/preset-editor.json（0.1.x 的 .agent-presets 目录
//    官方已不再读取，仅做一次性迁移）。

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import * as core from "./core.js";
import { AVAILABLE_TOOLS, DSH_BUILTIN_TOOL_NAMES, filterRuntimeTools } from "./tools.js";

export const name = "dsh-preset-editor";
export const inject = ["agentPresets", "llm", "tools", "agents"];

// 宿主插件不支持热重载：改了 lib/*.js 必须重启 DSH 才会生效。
// 这个标记会出现在 /dsh-preset-editor/state 的 build 字段里，
// 用来确认"当前运行的到底是什么版本"，不要再靠猜。
export const BUILD = "2026-10-19 v1.4.1 回退自定义插件行；恢复运行时扩展工具（只读，过滤 DSH 自带工具）";

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
 * 预设注册表管理：把编辑器中的预设同步为官方 Agent 预设声明。
 */
function createRegistry(ctx) {
  const disposers = new Map(); // presetId -> dispose()
  const failures = new Map(); // presetId -> message
  const signatures = new Map(); // presetId -> 已挂载声明的签名
  let latest = { version: core.DOC_VERSION, presets: {} };
  let chain = Promise.resolve();

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
      for (const preset of Object.values(doc.presets)) {
        const definition = core.toPresetDefinition(preset);
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

  return { sync, report, owns, preset, presetIdOf, disposers, failures };
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

function installWebServer(ctx, registry) {
  ctx.inject(["webServer"], (host) => {
    host.effect(() => {
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
      host.webServer.register({
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
              ...(registrations ? { registrations } : {}),
            });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      });

      // 2. GET: 读取所有可用工具列表
      host.webServer.register({
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
      host.webServer.register({
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
      host.webServer.register({
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
      host.webServer.register({
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
      host.webServer.register({
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
            const updatedDoc = await core.importPresetData(parsed);
            await registry.sync();
            json(res, 200, { ok: true, doc: updatedDoc });
          } catch (e) {
            json(res, 500, { ok: false, error: "导入失败: " + String(e) });
          }
        },
      });
    });
  });
}

export function apply(ctx) {
  const registry = createRegistry(ctx);

  installInjectors(ctx, registry);
  installWebServer(ctx, registry);

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
