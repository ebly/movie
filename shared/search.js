// search.js — 搜索归一化与打分内核，Node 与 Worker 共用同一份实现（第 8 项：消除双端逻辑漂移）。
"use strict";

const { matchScore } = require("./pinyin.js");

/** Lowercase, drop whitespace and common punctuation so "沙丘 2" === "沙丘2". */
function norm(value) {
  return String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[\s\-—_:：·,，.。!！?？'"“”‘’()（）]/g, "");
}

/**
 * 字段加权打分。基础权重沿用初版实现（改权重会改变老用户的搜索结果顺序），
 * 拼音部分只对纯字母 query 生效，因此中文查询的行为与之前完全一致。
 */
function scoreItem(item, q) {
  let score = 0;
  const title = norm(item.title);
  const original = norm(item.original);
  if (title === q) score += 120;
  else if (title.includes(q)) score += 70;
  else if (title.length > 1 && q.includes(title)) score += 45;
  if (original === q) score += 105;
  else if (original.includes(q)) score += 55;
  else if (original.length > 2 && q.includes(original)) score += 35;

  const aliases = item.aliases || [];
  aliases.forEach((alias) => {
    const a = norm(alias);
    if (a === q) score += 50;
    else if (a.includes(q) || q.includes(a)) score += 24;
  });

  (item.tags || []).forEach((tag) => {
    const t = norm(tag);
    if (t === q) score += 40;
    else if (q.includes(t) || t.includes(q)) score += 15;
  });

  (item.genres || []).forEach((genre) => {
    if (norm(genre) === q) score += 18;
  });

  if (norm(item.synopsis).includes(q)) score += 4;
  if (String(item.year) === q) score += 6;

  // 拼音：主标题满分权重，别名略降，避免同名别名把不相关作品顶上来。
  const titlePinyin = matchScore(item.title, q);
  if (titlePinyin) score += titlePinyin;
  else {
    let best = 0;
    aliases.forEach((alias) => {
      const value = matchScore(alias, q);
      if (value > best) best = value;
    });
    if (best) score += Math.round(best * 0.8);
  }

  return score;
}

module.exports = { norm, scoreItem };
