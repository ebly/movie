// tmdb.js — TMDB 检索与字段映射，Node 与 Worker 共用（只取元数据，不下载、不转存图片）。
"use strict";

const BASE = "https://api.themoviedb.org/3";
const IMAGE = "https://image.tmdb.org/t/p/w500";

const GENRES = {
  28: "动作", 12: "冒险", 16: "动画", 35: "喜剧", 80: "犯罪", 99: "纪录片",
  18: "剧情", 10751: "家庭", 14: "奇幻", 36: "历史", 27: "恐怖", 10402: "音乐",
  9648: "悬疑", 10749: "爱情", 878: "科幻", 53: "惊悚", 10752: "战争", 37: "西部",
  10759: "动作冒险", 10762: "儿童", 10763: "新闻", 10764: "真人秀",
  10765: "科幻奇幻", 10766: "肥皂剧", 10767: "脱口秀", 10768: "战争政治"
};

class TmdbError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** v4 Read Token（JWT）走 Authorization，v3 API Key 走 query。 */
function isBearer(key) {
  return /^ey[A-Za-z0-9._-]{20,}$/.test(key || "");
}

function mapResult(row) {
  const isTV = row.media_type === "tv";
  const date = row.release_date || row.first_air_date || "";
  const genres = (row.genre_ids || []).map((id) => GENRES[id]).filter(Boolean).slice(0, 6);
  return {
    tmdbId: row.id,
    mediaType: isTV ? "tv" : "movie",
    title: row.title || row.name || "",
    original: row.original_title || row.original_name || "",
    year: Number(date.slice(0, 4)) || null,
    overview: String(row.overview || "").trim(),
    poster: row.poster_path ? `${IMAGE}${row.poster_path}` : null,
    rating: typeof row.vote_average === "number" ? Math.round(row.vote_average * 10) / 10 : null,
    genres,
    type: isTV ? "剧集" : "电影"
  };
}

async function search(query, { key, language = "zh-CN", fetchImpl = fetch, signal, baseUrl } = {}) {
  const term = String(query || "").trim().slice(0, 80);
  if (!term) throw new TmdbError("empty_query", "请输入要搜索的片名");
  if (!key) throw new TmdbError("missing_key", "还没有配置 TMDB API Key");

  const url = new URL(`${String(baseUrl || BASE).replace(/\/+$/, "")}/search/multi`);
  url.searchParams.set("query", term);
  url.searchParams.set("language", language);
  url.searchParams.set("include_adult", "false");
  const headers = { Accept: "application/json" };
  if (isBearer(key)) headers.Authorization = `Bearer ${key}`;
  else url.searchParams.set("api_key", key);

  let response;
  try {
    response = await fetchImpl(url.toString(), { headers, signal });
  } catch (err) {
    throw new TmdbError("network_error", "连不上 TMDB，请检查网络或代理后重试");
  }

  if (response.status === 401) throw new TmdbError("invalid_key", "TMDB Key 无效或已过期");
  if (response.status === 429) throw new TmdbError("rate_limited", "TMDB 请求太频繁，请稍后再试");
  if (!response.ok) throw new TmdbError("upstream_error", `TMDB 返回 ${response.status}`);

  let payload;
  try {
    payload = await response.json();
  } catch (err) {
    throw new TmdbError("bad_response", "TMDB 返回了无法解析的内容");
  }

  return (payload.results || [])
    .filter((row) => row && (row.media_type === "movie" || row.media_type === "tv"))
    .slice(0, 12)
    .map(mapResult);
}

module.exports = { search, mapResult, TmdbError, GENRES };
