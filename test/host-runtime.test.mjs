// 宿主侧集成测试：用假的 ctx / agentPresets / agents 验证
// 「按项目文件夹默认预设」链路与 HTTP 路由（不启动 DSH）。
// 运行：node --test test/host-runtime.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-preset-editor-host-"));
process.env.DSH_HOME = tmpHome;
const core = await import("../lib/core.js");
const plugin = await import("../lib/index.js");
const { callAsSessionCreate } = await import("./fixtures/dsh-api-session-controller/select.mjs");

const RULE_DIR = path.resolve(tmpHome, "project-a");
const OTHER_DIR = path.resolve(tmpHome, "project-b");

function preset(id = "pi-spider", name = "Pi 蜘蛛", model = undefined) {
  return {
    id,
    name,
    description: "",
    order: 100,
    enabledTools: ["time-context"],
    entries: [{ id: "e-1", role: "system", text: "system prompt", enabled: true }],
    ...(model ? { model } : {}),
  };
}

function writeStore(doc) {
  fs.writeFileSync(path.join(tmpHome, "preset-editor.json"), JSON.stringify(doc, null, 2), "utf8");
}

function makeFakeContext(options = {}) {
  const handlers = new Map();
  const routes = [];
  const cleanups = [];
  const selectCalls = [];
  const modelSelections = [];
  const selectedBySession = new Map();
  const defaultId = options.defaultId ?? "standard";
  const currentPreset = options.currentPreset; // (session) => string | null
  const rosterRows = options.roster ?? [
    { id: "pi-spider", name: "Pi 蜘蛛", order: 100 },
    { id: "standard", name: "standard", order: 10 },
    { id: "minimal", name: "极简", order: 20 },
  ];
  const knownPresetIds = new Set(rosterRows.map((row) => row.id));

  const agentPresets = {
    get defaultId() {
      return defaultId;
    },
    register: async () => async () => {},
    resolve: async (id) => {
      const wanted = id ?? defaultId;
      if (options.unknownPresets?.includes(wanted) || !knownPresetIds.has(wanted)) {
        throw new Error("Unknown agent preset: " + wanted);
      }
      return { id: wanted };
    },
    list: async () => rosterRows,
    composedPreset: () => undefined,
    presetForSession: (session) =>
      selectedBySession.get(String(session?.id)) ??
      (currentPreset ? currentPreset(session) : defaultId),
    select: async (agent, id) => {
      selectCalls.push({ sessionId: String(agent?.session?.id), presetId: id });
      if (agent?.session?.id !== undefined) selectedBySession.set(String(agent.session.id), id);
      return id;
    },
  };

  const agents = {
    turnBoundaryOf: (session) => options.boundaryFor?.(session) ?? { openTurnStartSeq: null, lastTurn: 0 },
    get: (id) => (options.agentForSession ? options.agentForSession(id) : undefined),
  };

  const sessionProjections = options.sessionProjections ?? {
    snapshot: () => ({ values: { modelSelection: null } }),
  };

  const llm = {
    stream: () => (async function* () {})(),
    resolveCallConfig: async (config) => {
      const key = config.provider + "/" + config.model;
      if (options.unavailableModels?.includes(key)) throw new Error("model unavailable: " + key);
      return config;
    },
  };

  const host = {
    effect: (fn) => {
      const cleanup = fn();
      cleanups.push(cleanup);
      return () => {
        try {
          cleanup?.();
        } catch {}
      };
    },
    webServer: {
      register: (route) => {
        routes.push(route);
        return () => {};
      },
    },
  };

  const ctx = {
    on: (event, handler) => {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(handler);
      return () => {};
    },
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return () => {
        try {
          cleanup?.();
        } catch {}
      };
    },
    inject: (deps, callback) => {
      // 只模拟 webServer 注入；其它可选依赖直接跳过。
      if (Array.isArray(deps) && deps.includes("webServer")) callback(host);
      return () => {};
    },
    get: (name) => {
      if (name === "profileContext") return undefined;
      if (name === "webServer") return host;
      if (name === "sessionProjections") return sessionProjections;
      if (name === "sessionController") return options.sessionController;
      return undefined;
    },
    agentPresets,
    agents,
    llm,
    tools: { schemas: () => [] },
  };

  async function emit(event, ...args) {
    for (const handler of handlers.get(event) || []) await handler(...args);
  }

  function findRoute(routePath) {
    return routes.find((route) => route.path === routePath);
  }

  async function call(routePath, { method = "GET", url, body } = {}) {
    const route = findRoute(routePath);
    assert.ok(route, `route not found: ${routePath}`);
    const req = {
      method,
      url: url || routePath,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body));
      },
    };
    const res = {
      status: 0,
      headers: {},
      body: "",
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers || {};
      },
      end(data) {
        this.body = data === undefined ? "" : String(data);
      },
    };
    await route.handler(req, res);
    return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
  }

  return {
    ctx,
    handlers,
    routes,
    selectCalls,
    modelSelections,
    emit,
    call,
    cleanup: () => {
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup?.();
        } catch {}
      }
    },
  };
}

