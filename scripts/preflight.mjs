#!/usr/bin/env node
// preflight.mjs — 上线前自检：把「部署必踩的坑」在本地先拦一遍。
// 用法：npm run preflight
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = process.cwd();
const results = [];
const add = (level, title, detail = "", fix = "") => results.push({ level, title, detail, fix });

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

/* ---------- 1. 运行环境 ---------- */
const major = Number(process.versions.node.split(".")[0]);
if (major >= 20) add("ok", `Node ${process.version}`, "满足 wrangler 4 的要求");
else add("fail", `Node ${process.version} 太旧`, "wrangler 4 需要 Node >= 20", "nvm use 22");

/* ---------- 2. wrangler.toml ---------- */
let toml = "";
try {
  toml = read("wrangler.toml");
} catch (err) {
  add("fail", "找不到 wrangler.toml");
}

if (toml) {
  const idMatch = /database_id\s*=\s*"([^"]*)"/.exec(toml);
  const id = idMatch ? idMatch[1] : "";
  if (!id || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)) {
    add(
      "fail",
      "D1 database_id 还是占位符",
      "部署会失败，或运行时找不到数据库",
      "npx wrangler d1 create yingtu-db  # 把输出的 id 填回 wrangler.toml"
    );
  } else {
    add("ok", "D1 database_id 已填写", id.slice(0, 8) + "…");
  }

  if (/run_worker_first\s*=\s*\[/.test(toml)) {
    add("ok", "run_worker_first 使用路由白名单", "静态资源不消耗 Worker 请求额度");
  } else if (/run_worker_first\s*=\s*true/.test(toml)) {
    add("warn", "run_worker_first = true", "CSS/JS 也会走 Worker，消耗免费额度", "改回路由数组");
  }

  if (/\[observability\]/.test(toml)) add("ok", "已开启 Workers Logs");
  else add("warn", "未开启 observability", "线上排查 5xx 会很难");
}

/* ---------- 3. 静态资源与页面 ---------- */
if (exists("client/index.html")) {
  const html = read("client/index.html");
  if (html.includes("<!--SEO-->")) add("ok", "index.html 有 SEO 注入占位");
  else add("warn", "index.html 缺少 <!--SEO-->", "服务端 meta 注入会失效");

  const relative = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((ref) => !/^(https?:|data:|\/|#|mailto:)/.test(ref));
  if (relative.length) add("fail", "index.html 有相对路径资源", relative.join(", "), "改成 /styles.css 这类绝对路径");
  else add("ok", "index.html 资源均为绝对路径");
} else {
  add("fail", "缺少 client/index.html");
}

if (exists("client/admin/index.html")) add("warn", "client/admin 又出现了", "后台已拆成独立项目 movie-admin", "删掉它，后台在 ../movie-admin 里维护");
else add("ok", "前台不含后台文件（后台在 ../movie-admin）");

/* ---------- 4. D1 种子文件 ---------- */
if (exists("worker/seed.sql")) {
  const size = fs.statSync(path.join(ROOT, "worker/seed.sql")).size;
  add("ok", "worker/seed.sql 已生成", `${(size / 1024).toFixed(0)} KB`);
} else {
  add("warn", "worker/seed.sql 不存在", "远程库会是空的", "node scripts/seed-d1.mjs");
}

/* ---------- 5. wrangler 登录状态 ---------- */
const who = spawnSync("npx", ["wrangler", "whoami"], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 40_000,
  shell: process.platform === "win32"
});
const whoOut = `${who.stdout || ""}${who.stderr || ""}`;
if (/not authenticated|You are not authenticated/i.test(whoOut)) {
  add("fail", "wrangler 未登录", "无法创建 D1、无法 deploy", "npx wrangler login");
} else if (/You are logged in|associated with the email/i.test(whoOut)) {
  const email = (/associated with the email\s+(\S+)/i.exec(whoOut) || [])[1] || "";
  add("ok", "wrangler 已登录", email);
} else {
  add("warn", "无法确认 wrangler 登录状态", "网络或代理可能拦截了请求", "手动执行 npx wrangler whoami");
}

/* ---------- 6. 密钥提醒（无法在未登录时读取） ---------- */
add(
  "warn",
  "确认已设置 ADMIN_PASSWORD",
  "不设置则使用 config/brand.json 里的演示密码，等于后台公开",
  "npx wrangler secret put ADMIN_PASSWORD"
);
add("warn", "确认已设置 ADMIN_SECRET", "会话签名密钥，建议 32 位随机串", "npx wrangler secret put ADMIN_SECRET");

/* ---------- 输出 ---------- */
const icon = { ok: "✅", warn: "⚠️ ", fail: "❌" };
console.log("\n映途 · 上线前自检\n" + "─".repeat(56));
for (const item of results) {
  console.log(`${icon[item.level]} ${item.title}${item.detail ? `  — ${item.detail}` : ""}`);
  if (item.fix && item.level !== "ok") console.log(`   → ${item.fix}`);
}

const fails = results.filter((item) => item.level === "fail").length;
const warns = results.filter((item) => item.level === "warn").length;
console.log("─".repeat(56));
console.log(fails ? `还有 ${fails} 个阻塞项，先处理完再 deploy。` : "没有阻塞项，可以 `npm run deploy`。");
if (warns) console.log(`另有 ${warns} 条提醒，建议部署前看一眼。`);
console.log("完整步骤见 docs/deploy-free.md\n");
process.exit(fails ? 1 : 0);
