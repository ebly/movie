// pinyin.js — 汉字转无声调拼音与首字母，供 Node 与 Worker 共用（CommonJS，esbuild 可直接打包）。
// 数据来自 shared/pinyin-data.js（构建产物），运行时只做一次惰性解码。
"use strict";

const { START, END, SYLLABLES, PACKED } = require("./pinyin-data.js");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const DECODE = new Map([...ALPHABET].map((ch, index) => [ch, index]));

let table = null;

function loadTable() {
  if (table) return table;
  table = new Uint16Array(END - START + 1);
  for (let i = 0; i < table.length; i += 1) {
    const hi = DECODE.get(PACKED[i * 2]) || 0;
    const lo = DECODE.get(PACKED[i * 2 + 1]) || 0;
    table[i] = (hi << 6) | lo;
  }
  return table;
}

/** 单个汉字的无声调拼音；非汉字或未收录返回 ""。 */
function syllableOf(code) {
  if (code < START || code > END) return "";
  return SYLLABLES[loadTable()[code - START]] || "";
}

const cache = new Map();

/** 把一段文字转成全拼与首字母：怪奇物语 → { full: "guaiqiwuyu", initials: "gqwy" } */
function toPinyin(value) {
  const text = String(value == null ? "" : value);
  if (!text) return { full: "", initials: "" };
  const hit = cache.get(text);
  if (hit) return hit;

  let full = "";
  let initials = "";
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code >= START && code <= END) {
      const syllable = syllableOf(code);
      if (!syllable) continue;
      full += syllable;
      initials += syllable[0];
      continue;
    }
    if (/[a-z]/i.test(ch)) {
      full += ch.toLowerCase();
      initials += ch.toLowerCase();
    }
  }
  const result = { full, initials };
  if (cache.size > 4000) cache.clear();
  cache.set(text, result);
  return result;
}

/**
 * 拼音匹配打分：query 必须是纯英文字母。
 * 首字母命中优先于全拼，全拼精确优先于包含。
 */
function matchScore(value, query) {
  if (!query || !/^[a-z]{2,}$/.test(query)) return 0;
  const { full, initials } = toPinyin(value);
  if (!full) return 0;
  if (initials === query) return 110;
  if (full === query) return 100;
  if (initials.startsWith(query)) return 80;
  if (full.startsWith(query)) return 70;
  if (query.length >= 3 && full.includes(query)) return 45;
  return 0;
}

module.exports = { toPinyin, matchScore, syllableOf };