function sessionFor(cwd, extra = {}) {
  const id = "session-" + Math.random().toString(36).slice(2, 8);
  return {
    id,
    header: { version: 3, id, createdAt: Date.now(), cwd, isSeeded: false, ...extra },
  };
}

test("agent/created：命中规则 + blank + 默认预设 -> 调用 select，并记录诊断", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80)); // 等 registry.sync 完成

  const session = sessionFor(RULE_DIR);
  await fake.emit("agent/created", { agent: { id: session.id, session }, source: "startup" });

  assert.equal(fake.selectCalls.length, 1);
  assert.equal(fake.selectCalls[0].presetId, "pi-spider");
  const state = await fake.call("/dsh-preset-editor/state");
  assert.equal(state.json.projectRuntime.applied.length, 1);
  assert.equal(state.json.projectRuntime.applied[0].cwd, RULE_DIR);
  fake.cleanup();
});

test("总开关关闭 / 目录未命中 / 规则停用：不 select", async () => {
  const base = {
    version: 3,
    presets: { "pi-spider": preset() },
  };
  const cases = [
    { enabled: false, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
    { enabled: true, rules: [{ id: "r1", path: OTHER_DIR, presetId: "pi-spider", enabled: true }] },
    { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: false }] },
  ];
  for (const projectDefaults of cases) {
    writeStore({ ...base, projectDefaults });
    const fake = makeFakeContext();
    plugin.apply(fake.ctx);
    await new Promise((resolve) => setTimeout(resolve, 80));
    const session = sessionFor(RULE_DIR);
    await fake.emit("agent/created", { agent: { id: session.id, session }, source: "startup" });
    assert.equal(fake.selectCalls.length, 0, JSON.stringify(projectDefaults));
    fake.cleanup();
  }
});

test("用户手选了其他预设：尊重用户，不 select", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset(), other: preset("other", "Other") },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });
  const fake = makeFakeContext({ currentPreset: () => "other" });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const session = sessionFor(RULE_DIR);
  await fake.emit("agent/created", { agent: { id: session.id, session }, source: "startup" });
  assert.equal(fake.selectCalls.length, 0);
  const state = await fake.call("/dsh-preset-editor/state");
  assert.match(state.json.projectRuntime.skipped[0].reason, /用户手选/);
  fake.cleanup();
});

test("子代理 / fork / 非 blank 会话：不 select", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });

  const scenarios = [
    { session: sessionFor(RULE_DIR, { origin: "subagent" }), boundary: undefined },
    { session: sessionFor(RULE_DIR, { parentSession: "p1" }), boundary: undefined },
    { session: sessionFor(RULE_DIR, { isSeeded: true }), boundary: undefined },
    { session: sessionFor(RULE_DIR), boundary: { openTurnStartSeq: 3, lastTurn: 1 } },
    { session: sessionFor(RULE_DIR), boundary: { openTurnStartSeq: null, lastTurn: 2 } },
  ];

  for (const scenario of scenarios) {
    const fake = makeFakeContext({ boundaryFor: () => scenario.boundary });
    plugin.apply(fake.ctx);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await fake.emit("agent/created", { agent: { id: scenario.session.id, session: scenario.session }, source: "startup" });
    assert.equal(fake.selectCalls.length, 0);
    fake.cleanup();
  }
});

