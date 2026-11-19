// HTTP 路由回归测试：删除级联、保存冲突、损坏条目清理（v1.11.0）
// 运行：node --test test/http-routes.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-preset-editor-http-"));
process.env.DSH_HOME = tmpHome;
const plugin = await import("../lib/index.js");
const core = await import("../lib/core.js");

const RULE_DIR = path.resolve(tmpHome, "project-a");
const OTHER_DIR = path.resolve(tmpHome, "project-b");

function storeFile() {
  return path.join(tmpHome, "preset-editor.json");
}

function writeStore(doc) {
  fs.writeFileSync(storeFile(), JSON.stringify(doc, null, 2), "utf8");
}

function readStore() {
  return JSON.parse(fs.readFileSync(storeFile(), "utf8"));
}

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

/** 最小假宿主：只要 agentPresets 名册 + webServer 路由。 */
function makeFakeContext() {
  const routes = [];
  const cleanups = [];
  const rosterRows = [
    { id: "pi-spider", name: "Pi 蜘蛛", order: 100 },
    { id: "standard", name: "standard", order: 10 },
  ];
  const disposable = () => {};
  const agentPresets = {
    get defaultId() {
      return "standard";
    },
    register: async () => disposable,
    list: async () => rosterRows,
    resolve: async (id) => ({ id }),
    composedPreset: () => undefined,
  };
  const host = {
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return () => {};
    },
    webServer: {
      register: (route) => {
        routes.push(route);
        return () => {};
      },
    },
  };
  const ctx = {
    on: () => () => {},
    effect: (fn) => {
      const cleanup = fn();
      if (typeof cleanup === "function") cleanups.push(cleanup);
      return () => {};
    },
    inject: (deps, callback) => {
      if (Array.isArray(deps) && deps.includes("webServer")) callback(host);
      return () => {};
    },
    get: (name) => {
      if (name === "webServer") return host;
      return undefined;
    },
    agentPresets,
    agents: { list: () => [], get: () => undefined, turnBoundaryOf: () => null },
    llm: { stream: () => (async function* () {})() },
    tools: { schemas: () => [] },
  };

  async function call(routePath, { method = "GET", url, body } = {}) {
    const route = routes.find((r) => r.path === routePath);
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
    call,
    routes,
    // 逐个执行插件注册的 cleanup：其中包含 fs.unwatchFile——不调用进程会被 watch 挂住不退出
    cleanup: () => {
      for (const cleanup of cleanups.reverse()) {
        try {
          cleanup();
        } catch {}
      }
    },
  };
}

test("POST /delete：返回并落盘级联清理的目录规则", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset(), other: preset("other", "另一个") },
    presetModels: {},
    projectDefaults: {
      enabled: true,
      rules: [
        { id: "r1", path: RULE_DIR, presetId: "pi-spider", enabled: true },
        { id: "r2", path: OTHER_DIR, presetId: "other", enabled: true },
      ],
    },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 60));

  const result = await fake.call("/dsh-preset-editor/delete", {
    method: "POST",
    body: { id: "pi-spider" },
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.ok, true);
  assert.deepEqual(result.json.removedRules.map((r) => r.presetId), ["pi-spider"]);
  assert.equal(result.json.doc.presets["pi-spider"], undefined);

  const raw = readStore();
  assert.deepEqual(raw.projectDefaults.rules.map((r) => r.presetId), ["other"]);

  // 删除后「项目默认」仍能正常保存（旧版本会永久 400）
  const save = await fake.call("/dsh-preset-editor/projects", {
    method: "POST",
    body: { projectDefaults: raw.projectDefaults },
  });
  assert.equal(save.status, 200);
  fake.cleanup();
});

test("POST /delete：id 不存在返回 404，dryRun 只预览不改盘", async () => {
  writeStore({
    version: 3,
    presets: { "pi-spider": preset() },
    projectDefaults: { enabled: true, rules: [{ id: "r1", path: RULE_DIR, presetId: "pi-spider" }] },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 60));

  const missing = await fake.call("/dsh-preset-editor/delete", {
    method: "POST",
    body: { id: "ghost" },
  });
  assert.equal(missing.status, 404);
  assert.match(missing.json.error, /不存在/);

  const dry = await fake.call("/dsh-preset-editor/delete", {
    method: "POST",
    body: { id: "pi-spider", dryRun: true },
  });
  assert.equal(dry.status, 200);
  assert.equal(dry.json.rules.length, 1);
  assert.equal(readStore().presets["pi-spider"].id, "pi-spider", "dryRun 不能改盘");
  fake.cleanup();
});

