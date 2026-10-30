"use strict";

const { describe, test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createApp } = require("../server/app");
const BRAND = require("../config/brand.json");

let server;
let base;
let tmpDir;
let analyticsFile;
let feedbackFile;
let cookie;

function appendEvents(entries) {
  fs.appendFileSync(analyticsFile, entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n", "utf8");
}

describe(`${BRAND.name} 管理后台（独立项目）`, () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yingtu-admin-"));
    analyticsFile = path.join(tmpDir, "analytics.ndjson");
    feedbackFile = path.join(tmpDir, "feedback.ndjson");
    server = http.createServer(createApp({
      analyticsFile,
      feedbackFile,
      adminPassword: "test-admin",
      frontendUrl: "http://127.0.0.1:4173",
      logger: false
    }));
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function call(pathname, { method = "GET", body, auth = true, headers = {} } = {}) {
    const finalHeaders = { Accept: "application/json", ...headers };
    if (body !== undefined) finalHeaders["Content-Type"] = "application/json";
    if (auth && cookie) finalHeaders.Cookie = cookie;
    const response = await fetch(base + pathname, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (err) {
      payload = null;
    }
    return { response, body: payload };
  }

  test("后台接口默认都需要会话", async () => {
    const dashboard = await call("/api/dashboard", { auth: false });
    assert.equal(dashboard.response.status, 401);
    assert.equal(dashboard.body.error.code, "unauthorized");

    const feedback = await call("/api/feedback", { auth: false });
    assert.equal(feedback.response.status, 401);

    const session = await call("/api/session", { auth: false });
    assert.equal(session.response.status, 200);
    assert.equal(session.body.authenticated, false);
  });

  test("bootstrap 暴露品牌与前台地址", async () => {
    const boot = await call("/api/bootstrap", { auth: false });
    assert.equal(boot.response.status, 200);
    assert.equal(boot.body.brand.name, BRAND.name);
    assert.equal(boot.body.frontendUrl, "http://127.0.0.1:4173");

    // 品牌只给白名单字段：defaultPassword / cookies 绝不能出现在公开接口里
    const raw = JSON.stringify(boot.body);
    assert.doesNotMatch(raw, /defaultPassword/, "不应下发默认密码");
    assert.doesNotMatch(raw, /yt_admin|yt_vid/, "不应下发内部 Cookie 名");
    assert.equal(boot.body.brand.defaultPassword, undefined);
    assert.equal(boot.body.usingDefaultPassword, undefined);
  });

  test("登录拒绝错误密码，并下发严格 Cookie", async () => {
    const bad = await call("/api/login", {
      method: "POST",
      body: { password: "wrong-password" },
      auth: false
    });
    assert.equal(bad.response.status, 401);
    assert.equal(bad.body.error.code, "invalid_password");

    const good = await fetch(base + "/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-admin" })
    });
    assert.equal(good.status, 200);
    const setCookie = good.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.match(setCookie, new RegExp(`${BRAND.cookies.admin}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    cookie = setCookie.split(";")[0];

    const session = await call("/api/session");
    assert.equal(session.body.authenticated, true);
    assert.equal(session.body.usingDefaultPassword, false);
    assert.ok(Date.parse(session.body.expiresAt) > Date.now());

    // 老路径（挂在 /admin/ 下的那套接口）应当彻底不存在
    const legacy = await call("/api/admin/session");
    assert.equal(legacy.response.status, 404);
  });

  test("meta 只提供平台清单（看板用）", async () => {
    const { response, body } = await call("/api/meta");
    assert.equal(response.status, 200);
    assert.ok(body.providers.some((provider) => provider.id === "netflix"));
    assert.ok(body.providers.some((provider) => provider.id === "max"));
    // 片库编辑器已移除：不再下发类型/档位/画质/图案等编辑选项。
    assert.deepEqual(Object.keys(body), ["providers"]);
  });

  test("片库与 TMDB 接口已彻底移除", async () => {
    for (const pathname of ["/api/titles", "/api/titles/test-show", "/api/tmdb/search?q=x"]) {
      const { response } = await call(pathname);
      assert.equal(response.status, 404, `${pathname} 应当不存在`);
    }
    const created = await call("/api/titles", { method: "POST", body: { title: "x" } });
    assert.equal(created.response.status, 404);
  });

  test("看板会重新读取前台进程追加的统计文件", async () => {
    const now = new Date().toISOString();
    appendEvents([
      { id: "e0", at: now, type: "page", path: "/title", lang: "zh", visitorId: "v-1", country: "CN", city: "Chengdu", ip: "203.0.113.40" },
      { id: "e1", at: now, type: "search", query: "沙丘", resultType: "全部", total: 3, visitorId: "v-1", ip: "203.0.113.40" },
      { id: "e2", at: now, type: "search", query: "zzz-no-such-title", resultType: "全部", total: 0, visitorId: "v-1", ip: "203.0.113.40" },
      { id: "e3", at: now, type: "view", titleId: "hotd", title: "龙之家族", visitorId: "v-1", ip: "203.0.113.40" },
      // v-2 只有 API 请求、没有页面信标：按疑似自动化处理，不计入真实访客。
      { id: "e4", at: now, type: "click", titleId: "hotd", title: "龙之家族", providerId: "max", provider: "Max", visitorId: "v-2", country: "DE", ip: "198.51.100.7" },
      // v-3 执行了页面脚本，但整个编号都在 Scaleway 机房网段：不算真实访客。
      { id: "e5", at: now, type: "page", path: "/", lang: "en", visitorId: "v-3", country: "FR", city: "Paris", ip: "45.1.1.1", asn: 12876, asOrg: "Scaleway" },
      { id: "e6", at: now, type: "view", titleId: "hotd", title: "龙之家族", visitorId: "v-3", country: "FR", city: "Paris", ip: "45.1.1.1", asn: 12876, asOrg: "Scaleway" }
    ]);
    const stamped = new Date(Date.now() + 1000);
    fs.utimesSync(analyticsFile, stamped, stamped);

    const { response, body } = await call("/api/dashboard?days=7");
    assert.equal(response.status, 200);
    assert.equal(body.range.days, 7);
    assert.equal(body.trend.length, 7);
    assert.equal(body.overview.searches, 2);
    assert.equal(body.overview.views, 2);
    assert.equal(body.overview.clicks, 1);
    assert.equal(body.overview.zeroSearches, 1);
    assert.equal(body.overview.pageviews, 2, "page 事件要计入页面浏览");
    assert.equal(body.overview.visitors, 1, "只有打过页面信标、且不是机房来源的编号才算真实访客");
    assert.equal(body.overview.rawVisitors, 3);
    assert.equal(body.overview.botSuspects, 2);
    assert.equal(body.overview.hostingVisitors, 1, "机房来源被单独标出");
    assert.ok(body.topSearches.some((entry) => entry.query === "沙丘"));
    assert.ok(body.zeroSearches.some((entry) => entry.query === "zzz-no-such-title"));
    assert.ok(body.platforms.some((entry) => entry.id === "max" && entry.clicks === 1));
    assert.ok(body.topPaths.some((entry) => entry.path === "/title" && entry.views === 1));
    assert.ok(body.langs.some((entry) => entry.lang === "zh" && entry.views === 1));
    assert.deepEqual(
      body.topGeo.map((entry) => [entry.label, entry.views, entry.visitors]),
      [["中国 · Chengdu", 1, 1], ["法国 · Paris", 1, 0]],
      "访问地区按页面信标统计：机房的页面浏览在，但不带真实访客"
    );
    assert.deepEqual(
      body.suspectGeo.map((entry) => [entry.label, entry.events]),
      [["德国", 1], ["法国", 1]],
      "没打过页面信标的编号按国家单独列出"
    );
    assert.deepEqual(
      body.topIps.map((entry) => [entry.ip, entry.label, entry.events, entry.real]),
      [
        ["203.0.113.40", "中国 · Chengdu", 4, true],
        ["45.1.1.1", "法国 · Paris", 2, false],
        ["198.51.100.7", "德国", 1, false]
      ],
      "来源 IP 按事件数排序，机房来源即使有页面信标也不标成真实来源"
    );
    const hostingIp = body.topIps.find((entry) => entry.ip === "45.1.1.1");
    assert.equal(hostingIp.hosting, true);
    assert.equal(hostingIp.asn, 12876);
    assert.equal(hostingIp.asOrg, "Scaleway");
    assert.ok(body.recent.some((entry) => entry.type === "click"));
    assert.equal(body.recent.some((entry) => entry.type === "page"), false, "页面信标不进最近动态");
    assert.equal(body.visitors[0].id, "v-1", "真实访客排在列表前面");
    assert.equal(body.visitors[0].real, true);
    assert.equal(body.visitors[0].pages, 1);
    assert.equal(body.visitors[0].ip, "203.0.113.40", "访客行带上来源 IP");
    assert.equal(body.visitors[0].ips, 1);
    assert.equal(body.visitors[1].real, false);
    assert.equal(body.visitors[1].hosting, false, "一般疑似自动化排在机房来源前面");
    assert.equal(body.visitors[2].id, "v-3", "机房来源排在最后");
    assert.equal(body.visitors[2].hosting, true);
    assert.match(body.visitors[0].label, /^访客 /);
    assert.equal(body.usingDefaultPassword, false);
  });

  test("反馈收件箱可以列列表、搜索与分页", async () => {
    fs.appendFileSync(
      feedbackFile,
      [
        { id: "f1", createdAt: new Date().toISOString(), message: "希望增加按平台筛选", contact: "fan@example.com" },
        { id: "f2", createdAt: new Date(Date.now() + 1000).toISOString(), message: "搜索「沙丘」时结果能不能按年份排序", contact: "" }
      ].map((entry) => JSON.stringify(entry)).join("\n") + "\n",
      "utf8"
    );

    const inbox = await call("/api/feedback?limit=1");
    assert.equal(inbox.response.status, 200);
    assert.equal(inbox.body.total, 2);
    assert.equal(inbox.body.matched, 2);
    assert.equal(inbox.body.items.length, 1);
    assert.ok(inbox.body.stats.week >= 2);
    assert.ok(inbox.body.stats.contact >= 1);
    assert.equal(inbox.body.items[0].message, "搜索「沙丘」时结果能不能按年份排序");

    const pageTwo = await call("/api/feedback?limit=1&offset=1");
    assert.equal(pageTwo.body.offset, 1);
    assert.equal(pageTwo.body.items[0].message, "希望增加按平台筛选");

    const filtered = await call(`/api/feedback?q=${encodeURIComponent("平台筛选")}`);
    assert.equal(filtered.body.total, 2);
    assert.equal(filtered.body.matched, 1);

    const none = await call(`/api/feedback?q=${encodeURIComponent("不存在的关键词")}`);
    assert.equal(none.body.matched, 0);
    assert.deepEqual(none.body.items, []);
  });

  test("后台首页在根路径提供，带 CSP 与 noindex", async () => {
    const page = await fetch(base + "/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
    const html = await page.text();
    assert.match(html, new RegExp(`${BRAND.name} 管理后台`));
    assert.match(html, /admin\.js/);

    const script = await fetch(base + "/admin.js");
    assert.equal(script.status, 200);
    assert.match(script.headers.get("x-robots-tag") || "", /noindex/);

    const legacy = await fetch(base + "/admin/");
    assert.equal(legacy.status, 404);
  });

  test("退出登录会清掉会话", async () => {
    const logout = await call("/api/logout", { method: "POST" });
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers.get("set-cookie") || "", /Max-Age=0/);

    const after = await call("/api/dashboard");
    assert.equal(after.response.status, 401);
  });
});