test("规则预设被删除 / 挂载失败：跳过并记录原因", async () => {
  writeStore({
    version: 3,
    presets: {},
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "ghost", enabled: true }] },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const session = sessionFor(RULE_DIR);
  await fake.emit("agent/created", { agent: { id: session.id, session }, source: "startup" });
  assert.equal(fake.selectCalls.length, 0);
  const state = await fake.call("/dsh-preset-editor/state");
  assert.match(state.json.projectRuntime.skipped[0].reason, /未注册|挂载失败/);
  fake.cleanup();
});

test("HTTP：POST /projects 保存规则、GET /state 与 /project-default 反映结果", async () => {
  writeStore({ version: 3, presets: { "pi-spider": preset() }, projectDefaults: { enabled: false, rules: [] } });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const before = await fake.call("/dsh-preset-editor/project-default", {
    url: "/dsh-preset-editor/project-default?cwd=" + encodeURIComponent(RULE_DIR),
  });
  assert.equal(before.json.enabled, false);
  assert.equal(before.json.matched, null);
  assert.equal(before.json.effectivePreset, "standard");

  const saved = await fake.call("/dsh-preset-editor/projects", {
    method: "POST",
    body: {
      projectDefaults: {
        enabled: true,
        rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }],
      },
    },
  });
  assert.equal(saved.json.ok, true);
  assert.equal(saved.json.projectDefaultsInfo.enabled, true);
  assert.equal(saved.json.projectDefaultsInfo.rules[0].presetExists, true);

  const after = await fake.call("/dsh-preset-editor/project-default", {
    url: "/dsh-preset-editor/project-default?cwd=" + encodeURIComponent(RULE_DIR.toUpperCase()),
  });
  assert.equal(after.json.enabled, true);
  assert.equal(after.json.matched.presetId, "pi-spider");
  assert.equal(after.json.effectivePreset, "pi-spider");

  const missing = await fake.call("/dsh-preset-editor/projects", {
    method: "POST",
    body: { projectDefaults: { enabled: true, rules: [{ path: RULE_DIR, presetId: "nope" }] } },
  });
  assert.equal(missing.status, 400);
  assert.match(missing.json.error, /预设不存在/);
  fake.cleanup();
});

test("blank 会话被重置回官方默认时，重新套用目录规则（复用 blank 兜底）", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session };
  const fake = makeFakeContext({ agentForSession: () => agent });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  // 模拟宿主复用 live blank 会话时把预设重置回官方默认 standard
  await callAsSessionCreate(() =>
    fake.emit("session/event", session, {
      type: "agent-preset/selected",
      data: { agentPreset: "standard" },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(fake.selectCalls.length, 1);
  assert.equal(fake.selectCalls[0].presetId, "pi-spider");
  const state = await fake.call("/dsh-preset-editor/state");
  assert.equal(state.json.projectRuntime.applied[0].reason, "blank 会话被重置回官方默认，重新套用目录规则");
  fake.cleanup();
});

test("用户手选官方默认预设：属于用户选择，目录规则不纠正", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session };
  const fake = makeFakeContext({ agentForSession: () => agent });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  // 不在 sessionController.create 的调用栈里 -> 视为用户在新会话顶部手选官方默认
  await fake.emit("session/event", session, {
    type: "agent-preset/selected",
    data: { agentPreset: "standard" },
  });
  await new Promise((resolve) => setTimeout(resolve, 60));

  assert.equal(fake.selectCalls.length, 0, "用户手选官方默认时不应被目录规则改写");
  fake.cleanup();
});

test("sessionController.create({sessionId}) 复用标记：兜底重新套用目录规则", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session };
  const controller = {
    async create() {
      return { sessionId: session.id };
    },
  };
  const fake = makeFakeContext({ agentForSession: () => agent, sessionController: controller });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  // 插件应已包装 create：调用（模拟复用 blank 会话）后事件会被识别为宿主重置
  await fake.ctx.get("sessionController").create({ sessionId: session.id });
  await fake.emit("session/event", session, {
    type: "agent-preset/selected",
    data: { agentPreset: "standard" },
  });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(fake.selectCalls.length, 1);
  assert.equal(fake.selectCalls[0].presetId, "pi-spider");
  fake.cleanup();
});

test("预设选择来源判定：只有 sessionController.create 的栈才算宿主重置", () => {
  assert.equal(plugin.presetSelectionCameFromSessionCreate("at foo (dsh-api-session-controller/lib/index.js:1:1)"), true);
  assert.equal(plugin.presetSelectionCameFromSessionCreate("at bar (dsh-agent-preset-registry/lib/index.js:1:1)"), false);
  assert.equal(plugin.presetSelectionCameFromSessionCreate(undefined), false);
});

