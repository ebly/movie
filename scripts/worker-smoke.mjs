/**
 * Worker 生产代码预演（不需要 Cloudflare 账号，也不需要 workerd）。
 *
 * 为什么存在：本机缺 VC++ 运行库（api-ms-win-crt-*），workerd.exe 起不来，
 * 所以 `wrangler dev` / `wrangler d1 --local` 全部不可用。而 deploy 的打包链路
 * 走 esbuild、不依赖 workerd，于是这里先用 `wrangler deploy --dry-run` 打出
 * 真实部署产物，再用 node:sqlite 模拟 D1、用文件系统模拟 ASSETS 绑定，
 * 把 worker 的 fetch 入口当普通模块跑起来。
 *
 * 验证的是 bundle 本身，不是源码：路由、鉴权、SQL、catalog 缓存失效都在真实路径上。
 *
 * 跑法：npm run smoke:worker
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(os.tmpdir(), "yingtu-worker-smoke");
const BUNDLE = path.join(OUT_DIR, "index.js");

/* ---------------- 1. 打包（走真实 wrangler 构建） ---------------- */

console.log("→ wrangler deploy --dry-run 打包中…");
fs.rmSync(OUT_DIR, { recursive: true, force: true });
const build = spawnSync(
  "npx",
  ["wrangler", "deploy", "--dry-run", "--outdir", OUT_DIR],
  { cwd: ROOT, shell: true, encoding: "utf8", env: { ...process.env, CI: "1" } }
);
if (build.status !== 0 || !fs.existsSync(BUNDLE)) {
  console.error("打包失败，无法预演：");
  console.error((build.stdout || "") + (build.stderr || ""));
  process.exit(1);
}
console.log(`  产物 ${(fs.statSync(BUNDLE).size / 1024).toFixed(0)} KB → ${BUNDLE}\n`);

let pass = 0;
let fail = 0;
function ok(name, extra = "") {
  pass += 1;
  console.log(`  ok   ${name}${extra ? "  " + extra : ""}`);
}
function bad(name, detail) {
  fail += 1;
  console.log(`  FAIL ${name}  ${detail}`);
}
function check(name, condition, detail = "") {
  if (condition) ok(name, detail);
  else bad(name, detail || "断言失败");
}

/* ---------------- D1 适配器 ---------------- */

function makeD1(db) {
  let counter = 0;
  const isWriteSQL = (sql) => /^\s*(insert|update|delete|replace|create|drop)/i.test(sql);

  class Stmt {
    constructor(sql, params = []) {
      this.statement = sql;
      this.params = params;
      this._id = ++counter;
    }
    bind(...args) {
      return new Stmt(this.statement, args);
    }
    /** 统一的执行入口：写语句走 run 语义，读语句走 all 语义。 */
    _exec() {
      try {
        if (isWriteSQL(this.statement)) {
          const info = db.prepare(this.statement).run(...this.params);
          return Promise.resolve({
            success: true,
            meta: { changes: info.changes, last_row_id: info.lastInsertRowid },
            results: []
          });
        }
        return Promise.resolve({
          results: db.prepare(this.statement).all(...this.params),
          success: true,
          meta: {}
        });
      } catch (err) {
        return Promise.reject(err);
      }
    }
    /**
     * 真实 D1 的 .all() 返回的 Promise 同时被当成 prepared statement 塞进 batch，
     * 所以这里返回一个 thenable 且带 statement/params 的对象。
     */
    all() {
      const self = this;
      return {
        statement: self.statement,
        params: self.params,
        _exec: () => self._exec(),
        then: (resolve, reject) => self._exec().then(resolve, reject),
        catch: (reject) => self._exec().catch(reject)
      };
    }
    first(col) {
      const row = db.prepare(this.statement).get(...this.params) ?? null;
      return Promise.resolve(col ? (row ? row[col] : null) : row);
    }
    run() {
      return this._exec();
    }
  }

  return {
    prepare(sql) {
      return new Stmt(sql);
    },
    async batch(statements) {
      // D1 的 batch 是事务性的；这里用事务包裹以贴近真实语义
      db.exec("BEGIN");
      try {
        const out = [];
        for (const stmt of statements) {
          out.push(await stmt._exec());
        }
        db.exec("COMMIT");
        return out;
      } catch (err) {
        db.exec("ROLLBACK");
        throw err;
      }
    },
    exec(sql) {
      db.exec(sql);
      return Promise.resolve({ count: 0, duration: 0 });
    },
    withSession() {
      return this;
    }
  };
}

/* ---------------- ASSETS 适配器（读 client/ 目录） ---------------- */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function makeAssets(root) {
  return {
    async fetch(request) {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!rel || rel.endsWith("/")) rel += "index.html";
      const file = path.join(root, rel);
      if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });
      try {
        const body = fs.readFileSync(file);
        return new Response(body, {
          status: 200,
          headers: { "content-type": MIME[path.extname(file)] || "application/octet-stream" }
        });
      } catch (err) {
        return new Response("not found", { status: 404 });
      }
    }
  };
}

