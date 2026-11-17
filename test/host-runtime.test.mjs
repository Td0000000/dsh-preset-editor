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

const RULE_DIR = path.resolve(tmpHome, "project-a");
const OTHER_DIR = path.resolve(tmpHome, "project-b");

function preset(id = "pi-spider", name = "Pi 蜘蛛") {
  return {
    id,
    name,
    description: "",
    order: 100,
    enabledTools: ["time-context"],
    entries: [{ id: "e-1", role: "system", text: "system prompt", enabled: true }],
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
  const defaultId = options.defaultId ?? "standard";
  const currentPreset = options.currentPreset; // (session) => string | null

  const agentPresets = {
    get defaultId() {
      return defaultId;
    },
    register: async () => async () => {},
    resolve: async (id) => ({ id: id ?? defaultId }),
    composedPreset: () => undefined,
    presetForSession: (session) => (currentPreset ? currentPreset(session) : defaultId),
    select: async (agent, id) => {
      selectCalls.push({ sessionId: String(agent?.session?.id), presetId: id });
      return id;
    },
  };

  const agents = {
    turnBoundaryOf: (session) => options.boundaryFor?.(session) ?? { openTurnStartSeq: null, lastTurn: 0 },
    get: (id) => (options.agentForSession ? options.agentForSession(id) : undefined),
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
      return undefined;
    },
    agentPresets,
    agents,
    llm: { stream: () => (async function* () {})() },
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
  await new Promise((resolve) => setTimeout(resolve, 30)); // 等 registry.sync 完成

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
    await new Promise((resolve) => setTimeout(resolve, 30));
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
  await new Promise((resolve) => setTimeout(resolve, 30));
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
    await new Promise((resolve) => setTimeout(resolve, 30));
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
  await new Promise((resolve) => setTimeout(resolve, 30));
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
  await new Promise((resolve) => setTimeout(resolve, 30));

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
  await new Promise((resolve) => setTimeout(resolve, 30));

  // 模拟宿主复用 live blank 会话时把预设重置回官方默认 standard
  await fake.emit("session/event", session, { type: "agent-preset/selected", data: { agentPreset: "standard" } });
  await new Promise((resolve) => setTimeout(resolve, 40));

  assert.equal(fake.selectCalls.length, 1);
  assert.equal(fake.selectCalls[0].presetId, "pi-spider");
  const state = await fake.call("/dsh-preset-editor/state");
  assert.equal(state.json.projectRuntime.applied[0].reason, "blank 会话被重置回官方默认，重新套用目录规则");
  fake.cleanup();
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
    await new Promise((resolve) => setTimeout(resolve, 30));
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
  await new Promise((resolve) => setTimeout(resolve, 30));
  await fake.emit("session/event", session, { type: "agent-preset/selected", data: { agentPreset: "standard" } });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(fake.selectCalls.length, 0);
  fake.cleanup();
});

test.after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
