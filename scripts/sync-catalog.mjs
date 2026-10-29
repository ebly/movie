// deploy 前把本地后台维护的目录快照拷进 client/data/，随 ASSETS 一起上线。
// 数据唯一来源是 data/titles.json（本地后台独占写）；线上目录为只读快照。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "data", "titles.json");
const targetDir = path.join(root, "client", "data");
const target = path.join(targetDir, "titles.json");

if (!fs.existsSync(source)) {
  console.error(`未找到目录数据：${source}`);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(source, "utf8"));
} catch (err) {
  console.error(`titles.json 不是合法 JSON：${err.message}`);
  process.exit(1);
}

const count = Array.isArray(parsed.items) ? parsed.items.length : 0;
if (!count) {
  console.error("titles.json 里没有 items，拒绝打包空目录。");
  process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`目录快照已同步：${count} 部作品 → client/data/titles.json`);
