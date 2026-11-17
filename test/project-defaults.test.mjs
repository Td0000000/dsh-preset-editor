// 纯逻辑单测：项目文件夹默认预设（不启动 DSH，不接触真实 profile）
// 运行：node --test test/project-defaults.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// 必须早于 import core.js：存储路径按 DSH_HOME 解析。
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-preset-editor-test-"));
process.env.DSH_HOME = tmpHome;
const core = await import("../lib/core.js");

function storeFile() {
  return path.join(tmpHome, "preset-editor.json");
}

function writeDoc(doc) {
  fs.writeFileSync(storeFile(), JSON.stringify(doc, null, 2), "utf8");
}

function samplePreset(id = "pi-spider") {
  return {
    id,
    name: id,
    description: "",
    order: 100,
    enabledTools: ["time-context"],
    entries: [{ id: "e-1", role: "system", text: "hi", enabled: true }],
  };
}

test("normalizeProjectPath：拒绝相对路径，接受绝对路径并去掉引号", () => {
  assert.throws(() => core.normalizeProjectPath("relative/dir"), /绝对路径/);
  assert.throws(() => core.normalizeProjectPath("  "), /不能为空/);
  const abs = path.resolve(tmpHome, "proj");
  assert.equal(core.normalizeProjectPath(`"${abs}"`), abs);
  assert.equal(core.normalizeProjectPath(abs + path.sep), abs);
});

test("findProjectRule：文件夹本身 + 子文件夹继承，就近规则优先", () => {
  const dir = path.resolve(tmpHome, "ProjOne");
  const child = path.join(dir, "sub");
  const grandChild = path.join(child, "deep");
  const defaults = {
    enabled: true,
    rules: [
      { id: "r1", path: dir, presetId: "pi-spider", enabled: true },
      { id: "r2", path: path.resolve(tmpHome, "other"), presetId: "pi-spider", enabled: false },
      { id: "r3", path: child, presetId: "child-preset", enabled: true },
    ],
  };
  assert.equal(core.findProjectRule(defaults, dir)?.id, "r1");
  assert.equal(core.findProjectRule(defaults, dir.toUpperCase())?.id, "r1");
  assert.equal(core.findProjectRule(defaults, dir + path.sep)?.id, "r1");
  assert.equal(core.findProjectRule(defaults, child)?.id, "r3", "子文件夹命中更具体的规则");
  assert.equal(core.findProjectRule(defaults, grandChild)?.id, "r3", "孙目录继承就近规则");
  assert.equal(core.findProjectRule(defaults, path.resolve(tmpHome, "other")), undefined, "禁用规则不命中");
  assert.equal(core.findProjectRule(defaults, path.resolve(tmpHome, "ProjOneSibling")), undefined, "不能误匹配相邻目录");
  // 关掉“包含子文件夹”的规则只匹配自己
  const exactOnly = path.resolve(tmpHome, "exact-only");
  const exactDefaults = {
    enabled: true,
    rules: [{ id: "r4", path: exactOnly, presetId: "x", enabled: true, subfolders: false }],
  };
  assert.equal(core.findProjectRule(exactDefaults, exactOnly)?.id, "r4");
  assert.equal(core.findProjectRule(exactDefaults, path.join(exactOnly, "sub")), undefined);
  assert.equal(core.findProjectRule(defaults, ""), undefined);
});

test("normalizeProjectDefaults：坏规则跳过、重复目录去重、默认关闭", () => {
  const dir = path.resolve(tmpHome, "dup");
  const normalized = core.normalizeProjectDefaults({
    rules: [
      { path: dir, presetId: "pi-spider" },
      { path: dir, presetId: "another" },
      { path: "", presetId: "pi-spider" },
      { path: path.resolve(tmpHome, "ok"), presetId: "" },
    ],
  });
  assert.equal(normalized.enabled, false);
  assert.equal(normalized.rules.length, 1);
  assert.equal(normalized.rules[0].path, dir);
  assert.match(normalized.rules[0].id, /^pd-/);
});

test("assertProjectDefaults：保存时严格报错（重复/缺字段）", () => {
  const dir = path.resolve(tmpHome, "strict");
  assert.throws(
    () => core.assertProjectDefaults({ rules: [{ path: dir, presetId: "a" }, { path: dir, presetId: "b" }] }),
    /重复/,
  );
  assert.throws(() => core.assertProjectDefaults({ rules: [{ path: dir }] }), /缺少预设 ID/);
});

