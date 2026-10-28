"use strict";

const crypto = require("crypto");
const { HttpError } = require("./lib/http");
const { TYPES } = require("./providers");

const TIERS = ["订阅", "租赁", "购买", "免费"];
const QUALITIES = ["4K", "HDR", "杜比", "1080P", "中字"];
const MOTIFS = [
  "orbit", "plate", "ember", "blades", "vault", "neon", "sun", "arch",
  "ruins", "cave", "bust", "dune", "flash", "multiverse", "earth", "reactor"
];

const DEFAULT_ART = {
  p1: "#e7dfcf",
  p2: "#b8aaa0",
  p3: "#8c3327",
  ink: "#1b2422",
  motif: "orbit"
};

const ART_PRESETS = [
  { name: "暖纸", p1: "#f2ddc9", p2: "#d08a63", p3: "#8c3327", ink: "#2b1611" },
  { name: "深墨", p1: "#2a2420", p2: "#0a0908", p3: "#c25434", ink: "#f4eadb" },
  { name: "青瓷", p1: "#dfeae3", p2: "#8faeaa", p3: "#2f5f5a", ink: "#102a2c" },
  { name: "夜蓝", p1: "#0f2a3a", p2: "#06131c", p3: "#5fa88e", ink: "#e8f1ea" },
  { name: "沙金", p1: "#e8d3a7", p2: "#b98a4e", p3: "#a83232", ink: "#241a12" },
  { name: "霓虹", p1: "#1b1030", p2: "#0b0618", p3: "#e05a8a", ink: "#f0e9ff" }
];