/* ---------------- 建库 + 迁移 + 灌数据 ---------------- */

const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON");

const migrationsDir = path.join(ROOT, "worker", "migrations");
for (const file of fs.readdirSync(migrationsDir).sort()) {
  if (!file.endsWith(".sql")) continue;
  db.exec(fs.readFileSync(path.join(migrationsDir, file), "utf8"));
}
const seedPath = path.join(ROOT, "worker", "seed.sql");
if (fs.existsSync(seedPath)) db.exec(fs.readFileSync(seedPath, "utf8"));

console.log("建库完成：", db.prepare("SELECT COUNT(*) AS c FROM titles").get().c, "部作品 /",
  db.prepare("SELECT COUNT(*) AS c FROM offers").get().c, "条渠道");

/* ---------------- 起 Worker ---------------- */

const { default: worker } = await import(`file://${BUNDLE.replace(/\\/g, "/")}`);
const env = {
  DB: makeD1(db),
  ASSETS: makeAssets(path.join(ROOT, "client")),
  TMDB_BASE: "",
  ADMIN_PASSWORD: "smoke-pass-123",
  ADMIN_SECRET: "0123456789abcdef0123456789abcdef"
};

const pending = [];
const execution = {
  waitUntil(task) {
    pending.push(Promise.resolve(task).catch((err) => console.error("waitUntil 失败:", err)));
  },
  passThroughOnException() {}
};

const ORIGIN = "https://yingtu.example.workers.dev";
async function hit(pathname, init = {}) {
  const request = new Request(ORIGIN + pathname, init);
  const response = await worker.fetch(request, env, execution);
  return response;
}
async function hitJSON(pathname, init = {}) {
  const response = await hit(pathname, init);
  let body = null;
  try {
    body = await response.clone().json();
  } catch (err) {
    body = null;
  }
  return { response, body };
}
async function drain() {
  await Promise.all(pending);
  pending.length = 0;
}

console.log("\n=== 公开接口 ===");
{
  const { response, body } = await hitJSON("/api/health");
  check("GET /api/health", response.status === 200 && body.ok === true && body.name === "yingtu-api");
}

let brandRaw = "";
{
  const { response, body } = await hitJSON("/api/bootstrap");
  brandRaw = JSON.stringify(body);
  check("GET /api/bootstrap", response.status === 200 && body.providers && Object.keys(body.providers).length === 12,
    `${Object.keys(body.providers || {}).length} 个平台`);
  check("bootstrap 不含默认密码", !brandRaw.includes("defaultPassword"));
  check("bootstrap 不含内部 Cookie 名", !brandRaw.includes("yt_admin"));
  check("bootstrap 品牌字段收敛", body.brand && body.brand.defaultPassword === undefined);
}

{
  const { response, body } = await hitJSON("/api/search?q=" + encodeURIComponent("沙丘"));
  check("GET /api/search?q=沙丘", response.status === 200 && body.total >= 1, `${body && body.total} 条`);
}

{
  const { response, body } = await hitJSON("/api/titles/hotd");
  check("GET /api/titles/hotd", response.status === 200 && body.item && body.item.offers.length > 0);
}

console.log("\n=== 页面外壳 ===");
{
  const response = await hit("/title/hotd");
  const html = await response.text();
  check("GET /title/hotd", response.status === 200 && html.includes("<title"), "含注入后的 meta");
}
{
  const response = await hit("/");
  check("GET /", response.status === 200);
}
{
  const response = await hit("/robots.txt");
  const text = await response.text();
  check("robots.txt 不再屏蔽 /admin", response.status === 200 && !text.includes("/admin"), text.replace(/\n/g, " ").trim());
}
{
  const response = await hit("/sitemap.xml");
  check("GET /sitemap.xml", response.status === 200);
}
{
  const response = await hit("/admin");
  check("GET /admin 已下线", response.status === 404, `status=${response.status}`);
}
{
  const response = await hit("/go/hotd/0", { redirect: "manual" });
  check("GET /go/hotd/0 跳转", response.status === 302 && String(response.headers.get("location")).startsWith("https://"));
}

console.log("\n=== 后台 API（生产路径）===");
let cookie = "";
{
  const { response, body } = await hitJSON("/api/admin/session");
  check("未登录 session", response.status === 200 && body.authenticated === false);
}
{
  const bad = await hitJSON("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "wrong" })
  });
  check("错误密码被拒", bad.response.status === 401);

  const good = await hit("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "smoke-pass-123" })
  });
  const setCookie = good.headers.get("set-cookie") || good.headers.getSetCookie?.()?.[0] || "";
  cookie = setCookie.split(";")[0];
  check("正确密码登录", good.status === 200 && cookie.includes("yt_admin="), cookie.slice(0, 24));
}
{
  const { response, body } = await hitJSON("/api/admin/titles", { headers: { Cookie: cookie } });
  check("后台片库列表", response.status === 200 && body.total === 16, `${body && body.total} 部`);
}