test("normalizeDoc：v2 文档补 projectDefaults，预设保留", () => {
  const doc = core.normalizeDoc({ version: 2, presets: { "pi-spider": samplePreset() }, legacyField: 1 });
  assert.equal(doc.version, core.DOC_VERSION);
  assert.deepEqual(doc.projectDefaults, { enabled: false, rules: [] });
  assert.ok(doc.presets["pi-spider"]);
  assert.equal("legacyField" in doc, false);
});

test("saveProjectDefaults：持久化并拒绝不存在的预设", async () => {
  writeDoc({ version: 2, presets: { "pi-spider": samplePreset() } });
  const dir = path.resolve(tmpHome, "workspace-ok");
  const saved = await core.saveProjectDefaults({
    enabled: true,
    rules: [{ path: dir, presetId: "pi-spider" }],
  });
  assert.equal(saved.projectDefaults.enabled, true);
  const raw = JSON.parse(fs.readFileSync(storeFile(), "utf8"));
  assert.equal(raw.version, core.DOC_VERSION);
  assert.equal(raw.projectDefaults.rules[0].path, dir);
  assert.equal(raw.projectDefaults.rules[0].enabled, true);

  await assert.rejects(
    core.saveProjectDefaults({ enabled: true, rules: [{ path: dir, presetId: "missing" }] }),
    /预设不存在/,
  );
});

test("savePreset 不清掉已有 projectDefaults", async () => {
  writeDoc({ version: 3, presets: { "pi-spider": samplePreset() } });
  const dir = path.resolve(tmpHome, "keep");
  await core.saveProjectDefaults({ enabled: true, rules: [{ path: dir, presetId: "pi-spider" }] });
  await core.savePreset({ ...samplePreset("second"), name: "Second" });
  const doc = core.loadPresetsDoc();
  assert.equal(doc.projectDefaults.enabled, true);
  assert.equal(doc.projectDefaults.rules[0].path, dir);
  assert.ok(doc.presets.second);
});

test("importPresetData：整体备份可带回 projectDefaults", async () => {
  writeDoc({ version: 3, presets: { "pi-spider": samplePreset() } });
  const dir = path.resolve(tmpHome, "imported");
  const doc = await core.importPresetData({
    presets: { "pi-spider": samplePreset() },
    projectDefaults: { enabled: true, rules: [{ path: dir, presetId: "pi-spider" }] },
  });
  assert.equal(doc.projectDefaults.enabled, true);
  assert.equal(core.loadPresetsDoc().projectDefaults.rules[0].path, dir);
});

test("损坏的存储文件不会被 projectDefaults 保存覆盖", async () => {
  fs.writeFileSync(storeFile(), "{not json", "utf8");
  await assert.rejects(core.saveProjectDefaults({ enabled: true, rules: [] }), /无法解析/);
  assert.equal(fs.readFileSync(storeFile(), "utf8"), "{not json");
});

test("normalizePreset：保留默认模型绑定，非法绑定丢弃", () => {
  const withModel = core.normalizePreset({
    ...samplePreset(),
    model: { provider: "opencode-go", model: "deepseek-v4.1-flash", reasoningEffort: "high" },
  });
  assert.deepEqual(withModel.model, {
    provider: "opencode-go",
    model: "deepseek-v4.1-flash",
    reasoningEffort: "high",
  });
  const noEffort = core.normalizePreset({
    ...samplePreset(),
    model: { provider: "p", model: "m" },
  });
  assert.deepEqual(noEffort.model, { provider: "p", model: "m" });
  const invalid = core.normalizePreset({ ...samplePreset(), model: { provider: "p" } });
  assert.equal("model" in invalid, false);
});

test("savePreset / loadPresetsDoc 不丢预设的默认模型", async () => {
  writeDoc({ version: 3, presets: {} });
  await core.savePreset({
    ...samplePreset("with-model"),
    model: { provider: "p", model: "m", reasoningEffort: "low" },
  });
  const doc = core.loadPresetsDoc();
  assert.deepEqual(doc.presets["with-model"].model, {
    provider: "p",
    model: "m",
    reasoningEffort: "low",
  });
});

