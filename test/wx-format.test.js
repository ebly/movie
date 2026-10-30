"use strict";

/**
 * 小程序纯逻辑测试：格式化、复制文本、访客编号。
 * 这些文件不依赖微信运行时，可以直接在 Node 里跑，省得每次改样式都开开发者工具。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const fmt = require("../wx/utils/format.js");
const store = require("../wx/utils/store.js");

const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

test("小程序访客编号符合 Worker 的 UUID 规则，且每次都不同", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const id = store.newVisitorId();
    assert.match(id, VISITOR_RE);
    seen.add(id);
  }
  assert.equal(seen.size, 200);
});

test("海报兜底配色按种子稳定，有 art 时用目录自带的三色", () => {
  const first = fmt.posterStyle("douban:37660136", null);
  assert.match(first, /^background-image: linear-gradient\(155deg, #[0-9a-f]{6} 0%/i);
  assert.equal(fmt.posterStyle("douban:37660136", null), first, "同一个种子必须得到同一组颜色");
  assert.notEqual(fmt.posterStyle("douban:1", null), fmt.posterStyle("douban:2", null), "不同种子通常不同");

  const art = { p1: "#111111", p2: "#222222", p3: "#333333" };
  assert.match(fmt.posterStyle("x", art), /#111111.*#222222.*#333333/);
});

test("评分与副标题按站内口径展示", () => {
  assert.equal(fmt.ratingText(8.46), "8.5");
  assert.equal(fmt.ratingText("7"), "7.0");
  assert.equal(fmt.ratingText(0), "未评分");
  assert.equal(fmt.ratingText(null), "未评分");

  assert.equal(fmt.metaLine({ year: 2024, type: "电影", runtime: "2 小时 46 分" }), "2024 · 电影 · 2 小时 46 分");
  assert.equal(fmt.metaLine({ year: 2022, type: "剧集", seasons: 3 }), "2022 · 剧集 · 3 季");
  assert.equal(fmt.metaLine({ year: 2026, type: "电影" }), "2026 · 电影");
  assert.equal(fmt.metaLine({ seasons: 1 }), "剧集 · 1 季", "没写类型时按季数判断");
});

test("相对时间：分钟/小时/天，太旧就给日期", () => {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  assert.equal(fmt.relTime(iso(30 * 1000)), "刚刚");
  assert.equal(fmt.relTime(iso(5 * 60 * 1000)), "5 分钟前");
  assert.equal(fmt.relTime(iso(3 * 3600 * 1000)), "3 小时前");
  assert.equal(fmt.relTime(iso(2 * 24 * 3600 * 1000)), "2 天前");
  assert.match(fmt.relTime(iso(60 * 24 * 3600 * 1000)), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(fmt.relTime("不是时间"), "");
});

test("网盘复制文本把提取码一起带上", () => {
  const url = "https://pan.quark.cn/s/abc123";
  assert.equal(fmt.panCopyText({ url, password: "" }), url);
  assert.equal(fmt.panCopyText({ url, password: " 4k2m " }), `${url} 提取码：4k2m`);
  assert.equal(fmt.panCopyText({ url: "" }), "");
  assert.equal(fmt.panCopyText(null), "");
  assert.equal(fmt.panTypeLabel("aliyun"), "阿里云盘");
  assert.equal(fmt.panTypeLabel("unknown"), "网盘");
});

test("关键词裁剪不影响正常输入", () => {
  assert.equal(fmt.trimQuery("  沙丘   2  "), "沙丘 2");
  assert.equal(fmt.trimQuery(null), "");
  assert.equal(fmt.trimQuery("x".repeat(200)).length, 120);
  assert.equal(fmt.clip("abcdef", 3), "abc…");
  assert.equal(fmt.clip("ab", 3), "ab");
});