const NEW_TITLE = {
  title: "预演验证片",
  original: "Smoke Test Title",
  year: 2026,
  type: "电影",
  rating: 8.1,
  genres: ["测试"],
  synopsis: "只在预演里存在的作品。",
  hot: true,
  art: { p1: "#e7dfcf", p2: "#b8aaa0", p3: "#8c3327", ink: "#1b2422", motif: "orbit" },
  offers: [{ pid: "netflix", tier: "订阅", quality: ["4K"], price: "含在订阅", verified: true }]
};

{
  const { response, body } = await hitJSON("/api/admin/titles", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify(NEW_TITLE)
  });
  check("后台新增作品", response.status === 201 && body.item && body.item.id === "smoke-test-title", body.item && body.item.id);

  const dbRow = db.prepare("SELECT COUNT(*) AS c FROM titles WHERE id = ?").get("smoke-test-title");
  check("新增写入 D1 titles 表", dbRow.c === 1);
  const offerRow = db.prepare("SELECT COUNT(*) AS c FROM offers WHERE title_id = ?").get("smoke-test-title");
  check("新增写入 D1 offers 表", offerRow.c === 1);
}
{
  const { body } = await hitJSON("/api/search?q=" + encodeURIComponent("预演验证片"));
  check("写入后前台立即可搜到（catalog 缓存已失效）", body.total >= 1 && body.items[0].id === "smoke-test-title");
}
{
  const { response } = await hitJSON("/api/admin/titles/smoke-test-title", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify({ ...NEW_TITLE, title: "预演验证片 改", rating: 9.4 })
  });
  check("后台编辑作品", response.status === 200);
  const row = db.prepare("SELECT title, rating FROM titles WHERE id = ?").get("smoke-test-title");
  check("编辑落库", row && row.title === "预演验证片 改" && row.rating === 9.4);
}
{
  const badPoster = await hitJSON("/api/admin/titles/smoke-test-title", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify({ ...NEW_TITLE, poster: "http://a.com/x.jpg" })
  });
  check("非法海报被拒", badPoster.response.status === 422);

  const removed = await hitJSON("/api/admin/titles/smoke-test-title", {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: ORIGIN }
  });
  check("后台删除作品", removed.response.status === 200);
  const left = db.prepare("SELECT COUNT(*) AS c FROM titles WHERE id = ?").get("smoke-test-title");
  check("删除同时清掉渠道", left.c === 0 && db.prepare("SELECT COUNT(*) AS c FROM offers WHERE title_id = ?").get("smoke-test-title").c === 0);
}

console.log("\n=== 埋点与看板 ===");
{
  await hit("/api/search?q=" + encodeURIComponent("zzz-没有结果"));
  await hit("/api/titles/hotd");
  await hit("/go/hotd/0", { redirect: "manual" });
  await drain();
  const events = db.prepare("SELECT kind, COUNT(*) AS c FROM events GROUP BY kind").all();
  check("埋点写入 events 表", events.length >= 2, events.map((e) => `${e.kind}:${e.c}`).join(" "));

  const { response, body } = await hitJSON("/api/admin/dashboard?days=7", { headers: { Cookie: cookie } });
  check("后台看板", response.status === 200 && body.trend.length === 7 && body.overview.searches >= 1,
    `搜索 ${body && body.overview && body.overview.searches} / 浏览 ${body && body.overview && body.overview.views} / 跳转 ${body && body.overview && body.overview.clicks}`);
}
{
  const feedback = await hit("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "预演反馈" })
  });
  check("前台提交反馈", feedback.status === 201);
  const { body } = await hitJSON("/api/admin/feedback?limit=5", { headers: { Cookie: cookie } });
  check("后台反馈收件箱", body.total >= 1, `${body && body.total} 条`);
}

console.log("\n=== 鉴权边界 ===");
{
  const noAuth = await hitJSON("/api/admin/titles");
  check("无会话访问后台接口 401", noAuth.response.status === 401);

  const crossOrigin = await hitJSON("/api/admin/titles", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: "https://evil.example.com" },
    body: JSON.stringify(NEW_TITLE)
  });
  check("跨站写请求被拒", crossOrigin.response.status === 403);

  const legacy = await hitJSON("/api/admin/does-not-exist", { headers: { Cookie: cookie } });
  check("未知后台接口 404", legacy.response.status === 404);
}

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
