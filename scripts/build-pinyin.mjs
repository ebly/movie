// build-pinyin.mjs — 一次性生成 shared/pinyin-data.js。
// 数据来源：https://github.com/mozillazg/pinyin-data 的 kMandarin.txt（Unicode 官方 kMandarin 读音）。
// 生成结果：U+4E00–U+9FA5 共 20902 个汉字的常用读音索引，紧凑编码后约 40KB。
// 用法：node scripts/build-pinyin.mjs [本地 kMandarin.txt 路径]
import fs from "node:fs";
import path from "node:path";

const START = 0x4e00;
const END = 0x9fa5;
const SOURCE = "https://cdn.jsdelivr.net/gh/mozillazg/pinyin-data@master/kMandarin.txt";
const OUT = path.join(process.cwd(), "shared", "pinyin-data.js");

const TONE_MAP = {
  ā: "a", á: "a", ǎ: "a", à: "a",
  ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i",
  ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u",
  ǖ: "v", ǘ: "v", ǚ: "v", ǜ: "v", ü: "v",
  ń: "n", ň: "n", ǹ: "n", ḿ: "m"
};

function plain(syllable) {
  let out = "";
  for (const ch of syllable) out += TONE_MAP[ch] || ch;
  return out.toLowerCase().replace(/[^a-z]/g, "");
}

async function loadSource(file) {
  if (file) return fs.readFileSync(file, "utf8");
  const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`下载失败：${res.status}`);
  return res.text();
}

const text = await loadSource(process.argv[2]);
const readings = new Map();
for (const line of text.split("\n")) {
  const match = /^U\+([0-9A-F]+):\s*([^\s#]+)/i.exec(line.trim());
  if (!match) continue;
  const code = parseInt(match[1], 16);
  if (code < START || code > END) continue;
  const first = match[2].split(",")[0];
  const syllable = plain(first);
  if (syllable && /^[a-z]+$/.test(syllable) && syllable.length <= 7) readings.set(code, syllable);
}

const syllables = [...new Set(readings.values())].sort();
const index = new Map(syllables.map((s, i) => [s, i + 1]));
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

let packed = "";
for (let code = START; code <= END; code += 1) {
  const syllable = readings.get(code);
  const value = syllable ? index.get(syllable) : 0;
  packed += ALPHABET[value >> 6] + ALPHABET[value & 63];
}

const body = `// pinyin-data.js — 由 scripts/build-pinyin.mjs 生成，请勿手工修改。
// kMandarin 常用读音，覆盖 U+${START.toString(16).toUpperCase()}–U+${END.toString(16).toUpperCase()}（${END - START + 1} 字）。
// packed 每 2 个字符用 64 进制编码一个读音下标（0 = 无读音），syllables 是下标表。
"use strict";

const START = ${START};
const END = ${END};
const SYLLABLES = ${JSON.stringify([""].concat(syllables))};
const PACKED = ${JSON.stringify(packed)};

module.exports = { START, END, SYLLABLES, PACKED };
`;

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, body, "utf8");
console.log(`写入 ${OUT}`);
console.log(`汉字 ${END - START + 1} 个，有读音 ${readings.size} 个，音节 ${syllables.length} 种，文件 ${(body.length / 1024).toFixed(1)}KB`);
