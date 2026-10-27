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
let dataFile;
let cookie;

const NEW_TITLE = {
  title: "测试剧集",
  original: "Test Show",
  year: 2025,
  type: "剧集",
  rating: 8.6,
  seasons: 2,
  runtime: null,
  genres: ["剧情"],
  synopsis: "一部只用于测试的剧集。",
  aliases: ["测试别名"],
  tags: ["测试"],
  hot: true,
  art: { p1: "#e7dfcf", p2: "#b8aaa0", p3: "#8c3327", ink: "#1b2422", motif: "orbit" },
  offers: [
    {
      pid: "netflix",
      tier: "订阅",
      season: "S01",
      quality: ["4K", "中字"],
      price: "包含在订阅中",
      verified: true
    }
  ]
};

describe(`${BRAND.name} admin`, () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yingtu-admin-test-"));
    dataFile = path.join(tmpDir, "titles.json");
    server = http.createServer(createApp({
      dataFile,
      analyticsFile: path.join(tmpDir, "analytics.ndjson"),
      feedbackFile: path.join(tmpDir, "feedback.ndjson"),
      adminPassword: "test-admin",
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

  async function call(pathname, { method = "GET", body, auth = true } = {}) {
    const headers = { Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (auth && cookie) headers.Cookie = cookie;
    const response = await fetch(base + pathname, {
      method,
      headers,
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

  test("admin routes require a session", async () => {
    const titles = await call("/api/admin/titles", { auth: false });
    assert.equal(titles.response.status, 401);
    assert.equal(titles.body.error.code, "unauthorized");

    const dashboard = await call("/api/admin/dashboard", { auth: false });
    assert.equal(dashboard.response.status, 401);

    const session = await call("/api/admin/session", { auth: false });
    assert.equal(session.response.status, 200);
    assert.equal(session.body.authenticated, false);
  });

  test("login rejects bad passwords and sets a strict cookie", async () => {
    const bad = await call("/api/admin/login", {
      method: "POST",
      body: { password: "wrong-password" },
      auth: false
    });
    assert.equal(bad.response.status, 401);
    assert.equal(bad.body.error.code, "invalid_password");

    const good = await fetch(base + "/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "test-admin" })
    });
    assert.equal(good.status, 200);
    const setCookie = good.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.match(setCookie, /yt_admin=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    cookie = setCookie.split(";")[0];

    const session = await call("/api/admin/session");
    assert.equal(session.body.authenticated, true);
    assert.equal(session.body.usingDefaultPassword, false);
    assert.ok(Date.parse(session.body.expiresAt) > Date.now());
  });

  test("meta exposes editor options", async () => {
    const { response, body } = await call("/api/admin/meta");
    assert.equal(response.status, 200);
    assert.ok(body.providers.some((provider) => provider.id === "netflix"));
    assert.deepEqual(body.types, ["剧集", "电影", "动画", "纪录片"]);
    assert.ok(body.tiers.includes("订阅"));
    assert.ok(body.qualities.includes("4K"));
    assert.ok(body.motifs.includes("orbit"));
    assert.ok(body.artPresets.length >= 3);
    assert.ok(body.defaultArt.p1);
  });

  test("titles can be created, edited and deleted with validation", async () => {
    const unauthenticated = await fetch(base + "/api/admin/titles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(NEW_TITLE)
    });
    assert.equal(unauthenticated.status, 401);

    const created = await call("/api/admin/titles", { method: "POST", body: NEW_TITLE });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.item.id, "test-show");
    assert.equal(created.body.item.offers[0].quality[0], "4K");

    const search = await fetch(base + `/api/search?q=${encodeURIComponent("测试剧集")}`);
    const searchBody = await search.json();
    assert.equal(searchBody.items[0].id, "test-show");

    const detail = await fetch(base + "/api/titles/test-show");
    const detailBody = await detail.json();
    assert.equal(detailBody.item.offers[0].clickUrl, "/go/test-show/0");

    const updated = await call("/api/admin/titles/test-show", {
      method: "PUT",
      body: { ...NEW_TITLE, title: "测试剧集 第二版", rating: 9.1, hot: false }
    });
    assert.equal(updated.response.status, 200);
    assert.equal(updated.body.item.title, "测试剧集 第二版");
    assert.equal(updated.body.item.rating, 9.1);

    const persisted = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const row = persisted.items.find((item) => item.id === "test-show");
    assert.equal(row.title, "测试剧集 第二版");
    assert.ok(row.updatedAt);

    const badRating = await call("/api/admin/titles/test-show", {
      method: "PUT",
      body: { ...NEW_TITLE, rating: 11 }
    });
    assert.equal(badRating.response.status, 422);

    const badProvider = await call("/api/admin/titles", {
      method: "POST",
      body: { ...NEW_TITLE, original: "Bad Provider", offers: [{ pid: "nope", quality: ["4K"] }] }
    });
    assert.equal(badProvider.response.status, 422);

    const noTitle = await call("/api/admin/titles", {
      method: "POST",
      body: { ...NEW_TITLE, title: "  ", original: "No Title" }
    });
    assert.equal(noTitle.response.status, 422);

    const missing = await call("/api/admin/titles/not-real", { method: "DELETE" });
    assert.equal(missing.response.status, 404);

    const removed = await call("/api/admin/titles/test-show", { method: "DELETE" });
    assert.equal(removed.response.status, 200);

    const gone = await fetch(base + "/api/titles/test-show");
    assert.equal(gone.status, 404);
    const list = await call("/api/admin/titles");
    assert.ok(!list.body.items.some((item) => item.id === "test-show"));
  });

  test("海报图片地址经过校验后落库，并透出到列表、搜索与详情", async () => {
    const POSTER = "https://img.example.com/poster-400x600.jpg";

    const created = await call("/api/admin/titles", {
      method: "POST",
      body: { ...NEW_TITLE, poster: POSTER }
    });
    assert.equal(created.response.status, 201);
    assert.equal(created.body.item.poster, POSTER);

    const list = await call("/api/admin/titles");
    assert.equal(list.body.items.find((item) => item.id === "test-show").poster, POSTER);

    const search = await fetch(base + `/api/search?q=${encodeURIComponent("测试剧集")}`);
    const searchBody = await search.json();
    assert.equal(searchBody.items[0].poster, POSTER);

    const detail = await fetch(base + "/api/titles/test-show");
    const detailBody = await detail.json();
    assert.equal(detailBody.item.poster, POSTER);

    const persisted = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    assert.equal(persisted.items.find((item) => item.id === "test-show").poster, POSTER);

    const cleared = await call("/api/admin/titles/test-show", {
      method: "PUT",
      body: { ...NEW_TITLE, poster: "   " }
    });
    assert.equal(cleared.response.status, 200);
    assert.equal(cleared.body.item.poster, null);

    for (const bad of ["http://img.example.com/a.jpg", "javascript:alert(1)", "not a url", "ftp://img.example.com/a.jpg"]) {
      const rejected = await call("/api/admin/titles/test-show", {
        method: "PUT",
        body: { ...NEW_TITLE, poster: bad }
      });
      assert.equal(rejected.response.status, 422, `${bad} 应当被拒绝`);
    }

    const tooLong = await call("/api/admin/titles/test-show", {
      method: "PUT",
      body: { ...NEW_TITLE, poster: `https://img.example.com/${"a".repeat(520)}.jpg` }
    });
    assert.equal(tooLong.response.status, 422);

    await call("/api/admin/titles/test-show", { method: "DELETE" });
  });

  test("tracked redirects send visitors to the provider", async () => {
    const response = await fetch(base + "/go/hotd/0", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.match(response.headers.get("location"), /^https:\/\//);
    assert.equal(response.headers.get("cache-control"), "no-store");

    const missing = await fetch(base + "/go/hotd/99", { redirect: "manual" });
    assert.equal(missing.status, 404);
  });

  test("dashboard aggregates searches, views and clicks", async () => {
    await fetch(base + `/api/search?q=${encodeURIComponent("zzz-no-such-title")}`);
    await fetch(base + `/api/search?q=${encodeURIComponent("沙丘")}`);
    await fetch(base + "/api/titles/hotd");
    await fetch(base + "/go/hotd/0", { redirect: "manual" });

    const { response, body } = await call("/api/admin/dashboard?days=7");
    assert.equal(response.status, 200);
    assert.equal(body.range.days, 7);
    assert.equal(body.trend.length, 7);
    assert.ok(body.overview.searches >= 2);
    assert.ok(body.overview.views >= 1);
    assert.ok(body.overview.clicks >= 1);
    assert.ok(body.overview.visitors >= 1);
    assert.ok(body.overview.zeroSearches >= 1);
    assert.ok(body.topSearches.some((entry) => entry.query === "zzz-no-such-title"));
    assert.ok(body.zeroSearches.some((entry) => entry.query === "zzz-no-such-title"));

    const hotd = body.topTitles.find((entry) => entry.id === "hotd");
    assert.ok(hotd);
    assert.ok(hotd.views >= 1);
    assert.ok(hotd.clicks >= 1);
    assert.ok(body.platforms.some((entry) => entry.id === "max" && entry.clicks >= 1));
    assert.ok(body.recent.some((entry) => entry.type === "search"));
    assert.ok(body.recent.some((entry) => entry.type === "view"));
    assert.ok(body.recent.some((entry) => entry.type === "click"));
    assert.match(body.visitors[0].label, /^访客 /);
    assert.equal(body.usingDefaultPassword, false);
  });

  test("feedback inbox lists, searches and paginates", async () => {
    for (const entry of [
      { message: "希望增加按平台筛选", contact: "fan@example.com" },
      { message: "搜索「沙丘」时结果能不能按年份排序" }
    ]) {
      const response = await fetch(base + "/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
      assert.equal(response.status, 201);
    }

    const inbox = await call("/api/admin/feedback?limit=1");
    assert.equal(inbox.response.status, 200);
    assert.equal(inbox.body.total, 2);
    assert.equal(inbox.body.matched, 2);
    assert.equal(inbox.body.items.length, 1);
    assert.ok(inbox.body.stats.week >= 2);
    assert.ok(inbox.body.stats.contact >= 1);
    assert.equal(inbox.body.items[0].message, "搜索「沙丘」时结果能不能按年份排序");

    const pageTwo = await call("/api/admin/feedback?limit=1&offset=1");
    assert.equal(pageTwo.body.offset, 1);
    assert.equal(pageTwo.body.items[0].message, "希望增加按平台筛选");

    const filtered = await call(`/api/admin/feedback?q=${encodeURIComponent("平台筛选")}`);
    assert.equal(filtered.body.total, 2);
    assert.equal(filtered.body.matched, 1);
    assert.equal(filtered.body.items[0].message, "希望增加按平台筛选");

    const byContact = await call(`/api/admin/feedback?q=${encodeURIComponent("fan@example.com")}`);
    assert.equal(byContact.body.matched, 1);

    const none = await call(`/api/admin/feedback?q=${encodeURIComponent("不存在的关键词")}`);
    assert.equal(none.body.matched, 0);
    assert.deepEqual(none.body.items, []);

    const unauth = await call("/api/admin/feedback", { auth: false });
    assert.equal(unauth.response.status, 401);
  });

  test("admin page is served with noindex and remains unlinked from CSP", async () => {
    const redirect = await fetch(base + "/admin", { redirect: "manual" });
    assert.equal(redirect.status, 302);
    assert.equal(redirect.headers.get("location"), "/admin/");

    const page = await fetch(base + "/admin/");
    assert.equal(page.status, 200);
    assert.match(page.headers.get("content-type"), /text\/html/);
    assert.match(page.headers.get("content-security-policy") || "", /default-src 'self'/);
    assert.match(page.headers.get("x-robots-tag") || "", /noindex/);
    const html = await page.text();
    assert.match(html, new RegExp(`${BRAND.name} 管理后台`));
    assert.match(html, /admin\.js/);

    const script = await fetch(base + "/admin/admin.js");
    assert.equal(script.status, 200);
    assert.match(script.headers.get("x-robots-tag") || "", /noindex/);
  });

  test("logout clears the session", async () => {
    const logout = await call("/api/admin/logout", { method: "POST" });
    assert.equal(logout.response.status, 200);
    assert.match(logout.response.headers.get("set-cookie") || "", /Max-Age=0/);

    const after = await call("/api/admin/titles");
    assert.equal(after.response.status, 401);
  });
});