test("用户手选其它预设 / 自己写入规则预设时，兜底不动作", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset(), other: preset("other", "Other") },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });

  for (const next of ["other", "pi-spider"]) {
    const session = sessionFor(RULE_DIR);
    const agent = { id: session.id, session };
    const fake = makeFakeContext({ agentForSession: () => agent });
    plugin.apply(fake.ctx);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await fake.emit("session/event", session, { type: "agent-preset/selected", data: { agentPreset: next } });
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(fake.selectCalls.length, 0, `next=${next}`);
    fake.cleanup();
  }
});

test("非 blank 会话被重置回默认时，兜底不动作（select 会 locked）", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }] },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session };
  const fake = makeFakeContext({
    agentForSession: () => agent,
    boundaryFor: () => ({ openTurnStartSeq: null, lastTurn: 2 }),
  });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));
  await fake.emit("session/event", session, { type: "agent-preset/selected", data: { agentPreset: "standard" } });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(fake.selectCalls.length, 0);
  fake.cleanup();
});

test("官方内置预设可以作为目录规则目标，并真实调用 select", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: {
      enabled: true,
      rules: [{ id: "r1", path: RULE_DIR, presetId: "standard", enabled: true }],
    },
  });
  const fake = makeFakeContext({ defaultId: "minimal" });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const session = sessionFor(RULE_DIR);
  await fake.emit("agent/created", { agent: { id: session.id, session }, source: "startup" });

  assert.equal(fake.selectCalls.length, 1);
  assert.equal(fake.selectCalls[0].presetId, "standard");

  const state = await fake.call("/dsh-preset-editor/state");
  const roster = state.json.presetRoster;
  assert.equal(roster.find((row) => row.id === "standard")?.source, "official");
  assert.equal(roster.find((row) => row.id === "pi-spider")?.source, "custom");
  assert.equal(
    state.json.projectDefaultsInfo.rules[0].presetSource,
    "official",
    "规则应识别为官方预设",
  );
  fake.cleanup();
});

test("预设绑定的默认模型会在会话创建（规则套用预设后）写入会话", async () => {
  writeStore({
    version: 3,
    presets: {
      "pi-spider": preset("pi-spider", "Pi 蜘蛛", {
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
        reasoningEffort: "high",
      }),
    },
    projectDefaults: {
      enabled: true,
      rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }],
    },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session, model: { select: (selection) => fake.modelSelections.push(selection) } };
  const fake = makeFakeContext({ agentForSession: () => agent });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  await fake.emit("agent/created", { agent, source: "startup" });

  assert.equal(fake.selectCalls.length, 1, "目录规则应先切到 pi-spider");
  assert.deepEqual(fake.modelSelections, [
    { provider: "opencode-go", model: "deepseek-v4.1-flash", reasoningEffort: "high" },
  ]);
  const state = await fake.call("/dsh-preset-editor/state");
  assert.ok(
    state.json.projectRuntime.applied.some((row) => row.kind === "model"),
    "诊断里应有模型套用记录",
  );
  fake.cleanup();
});

test("会话已有显式模型选择时，不覆盖预设绑定模型", async () => {
  writeStore({
    version: 3,
    presets: {
      "pi-spider": preset("pi-spider", "Pi 蜘蛛", {
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
      }),
    },
    projectDefaults: {
      enabled: true,
      rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }],
    },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session, model: { select: (selection) => fake.modelSelections.push(selection) } };
  const fake = makeFakeContext({
    agentForSession: () => agent,
    sessionProjections: {
      snapshot: () => ({
        values: { modelSelection: { lastUsed: { provider: "x", model: "y" }, next: null } },
      }),
    },
  });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  await fake.emit("agent/created", { agent, source: "startup" });

  assert.equal(fake.modelSelections.length, 0);
  fake.cleanup();
});

