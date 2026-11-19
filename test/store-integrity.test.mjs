// 回归测试：删除级联、同 ID 覆盖、损坏条目保留、并发写丢失（v1.11.0 修复项）
// 运行：node --test test/store-integrity.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-preset-editor-integrity-"));
process.env.DSH_HOME = tmpHome;
const core = await import("../lib/core.js");

function storeFile() {
  return path.join(tmpHome, "preset-editor.json");
}

function writeDoc(doc) {
  fs.writeFileSync(storeFile(), JSON.stringify(doc, null, 2), "utf8");
}

function readRaw() {
  return JSON.parse(fs.readFileSync(storeFile(), "utf8"));
}

function preset(id = "spider", name = id) {
  return {
    id,
    name,
    description: "",
    order: 100,
    enabledTools: ["time-context"],
    entries: [{ id: "e-1", role: "system", text: "系统提示词 " + id, enabled: true }],
  };
}

test.beforeEach(() => {
  writeDoc({ version: 3, presets: {}, presetModels: {}, projectDefaults: { enabled: true, rules: [] } });
});

test("deletePreset：级联清理引用它的目录规则", async () => {
  const dir = path.resolve(tmpHome, "proj-a");
  const otherDir = path.resolve(tmpHome, "proj-b");
  await core.savePreset(preset("spider"));
  await core.savePreset(preset("other"));
  await core.saveProjectDefaults({
    enabled: true,
    rules: [
      { path: dir, presetId: "spider" },
      { path: otherDir, presetId: "other" },
    ],
  });

  const result = await core.deletePreset("spider");
  assert.equal(result.removedRules.length, 1);
  assert.equal(result.removedRules[0].presetId, "spider");

  const doc = core.loadPresetsDoc();
  assert.equal(doc.presets.spider, undefined);
  assert.deepEqual(doc.projectDefaults.rules.map((r) => r.presetId), ["other"]);

  // 关键：删除后「项目默认」仍然可以保存（旧版本这里会永久失败）
  await core.saveProjectDefaults(doc.projectDefaults);
  assert.equal(readRaw().projectDefaults.rules.length, 1);
});

test("deletePreset：删除后重建同 ID，旧规则不会静默复活", async () => {
  const dir = path.resolve(tmpHome, "revive");
  await core.savePreset(preset("spider"));
  await core.saveProjectDefaults({ enabled: true, rules: [{ path: dir, presetId: "spider" }] });
  await core.deletePreset("spider");
  await core.savePreset(preset("spider", "重建的蜘蛛"));
  const doc = core.loadPresetsDoc();
  assert.equal(doc.projectDefaults.rules.length, 0, "旧规则应随删除一起清理，不复活");
});

test("deletePreset：keepRules 可保留规则但默认清理；不存在时抛错", async () => {
  const dir = path.resolve(tmpHome, "keep");
  await core.savePreset(preset("spider"));
  await core.saveProjectDefaults({ enabled: true, rules: [{ path: dir, presetId: "spider" }] });
  const kept = await core.deletePreset("spider", { keepRules: true });
  assert.equal(kept.removedRules.length, 0);
  assert.equal(core.loadPresetsDoc().projectDefaults.rules.length, 1);

  await assert.rejects(core.deletePreset("ghost"), /不存在/);
  await assert.rejects(core.deletePreset(""), /缺少/);
});

test("deletePreset：同时清理 presetModels 残留", async () => {
  await core.savePresetModel("minimal", { provider: "p", model: "m" }, {
    isPresetAvailable: () => true,
  });
  const result = await core.deletePreset("minimal");
  assert.deepEqual(result.removedModelBinding, { provider: "p", model: "m" });
  assert.equal(core.loadPresetsDoc().presetModels.minimal, undefined);
});

test("planPresetDeletion：删除前列出将被清理的规则与绑定", async () => {
  const dir = path.resolve(tmpHome, "plan");
  await core.savePreset(preset("spider"), { onConflict: "overwrite" });
  await core.saveProjectDefaults({ enabled: true, rules: [{ path: dir, presetId: "spider" }] });
  const plan = core.planPresetDeletion("spider");
  assert.equal(plan.preset.id, "spider");
  assert.equal(plan.rules.length, 1);
  assert.equal(plan.rules[0].path, dir);
});

