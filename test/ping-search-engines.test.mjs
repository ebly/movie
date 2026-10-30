import test from "node:test";
import assert from "node:assert/strict";
import { parseSitemapLocs, buildIndexNowPayload, hostOf } from "../scripts/ping-search-engines.mjs";

test("sitemap 解析只取页面 <loc>，忽略 image:loc", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url>
    <loc>https://yinto.top/</loc>
    <image:image><image:loc>https://yinto.top/p.jpg</image:loc></image:image>
  </url>
  <url><loc> https://yinto.top/title/hotd </loc></url>
</urlset>`;
  assert.deepEqual(parseSitemapLocs(xml), [
    "https://yinto.top/",
    "https://yinto.top/title/hotd"
  ]);
});

test("IndexNow 载荷带上 host / keyLocation，且不超过上限", () => {
  const urls = Array.from({ length: 10_050 }, (_, i) => `https://yinto.top/title/${i}`);
  const payload = buildIndexNowPayload({ url: "https://yinto.top", key: "k".repeat(32), urls });
  assert.equal(payload.host, "yinto.top");
  assert.equal(payload.key, "k".repeat(32));
  assert.equal(payload.keyLocation, "https://yinto.top/kkkkkkkkkkkkkkkkkkkkkkkkkkkkkkkk.txt");
  assert.equal(payload.urlList.length, 10_000);
});

test("hostOf 对非法地址返回空串", () => {
  assert.equal(hostOf("https://yinto.top/title/x"), "yinto.top");
  assert.equal(hostOf("not a url"), "");
});