test("预设绑定的模型不可用时跳过并记录诊断", async () => {
  writeStore({
    version: 3,
    presets: {
      "pi-spider": preset("pi-spider", "Pi 蜘蛛", {
        provider: "opencode-go",
        model: "gone-model",
      }),
    },
    projectDefaults: {
      enabled: true,
      rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true }],
    },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session, model: { select: (selection) => fake.modelSelections.push(selection) } };
  const fake = makeFakeContext({
    agentForSession: () => agent,
    unavailableModels: ["opencode-go/gone-model"],
  });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  await fake.emit("agent/created", { agent, source: "startup" });

  assert.equal(fake.modelSelections.length, 0);
  const state = await fake.call("/dsh-preset-editor/state");
  assert.ok(
    state.json.projectRuntime.skipped.some((row) => /模型不可用/.test(row.reason)),
    "诊断里应有模型不可用记录",
  );
  fake.cleanup();
});

test("用户手选自定义预设（agent-preset/selected）后也会套用绑定的默认模型", async () => {
  writeStore({
    version: 3,
    presets: {
      "pi-spider": preset("pi-spider", "Pi 蜘蛛", {
        provider: "opencode-go",
        model: "deepseek-v4.1-flash",
        reasoningEffort: "low",
      }),
    },
    projectDefaults: { enabled: false, rules: [] },
  });
  const session = sessionFor(RULE_DIR);
  const agent = { id: session.id, session, model: { select: (selection) => fake.modelSelections.push(selection) } };
  const currentRef = { value: "standard" };
  const fake = makeFakeContext({
    agentForSession: () => agent,
    currentPreset: () => currentRef.value,
  });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  // 模拟官方客户端手选预设后，会话 projection 已经更新为 pi-spider
  currentRef.value = "pi-spider";
  await fake.emit("session/event", session, {
    type: "agent-preset/selected",
    data: { agentPreset: "pi-spider" },
  });
  await new Promise((resolve) => setTimeout(resolve, 50));

  assert.equal(fake.selectCalls.length, 0, "未开启目录规则，不应再切预设");
  assert.deepEqual(fake.modelSelections, [
    { provider: "opencode-go", model: "deepseek-v4.1-flash", reasoningEffort: "low" },
  ]);
  fake.cleanup();
});

test("HTTP /projects 允许保存官方预设规则，未知预设仍拒绝", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: false, rules: [] },
  });
  const fake = makeFakeContext({
    roster: [
      { id: "pi-spider", name: "Pi 蜘蛛", order: 100 },
      { id: "standard", name: "standard", order: 10 },
      { id: "minimal", name: "极简", order: 20 },
    ],
  });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const official = await fake.call("/dsh-preset-editor/projects", {
    method: "POST",
    body: {
      projectDefaults: {
        enabled: true,
        rules: [{ id: "r1", path: RULE_DIR, presetId: "standard", enabled: true }],
      },
    },
  });
  assert.equal(official.status, 200, JSON.stringify(official.json));
  assert.equal(official.json.ok, true);
  assert.equal(official.json.projectDefaultsInfo.rules[0].presetSource, "official");

  const unknown = await fake.call("/dsh-preset-editor/projects", {
    method: "POST",
    body: {
      projectDefaults: {
        enabled: true,
        rules: [{ id: "r2", path: OTHER_DIR, presetId: "ghost-preset", enabled: true }],
      },
    },
  });
  assert.equal(unknown.status, 400);
  assert.match(unknown.json.error, /不存在或不可用/);
  fake.cleanup();
});

test("官方内置预设也能绑定默认模型（presetModels 映射），会话创建时套用", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    presetModels: {
      minimal: {
        provider: "opencode-go",
        model: "claude-haiku-5-5",
        reasoningEffort: "medium",
      },
    },
    projectDefaults: { enabled: false, rules: [] },
  });
  const session = sessionFor(OTHER_DIR);
  const agent = { id: session.id, session, model: { select: (selection) => fake.modelSelections.push(selection) } };
  const fake = makeFakeContext({ agentForSession: () => agent, defaultId: "minimal" });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  await fake.emit("agent/created", { agent, source: "startup" });

  assert.equal(fake.selectCalls.length, 0, "没有目录规则，不应切预设");
  assert.deepEqual(fake.modelSelections, [
    { provider: "opencode-go", model: "claude-haiku-5-5", reasoningEffort: "medium" },
  ]);
  fake.cleanup();
});

