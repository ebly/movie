// store.js — 基于 D1 (env.DB) 的数据层：目录加载、搜索打分/筛选/related（对齐 server/store.js）与作品 CRUD（对齐 server/repository.js + server/validate.js）。

import { TYPES, QUALITY_ORDER } from "./config.js";
import searchCore from "../shared/search.js";

const { norm, scoreItem } = searchCore;

export { norm };

/* ---------------- 基础错误与工具 ---------------- */

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Lowercase, drop whitespace and common punctuation so "沙丘 2" === "沙丘2". */

function seasonNumber(season) {
  const match = /^S(\d+)$/i.exec(season || "");
  return match ? Number(match[1]) : 0;
}

function parseJSON(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch (err) {
    return fallback;
  }
}

/* ---------------- 校验（对齐 server/validate.js） ---------------- */

export const TIERS = ["订阅", "租赁", "购买", "免费"];
export const QUALITIES = ["4K", "HDR", "杜比", "1080P", "中字"];
export const MOTIFS = [
  "orbit", "plate", "ember", "blades", "vault", "neon", "sun", "arch",
  "ruins", "cave", "bust", "dune", "flash", "multiverse", "earth", "reactor"
];

export const DEFAULT_ART = {
  p1: "#e7dfcf",
  p2: "#b8aaa0",
  p3: "#8c3327",
  ink: "#1b2422",
  motif: "orbit"
};

export const ART_PRESETS = [
  { name: "暖纸", p1: "#f2ddc9", p2: "#d08a63", p3: "#8c3327", ink: "#2b1611" },
  { name: "深墨", p1: "#2a2420", p2: "#0a0908", p3: "#c25434", ink: "#f4eadb" },
  { name: "青瓷", p1: "#dfeae3", p2: "#8faeaa", p3: "#2f5f5a", ink: "#102a2c" },
  { name: "夜蓝", p1: "#0f2a3a", p2: "#06131c", p3: "#5fa88e", ink: "#e8f1ea" },
  { name: "沙金", p1: "#e8d3a7", p2: "#b98a4e", p3: "#a83232", ink: "#241a12" },
  { name: "霓虹", p1: "#1b1030", p2: "#0b0618", p3: "#e05a8a", ink: "#f0e9ff" }
];

const COLOR_RE = /^#[0-9a-f]{6}$/i;

