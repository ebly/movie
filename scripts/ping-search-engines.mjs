#!/usr/bin/env node
// ping-search-engines.mjs — 部署后把 sitemap 里的 URL 主动推给搜索引擎，缩短收录时间。
//
// 能做什么：
//   1. 读取线上 sitemap.xml，取出全部页面 URL；
//   2. IndexNow：一次 POST 通知 Bing / Yandex / Seznam / Naver（当前 Bing 推荐的提交方式）；
//   3. 百度「普通收录」主动推送（需要 BAIDU_TOKEN）；
//   4. Google 已停用 sitemap ping，这里只做提醒，需在 Search Console 里提交。
//
// 用法：
//   npm run seo:init-key            # 首次：生成 IndexNow 密钥文件到 client/，随部署上线
//   npm run seo:ping                # 部署后：推送全部 URL
//   node scripts/ping-search-engines.mjs --check   # 只读：抓 sitemap 并列出 URL，不提交
//
// 环境变量：
//   SITE_URL       站点根地址（默认 https://yinto.top）
//   INDEXNOW_KEY   IndexNow 密钥；不填则自动从 client/<32位十六进制>.txt 里找
//   BAIDU_TOKEN    百度搜索资源平台的推送 token；不填则跳过百度
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLIENT_DIR = path.join(ROOT, "client");
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const BAIDU_ENDPOINT = "https://data.zz.baidu.com/urls";
const MAX_URLS = 10_000;

function origin() {
  return (process.env.SITE_URL || "https://yinto.top").replace(/\/+$/, "");
}

/** 从 sitemap 文本里取出所有 <loc>（不会误取 image:loc）。 */
export function parseSitemapLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
}

export function hostOf(url) {
  try {
    return new URL(url).host;
  } catch (err) {
    return "";
  }
}

export function buildIndexNowPayload({ url, key, urls }) {
  const list = urls.slice(0, MAX_URLS);
  const site = originOf(url);
  const host = hostOf(url);
  return {
    host,
    key,
    keyLocation: `${site}/${key}.txt`,
    urlList: list
  };
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch (err) {
    return "";
  }
}

/** 在 client/ 里找已生成的 IndexNow 密钥文件（文件名就是密钥）。 */
export function findKeyFile(dir = CLIENT_DIR) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (err) {
    return null;
  }
  for (const name of entries) {
    const match = /^([0-9a-f]{32})\.txt$/.exec(name);
    if (match) return { key: match[1], file: path.join(dir, name) };
  }
  return null;
}

function initKey() {
  const existing = findKeyFile();
  if (existing) {
    console.log(`已存在 IndexNow 密钥文件：${path.relative(ROOT, existing.file)}`);
    console.log(`密钥：${existing.key}`);
    return existing.key;
  }
  const key = crypto.randomBytes(16).toString("hex");
  const file = path.join(CLIENT_DIR, `${key}.txt`);
  fs.mkdirSync(CLIENT_DIR, { recursive: true });
  fs.writeFileSync(file, key, "utf8");
  console.log(`已生成 IndexNow 密钥文件：${path.relative(ROOT, file)}`);
  console.log(`密钥：${key}`);
  console.log("部署后它会以 /<密钥>.txt 的形式公开，IndexNow 用它验证站点归属。");
  return key;
}

async function fetchSitemap(site) {
  const url = `${site}/sitemap.xml`;
  const response = await fetch(url, {
    headers: { accept: "application/xml,text/xml" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    throw new Error(`拉取 sitemap 失败：${url} → HTTP ${response.status}`);
  }
  const xml = await response.text();
  const locs = parseSitemapLocs(xml);
  if (!locs.length) throw new Error(`sitemap 里没有 <loc>：${url}`);
  return locs;
}

async function pingIndexNow(site, key, urls) {
  const keyLocation = `${site}/${key}.txt`;
  try {
    const check = await fetch(keyLocation, { signal: AbortSignal.timeout(15_000) });
    if (!check.ok) {
      console.warn(`⚠️  密钥文件还不可访问（${keyLocation} → HTTP ${check.status}），请先部署再推送。`);
      return false;
    }
  } catch (err) {
    console.warn(`⚠️  无法访问密钥文件 ${keyLocation}：${err.message}`);
    return false;
  }

  const payload = buildIndexNowPayload({ url: site, key, urls });
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000)
  });
  // 200 成功；202 已接收待校验，都算提交成功。
  if (response.status === 200 || response.status === 202) {
    console.log(`✅ IndexNow 已提交 ${payload.urlList.length} 条 URL（HTTP ${response.status}）`);
    return true;
  }
  const text = await response.text().catch(() => "");
  console.warn(`⚠️  IndexNow 返回 HTTP ${response.status}${text ? `：${text.slice(0, 200)}` : ""}`);
  return false;
}

async function pingBaidu(site, token, urls) {
  const endpoint = `${BAIDU_ENDPOINT}?site=${encodeURIComponent(site)}&token=${encodeURIComponent(token)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: urls.slice(0, MAX_URLS).join("\n"),
    signal: AbortSignal.timeout(20_000)
  });
  let body = {};
  try {
    body = await response.json();
  } catch (err) {
    body = {};
  }
  if (response.ok && !body.error) {
    console.log(`✅ 百度推送已接受（success=${body.success ?? "?"}，remain=${body.remain ?? "?"}）`);
    return true;
  }
  console.warn(`⚠️  百度推送失败（HTTP ${response.status}）：${body.message || body.error || "未知错误"}`);
  return false;
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--init-key")) {
    initKey();
    return;
  }

  const site = origin();
  const checkOnly = argv.includes("--check");
  console.log(`站点：${site}`);

  let locs;
  try {
    locs = await fetchSitemap(site);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`sitemap 共 ${locs.length} 条 URL${checkOnly ? "（--check，不提交）" : ""}`);

  if (checkOnly) {
    locs.slice(0, 8).forEach((loc) => console.log(`  · ${loc}`));
    if (locs.length > 8) console.log(`  … 另外 ${locs.length - 8} 条`);
    return;
  }

  let submitted = false;

  const keyFile = findKeyFile();
  const key = process.env.INDEXNOW_KEY || (keyFile && keyFile.key);
  if (key) {
    submitted = (await pingIndexNow(site, key, locs)) || submitted;
  } else {
    console.log("· 未配置 IndexNow：`npm run seo:init-key` 生成密钥，部署后再运行本脚本。");
  }

  if (process.env.BAIDU_TOKEN) {
    submitted = (await pingBaidu(site, process.env.BAIDU_TOKEN, locs)) || submitted;
  } else {
    console.log("· 未配置 BAIDU_TOKEN：跳过百度主动推送（中文站建议配置）。");
  }

  console.log("· Google 已停用 sitemap ping，请在 Search Console 提交一次 sitemap.xml 即可长期自动抓取。");
  if (!submitted) console.log("没有成功提交任何搜索引擎，检查上面的提示。");
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`❌ ${err.message}`);
    process.exitCode = 1;
  });
}