// seed-d1.mjs — 把 server/data/seed.js 的演示片库导出为 worker/seed.sql（D1 可直接执行）。
// 用法：node scripts/seed-d1.mjs 生成；npm run db:seed 会先生成再导入本地 D1。
// 幂等：先清空 titles/offers（offers 依赖 ON DELETE CASCADE 不保证开启，显式删除），再整表插入。

import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { DATA } = require(path.join(root, "server", "data", "seed.js"));

const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;
const sqlValue = (value) => (value == null ? "NULL" : quote(value));
const NOW = quote(new Date().toISOString());

const lines = [
  "-- worker/seed.sql — 由 scripts/seed-d1.mjs 生成，请勿手工编辑。",
  "DELETE FROM offers;",
  "DELETE FROM titles;",
  ""
];

for (const item of DATA) {
  lines.push(
    `INSERT INTO titles (id, title, original, year, type, rating, seasons, runtime, genres, synopsis, aliases, tags, hot, poster, art, created_at, updated_at) VALUES (` +
    [
      sqlValue(item.id), sqlValue(item.title), sqlValue(item.original), item.year,
      sqlValue(item.type), item.rating, sqlValue(item.seasons ?? null), sqlValue(item.runtime ?? null),
      quote(JSON.stringify(item.genres || [])), sqlValue(item.synopsis || ""),
      quote(JSON.stringify(item.aliases || [])), quote(JSON.stringify(item.tags || [])),
      item.hot ? 1 : 0, sqlValue(item.poster ?? null), quote(JSON.stringify(item.art || {})),
      NOW, NOW
    ].join(", ") +
    ");"
  );
  (item.offers || []).forEach((offerItem, index) => {
    lines.push(
      `INSERT INTO offers (title_id, position, pid, tier, season, quality, price, verified) VALUES (` +
      [
        sqlValue(item.id), index, sqlValue(offerItem.pid), sqlValue(offerItem.tier),
        sqlValue(offerItem.season ?? null), quote(JSON.stringify(offerItem.quality || [])),
        sqlValue(offerItem.price || ""), offerItem.verified ? 1 : 0
      ].join(", ") +
      ");"
    );
  });
}

lines.push("");

const out = path.join(root, "worker", "seed.sql");
writeFileSync(out, lines.join("\n"), "utf8");

const offerCount = DATA.reduce((sum, item) => sum + (item.offers || []).length, 0);
console.log(`seed.sql 已生成：${DATA.length} 部作品、${offerCount} 条观看渠道 -> ${path.relative(root, out)}`);
