// dsh-preset-editor 宿主插件
//
// 核心机制：
// 1. 无命令运行：删除所有 / 命令，完全通过绑定的预设自动触发注入。
// 2. 预设绑定触发：用户在新会话中选择自定义预设后，自动触发预设模板的提示词注入。
// 3. 隔离安全：只用于本插件管理的自定义预设，官方预设（standard/minimal 等）绝对不注入，保持纯净。
// 4. 双通道注入：system 段通过 systemPrompt.section() 动态注入；user/assistant 伪装消息通过 llm/stream 前置注入。
// 5. 官方规范：保存的预设自动同步至 ~/.dsh/.agent-presets/<id>/，在官方 Agent 预设中以自定义预设展示与使用。

import { randomUUID } from "node:crypto";
import * as core from "./core.js";
import { AVAILABLE_TOOLS } from "./tools.js";

export const name = "dsh-preset-editor";
export const inject = ["systemPrompt", "tools", "llm", "agents"];

/**
 * 获取当前 session 绑定的 presetId
 */
function getSessionPresetId(ctx, sessionId) {
  if (!sessionId) return null;
  const agent = ctx.agents?.get(sessionId);
  if (!agent) return null;
  const agentPresets = ctx.get("agentPresets");
  if (!agentPresets) return null;
  return agentPresets.composedPreset(agent.ctx);
}

/**
 * 判断当前 session 是否使用的是本插件管理的自定义预设
 */
function getCustomPreset(ctx, sessionId) {
  const presetId = getSessionPresetId(ctx, sessionId);
  if (!presetId) return null;
  const doc = core.loadPresetsDoc(ctx);
  return doc.presets[presetId] || null;
}

/**
 * 构造 Fake User 消息
 */
function makeUser(text) {
  return Object.freeze({
    id: randomUUID(),
    role: "user",
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: name },
  });
}

/**
 * 构造 Fake Assistant 消息
 */
function makeAssistant(text, provider, model) {
  return Object.freeze({
    id: randomUUID(),
    role: "assistant",
    content: [{ type: "text", text }],
    source: { kind: "model", provider: provider || "dsh-preset-editor", model: model || "dsh-preset-editor" },
  });
}

/**
 * 安装注入引擎
 */
function installInjector(ctx) {
  const inFlight = new WeakSet();
  const injectedMessageIds = new Map();

  // 1. 动态注入 System 提示词
  ctx.systemPrompt.section({
    name: "preset-editor-system",
    order: 100,
    text: (context) => {
      const sessionId = context.agent?.id;
      const preset = getCustomPreset(ctx, sessionId);
      if (!preset) return "";
      const sysEntries = (preset.entries || []).filter((e) => e.role === "system" && e.enabled !== false);
      return sysEntries.map((e) => e.text).filter(Boolean).join("\n\n");
    },
  });

  // 2. 自定义预设生效时，过滤掉部分冗余内置 identity，避免提示词稀释
  ctx.on("system-prompt/assemble", (assembly, context, next) => {
    if (context.agent) {
      const preset = getCustomPreset(ctx, context.agent.id);
      if (preset) {
        const suppress = ["harness:identity", "harness:source", "app:web-surface"];
        assembly.sections = assembly.sections.filter((s) => !suppress.includes(s.name));
      }
    }
    return next();
  }, { global: true });

  // 3. 在 llm/stream 前置注入 fake user / assistant 消息
  ctx.on("llm/stream", (options, next) => {
    if (inFlight.has(options)) return next();

    const sessionId = options.sessionId;
    const isMain = options.purpose === undefined;
    if (!isMain) return next();

    const preset = getCustomPreset(ctx, sessionId);
    if (!preset) return next();

    const entries = preset.entries || [];
    const injectMessages = [];
    for (const e of entries) {
      if (e.enabled === false) continue;
      if (e.role === "user") {
        injectMessages.push(makeUser(e.text));
      } else if (e.role === "assistant") {
        injectMessages.push(makeAssistant(e.text, options.provider, options.model));
      }
    }

    if (injectMessages.length === 0) return next();

    const oldIds = injectedMessageIds.get(sessionId) || new Set();
    const sourceMessages = (options.messages || []).filter((m) => !oldIds.has(m?.id));
    injectedMessageIds.set(sessionId, new Set(injectMessages.map((m) => m.id)));

    console.log(`[dsh-preset-editor] injected ${injectMessages.length} fake messages into session: ${sessionId}`);

    const mutableOptions = {
      ...options,
      messages: [...injectMessages, ...sourceMessages],
    };
    inFlight.add(mutableOptions);
    return ctx.llm.stream(mutableOptions);
  });
}