test("savePreset：默认拒绝用已存在的 ID 覆盖", async () => {
  await core.savePreset(preset("spider", "原版"));
  await assert.rejects(core.savePreset(preset("spider", "冒名者")), /已存在/);
  assert.equal(core.loadPresetsDoc().presets.spider.name, "原版", "旧预设必须完好");

  // 官方内置 ID 同样被占用，不能悄悄创建同 ID 自定义预设
  await assert.rejects(
    core.savePreset(preset("minimal")),
    /已被占用|冲突/,
  );
});

test("savePreset：overwrite 显式覆盖、rename 自动另存", async () => {
  await core.savePreset(preset("spider", "原版"));
  const overwritten = await core.savePreset(preset("spider", "新版"), { onConflict: "overwrite" });
  assert.equal(overwritten.preset.name, "新版");
  assert.equal(core.loadPresetsDoc().presets.spider.name, "新版");

  const renamed = await core.savePreset(preset("spider", "另存"), { onConflict: "rename" });
  assert.equal(renamed.preset.id, "spider-2");
  const doc = core.loadPresetsDoc();
  assert.equal(doc.presets.spider.name, "新版");
  assert.equal(doc.presets["spider-2"].name, "另存");
});

test("createPreset：语义等价于「ID 必须全新」", async () => {
  await core.createPreset(preset("fresh"));
  assert.ok(core.loadPresetsDoc().presets.fresh);
  await assert.rejects(core.createPreset(preset("fresh")), /已存在/);
});

test("损坏条目：读时收集、写时原样保留，绝不静默删除", async () => {
  writeDoc({
    version: 3,
    presets: {
      good: preset("good"),
      broken: { id: "broken", name: "坏的", entries: [{ role: "tool", text: "x" }] },
      "Bad_ID": { id: "Bad_ID", name: "坏 ID", entries: [{ role: "system", text: "x" }] },
    },
  });

  const doc = core.loadPresetsDoc();
  assert.deepEqual(Object.keys(doc.presets), ["good"]);
  assert.equal(doc.invalidPresets.length, 2);

  // 任意一次无关保存后，坏条目仍在磁盘上
  await core.savePreset(preset("another"));
  const raw = readRaw();
  assert.ok(raw.presets.broken, "坏条目不应因一次无关保存而消失");
  assert.ok(raw.presets["Bad_ID"], "非法 ID 条目也应保留");
  assert.ok(raw.presets.another);
  assert.ok(raw.presets.good);
});

test("purgeInvalidPresets：只有显式调用才真正删除坏条目", async () => {
  writeDoc({
    version: 3,
    presets: {
      good: preset("good"),
      broken: { id: "broken", name: "坏的", entries: [{ role: "tool", text: "x" }] },
    },
  });
  const result = await core.purgeInvalidPresets();
  assert.deepEqual(result.removed, ["broken"]);
  const raw = readRaw();
  assert.equal(raw.presets.broken, undefined);
  assert.ok(raw.presets.good);
});

test("并发保存不丢更新：读-改-写整体串行", async () => {
  const ids = Array.from({ length: 6 }, (_, i) => "race-" + i);
  await Promise.allSettled(ids.map((id) => core.savePreset(preset(id))));
  const doc = core.loadPresetsDoc();
  for (const id of ids) assert.ok(doc.presets[id], `并发保存丢失了 ${id}`);
});

test("并发删除与保存互不覆盖", async () => {
  await core.savePreset(preset("victim"));
  await core.savePreset(preset("bystander"));
  await Promise.allSettled([
    core.deletePreset("victim"),
    core.savePreset(preset("newcomer")),
  ]);
  const doc = core.loadPresetsDoc();
  assert.equal(doc.presets.victim, undefined);
  assert.ok(doc.presets.newcomer);
  assert.ok(doc.presets.bystander);
});

test("损坏的存储文件：写操作拒绝执行且不改写原文件", async () => {
  fs.writeFileSync(storeFile(), "{oops", "utf8");
  await assert.rejects(core.deletePreset("spider"), /无法解析/);
  await assert.rejects(core.savePreset(preset("spider")), /无法解析/);
  assert.equal(fs.readFileSync(storeFile(), "utf8"), "{oops");
});

test.after(() => {
  fs.rmSync(tmpHome, { recursive: true, force: true });
});