test("POST /save：新建撞车返回 409，编辑可显式覆盖", async () => {
  writeStore({ version: 3, presets: { "pi-spider": preset() }, projectDefaults: { enabled: false, rules: [] } });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 60));

  const conflict = await fake.call("/dsh-preset-editor/save", {
    method: "POST",
    body: { preset: preset("pi-spider", "冒名者"), onConflict: "error" },
  });
  assert.equal(conflict.status, 409);
  assert.match(conflict.json.error, /已存在/);
  assert.equal(readStore().presets["pi-spider"].name, "Pi 蜘蛛", "旧预设必须完好");

  const overwrite = await fake.call("/dsh-preset-editor/save", {
    method: "POST",
    body: { preset: preset("pi-spider", "新版"), onConflict: "overwrite" },
  });
  assert.equal(overwrite.status, 200);
  assert.equal(readStore().presets["pi-spider"].name, "新版");

  const rename = await fake.call("/dsh-preset-editor/save", {
    method: "POST",
    body: { preset: preset("pi-spider", "另存"), onConflict: "rename" },
  });
  assert.equal(rename.status, 200);
  assert.equal(rename.json.preset.id, "pi-spider-2");
  fake.cleanup();
});

test("POST /purge-invalid：显式清理坏条目，未清理前原样保留", async () => {
  writeStore({
    version: 3,
    presets: {
      good: preset("good", "正常"),
      broken: { id: "broken", name: "坏的", entries: [{ role: "tool", text: "x" }] },
    },
    projectDefaults: { enabled: false, rules: [] },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 60));

  const state = await fake.call("/dsh-preset-editor/state");
  assert.equal(state.json.invalidPresets.length, 1);
  assert.equal(state.json.invalidPresets[0].key, "broken");

  // 无关保存之后坏条目仍在盘上
  await fake.call("/dsh-preset-editor/save", {
    method: "POST",
    body: { preset: preset("another", "新预设") },
  });
  assert.ok(readStore().presets.broken, "坏条目不应因无关保存消失");

  const purged = await fake.call("/dsh-preset-editor/purge-invalid", {
    method: "POST",
    body: {},
  });
  assert.equal(purged.status, 200);
  assert.deepEqual(purged.json.removed, ["broken"]);
  assert.equal(readStore().presets.broken, undefined);
  assert.ok(readStore().presets.good);
  fake.cleanup();
});

test("POST /import：单预设默认不覆盖，整包备份可覆盖", async () => {
  writeStore({ version: 3, presets: { "pi-spider": preset() }, projectDefaults: { enabled: false, rules: [] } });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 60));

  const single = JSON.stringify(preset("pi-spider", "导入的冒名者"));
  const conflict = await fake.call("/dsh-preset-editor/import", {
    method: "POST",
    body: { raw: single, onConflict: "error" },
  });
  assert.equal(conflict.status, 500);
  assert.match(conflict.json.error, /已存在/);
  assert.equal(readStore().presets["pi-spider"].name, "Pi 蜘蛛");

  const backup = JSON.stringify({
    version: 3,
    presets: { "pi-spider": preset("pi-spider", "恢复的") },
  });
  const restored = await fake.call("/dsh-preset-editor/import", {
    method: "POST",
    body: { raw: backup, onConflict: "overwrite" },
  });
  assert.equal(restored.status, 200);
  assert.equal(readStore().presets["pi-spider"].name, "恢复的");
  fake.cleanup();
});

test("注册期校验：含非法模板变量的预设拒绝挂载，其余照常", async () => {
  writeStore({
    version: 3,
    presets: {
      good: preset("good", "正常"),
      bad: {
        ...preset("bad", "坏变量"),
        entries: [{ id: "e-1", role: "system", text: "当前目录 {{cwd}}", enabled: true }],
      },
    },
    projectDefaults: { enabled: false, rules: [] },
  });
  const fake = makeFakeContext();
  plugin.apply(fake.ctx);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const state = await fake.call("/dsh-preset-editor/state");
  // 保存层本应拦截，但外部直接改文件可以绕过——注册层必须拦住
  const warnings = state.json.registrationWarnings || state.json.templateWarnings || [];
  assert.ok(
    warnings.some((w) => w.presetId === "bad"),
    "非法模板变量必须在注册层被拒绝并上报",
  );
  assert.ok(warnings.every((w) => w.presetId !== "good"), "正常预设不应被误报");
  fake.cleanup();
});

test.after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
