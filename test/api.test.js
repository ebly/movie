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
let feedbackFile;

describe(`${BRAND.name} API`, () => {
before(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "yingtu-test-"));
  feedbackFile = path.join(tmpDir, "feedback.ndjson");
  server = http.createServer(createApp({
    dataFile: path.join(tmpDir, "titles.json"),
    analyticsFile: path.join(tmpDir, "analytics.ndjson"),
    feedbackFile,
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

async function getJSON(pathname) {
  const response = await fetch(base + pathname);
  const body = await response.json();
  return { response, body };
}

async function postJSON(pathname, payload, headers = {}) {
  return fetch(base + pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(payload)
  });
}

test("health endpoint", async () => {
  const { response, body } = await getJSON("/api/health");
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.name, BRAND.apiName);
});

test("bootstrap 只下发白名单品牌字段，不泄漏默认密码与内部配置", async () => {
  const { response, body } = await getJSON("/api/bootstrap");
  assert.equal(response.status, 200);
  assert.equal(body.brand.name, BRAND.name);
  assert.equal(body.brand.slogan, BRAND.slogan);
  assert.ok(body.brand.disclaimer);

  const raw = JSON.stringify(body);
  assert.doesNotMatch(raw, /defaultPassword/, "不应下发 defaultPassword");
  assert.doesNotMatch(raw, /yt_admin|yt_vid/, "不应下发内部 Cookie 名");
  assert.doesNotMatch(raw, /logPrefix/, "不应下发日志前缀");
  assert.equal(body.brand.defaultPassword, undefined);
  assert.equal(body.brand.cookies, undefined);

  // /api 索引接口同样不能带出内部字段
  const index = await getJSON("/api");
  assert.doesNotMatch(JSON.stringify(index.body), /defaultPassword/);
});

test("search ranks the exact title first and includes tag matches", async () => {
  const { response, body } = await getJSON(`/api/search?q=${encodeURIComponent("龙之家族")}`);
  assert.equal(response.status, 200);
  assert.equal(body.total, 2);
  assert.equal(body.items[0].id, "hotd");
  assert.ok(body.items.some((item) => item.id === "got"));
  assert.deepEqual(body.matchedTypes, ["剧集"]);
  assert.equal(body.items[0].verifiedCount, 3);
});

test("empty query returns the catalog sorted by rating", async () => {
  const { body } = await getJSON("/api/search");
  assert.equal(body.total, 16);
  assert.equal(body.items[0].id, "planet");
  assert.ok(body.items[0].rating >= body.items[1].rating);
});

test("type filter only returns matching works", async () => {
  const { body } = await getJSON(`/api/search?type=${encodeURIComponent("电影")}`);
  assert.equal(body.total, 2);
  assert.ok(body.items.every((item) => item.type === "电影"));
  assert.deepEqual(body.items.map((item) => item.id).sort(), ["dune2", "oppenheimer"]);
});

test("title detail includes offers, links and similar works", async () => {
  const { response, body } = await getJSON("/api/titles/hotd");
  assert.equal(response.status, 200);
  assert.equal(body.item.id, "hotd");
  assert.equal(body.item.offers.length, 4);
  assert.equal(body.related.length, 4);
  assert.match(body.item.offers[0].url, /^https:\/\//);
});

test("offer filters combine season and verified state", async () => {
  const season = await getJSON("/api/titles/hotd/offers?season=S03");
  assert.equal(season.body.total, 2);
  assert.equal(season.body.filters.season, "S03");

  const verified = await getJSON("/api/titles/hotd/offers?season=S03&verified=1");
  assert.equal(verified.body.total, 1);
  assert.equal(verified.body.verifiedCount, 1);
  assert.equal(verified.body.groups[0].items[0].pid, "max");
  assert.equal(verified.body.groups[1].items.length, 0);
});

test("unknown titles and APIs return JSON 404", async () => {
  const title = await getJSON("/api/titles/not-real");
  assert.equal(title.response.status, 404);
  assert.equal(title.body.error.code, "title_not_found");

  const api = await getJSON("/api/not-real");
  assert.equal(api.response.status, 404);
  assert.equal(api.body.error.code, "not_found");
});

test("static client is served with a CSP", async () => {
  const response = await fetch(base + "/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  assert.match(response.headers.get("content-security-policy") || "", /default-src 'self'/);
  // 后台可以填外部海报直链，img-src 必须放开 https
  assert.match(response.headers.get("content-security-policy") || "", /img-src 'self' data: https:/);
  const html = await response.text();
  assert.match(html, /映途/);
  assert.match(html, /api\.js/);
});

test("path traversal is blocked", async () => {
  const response = await fetch(base + "/..%2f..%2fserver%2findex.js");
  assert.equal(response.status, 404);
});

test("feedback validates, persists and ignores honeypot", async () => {
  const response = await postJSON("/api/feedback", { message: "希望增加按平台筛选" });
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.ok(payload.id);

  const lines = fs.readFileSync(feedbackFile, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0]).message, "希望增加按平台筛选");

  const spam = await postJSON("/api/feedback", { message: "spam", website: "http://spam.example" });
  assert.equal(spam.status, 201);
  assert.equal(fs.readFileSync(feedbackFile, "utf8").trim().split("\n").length, 1);

  const short = await postJSON("/api/feedback", { message: "x" });
  assert.equal(short.status, 422);

  const wrongType = await fetch(base + "/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "hello"
  });
  assert.equal(wrongType.status, 415);
});

test("wrong method returns 405 with Allow", async () => {
  const response = await fetch(base + "/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET");
});

test("feedback is rate limited after five submissions", async () => {
  const statuses = [];
  for (let index = 0; index < 6; index += 1) {
    const response = await postJSON("/api/feedback", { message: `测试反馈 ${index}` });
    statuses.push(response.status);
  }
  assert.ok(statuses.includes(429));
});
});