// 与 server/validate.js 一致：只接受 https 图片地址，留空表示用程序化海报。
export const POSTER_MAX = 500;
const POSTER_RE = /^https:\/\/[^\s<>"']+$/i;

function invalid(message, code = "invalid_title") {
  return new HttpError(422, code, message);
}

export function normalizePoster(value) {
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
export function validateTitle(body, { providers }) {
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

export function slugify(value) {
  return String(value == null ? "" : value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function randomHex(bytes) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map((entry) => entry.toString(16).padStart(2, "0")).join("");
}

export function candidateId(title, original) {
  const base = slugify(original) || slugify(title);
  if (base.length >= 2) return base;
  return `title-${randomHex(3)}`;
}

/* ---------------- 目录加载（D1 -> 内存） ---------------- */

function rowToItem(row) {
  return {
    id: row.id,
    title: row.title,
    original: row.original,
    year: row.year,
    type: row.type,
    rating: row.rating,
    seasons: row.seasons == null ? null : row.seasons,
    runtime: row.runtime == null ? null : row.runtime,
    genres: parseJSON(row.genres, []),
    synopsis: row.synopsis || "",
    aliases: parseJSON(row.aliases, []),
    tags: parseJSON(row.tags, []),
    hot: Boolean(row.hot),
    poster: row.poster == null ? null : row.poster,
    art: parseJSON(row.art, {}),
    offers: [],
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function rowToOffer(row) {
  return {
    pid: row.pid,
    tier: row.tier,
    season: row.season == null ? null : row.season,
    quality: parseJSON(row.quality, []),
    price: row.price || "",
    verified: Boolean(row.verified)
  };
}

/** 一次性加载全部 titles + offers，按 rowid / position 保持与 Node 版一致的顺序。 */
export async function loadCatalog(db) {
  const readAll = async () => {
    const [titleRes, offerRes] = await Promise.all([
      db.prepare("SELECT * FROM titles ORDER BY rowid").all(),
      db.prepare("SELECT * FROM offers ORDER BY title_id, position, id").all()
    ]);
    return [titleRes, offerRes];
  };
  let titleRes, offerRes;
  try {
    [titleRes, offerRes] = await db.batch([
      db.prepare("SELECT * FROM titles ORDER BY rowid").all(),
      db.prepare("SELECT * FROM offers ORDER BY title_id, position, id").all()
    ]);
  } catch (err) {
    // 本地 miniflare（wrangler 3.x dev）的 batch 序列化有缺陷（ZodError），降级为两条独立查询。
    if (!/ZodError|Failed to parse body/.test(String(err && err.message))) throw err;
    [titleRes, offerRes] = await readAll();
  }
  const items = (titleRes.results || []).map(rowToItem);
  const byId = new Map();
  const offersByTitle = new Map();
  (offerRes.results || []).forEach((row) => {
    const offers = offersByTitle.get(row.title_id) || [];
    offers.push(rowToOffer(row));
    offersByTitle.set(row.title_id, offers);
  });
  items.forEach((item) => {
    item.offers = offersByTitle.get(item.id) || [];
    byId.set(item.id, item);
  });
  return { items, byId };
}

/* ---------------- 查询逻辑（对齐 server/store.js） ---------------- */

const DEFAULT_LIMIT = 50;

export function createStore({ db, providers, catalog }) {
  const all = () => catalog.items;
  const getById = (id) => catalog.byId.get(String(id || "")) || null;

  function providerURL(offerItem, item) {
    const provider = providers[offerItem.pid];
    if (!provider) return "#";
    const term = provider.region === "中国大陆" ? item.title : item.original;
    return provider.search + encodeURIComponent(term);
  }

  function summarize(item) {
    const verifiedCount = item.offers.filter((offerItem) => offerItem.verified).length;
    return {
      id: item.id,
      title: item.title,
      original: item.original,
      year: item.year,
      type: item.type,
      rating: item.rating,
      seasons: item.seasons,
      runtime: item.runtime,
      genres: item.genres,
      synopsis: item.synopsis,
      aliases: item.aliases || [],
      tags: item.tags || [],
      hot: Boolean(item.hot),
      poster: item.poster || null,
      art: item.art,
      offerCount: item.offers.length,
      verifiedCount
    };
  }

  function rank(q) {
    if (!q) {
      return all().slice().sort((a, b) => b.rating - a.rating);
    }
    return all()
      .map((item) => ({ item, score: scoreItem(item, q) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.item.rating - a.item.rating)
      .map((entry) => entry.item);
  }

  function hotPool() {
    const items = all();
    const featured = items
      .filter((item) => item.hot)
      .sort((a, b) => b.rating - a.rating);
    return featured.length ? featured : items.slice().sort((a, b) => b.rating - a.rating).slice(0, 5);
  }

  function search({ q = "", type = "全部", limit = DEFAULT_LIMIT } = {}) {
    const query = String(q || "").trim().slice(0, 80);
    const cleanType = TYPES.includes(type) ? type : "全部";
    const max = Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 100);
    const matched = rank(norm(query));
    const matchedTypes = TYPES.filter((entry) => matched.some((item) => item.type === entry));
    const effectiveType = cleanType === "全部" || matchedTypes.includes(cleanType) ? cleanType : "全部";
    const filtered = effectiveType === "全部" ? matched : matched.filter((item) => item.type === effectiveType);
    const visibleIds = new Set(filtered.slice(0, max).map((item) => item.id));

    return {
      query,
      type: effectiveType,
      total: filtered.length,
      matchedTotal: matched.length,
      matchedTypes,
      items: filtered.slice(0, max).map(summarize),
      suggestions: hotPool()
        .filter((item) => !visibleIds.has(item.id))
        .slice(0, 3)
        .map(summarize)
    };
  }

  function related(item) {
    return all()
      .filter((candidate) => candidate.id !== item.id)
      .map((candidate) => {
        const genreOverlap = (candidate.genres || []).filter((genre) => (item.genres || []).includes(genre)).length;
        const tagOverlap = (candidate.tags || []).filter((tag) => (item.tags || []).includes(tag)).length;
        const typeBonus = candidate.type === item.type ? 3 : 0;
        return {
          candidate,
          score: genreOverlap * 10 + tagOverlap * 4 + typeBonus + candidate.rating / 10
        };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((entry) => summarize(entry.candidate));
  }

  function decorateOffer(item, offerItem, index) {
    return {
      ...offerItem,
      url: providerURL(offerItem, item),
      clickUrl: `/go/${encodeURIComponent(item.id)}/${index}`
    };
  }

  function getTitle(id) {
    const item = getById(id);
    if (!item) return null;
    return {
      item: {
        ...item,
        aliases: item.aliases || [],
        tags: item.tags || [],
        offers: item.offers.map((offerItem, index) => decorateOffer(item, offerItem, index))
      },
      related: related(item)
    };
  }

  function offerOptions(item) {
    const seasons = [...new Set(item.offers.map((offerItem) => offerItem.season).filter(Boolean))]
      .sort((a, b) => seasonNumber(b) - seasonNumber(a));
    const regions = [...new Set(item.offers.map((offerItem) => providers[offerItem.pid] && providers[offerItem.pid].region).filter(Boolean))];
    const tiers = [...new Set(item.offers.map((offerItem) => offerItem.tier))];
    const qualities = QUALITY_ORDER.filter((quality) =>
      item.offers.some((offerItem) => offerItem.quality.includes(quality))
    );
    return { seasons, regions, tiers, qualities };
  }

  function filterOffers(id, rawFilters = {}) {
    const item = getById(id);
    if (!item) return null;

    const options = offerOptions(item);
    const season = options.seasons.includes(rawFilters.season) ? rawFilters.season : "全部";
    const region = options.regions.includes(rawFilters.region) ? rawFilters.region : "全部";
    const tier = options.tiers.includes(rawFilters.tier) ? rawFilters.tier : "全部";
    const quality = options.qualities.includes(rawFilters.quality) ? rawFilters.quality : "全部";
    const verified = rawFilters.verified === true || rawFilters.verified === "1" || rawFilters.verified === "true";

    const matches = (offerItem) => {
      if (verified && !offerItem.verified) return false;
      if (season !== "全部" && offerItem.season !== season) return false;
      if (region !== "全部" && (!providers[offerItem.pid] || providers[offerItem.pid].region !== region)) return false;
      if (tier !== "全部" && offerItem.tier !== tier) return false;
      if (quality !== "全部" && !offerItem.quality.includes(quality)) return false;
      return true;
    };

    const visible = item.offers
      .map((offerItem, index) => decorateOffer(item, offerItem, index))
      .filter(matches);
    const online = visible.filter((offerItem) => offerItem.verified);
    const pending = visible.filter((offerItem) => !offerItem.verified);

    const counts = {
      season: {},
      region: {},
      tier: {},
      quality: {}
    };
    item.offers.forEach((offerItem) => {
      if (offerItem.season) counts.season[offerItem.season] = (counts.season[offerItem.season] || 0) + 1;
      const provider = providers[offerItem.pid];
      if (provider) counts.region[provider.region] = (counts.region[provider.region] || 0) + 1;
      counts.tier[offerItem.tier] = (counts.tier[offerItem.tier] || 0) + 1;
      offerItem.quality.forEach((entry) => {
        if (QUALITY_ORDER.includes(entry)) counts.quality[entry] = (counts.quality[entry] || 0) + 1;
      });
    });

    return {
      id: item.id,
      filters: { season, region, tier, quality, verified },
      options,
      counts,
      total: visible.length,
      verifiedCount: online.length,
      groups: [
        { key: "verified", title: "已验证可看", items: online },
        { key: "pending", title: "待确认", items: pending }
      ]
    };
  }

  function resolveOffer(id, rawIndex) {
    const item = getById(id);
    if (!item) return null;
    const index = Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= item.offers.length) return null;
    const offerItem = item.offers[index];
    return {
      item,
      offer: offerItem,
      url: providerURL(offerItem, item)
    };
  }

  function stats() {
    const items = all();
    return {
      titles: items.length,
      providers: Object.keys(providers).length,
      offers: items.reduce((sum, item) => sum + item.offers.length, 0),
      verifiedOffers: items.reduce(
        (sum, item) => sum + item.offers.filter((offerItem) => offerItem.verified).length,
        0
      )
    };
  }

  /* ---------------- CRUD（对齐 server/repository.js，优先 db.batch 事务写回） ---------------- */

  /**
   * 事务式执行一组写语句。
   * 本地 wrangler dev 的 miniflare batch 序列化有缺陷（ZodError）时，
   * 降级为逐条执行（失去原子性，仅影响本地演示；生产 workerd 走 batch 事务）。
   */
  async function runStatements(statements) {
    try {
      return await db.batch(statements);
    } catch (err) {
      const isLocalBatchBug = /ZodError|Failed to parse body/.test(String(err && err.message));
      const readable = statements.every((s) => typeof s.statement === "string" && Array.isArray(s.params));
      if (!isLocalBatchBug || !readable) throw err;
      for (const s of statements) {
        await db.prepare(s.statement).bind(...s.params).run();
      }
      return null;
    }
  }

  function nextId(title, original) {
    const base = candidateId(title, original);
    if (!catalog.byId.has(base)) return base;
    let index = 2;
    while (catalog.byId.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  function titleStatements(item, { insert }) {
    const statements = [];
    if (insert) {
      statements.push(db.prepare(
        "INSERT INTO titles (id, title, original, year, type, rating, seasons, runtime, genres, synopsis, aliases, tags, hot, poster, art, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        item.id, item.title, item.original, item.year, item.type, item.rating,
        item.seasons, item.runtime, JSON.stringify(item.genres || []), item.synopsis,
        JSON.stringify(item.aliases || []), JSON.stringify(item.tags || []),
        item.hot ? 1 : 0, item.poster || null, JSON.stringify(item.art || {}), item.createdAt, item.updatedAt
      ));
    } else {
      statements.push(db.prepare(
        "UPDATE titles SET title = ?, original = ?, year = ?, type = ?, rating = ?, seasons = ?, runtime = ?, genres = ?, synopsis = ?, aliases = ?, tags = ?, hot = ?, poster = ?, art = ?, created_at = ?, updated_at = ? WHERE id = ?"
      ).bind(
        item.title, item.original, item.year, item.type, item.rating,
        item.seasons, item.runtime, JSON.stringify(item.genres || []), item.synopsis,
        JSON.stringify(item.aliases || []), JSON.stringify(item.tags || []),
        item.hot ? 1 : 0, item.poster || null, JSON.stringify(item.art || {}), item.createdAt, item.updatedAt, item.id
      ));
    }
    statements.push(db.prepare("DELETE FROM offers WHERE title_id = ?").bind(item.id));
    (item.offers || []).forEach((offerItem, index) => {
      statements.push(db.prepare(
        "INSERT INTO offers (title_id, position, pid, tier, season, quality, price, verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(
        item.id, index, offerItem.pid, offerItem.tier, offerItem.season,
        JSON.stringify(offerItem.quality || []), offerItem.price, offerItem.verified ? 1 : 0
      ));
    });
    return statements;
  }

  async function createTitle(input) {
    const now = new Date().toISOString();
    const item = {
      ...input,
      id: nextId(input.title, input.original),
      createdAt: now,
      updatedAt: now
    };
    await runStatements(titleStatements(item, { insert: true }));
    catalog.items.push(item);
    catalog.byId.set(item.id, item);
    return item;
  }

  async function updateTitle(id, input) {
    const current = getById(id);
    if (!current) return null;
    const index = catalog.items.indexOf(current);
    const next = {
      ...input,
      id: current.id,
      createdAt: current.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await runStatements(titleStatements(next, { insert: false }));
    catalog.items[index] = next;
    catalog.byId.set(next.id, next);
    return next;
  }

  async function removeTitle(id) {
    const current = getById(id);
    if (!current) return null;
    const index = catalog.items.indexOf(current);
    // offers 定义了 ON DELETE CASCADE，但 D1 的外键开关取决于绑定配置，这里显式删除以保证一致。
    await runStatements([
      db.prepare("DELETE FROM offers WHERE title_id = ?").bind(current.id),
      db.prepare("DELETE FROM titles WHERE id = ?").bind(current.id)
    ]);
    catalog.items.splice(index, 1);
    catalog.byId.delete(current.id);
    return current;
  }

  return {
    providers,
    types: TYPES,
    all,
    get: getById,
    get stats() {
      return stats();
    },
    hot: () => hotPool().map(summarize),
    search,
    getTitle,
    filterOffers,
    resolveOffer,
    createTitle,
    updateTitle,
    removeTitle
  };
}
