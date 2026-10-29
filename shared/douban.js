"use strict";

/**
 * 豆瓣榜单（只取片名、年份、评分、海报这些元数据，不含任何播放地址）。
 *
 * 支持两个榜单：热门（movie_hot_gaia）与最新（movie_latest），供首页切换。
 * 用的是豆瓣移动端 rexxar 接口：旧的 /j/search_subjects 浏览器榜单已返回空数组。
 * 非公开文档接口，所以：带正常 UA 与 Referer、8 秒超时、10 分钟内存缓存、失败降级。
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const clean = (value, max) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f\u200b-\u200f\ufeff]/g, " ").replace(/\s+/g, " ").trim().slice(0, max)
  : "";

function posterOf(row) {
  const url = row && row.cover && typeof row.cover.url === "string" ? row.cover.url : "";
  if (!url) return null;
  // 列表接口给的是 m_ratio_poster（中等尺寸），换成 l_ratio_poster 更清晰
  const bigger = url.replace("/m_ratio_poster/", "/l_ratio_poster/");
  return /^https:\/\/img\d+\.doubanio\.com\//.test(bigger) ? bigger : null;
}

function normalize(payload, limit) {
  const rows = payload && Array.isArray(payload.subject_collection_items)
    ? payload.subject_collection_items
    : [];
  const items = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const title = clean(row.title, 120);
    const id = clean(String(row.id || ""), 40);
    if (!title || !/^\d+$/.test(id)) continue;
    const ratingValue = row.rating && Number(row.rating.value);
    const rating = Number.isFinite(ratingValue) && ratingValue > 0
      ? Math.round(ratingValue * 10) / 10
      : null;
    const year = Number(row.year);
    items.push({
      id: `douban:${id}`,
      title,
      original: clean(row.original_title, 120),
      year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
      type: row.type === "tv" ? "剧集" : "电影",
      rating,
      poster: posterOf(row),
      releaseDate: clean(row.release_date, 20),
      url: `https://movie.douban.com/subject/${id}/`
    });
    if (items.length >= limit) break;
  }
  return items;
}

/** 首页切换用的两个榜单：热门（实时热度）、最新（最近更新）。 */
const COLLECTIONS = {
  hot: { id: "movie_hot_gaia", label: "热门" },
  latest: { id: "movie_latest", label: "最新" }
};
const KIND_IDS = Object.keys(COLLECTIONS);

function createDoubanList({
  fetchImpl = globalThis.fetch,
  ttlMs = 10 * 60 * 1000,
  timeoutMs = 8000,
  logger = console
} = {}) {
  /** @type {Map<string, {items: any[], expires: number}>} */
  const cache = new Map();
  const inflight = new Map();

  async function load(kind) {
    if (!inflight.has(kind)) {
      const task = (async () => {
        const response = await fetchImpl(`https://m.douban.com/rexxar/api/v2/subject_collection/${COLLECTIONS[kind].id}/items`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { "User-Agent": UA, Accept: "application/json", Referer: "https://movie.douban.com/" }
        });
        if (!response.ok) throw new Error(`豆瓣返回 ${response.status}`);
        const payload = await response.json();
        return normalize(payload, 24);
      })().finally(() => { inflight.delete(kind); });
      inflight.set(kind, task);
    }
    return inflight.get(kind);
  }

  /** 返回 { kind, label, items, cached }；失败时如果有旧数据就降级返回旧数据。 */
  async function list({ kind = "hot", limit = 11 } = {}) {
    const key = COLLECTIONS[kind] ? kind : "hot";
    const size = Math.min(Math.max(Number(limit) || 10, 1), 24);
    const entry = cache.get(key);
    if (entry && entry.expires > Date.now()) {
      return { kind: key, label: COLLECTIONS[key].label, items: entry.items.slice(0, size), cached: true };
    }
    try {
      const items = await load(key);
      cache.set(key, { items, expires: Date.now() + ttlMs });
      return { kind: key, label: COLLECTIONS[key].label, items: items.slice(0, size), cached: false };
    } catch (err) {
      logger.warn(`[douban] ${COLLECTIONS[key].label}榜单获取失败：${(err && err.message) || err}`);
      if (entry) return { kind: key, label: COLLECTIONS[key].label, items: entry.items.slice(0, size), cached: true, stale: true };
      throw err;
    }
  }

  return { list };
}

module.exports = { createDoubanList, normalize, COLLECTIONS, KIND_IDS };
