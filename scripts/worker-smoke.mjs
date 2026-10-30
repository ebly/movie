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
// 目录（titles/offers）已在 0003 迁移中下线：数据来自部署打包的 client/data/titles.json，
// D1 只保留 feedback / events / meta。

console.log("建库完成：D1 仅存统计与反馈表；目录走 ASSETS 快照");

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
/**
 * 带上 request.cf 的请求：本地 Request 没有 cf 字段，用 defineProperty 挂上去，
 * 模拟 Cloudflare 边缘真正会给出的 country / city / asn / asOrganization。
 */
async function hitWithCf(pathname, init = {}, cf = {}) {
  const request = new Request(ORIGIN + pathname, init);
  Object.defineProperty(request, "cf", { value: cf });
  return worker.fetch(request, env, execution);
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

console.log("\n=== 冷启动（isolate 首次请求） ===");
{
  // 每次 import 都拿到独立的模块实例，等于全新的 isolate；首个请求必须是详情页/站点地图，
  // 否则 catalog 缓存已被其它请求预热，这条路径永远测不到。
  const cold = async (tag) => (await import(`file://${BUNDLE.replace(/\\/g, "/")}?cold=${tag}-${Date.now()}`)).default;
  const detail = await (await cold("detail")).fetch(new Request(ORIGIN + "/title/hotd"), env, execution);
  check("冷启动首个请求 GET /title/hotd", detail.status === 200 && (await detail.text()).includes("<title"), `status=${detail.status}`);
  const sitemap = await (await cold("sitemap")).fetch(new Request(ORIGIN + "/sitemap.xml"), env, execution);
  check("冷启动首个请求 GET /sitemap.xml", sitemap.status === 200, `status=${sitemap.status}`);
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
const catalogSnapshot = JSON.parse(fs.readFileSync(path.join(ROOT, "client", "data", "titles.json"), "utf8"));
const SNAPSHOT_COUNT = catalogSnapshot.items.length;

{
  const { response, body } = await hitJSON("/api/admin/titles", { headers: { Cookie: cookie } });
  check("后台片库列表（来自 titles.json 快照）", response.status === 200 && body.total === SNAPSHOT_COUNT, `${body && body.total} 部`);
}

{
  // 线上目录是只读快照：任何写入都应返回 410，而不是假装成功。
  const created = await hitJSON("/api/admin/titles", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify({ title: "预演验证片", type: "电影", offers: [] })
  });
  check("线上目录拒绝新增（410）", created.response.status === 410 && created.body?.error?.code === "catalog_readonly",
    `status=${created.response.status}`);

  const updated = await hitJSON("/api/admin/titles/hotd", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: ORIGIN },
    body: JSON.stringify({ title: "改", type: "电影", offers: [] })
  });
  check("线上目录拒绝编辑（410）", updated.response.status === 410, `status=${updated.response.status}`);

  const removed = await hitJSON("/api/admin/titles/hotd", {
    method: "DELETE",
    headers: { Cookie: cookie, Origin: ORIGIN }
  });
  check("线上目录拒绝删除（410）", removed.response.status === 410, `status=${removed.response.status}`);

  const stillThere = await hitJSON("/api/titles/hotd");
  check("只读快照不受写请求影响", stillThere.response.status === 200 && stillThere.body.item?.id === "hotd");
}