test("HTTP /preset-model：可以给官方预设保存/清除默认模型绑定", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: false, rules: [] },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const saved = await fake.call("/dsh-preset-editor/preset-model", {
    method: "POST",
    body: {
      presetId: "standard",
      model: { provider: "opencode-go", model: "claude-haiku-5-5", reasoningEffort: "high" },
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.json));
  assert.deepEqual(saved.json.doc.presetModels.standard, {
    provider: "opencode-go",
    model: "claude-haiku-5-5",
    reasoningEffort: "high",
  });
  const state = await fake.call("/dsh-preset-editor/state");
  const officialRow = state.json.presetRoster.find((row) => row.id === "standard");
  assert.deepEqual(officialRow.boundModel, {
    provider: "opencode-go",
    model: "claude-haiku-5-5",
    reasoningEffort: "high",
  });

  const cleared = await fake.call("/dsh-preset-editor/preset-model", {
    method: "POST",
    body: { presetId: "standard", model: null },
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.doc.presetModels.standard, undefined);

  const unknown = await fake.call("/dsh-preset-editor/preset-model", {
    method: "POST",
    body: { presetId: "ghost", model: { provider: "p", model: "m" } },
  });
  assert.equal(unknown.status, 400);
  fake.cleanup();
});

test("官方内置预设显示中文名（UI 名册），但仍以 raw id 工作", async () => {
  writeStore({ version: 3, presets: { "pi-spider": preset() }, projectDefaults: { enabled: false, rules: [] } });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const state = await fake.call("/dsh-preset-editor/state");
  const minimal = state.json.presetRoster.find((row) => row.id === "minimal");
  assert.equal(minimal.displayName, "极简");
  assert.equal(minimal.source, "official");
  assert.match(minimal.displayDescription, /极简/);
  fake.cleanup();
});

test("模型只是默认值：预设切换时更新自动默认，用户改过模型后不再覆盖", async () => {
  writeStore({
    version: 3,
    presets: {
      "preset-a": preset("preset-a", "Preset A", {
        provider: "opencode-go",
        model: "claude-haiku-5-5",
        reasoningEffort: "medium",
      }),
      "preset-b": preset("preset-b", "Preset B", {
        provider: "cpa",
        model: "nvidia-glm-5.3-flash",
        reasoningEffort: "high",
      }),
    },
    projectDefaults: {
      enabled: true,
      rules: [{ id: "r1", path: RULE_DIR, presetId: "preset-a", enabled: true }],
    },
  });
  const session = sessionFor(RULE_DIR);
  const modelState = { value: null };
  const agent = {
    id: session.id,
    session,
    model: {
      select: (selection) => {
        fake.modelSelections.push(selection);
        modelState.value = { lastUsed: null, next: selection };
      },
    },
  };
  const currentRef = { value: "standard" };
  const fake = makeFakeContext({
    agentForSession: () => agent,
    currentPreset: () => currentRef.value,
    sessionProjections: {
      snapshot: () => ({ values: { modelSelection: modelState.value } }),
    },
  });
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  // 1) 新会话：目录规则切 preset-a，套用它的默认模型 M1
  await fake.emit("agent/created", { agent, source: "startup" });
  assert.equal(fake.selectCalls.at(-1).presetId, "preset-a");
  assert.deepEqual(fake.modelSelections.at(-1), {
    provider: "opencode-go",
    model: "claude-haiku-5-5",
    reasoningEffort: "medium",
  });

  // 2) 用户切换预设到 preset-b：之前是自动默认，允许更新为 M2
  await fake.ctx.agentPresets.select(agent, "preset-b");
  currentRef.value = "preset-b";
  await fake.emit("session/event", session, {
    type: "agent-preset/selected",
    data: { agentPreset: "preset-b" },
  });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.deepEqual(fake.modelSelections.at(-1), {
    provider: "cpa",
    model: "nvidia-glm-5.3-flash",
    reasoningEffort: "high",
  });

  // 3) 用户手动改模型（模拟 UI 选模型，更新 projection）：之后切预设不应覆盖
  const userSelection = { provider: "opencode-go", model: "muse-spark-1.3-contributor", reasoningEffort: "low" };
  modelState.value = { lastUsed: null, next: userSelection };
  await fake.ctx.agentPresets.select(agent, "preset-a");
  currentRef.value = "preset-a";
  const before = fake.modelSelections.length;
  await fake.emit("session/event", session, {
    type: "agent-preset/selected",
    data: { agentPreset: "preset-a" },
  });
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(fake.modelSelections.length, before, "用户改过模型后不应再自动覆盖");
  fake.cleanup();
});

test.after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