/**
 * 收集当前运行时中所有的可用工具（官方内置工具 + 当前环境注册工具）
 */
function collectAllTools(ctx) {
  const toolsMap = new Map();
  // 先加入内置官方工具
  for (const t of AVAILABLE_TOOLS) {
    toolsMap.set(t.id, {
      id: t.id,
      name: t.name,
      category: t.category,
      description: t.description,
      isOfficial: true,
      defaultEnabled: t.defaultEnabled,
    });
  }

  // 尝试从 ctx.tools 读取运行时已注册的工具
  try {
    const schemas = ctx.tools?.schemas?.() || [];
    for (const lt of schemas) {
      const toolId = lt.name;
      if (!toolsMap.has(toolId)) {
        toolsMap.set(toolId, {
          id: toolId,
          name: lt.title || lt.name,
          category: "扩展工具",
          description: lt.description || "自定义已注册工具",
          isOfficial: false,
          defaultEnabled: false,
        });
      }
    }
  } catch {}

  return Array.from(toolsMap.values());
}

/**
 * 安装 Web API 路由
 */
function installWebServer(ctx) {
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
            const doc = core.loadPresetsDoc(ctx);
            json(res, 200, {
              ok: true,
              doc,
              dshHome: core.findDshHome(),
              rootDir: core.agentPresetsRootDir(ctx),
            });
          } catch (e) { json(res, 500, { ok: false, error: String(e) }); }
        },
      }, "dsh-preset-editor: state");

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
            const tools = collectAllTools(ctx);
            json(res, 200, { ok: true, tools });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      }, "dsh-preset-editor: tools");

      // 3. POST: 保存单个预设
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
            const { doc, preset: savedPreset } = await core.savePreset(preset, ctx);

            // 官方创作模式规范校验: 尝试 mount-validate 预设组合
            const agentPresets = ctx.get("agentPresets");
            if (agentPresets && typeof agentPresets.standingKeyFor === "function") {
              try {
                await agentPresets.standingKeyFor(savedPreset.id);
              } catch (mountErr) {
                console.warn(`[dsh-preset-editor] standingKeyFor validation warning:`, mountErr);
                // 如果挂载校验失败，记录日志并告知前端警告
              }
            }

            json(res, 200, { ok: true, doc, preset: savedPreset });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      }, "dsh-preset-editor: save");

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
            const doc = await core.deletePreset(id, ctx);
            json(res, 200, { ok: true, doc });
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      }, "dsh-preset-editor: delete");

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
              const doc = core.loadPresetsDoc(ctx);
              const raw = JSON.stringify(doc, null, 2);
              res.writeHead(200, {
                "content-type": "application/json; charset=utf-8",
                "content-disposition": 'attachment; filename="presets-all.json"',
              });
              res.end(raw);
              return;
            }

            const id = url.searchParams.get("id");
            if (!id) {
              json(res, 400, { ok: false, error: "缺少 id 参数" });
              return;
            }
            const single = core.exportPreset(id, ctx);
            if (!single) {
              json(res, 404, { ok: false, error: "预设不存在: " + id });
              return;
            }
            const raw = JSON.stringify(single, null, 2);
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "content-disposition": `attachment; filename="preset-${encodeURIComponent(single.name || id)}.json"`,
            });
            res.end(raw);
          } catch (e) {
            json(res, 500, { ok: false, error: String(e) });
          }
        },
      }, "dsh-preset-editor: export");

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

            const updatedDoc = await core.importPresetData(parsed, ctx);
            json(res, 200, { ok: true, doc: updatedDoc });
          } catch (e) {
            json(res, 500, { ok: false, error: "导入失败: " + String(e) });
          }
        },
      }, "dsh-preset-editor: import");
    }, "dsh-preset-editor: http routes");
  });
}

export function apply(ctx) {
  // 启动时以文件系统为真源执行一次全量双向扫描同步
  try {
    core.loadPresetsDoc(ctx);
  } catch (e) {
    console.warn("[dsh-preset-editor] init presets sync failed:", e);
  }

  installInjector(ctx);
  installWebServer(ctx);
}
