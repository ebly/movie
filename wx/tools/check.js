"use strict";

/**
 * 小程序结构自检：不用打开微信开发者工具，先在这里把低级错误挡掉。
 *
 *   node wx/tools/check.js
 *
 * 检查项：
 * 1. app.json 里的每个页面都有 js/json/wxml/wxss 四件套；
 * 2. tabBar 指向的页面都在 pages 里；
 * 3. wxml 里 bind / catch 绑定的方法都在对应 js 里存在；
 * 4. 所有 json 能解析、js 能通过语法检查；
 * 5. js 里相对路径的 require 目标文件存在。
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const problems = [];
let checks = 0;

function fail(message) {
  problems.push(message);
}

function readJSON(file) {
  checks += 1;
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  } catch (err) {
    fail(`${file} 不是合法 JSON：${err.message}`);
    return null;
  }
}

function collectKeys(dir, suffix, out = []) {
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) collectKeys(rel, suffix, out);
    else if (entry.name.endsWith(suffix)) out.push(rel);
  }
  return out;
}

const app = readJSON("app.json");
if (!app) {
  console.error("app.json 读不出来，后面的检查跳过");
  process.exit(1);
}

const pages = Array.isArray(app.pages) ? app.pages : [];
if (!pages.length) fail("app.json 没有声明任何页面");

for (const page of pages) {
  for (const ext of [".js", ".json", ".wxml", ".wxss"]) {
    const file = `${page}${ext}`;
    checks += 1;
    if (!fs.existsSync(path.join(ROOT, file))) fail(`缺少文件 ${file}`);
  }
  readJSON(`${page}.json`);
}

const tabList = (app.tabBar && Array.isArray(app.tabBar.list)) ? app.tabBar.list : [];
for (const tab of tabList) {
  checks += 1;
  if (!pages.includes(tab.pagePath)) fail(`tabBar 指向未注册页面 ${tab.pagePath}`);
}

/* 每个页面的 js 是否实现了 wxml 里绑定的方法 */
function boundHandlers(wxml) {
  const names = new Set();
  const re = /\b(?:bind|catch|capture-bind|capture-catch)[:]?([a-zA-Z]+)\s*=\s*"([^"{}]+)"/g;
  let match = re.exec(wxml);
  while (match) {
    names.add(match[2].trim());
    match = re.exec(wxml);
  }
  return names;
}

for (const page of pages) {
  const wxmlPath = path.join(ROOT, `${page}.wxml`);
  const jsPath = path.join(ROOT, `${page}.js`);
  if (!fs.existsSync(wxmlPath) || !fs.existsSync(jsPath)) continue;
  const wxml = fs.readFileSync(wxmlPath, "utf8");
  const js = fs.readFileSync(jsPath, "utf8");
  for (const name of boundHandlers(wxml)) {
    checks += 1;
    const declared = new RegExp(`(^|[^\\w.])${name}\\s*\\(`, "m").test(js)
      || new RegExp(`(^|[^\\w.])${name}\\s*:`, "m").test(js);
    if (!declared) fail(`${page}.wxml 绑定的 ${name} 在 ${page}.js 里找不到`);
  }
}

/* 语法与 require 目标 */
for (const file of collectKeys(".", ".js").filter((entry) => !entry.startsWith("tools/"))) {
  const source = fs.readFileSync(path.join(ROOT, file), "utf8");
  checks += 1;
  try {
    new vm.Script(source, { filename: file });
  } catch (err) {
    fail(`${file} 语法错误：${err.message}`);
    continue;
  }
  const re = /require\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
  let match = re.exec(source);
  while (match) {
    const target = path.resolve(path.dirname(path.join(ROOT, file)), match[1]);
    checks += 1;
    if (!fs.existsSync(target) && !fs.existsSync(`${target}.js`)) {
      fail(`${file} require 的 ${match[1]} 不存在`);
    }
    match = re.exec(source);
  }
}

/* 样式里引用的全局 class 不做严格校验，只统计一下规模 */
const wxss = collectKeys(".", ".wxss");
const wxml = collectKeys(".", ".wxml");

if (problems.length) {
  console.error(`✗ 自检未通过，${problems.length} 个问题：`);
  problems.forEach((item) => console.error(`  - ${item}`));
  process.exit(1);
}

console.log(`✓ 小程序结构自检通过：${pages.length} 个页面、${wxml.length} 个 wxml、${wxss.length} 个 wxss、${checks} 项检查`);
