"use strict";

// 守卫测试：wrangler.toml 的 run_worker_first 白名单必须覆盖所有前台页面路由。
// 漏掉一条的表现是「页面能打开，但没有 title/description/JSON-LD」——线上很难发现，
// 所以这里用测试代替肉眼检查。
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

function whitelist() {
  const toml = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
  const block = /run_worker_first\s*=\s*\[([\s\S]*?)\]/.exec(toml);
  assert.ok(block, "wrangler.toml 里找不到 run_worker_first 数组（可能被改回了 true）");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function covered(rules, pathname) {
  return rules.some((rule) =>
    rule.endsWith("/*") ? pathname.startsWith(rule.slice(0, -1)) : pathname === rule
  );
}

test("页面路由都在 Worker 白名单里（否则拿不到注入的 meta）", () => {
  const rules = whitelist();
  const pages = [
    "/",
    "/index.html",
    "/search",
    "/search/",
    "/list",
    "/list/",
    "/title/hotd",
    "/title/severance",
    "/sitemap.xml",
    "/robots.txt",
    "/api/bootstrap",
    "/api/search",
    "/api/admin/titles",
    "/go/hotd/0",
    "/admin",
    "/admin/"
  ];
  const missing = pages.filter((pathname) => !covered(rules, pathname));
  assert.deepEqual(missing, [], `这些路由没进白名单：${missing.join(", ")}`);
});

test("静态资源不进 Worker（不消耗免费请求额度）", () => {
  const rules = whitelist();
  ["/styles.css", "/app.js", "/api.js", "/nope"].forEach((asset) => {
    assert.equal(covered(rules, asset), false, `${asset} 应该由静态资源直出`);
  });
});

test("index.html 的资源引用必须是绝对路径", () => {
  const html = fs.readFileSync(path.join(ROOT, "client", "index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
  const relative = refs.filter(
    (ref) => !/^(https?:|data:|\/|#|mailto:)/.test(ref)
  );
  assert.deepEqual(relative, [], `这些引用要用绝对路径：${relative.join(", ")}`);
});
