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

test("findProjectRule：完全匹配、忽略大小写与末尾分隔符", () => {
  const dir = path.resolve(tmpHome, "ProjOne");
  const defaults = {
    enabled: true,
    rules: [
      { id: "r1", path: dir, presetId: "pi-spider", enabled: true },
      { id: "r2", path: path.resolve(tmpHome, "other"), presetId: "pi-spider", enabled: false },
    ],
  };
  assert.equal(core.findProjectRule(defaults, dir)?.id, "r1");
  assert.equal(core.findProjectRule(defaults, dir.toUpperCase())?.id, "r1");
  assert.equal(core.findProjectRule(defaults, dir + path.sep)?.id, "r1");
  assert.equal(core.findProjectRule(defaults, path.join(dir, "sub")), undefined);
  assert.equal(core.findProjectRule(defaults, path.resolve(tmpHome, "other")), undefined, "禁用规则不命中");
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

test.after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
