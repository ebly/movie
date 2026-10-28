"use strict";

/* 品牌一致性守卫：换品牌只需要改 config/brand.json，这个测试负责保证没有别处漏改。 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const BRAND = require("../config/brand.json");

const SCAN_DIRS = ["server", "worker", "client", "config", "scripts", "test", "docs"];
const SCAN_FILES = ["README.md", "package.json", "wrangler.toml"];
const SKIP_DIRS = new Set(["node_modules", ".wrangler", ".wr4", ".git", ".verify", "data"]);
const LEGACY = /cinepaw|cp_admin|cp_vid/i;
const SELF = path.join(__dirname, "brand.test.js");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (/\.(js|mjs|cjs|json|html|css|md|toml|sql|txt)$/.test(entry.name)) yield full;
  }
}

function legacyHits() {
  const hits = [];
  const files = [
    ...SCAN_FILES.map((file) => path.join(ROOT, file)),
    ...SCAN_DIRS.filter((dir) => fs.existsSync(path.join(ROOT, dir))).flatMap((dir) => [...walk(path.join(ROOT, dir))])
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    if (path.resolve(file) === SELF) continue;
    const text = fs.readFileSync(file, "utf8");
    text.split("\n").forEach((line, index) => {
      if (LEGACY.test(line)) hits.push(`${path.relative(ROOT, file)}:${index + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  return hits;
}

describe(`${BRAND.name} 品牌一致性`, () => {
  test("config/brand.json 字段齐全", () => {
    for (const key of ["name", "latin", "slug", "tagline", "slogan", "apiName", "logPrefix", "defaultPassword", "disclaimer"]) {
      assert.ok(BRAND[key], `brand.json 缺少 ${key}`);
    }
    assert.ok(BRAND.cookies && BRAND.cookies.admin && BRAND.cookies.visitor, "brand.json 缺少 Cookie 名");
    assert.equal(BRAND.logPrefix, `[${BRAND.slug}]`);
  });

  test("源码与文档中不再出现旧品牌标识", () => {
    assert.deepEqual(legacyHits(), []);
  });

  test("Node 与 Worker 都从同一份 brand.json 取品牌", () => {
    const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
    assert.match(read("worker/config.js"), /import BRAND from "\.\.\/config\/brand\.json"/);
    assert.match(read("worker/adminAuth.js"), /import BRAND from "\.\.\/config\/brand\.json"/);
    // 管理后台已拆成独立项目 ../movie-admin，这里只校验前台项目内的引用。
    const serverUsesBrand = ["server/api.js", "server/lib/http.js", "server/app.js", "server/repository.js"]
      .filter((file) => /config\/brand\.json/.test(read(file)));
    assert.equal(serverUsesBrand.length, 4, `Node 侧应全部引用 brand.json，实际：${serverUsesBrand.join(", ")}`);
    assert.match(read("server/lib/http.js"), /BRAND\.cookies\.visitor/);
  });
});