const COLOR_RE = /^#[0-9a-f]{6}$/i;
const POSTER_MAX = 500;
// 只接受 https 图片地址：http 会在 https 页面上被浏览器按混合内容拦截，data: 太长且会撑爆片库文件。
const POSTER_RE = /^https:\/\/[^\s<>"']+$/i;

function invalid(message, code = "invalid_title") {
  return new HttpError(422, code, message);
}

/** 海报图片地址：留空返回 null（前台回退到程序化海报），非法值直接 422。 */
function normalizePoster(value) {
  const clean = text(value, POSTER_MAX, "海报地址");
  if (!clean) return null;
  if (!POSTER_RE.test(clean)) throw invalid("海报地址需要是以 https:// 开头的图片链接");
  return clean;
}

function text(value, max, label, { required = false } = {}) {
  const clean = String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
  if (required && !clean) throw invalid(`${label}不能为空`);
  if (clean.length > max) throw invalid(`${label}最多 ${max} 个字符`);
  return clean;
}

function list(value, { maxItems, itemMax, label }) {
  const raw = Array.isArray(value)
    ? value
    : String(value == null ? "" : value).split(/[,，\n]/);
  const seen = new Set();
  const result = [];
  raw.forEach((entry) => {
    const item = text(entry, itemMax, label);
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  if (result.length > maxItems) throw invalid(`${label}最多 ${maxItems} 项`);
  return result;
}

function integer(value, { min, max, label, fallback = null }) {
  if (value === "" || value == null) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min || number > max) {
    throw invalid(`${label}需要在 ${min}–${max} 之间`);
  }
  return number;
}

function color(value, label, fallback) {
  const clean = String(value == null ? "" : value).trim();
  if (!clean) return fallback;
  if (!COLOR_RE.test(clean)) throw invalid(`${label}需要使用 #RRGGBB 格式`);
  return clean.toLowerCase();
}

function normalizeSeason(value) {
  const clean = String(value == null ? "" : value).trim().toUpperCase();
  if (!clean) return null;
  if (!/^S\d{1,2}$/.test(clean)) throw invalid("季数需要写成 S01 这样的格式，电影请留空");
  return clean;
}

function normalizeQuality(value) {
  const raw = Array.isArray(value)
    ? value
    : String(value == null ? "" : value).split(/[,，\s/]+/);
  const result = [];
  raw.forEach((entry) => {
    const clean = String(entry || "").trim().toUpperCase().replace("杜比视界", "杜比");
    if (!clean) return;
    if (!QUALITIES.includes(clean)) throw invalid(`画质「${clean}」不在支持范围内`);
    if (!result.includes(clean)) result.push(clean);
  });
  if (!result.length) throw invalid("每个观看渠道至少选择一种画质");
  return QUALITIES.filter((entry) => result.includes(entry));
}

function normalizeOffer(value, providers, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw invalid(`第 ${index + 1} 个观看渠道格式不正确`);
  }
  const pid = text(value.pid, 30, "平台");
  if (!providers[pid]) throw invalid(`第 ${index + 1} 个观看渠道的平台不存在`);
  const tier = text(value.tier, 10, "观看方式") || "订阅";
  if (!TIERS.includes(tier)) throw invalid(`观看方式「${tier}」不受支持`);

  return {
    pid,
    tier,
    season: normalizeSeason(value.season),
    quality: normalizeQuality(value.quality),
    price: text(value.price, 40, "价格") || "以平台为准",
    verified: Boolean(value.verified)
  };
}

function normalizeArt(value) {
  const art = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const motif = String(art.motif || DEFAULT_ART.motif);
  return {
    p1: color(art.p1, "主色", DEFAULT_ART.p1),
    p2: color(art.p2, "背景色", DEFAULT_ART.p2),
    p3: color(art.p3, "强调色", DEFAULT_ART.p3),
    ink: color(art.ink, "文字色", DEFAULT_ART.ink),
    motif: MOTIFS.includes(motif) ? motif : DEFAULT_ART.motif
  };
}

/** Validate and normalize an admin title payload. Unknown fields are dropped. */
function validateTitle(body, { providers }) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(422, "invalid_title", "作品数据格式不正确");
  }

  const title = text(body.title, 80, "中文名", { required: true });
  const original = text(body.original, 160, "原名", { required: true });
  const type = text(body.type, 10, "类型") || "剧集";
  if (!TYPES.includes(type)) throw invalid(`类型「${type}」不受支持`);

  let rating = Number(body.rating);
  if (!Number.isFinite(rating)) rating = 0;
  if (rating < 0 || rating > 10) throw invalid("评分需要在 0–10 之间");
  rating = Math.round(rating * 10) / 10;

  const currentYear = new Date().getFullYear();
  const year = integer(body.year, {
    min: 1888,
    max: currentYear + 5,
    label: "年份",
    fallback: currentYear
  });

  const genres = list(body.genres, { maxItems: 8, itemMax: 12, label: "类型标签" });
  if (!genres.length) throw invalid("至少填写一个类型标签");

  const rawOffers = Array.isArray(body.offers) ? body.offers : [];
  if (rawOffers.length > 24) throw invalid("观看渠道最多 24 个");
  const offers = rawOffers.map((offerItem, index) => normalizeOffer(offerItem, providers, index));

  return {
    title,
    original,
    year,
    type,
    rating,
    seasons: integer(body.seasons, { min: 0, max: 100, label: "季数", fallback: null }),
    runtime: text(body.runtime, 40, "片长") || null,
    genres,
    synopsis: text(body.synopsis, 500, "简介", { required: true }),
    aliases: list(body.aliases, { maxItems: 12, itemMax: 40, label: "别名" }),
    tags: list(body.tags, { maxItems: 16, itemMax: 24, label: "标签" }),
    hot: Boolean(body.hot),
    poster: normalizePoster(body.poster),
    art: normalizeArt(body.art),
    offers
  };
}

function slugify(value) {
  return String(value == null ? "" : value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function candidateId(title, original) {
  const base = slugify(original) || slugify(title);
  if (base.length >= 2) return base;
  return `title-${crypto.randomBytes(3).toString("hex")}`;
}

module.exports = {
  TIERS,
  QUALITIES,
  MOTIFS,
  ART_PRESETS,
  DEFAULT_ART,
  POSTER_MAX,
  normalizePoster,
  validateTitle,
  slugify,
  candidateId
};