console.log("\n=== 埋点与看板 ===");
{
  // 一个「真人」：带着 yt_vid Cookie，并且打过页面信标。
  const visitor = "yt_vid=11111111-1111-1111-1111-111111111111";
  const track = await hit("/api/track", {
    method: "POST",
    // cf-ipcountry 模拟 Cloudflare 边缘 GeoIP 的结果（本地没有 request.cf，走这个兜底分支）；
    // cf-connecting-ip 是访客的真实来源地址，落进 events.ip。
    headers: {
      "Content-Type": "application/json",
      Cookie: visitor,
      "cf-ipcountry": "US",
      "cf-connecting-ip": "203.0.113.7"
    },
    body: JSON.stringify({ path: "/title", lang: "zh" })
  });
  check("页面信标 202", track.status === 202, `status=${track.status}`);
  await hit("/api/search?q=" + encodeURIComponent("zzz-没有结果"), {
    headers: { Cookie: visitor, "cf-ipcountry": "US", "cf-connecting-ip": "203.0.113.7" }
  });
  // 小程序没有 Cookie 罐：用 X-YT-Visitor 自报编号，打完页面信标同样算真实访客。
  const wxVisitor = "22222222-2222-2222-2222-222222222222";
  const wxTrack = await hit("/api/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-YT-Visitor": wxVisitor,
      "cf-ipcountry": "CN",
      "cf-connecting-ip": "203.0.113.90"
    },
    body: JSON.stringify({ path: "/search", lang: "zh" })
  });
  check("小程序访客编号可走 X-YT-Visitor，不再下发 Cookie",
    wxTrack.status === 202 && !/yt_vid=/.test(wxTrack.headers.get("set-cookie") || ""),
    `status=${wxTrack.status} set-cookie=${wxTrack.headers.get("set-cookie") || "无"}`);
  // 无头浏览器：带 Cookie、也执行了页面脚本，但整个来源在 Scaleway 机房网段。
  // ASN 判定的意义就在这里——光看页面信标会把它算成人。
  const headless = await hitWithCf("/api/track", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: "yt_vid=33333333-3333-3333-3333-333333333333",
      "cf-connecting-ip": "51.158.1.10"
    },
    body: JSON.stringify({ path: "/", lang: "en" })
  }, { country: "FR", city: "Paris", asn: 12876, asOrganization: "Scaleway" });
  check("机房来源的页面信标同样 202（只打标，不拦）", headless.status === 202, `status=${headless.status}`);
  // 下面这三条故意不带 Cookie：模拟采集脚本，每次请求都会被铸一个新的访客编号。
  await hit("/api/titles/hotd", { headers: { "cf-ipcountry": "RU", "cf-connecting-ip": "198.51.100.20" } });
  await hit("/go/hotd/0", { redirect: "manual", headers: { "cf-connecting-ip": "198.51.100.20" } });
  await drain();
  const events = db.prepare("SELECT kind, COUNT(*) AS c FROM events GROUP BY kind").all();
  check("埋点写入 events 表", events.length >= 2, events.map((e) => `${e.kind}:${e.c}`).join(" "));

  const { response, body } = await hitJSON("/api/admin/dashboard?days=7", { headers: { Cookie: cookie } });
  check("后台看板", response.status === 200 && body.trend.length === 7 && body.overview.searches >= 1,
    `搜索 ${body && body.overview && body.overview.searches} / 浏览 ${body && body.overview && body.overview.views} / 跳转 ${body && body.overview && body.overview.clicks}`);
  const overview = body.overview;
  check("页面信标计入 PV 与路径分布", overview.pageviews >= 1
    && (body.topPaths || []).some((entry) => entry.path === "/title" && entry.views >= 1)
    && (body.langs || []).some((entry) => entry.lang === "zh" && entry.views >= 1),
    `PV ${overview.pageviews} / 路径 ${(body.topPaths || []).map((p) => `${p.path}:${p.views}`).join(" ")}`);
  const visitorIds = (body.visitors || []).map((entry) => entry.id);
  check("只有打过信标、且不是机房来源的编号算真实访客", overview.visitors === 2
    && overview.rawVisitors === overview.visitors + overview.botSuspects
    && overview.botSuspects >= 3
    && overview.hostingVisitors === 1
    && visitorIds.includes("11111111-1111-1111-1111-111111111111")
    && visitorIds.includes(wxVisitor)
    && body.visitors[0].real === true
    && body.visitors.every((entry) => entry.real === (entry.pages > 0 && !entry.hosting)),
    `真实 ${overview.visitors} / 编号 ${overview.rawVisitors} / 疑似 ${overview.botSuspects} / 机房 ${overview.hostingVisitors}`);
  check("日分桶按北京时间（UTC+8）切天", body.trend[body.trend.length - 1].date
    === new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
    `最后一天 ${body.trend[body.trend.length - 1].date}`);
  check("访问地区按页面信标统计，疑似自动化来源单独给出",
    (body.topGeo || []).some((entry) => entry.country === "US" && entry.label === "美国" && entry.views >= 1)
    && (body.suspectGeo || []).some((entry) => entry.country === "RU" && entry.label === "俄罗斯"),
    `真实 ${(body.topGeo || []).map((g) => `${g.label}:${g.views}`).join(" ")} / 疑似 ${(body.suspectGeo || []).map((g) => `${g.label}:${g.events}`).join(" ")}`);
  const columns = db.prepare("PRAGMA table_info(events)").all().map((column) => column.name);
  check("事件表带国家/城市/IP/ASN 列，仍然不落 UA",
    columns.includes("country") && columns.includes("city") && columns.includes("ip")
    && columns.includes("asn") && columns.includes("as_org")
    && !columns.some((name) => /user_agent|fingerprint|(^|_)ua($|_)/i.test(name)),
    columns.join(" "));

  // 来源 IP 明细：真人（打过页面信标）与脚本（只打接口）要能按 IP 分开认出来。
  const humanIp = (body.topIps || []).find((entry) => entry.ip === "203.0.113.7");
  const botIp = (body.topIps || []).find((entry) => entry.ip === "198.51.100.20");
  check("来源 IP 落库并进看板，UA 仍然不落",
    Boolean(humanIp) && humanIp.real === true && humanIp.pages >= 1 && humanIp.label === "美国"
    && Boolean(botIp) && botIp.real === false && botIp.events >= 2,
    `真人 ${humanIp ? `${humanIp.ip}/${humanIp.label}/${humanIp.events}` : "缺"} / 脚本 ${botIp ? `${botIp.ip}/${botIp.events}` : "缺"}`);
  const browserVisitor = (body.visitors || []).find((entry) => entry.id === "11111111-1111-1111-1111-111111111111");
  check("访客编号带上来源 IP",
    Boolean(browserVisitor) && browserVisitor.ip === "203.0.113.7" && browserVisitor.ips >= 1,
    `访客 ${browserVisitor ? browserVisitor.label : "缺"} ← ${browserVisitor ? browserVisitor.ip || "无 IP" : ""}`);
  // 机房来源：有页面信标，但 ASN 命中 Scaleway → 看板标成机房、不算真实来源，并排在最后。
  const headlessIp = (body.topIps || []).find((entry) => entry.ip === "51.158.1.10");
  check("ASN 与网络组织落库，机房来源被识别",
    Boolean(headlessIp) && headlessIp.hosting === true && headlessIp.asn === 12876
    && headlessIp.asOrg === "Scaleway" && headlessIp.real === false && headlessIp.pages === 1,
    headlessIp ? `${headlessIp.ip}/${headlessIp.asOrg}/AS${headlessIp.asn}/机房=${headlessIp.hosting}` : "缺机房来源行");
  const headlessVisitor = (body.visitors || []).find((entry) => entry.id === "33333333-3333-3333-3333-333333333333");
  check("机房访客排在最后，并带上网络组织名",
    Boolean(headlessVisitor) && headlessVisitor.hosting === true && headlessVisitor.real === false
    && headlessVisitor.asOrg === "Scaleway"
    && body.visitors[body.visitors.length - 1].id === headlessVisitor.id,
    headlessVisitor ? `${headlessVisitor.label} 排第 ${body.visitors.findIndex((e) => e.id === headlessVisitor.id) + 1}/${body.visitors.length}` : "缺");
  const stored = db.prepare("SELECT ip, country, asn, as_org FROM events WHERE ip IS NOT NULL").all();
  check("IP 与地区、来源网络同批写入，非法值不会污染",
    stored.length >= 5 && stored.every((row) => /^\d+\.\d+\.\d+\.\d+$/.test(row.ip))
    && stored.some((row) => row.asn === 12876 && row.as_org === "Scaleway")
    && stored.filter((row) => row.asn === null).length >= 4,
    `${stored.length} 条带 IP，其中 ${stored.filter((row) => row.asn != null).length} 条带 ASN`);
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
    body: JSON.stringify({ title: "跨站片", type: "电影", offers: [] })
  });
  check("跨站写请求被拒", crossOrigin.response.status === 403);

  const legacy = await hitJSON("/api/admin/does-not-exist", { headers: { Cookie: cookie } });
  check("未知后台接口 404", legacy.response.status === 404);
}

console.log(`\n结果：通过 ${pass} 项，失败 ${fail} 项`);
process.exit(fail === 0 ? 0 : 1);