test("saveProjectDefaults：允许官方预设（isPresetAvailable 回调）", async () => {
  writeDoc({ version: 3, presets: { "pi-spider": samplePreset() } });
  const dir = path.resolve(tmpHome, "official");
  const saved = await core.saveProjectDefaults(
    { enabled: true, rules: [{ path: dir, presetId: "minimal" }] },
    { isPresetAvailable: (id) => id === "minimal" || id === "pi-spider" },
  );
  assert.equal(saved.projectDefaults.rules[0].presetId, "minimal");
  await assert.rejects(
    core.saveProjectDefaults(
      { enabled: true, rules: [{ path: dir, presetId: "ghost" }] },
      { isPresetAvailable: (id) => id === "minimal" },
    ),
    /不存在或不可用/,
  );
});

test("importPresetData：整体备份里的官方预设规则需要 isPresetAvailable 放行", async () => {
  writeDoc({ version: 3, presets: { "pi-spider": samplePreset() } });
  const dir = path.resolve(tmpHome, "imported-official");
  const data = {
    presets: { "pi-spider": samplePreset() },
    projectDefaults: { enabled: true, rules: [{ path: dir, presetId: "minimal" }] },
  };
  await assert.rejects(core.importPresetData(data), /不存在的预设/);
  const doc = await core.importPresetData(data, {
    isPresetAvailable: (id) => id === "minimal" || id === "pi-spider",
  });
  assert.equal(doc.projectDefaults.rules[0].presetId, "minimal");
});

test("presetModels / 自定义预设模型绑定：官方写映射，自定义写回预设自身", async () => {
  writeDoc({
    version: 3,
    presets: { "pi-spider": samplePreset(), "custom-a": samplePreset("custom-a") },
  });
  // 官方预设：写入 presetModels
  await core.savePresetModel(
    "minimal",
    { provider: "opencode-go", model: "claude-haiku-5-5", reasoningEffort: "medium" },
    { isPresetAvailable: (id) => id === "minimal" || id === "custom-a" || id === "pi-spider" },
  );
  let doc = core.loadPresetsDoc();
  assert.deepEqual(doc.presetModels.minimal, {
    provider: "opencode-go",
    model: "claude-haiku-5-5",
    reasoningEffort: "medium",
  });
  assert.deepEqual(core.findPresetModelBinding(doc, "minimal"), doc.presetModels.minimal);
  assert.equal(core.findPresetModelBinding(doc, "unknown-preset"), undefined);

  // 自定义预设：写入 preset.model（预设编辑页与列表入口共用同一个存储）
  await core.savePresetModel(
    "custom-a",
    { provider: "cpa", model: "nvidia-glm-5.3-flash", reasoningEffort: "high" },
    { isPresetAvailable: () => true },
  );
  doc = core.loadPresetsDoc();
  assert.deepEqual(doc.presets["custom-a"].model, {
    provider: "cpa",
    model: "nvidia-glm-5.3-flash",
    reasoningEffort: "high",
  });
  assert.equal(doc.presetModels["custom-a"], undefined);

  // 清除自定义绑定
  await core.savePresetModel("custom-a", null, { isPresetAvailable: () => true });
  doc = core.loadPresetsDoc();
  assert.equal(core.findPresetModelBinding(doc, "custom-a"), undefined);

  // 清除官方绑定
  await core.savePresetModel("minimal", null, { isPresetAvailable: () => true });
  doc = core.loadPresetsDoc();
  assert.equal(core.findPresetModelBinding(doc, "minimal"), undefined);

  await assert.rejects(
    core.savePresetModel("ghost", { provider: "p", model: "m" }, { isPresetAvailable: () => false }),
    /不存在或不可用/,
  );
});

test("normalizeDoc：保留 presetModels，坏绑定丢弃", () => {
  const doc = core.normalizeDoc({
    version: 3,
    presets: { "pi-spider": samplePreset() },
    presetModels: {
      minimal: { provider: "p", model: "m", reasoningEffort: "high" },
      broken: { provider: "p" },
    },
  });
  assert.deepEqual(doc.presetModels, { minimal: { provider: "p", model: "m", reasoningEffort: "high" } });
});

test.after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
