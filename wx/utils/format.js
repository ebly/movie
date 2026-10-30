"use strict";

/**
 * 纯函数：所有页面共用的小工具。
 * 不碰 wx.* 全局，所以既能被小程序 require，也能被 Node 的测试直接加载。
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** 海报缺失时的兜底配色，取自站点的暖色主题，按标题散列挑一组。 */
const PALETTES = [
  ["#e7c795", "#b7763c", "#5b2a17"],
  ["#dfeae3", "#8faeaa", "#2f5f5a"],
  ["#f0e2e6", "#c39aa8", "#6b3a4e"],
  ["#e9e2d0", "#b9a982", "#5c5030"],
  ["#dde5ef", "#8fa3bd", "#33465c"],
  ["#efe0d2", "#c08f6c", "#63341f"]
];

function hashOf(seed) {
  const text = String(seed || "");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function paletteFor(seed) {
  return PALETTES[hashOf(seed) % PALETTES.length];
}

/** 海报容器的内联样式：有图不画渐变，没图用散列调色板兜底。 */
function posterStyle(seed, art) {
  const colors = art && art.p1 && art.p2 && art.p3
    ? [art.p1, art.p2, art.p3]
    : paletteFor(seed);
  return `background-image: linear-gradient(155deg, ${colors[0]} 0%, ${colors[1]} 52%, ${colors[2]} 100%);`;
}

function ratingText(value) {
  const rating = Number(value);
  return Number.isFinite(rating) && rating > 0 ? rating.toFixed(1) : "未评分";
}

function typeText(item) {
  if (!item) return "";
  if (item.type) return item.type;
  return item.seasons ? "剧集" : "电影";
}

/** 详情页的一行副标题：年份 · 类型 · 时长/季数。 */
function metaLine(item) {
  if (!item) return "";
  const parts = [];
  if (item.year) parts.push(`${item.year}`);
  parts.push(typeText(item));
  if (item.runtime) parts.push(item.runtime);
  else if (item.seasons) parts.push(`${item.seasons} 季`);
  return parts.join(" · ");
}

function clip(text, max = 80) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function relTime(input) {
  const time = input instanceof Date ? input.getTime() : Date.parse(input);
  if (!Number.isFinite(time)) return "";
  const diff = Date.now() - time;
  if (diff < 0) return "刚刚";
  if (diff < MINUTE) return "刚刚";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} 小时前`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)} 天前`;
  const date = new Date(time);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const PAN_LABELS = {
  quark: "夸克网盘",
  baidu: "百度网盘",
  xunlei: "迅雷网盘",
  aliyun: "阿里云盘"
};

function panTypeLabel(type) {
  return PAN_LABELS[type] || "网盘";
}

/** 复制到剪贴板的内容：有提取码就一起带上，省得用户分两次复制。 */
function panCopyText(item) {
  if (!item || !item.url) return "";
  const code = String(item.password || "").trim();
  return code ? `${item.url} 提取码：${code}` : item.url;
}

function trimQuery(value, max = 120) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

module.exports = {
  PALETTES,
  clip,
  hashOf,
  metaLine,
  paletteFor,
  panCopyText,
  panTypeLabel,
  posterStyle,
  ratingText,
  relTime,
  trimQuery,
  typeText
};
