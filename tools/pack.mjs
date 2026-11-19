// 打包 dsh-preset-editor 安装包（npm pack 格式）。
//
// 为什么必须这样打包：plugin_manager 的 install_bundle 按 npm pack 布局解包，
// 顶层必须是 `package/`。直接用 `tar -czf x.tgz lib client.js ...` 打出来的包
// 解压后 lib/ 会丢失，安装报 ENOENT .../node_modules/dsh-preset-editor/lib/index.js。
//
// 用法：在仓库根目录执行  node tools/pack.mjs
// 产物：<仓库根>/dsh-preset-editor-<version>.tgz
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const repo = path.resolve(import.meta.dirname, "..");
const pkgJson = JSON.parse(fs.readFileSync(path.join(repo, "package.json"), "utf8"));
const version = pkgJson.version;
const out = path.join(repo, `dsh-preset-editor-${version}.tgz`);

// package.json 的 files 字段就是打包清单，按它收集，避免漏文件。
const entries = Array.isArray(pkgJson.files) ? pkgJson.files : [];
if (entries.length === 0) {
  console.error("package.json 缺少 files 字段，无法确定打包内容");
  process.exit(1);
}

const stage = fs.mkdtempSync(path.join(os.tmpdir(), "dsh-pe-pack-"));
const pkgDir = path.join(stage, "package");
fs.mkdirSync(pkgDir, { recursive: true });

for (const entry of entries) {
  const src = path.join(repo, entry);
  if (!fs.existsSync(src)) {
    console.warn(`跳过不存在的条目: ${entry}`);
    continue;
  }
  fs.cpSync(src, path.join(pkgDir, entry), { recursive: true });
}

fs.rmSync(out, { force: true });
execFileSync("tar", ["-czf", out, "package"], { cwd: stage, stdio: "inherit" });
fs.rmSync(stage, { recursive: true, force: true });

const stat = fs.statSync(out);
console.log(`已生成 ${out} (${stat.size} bytes)`);

// 自检：顶层必须是 package/
const listing = execFileSync("tar", ["-tzf", out], { encoding: "utf8" }).trim().split(/\r?\n/);
if (!listing[0].startsWith("package/")) {
  console.error("打包结构错误：顶层不是 package/，安装后 lib/ 会丢失");
  process.exit(1);
}
console.log("结构自检通过：顶层 package/");
