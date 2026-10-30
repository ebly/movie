/* 字体样式表以 media="print" 载入，避免 Google Fonts 不可达时阻塞首屏。 */
(function enableFonts() {
  const link = document.getElementById("font-css");
  if (link) link.media = "all";
})();

/* 映途管理后台 — 无依赖看板与反馈收件箱。品牌文案来自 /api/bootstrap 的 brand 字段（唯一来源 config/brand.json）。 */
"use strict";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const esc = (value) =>
  String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));

const MARK_PATHS = `<path d="M4 19 12 6l8 13" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8.6 19l3.4-5 3.4 5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/><circle cx="12" cy="4.6" r="1.7" fill="currentColor"/>`;

const ICONS = {
  mark: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${MARK_PATHS}</svg>`,
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="8" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.4-3.4"/></svg>`,
  arrowLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.3M21 3v6h-6"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.1A10.8 10.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.7C3.6 8.5 2 12 2 12s3.6 6 10 6a9.7 9.7 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6M18 20a5.4 5.4 0 0 0-2-4.2"/></svg>`,
  click: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3l6.5 17 2.2-7.2L21 10.5z"/></svg>`,
  view: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3"/><path d="M8 8.5h8M8 12h5"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.3-2.9 7.6-7 9.5-4.1-1.9-7-5.2-7-9.5V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  message: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8z"/><path d="M8 10h8M8 14h5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/></svg>`,
  film: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 3v18M16 3v18M3 9h5M16 9h5M3 15h5M16 15h5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
};

const NUMBER = new Intl.NumberFormat("zh-CN");
const DATE_TIME = new Intl.DateTimeFormat("zh-CN", {
  month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false
});
const WEEKDAY = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
const CLOCK = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

const state = {
  session: null,
  usingDefaultPassword: false,
  mode: "local",
  remoteBase: null,
  meta: null,
  dashboard: null,
  days: 30,
  feedback: { q: "", page: 0, limit: 12, focus: false },
  feedbackTimer: null,
  view: "login",
  booted: false,
  routingBound: false,
  routeToken: 0,
  toastTimer: null
};

/* ---------------- utilities ---------------- */

function mark(className = "mark") {
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true">${MARK_PATHS}</svg>`;
}

function num(value) {
  return NUMBER.format(Number(value) || 0);
}

function clock(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : CLOCK.format(date);
}

function dateTime(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : DATE_TIME.format(date);
}

function relativeTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diff = Date.now() - date.getTime();
  const minute = 60_000;
  if (diff < minute) return "刚刚";
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`;
  if (diff < 7 * 24 * 60 * minute) return `${Math.floor(diff / (24 * 60 * minute))} 天前`;
  return DATE_TIME.format(date);
}

function firstChar(value) {
  return Array.from(String(value || "?"))[0] || "?";
}

function showToast(message, type = "") {
  const toast = $("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.className = `admin-toast show${type === "error" ? " error" : ""}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    toast.className = "admin-toast";
  }, 2800);
}

function pageHead({ eyebrow, title, sub, actions = "", note = "" }) {
  return `<div class="page-head">
    <div>
      <div class="eyebrow">${esc(eyebrow)}</div>
      <h1>${title}</h1>
      <div class="sub">${sub}${note ? ` <span class="tag amber">${esc(note)}</span>` : ""}</div>
    </div>
    ${actions ? `<div class="head-actions">${actions}</div>` : ""}
  </div>`;
}

function emptyState(message, hint = "") {
  return `<div class="empty">${ICONS.spark}<strong>${esc(message)}</strong>${hint ? esc(hint) : ""}</div>`;
}

/* ---------------- API ---------------- */

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(path, { method = "GET", body, auth = true, headers: extraHeaders } = {}) {
  const headers = { Accept: "application/json", ...(extraHeaders || {}) };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      credentials: "same-origin",
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (err) {
    throw new ApiError("无法连接服务器，请确认 npm start 仍在运行", 0, "network_error");
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch (err) {
    payload = null;
  }

  if (response.status === 401 && auth && !path.includes("/login")) {
    handleExpired();
    throw new ApiError("请先登录管理后台", 401, "unauthorized");
  }

  if (!response.ok) {
    const message = payload && payload.error && payload.error.message
      ? payload.error.message
      : `请求失败（HTTP ${response.status}）`;
    throw new ApiError(message, response.status, payload && payload.error ? payload.error.code : "http_error");
  }

  return payload;
}

function handleExpired() {
  state.session = { authenticated: false };
  state.booted = false;
  state.routeToken += 1;
  if (state.view !== "login") renderLogin("登录已过期，请重新登录。");
}

/* 品牌文案与前台地址：兜底值只在服务端不可用时出现，正常由 /api/bootstrap 下发覆盖。 */
let BRAND = { name: "映途", latin: "Yingtu", tagline: "正版观看渠道索引", slogan: "找到正版影视的观看去处" };
let FRONTEND = "http://127.0.0.1:4173";

async function loadBrand() {
  try {
    const boot = await api("/api/bootstrap", { auth: false });
    if (boot && boot.brand) BRAND = Object.assign(BRAND, boot.brand);
    if (boot && boot.frontendUrl) FRONTEND = String(boot.frontendUrl).replace(/\/+$/, "");
    if (boot && boot.mode) state.mode = boot.mode;
    if (boot && boot.remoteBase) state.remoteBase = boot.remoteBase;
  } catch (err) {
    /* 拿不到品牌就沿用兜底文案 */
  }
}

/* ---------------- login ---------------- */

function renderLogin(message = "") {
  state.view = "login";
  state.booted = false;
  state.routeToken += 1;
  document.title = `登录 — ${BRAND.name}管理后台`;

  const hint = state.usingDefaultPassword
    ? "当前使用演示默认密码（见 README）。部署到公网前，请通过 <code>ADMIN_PASSWORD</code> 设置强密码。"
    : "密码由服务端 <code>ADMIN_PASSWORD</code> 环境变量提供。";

  $("#admin").innerHTML = `<div class="login">
    <section class="login-visual">
      <div class="login-brand">
        ${mark()}
        <span class="word">${BRAND.name}</span>
        <span class="tag">ADMIN</span>
      </div>
      <div class="login-copy">
        <span class="login-kicker">Editorial control room</span>
        <h1>把<em>观众</em>的动向<br>握在手里。</h1>
        <p>看看大家在找什么、点开了哪一部，收到哪些反馈。所有数据都留在这台服务器上。</p>
        <div class="login-facts"><span>搜索洞察</span><span>匿名统计</span><span>反馈收件箱</span></div>
      </div>
      <div class="login-foot"><span>${BRAND.name} · ${BRAND.tagline}</span><span>仅限授权人员</span></div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <div class="eyebrow">Private access</div>
        <h2>进入管理后台</h2>
        <p class="lede">输入管理密码，查看行为数据与用户反馈。</p>
        <form class="login-form" id="login-form">
          <div class="field">
            <label for="admin-password">管理密码</label>
            <div class="password-wrap">
              <input id="admin-password" name="password" type="password" autocomplete="current-password" placeholder="输入密码" required autofocus>
              <button class="password-toggle" type="button" data-toggle-password aria-label="显示密码">${ICONS.eye}</button>
            </div>
          </div>
          <div class="login-error${message ? " show" : ""}" id="login-error" role="alert">${esc(message)}</div>
          <button class="btn btn-accent login-submit" type="submit">验证并进入 ${ICONS.arrowRight}</button>
        </form>
        <div class="login-hint">${hint}</div>
        <div class="login-note">${ICONS.shield}<span>会话保存在 HttpOnly Cookie 中，12 小时后自动失效。</span></div>
      </div>
    </section>
  </div>`;

  const form = $("#login-form");
  const input = $("#admin-password");
  const errorBox = $("#login-error");
  const toggle = $("[data-toggle-password]");

  toggle.addEventListener("click", () => {
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    toggle.innerHTML = showing ? ICONS.eye : ICONS.eyeOff;
    toggle.setAttribute("aria-label", showing ? "显示密码" : "隐藏密码");
    input.focus();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const original = button.innerHTML;
    errorBox.classList.remove("show");
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> 正在验证…`;

    try {
      await api("/api/login", {
        method: "POST",
        body: { password: input.value },
        auth: false
      });
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.classList.add("show");
      button.disabled = false;
      button.innerHTML = original;
      input.focus();
      input.select();
      return;
    }

    button.innerHTML = `<span class="spinner"></span> 正在载入…`;
    try {
      const session = await api("/api/session", { auth: false });
      state.session = session;
      state.usingDefaultPassword = session.usingDefaultPassword;
      await startApp();
    } catch (err) {
      renderFatal(err);
    }
  });
}

function renderFatal(err) {
  state.view = "fatal";
  $("#admin").innerHTML = `<div class="admin-boot">
    <div class="boot-mark" aria-hidden="true"><span></span><span></span><span></span></div>
    <p>${esc(err && err.message ? err.message : "后台暂时无法加载")}</p>
    <button class="btn btn-ghost" type="button" data-retry-boot>重新连接</button>
  </div>`;
  const retry = $("[data-retry-boot]");
  if (retry) retry.addEventListener("click", () => location.reload());
}

async function startApp() {
  if (!state.routingBound) {
    window.addEventListener("hashchange", route);
    state.routingBound = true;
  }
  if (!state.meta) state.meta = await api("/api/meta");
  state.booted = true;
  const raw = currentRoute();
  if (!location.hash || location.hash === "#/" || location.hash === "#") {
    history.replaceState(null, "", "#/dashboard");
  }
  await route(raw);
}

function currentRoute() {
  return (location.hash || "#/")
    .replace(/^#\/?/, "")
    .split("?")[0]
    .replace(/\/+$/, "") || "dashboard";
}

async function route(routeOverride) {
  if (!state.session || !state.session.authenticated) {
    renderLogin();
    return;
  }
  const raw = typeof routeOverride === "string" ? routeOverride : currentRoute();
  window.scrollTo(0, 0);
  if (raw === "feedback") return renderFeedback();
  return renderDashboard();
}

/* ---------------- shell ---------------- */

function shell(active, title, content, actions = "") {
  state.view = active;
  document.title = `${title} — ${BRAND.name}管理后台`;
  const navLink = (key, href, label, icon) =>
    `<a class="sb-link${active === key ? " active" : ""}" href="${href}">${icon}<span>${label}</span></a>`;

  $("#admin").innerHTML = `<div class="shell">
    <aside class="sidebar">
      <a class="sb-brand" href="#/dashboard">${mark()}<span class="word">${BRAND.name}</span><span class="tag">ADMIN</span></a>
      <div class="sb-tag">行为 · 反馈</div>
      <div class="sb-mode ${state.mode === "remote" ? "is-remote" : ""}" title="${state.mode === "remote" ? `数据来自 ${esc(state.remoteBase || "")}` : "数据来自本地 data/ 目录"}">
        ${state.mode === "remote" ? "线上 D1" : "本地文件"}
      </div>
      <nav class="sb-nav">
        <div class="sb-label">工作台</div>
        ${navLink("dashboard", "#/dashboard", "数据看板", ICONS.dashboard)}
        ${navLink("feedback", "#/feedback", "用户反馈", ICONS.message)}
        <div class="sb-label">站点</div>
        <a class="sb-front" href="${FRONTEND}" target="_blank" rel="noopener">${ICONS.external}<span>查看前台</span></a>
      </nav>
      <div class="sb-bottom">
        <div class="sb-session"><span class="dot"></span><span>已登录 · 会话 12 小时</span></div>
        <div class="sb-sep"></div>
        <button class="sb-logout" type="button" data-logout>${ICONS.logout}<span>退出登录</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="crumb"><span class="root">${BRAND.name}</span><span class="slash">/</span><strong>${esc(title)}</strong></div>
        <div class="topbar-actions">
          <span class="topbar-date">${esc(WEEKDAY.format(new Date()))}</span>
          ${actions}
          <a class="topbar-link" href="${FRONTEND}" target="_blank" rel="noopener">${ICONS.external}<span>查看前台</span></a>
        </div>
      </header>
      <main class="page">${content}</main>
    </div>
  </div>`;
}

/* ---------------- dashboard ---------------- */

async function renderDashboard() {
  const token = ++state.routeToken;
  shell("dashboard", "数据看板", `${pageHead({
    eyebrow: "Overview",
    title: "数据看板",
    sub: `过去 ${state.days} 天 · 匿名行为统计，来源 IP 仅本后台可见`
  })}<div class="panel panel-pad"><div class="title-loading">正在汇总行为数据…</div></div>`);

  try {
    const data = await api(`/api/dashboard?days=${state.days}`);
    if (token !== state.routeToken) return;
    state.dashboard = data;
    shell("dashboard", "数据看板", dashboardHTML(data), "");
    bindDashboard();
  } catch (err) {
    if (token !== state.routeToken || err.code === "unauthorized") return;
    shell("dashboard", "数据看板", `${pageHead({
      eyebrow: "Overview",
      title: "数据看板",
      sub: "统计加载失败"
    })}<div class="panel panel-pad">${emptyState(err.message, "请确认服务仍在运行，然后重试。")}<div class="head-actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-retry-dashboard>${ICONS.refresh} 重试</button></div></div>`);
    const retry = $("[data-retry-dashboard]");
    if (retry) retry.addEventListener("click", () => renderDashboard());
  }
}

function changeBadge(value) {
  if (value === null) return `<span class="metric-change up">新增</span>`;
  if (!value) return `<span class="metric-change flat">持平</span>`;
  return `<span class="metric-change ${value > 0 ? "up" : "down"}">${value > 0 ? "↑" : "↓"} ${Math.abs(value)}%</span>`;
}

function metricCard({ label, value, change, note, icon, color }) {
  return `<div class="metric" style="--metric-color:${color}">
    <div class="metric-top">
      <span class="metric-label">${esc(label)}</span>
      <span class="metric-icon">${icon}</span>
    </div>
    <div class="metric-value"><strong>${num(value)}</strong>${changeBadge(change)}</div>
    <div class="metric-note">${esc(note)}</div>
  </div>`;
}

function dashboardHTML(data) {
  const overview = data.overview;
  const days = data.range.days;
  const note = data.usingDefaultPassword ? "默认密码运行中" : "";
  const actions = `<div class="range-tabs" role="group" aria-label="统计范围">
      ${[7, 30, 90].map((value) => `<button type="button" data-days="${value}" class="${value === days ? "active" : ""}">${value} 天</button>`).join("")}
    </div>
    <button class="btn-icon" type="button" data-refresh-dashboard title="刷新数据" aria-label="刷新数据">${ICONS.refresh}</button>`;

  const platformRows = data.platforms.length
    ? data.platforms.map((entry) => {
        const provider = (state.meta.providers || []).find((item) => item.id === entry.id);
        const max = Math.max(...data.platforms.map((item) => item.clicks), 1);
        return `<div class="bar-row">
          <span class="bar-name">${esc(entry.name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((entry.clicks / max) * 100))}%;--bar-color:${esc(provider ? provider.color : "#a83232")}"></span></span>
          <span class="bar-count">${num(entry.clicks)}</span>
        </div>`;
      }).join("")
    : `<div class="rank-empty">还没有平台跳转数据。</div>`;

  // 页面信标（/api/track）早就在落库，这里第一次把它聚合成路径与语言分布。
  const LANG_NAMES = { zh: "中文", en: "English" };
  const barRows = (entries, { name, value, visitors, empty }) => {
    if (!entries.length) return `<div class="rank-empty">${empty}</div>`;
    const max = Math.max(...entries.map(value), 1);
    return entries.map((entry) => `<div class="bar-row">
          <span class="bar-name">${esc(name(entry))}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((value(entry) / max) * 100))}%;--bar-color:var(--amber)"></span></span>
          <span class="bar-count" title="${visitors(entry)} 个真实访客">${num(value(entry))}</span>
        </div>`).join("");
  };
  const pageRows = barRows(data.topPaths || [], {
    name: (entry) => entry.path,
    value: (entry) => entry.views,
    visitors: (entry) => entry.visitors,
    empty: "还没有页面访问数据。"
  });
  const langRows = barRows(data.langs || [], {
    name: (entry) => LANG_NAMES[entry.lang] || entry.lang,
    value: (entry) => entry.views,
    visitors: (entry) => entry.visitors,
    empty: "还没有语言数据。"
  });
  const geoRows = barRows(data.topGeo || [], {
    name: (entry) => entry.label,
    value: (entry) => entry.views,
    visitors: (entry) => entry.visitors,
    empty: "还没有地区数据。"
  });
  // 疑似自动化的来源地单独提一句：它们不进上面的地区分布（那里只算打过页面信标的）。
  const suspectGeo = data.suspectGeo || [];
  const suspectGeoNote = suspectGeo.length
    ? `<p class="geo-suspect">未执行页面脚本的流量来自：${suspectGeo
      .map((entry) => `${esc(entry.label)} ${num(entry.events)}`)
      .join("、")}。</p>`
    : "";
  // 来源 IP 明细：按事件数排序，最活跃的来源在前；没打过页面信标的整行压暗，
  // 机房 / 代理网段（按 ASN 判定）额外标出来，哪怕它执行过页面脚本。
  const ipEntries = data.topIps || [];
  const ipRows = ipEntries.length ? `<div class="ip-list">${ipEntries.map((entry) => `
        <div class="ip-row${entry.real ? "" : " is-suspect"}${entry.hosting ? " is-hosting" : ""}">
          <div class="ip-main"><strong title="${esc(entry.ip)}">${esc(entry.ip)}</strong><small>${esc(entry.label)}${entry.hosting ? ` · 机房${entry.asOrg ? ` ${esc(entry.asOrg)}` : ""}${entry.asn ? ` · AS${num(entry.asn)}` : ""}` : ""}${entry.visitors > 1 ? ` · ${num(entry.visitors)} 个编号` : ""}</small></div>
          <div class="ip-counts"><b>${num(entry.events)}</b><span>${relativeTime(entry.lastAt)}</span></div>
        </div>`).join("")}</div>`
    : `<div class="rank-empty">还没有来源 IP 数据。</div>`;

  return `${pageHead({
    eyebrow: "Overview",
    title: "数据看板",
    sub: `过去 ${days} 天 · 更新于 ${clock(data.generatedAt)}`,
    note,
    actions
  })}
  <section class="metrics">
    ${metricCard({
      label: "搜索次数",
      value: overview.searches,
      change: data.comparison.searches,
      note: `${overview.zeroSearches} 次没有找到结果`,
      icon: ICONS.search,
      color: "var(--accent)"
    })}
    ${metricCard({
      label: "详情浏览",
      value: overview.views,
      change: data.comparison.views,
      note: `${overview.clicks} 次从详情页跳往平台`,
      icon: ICONS.view,
      color: "var(--green)"
    })}
    ${metricCard({
      label: "平台跳转",
      value: overview.clicks,
      change: data.comparison.clicks,
      note: `${data.platforms.length} 个平台产生跳转`,
      icon: ICONS.click,
      color: "var(--amber)"
    })}
    ${metricCard({
      label: "真实访客",
      value: overview.visitors,
      change: data.comparison.visitors,
      note: overview.hostingVisitors
        ? `已排除 ${overview.hostingVisitors} 个机房来源，另有 ${overview.botSuspects} 个编号未执行页面脚本`
        : overview.botSuspects
          ? `另有 ${overview.botSuspects} 个编号未执行页面脚本`
          : "只计执行过页面脚本的匿名编号",
      icon: ICONS.users,
      color: "var(--ink-2)"
    })}
  </section>

  <section class="panel panel-pad chart-panel">
    <div class="panel-head">
      <div>
        <h2>行为趋势</h2>
        <p>页面浏览、搜索与详情浏览的每日变化，悬停查看具体数字。</p>
      </div>
      <div class="chart-legend">
        <span><i class="pageview"></i>页面浏览</span>
        <span><i class="search"></i>搜索</span>
        <span><i class="view"></i>详情浏览</span>
      </div>
    </div>
    ${chartHTML(data.trend)}
    ${data.trend.some((point) => point.pageviews || point.searches || point.views) ? "" : `<p class="chart-empty">还没有行为数据。去前台搜索或打开一部作品，这里就会开始记录。</p>`}
  </section>

  <div class="board-grid">
    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>热门搜索</h2><p>用户正在找什么，按搜索次数排序。</p></div>
        <span class="mono">TOP 8</span>
      </div>
      ${data.topSearches.length ? `<div class="rank-list">${data.topSearches.map((entry, index) => `
        <div class="rank-item">
          <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
          <div class="rank-main"><strong>${esc(entry.query)}</strong><small>最近 ${relativeTime(entry.lastAt)}</small></div>
          <div class="rank-meta">${entry.zeroCount ? `<span class="tag amber">${entry.zeroCount} 次无结果</span>` : ""}<span class="rank-count">${num(entry.count)}</span></div>
        </div>`).join("")}</div>` : `<div class="rank-empty">还没有搜索记录。</div>`}
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>搜索无结果</h2><p>这些关键词没有匹配到片库，值得补片或加别名。</p></div>
        <span class="mono">GAPS</span>
      </div>
      ${data.zeroSearches.length ? `<div class="rank-list">${data.zeroSearches.map((entry, index) => `
        <div class="rank-item">
          <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
          <div class="rank-main"><strong>${esc(entry.query)}</strong><small>最近 ${relativeTime(entry.lastAt)}</small></div>
          <span class="rank-count">${num(entry.count)}</span>
        </div>`).join("")}</div>` : `<div class="rank-empty"><span class="check">✓</span>所有搜索都找到了结果。</div>`}
    </section>
  </div>

  <div class="board-grid">
    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>热门作品</h2><p>详情页浏览最多的作品，以及被带往平台的次数。</p></div>
        <span class="mono">TITLES</span>
      </div>
      ${data.topTitles.length ? `<div class="rank-list">${data.topTitles.map((entry, index) => `
        <a class="rank-item" href="${FRONTEND}/#/title/${encodeURIComponent(entry.id)}" target="_blank" rel="noopener">
          <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
          <div class="rank-main"><strong>${esc(entry.title)}</strong><small>${num(entry.views)} 次浏览 · ${num(entry.clicks)} 次跳转</small></div>
          <span class="rank-count">${num(entry.views)}</span>
        </a>`).join("")}</div>` : `<div class="rank-empty">还没有作品浏览数据。</div>`}
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>平台跳转</h2><p>用户从详情页前往各正版平台的次数。</p></div>
        <span class="mono">PLATFORMS</span>
      </div>
      <div class="bar-list">${platformRows}</div>
    </section>
  </div>

  <div class="board-grid four">
    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>页面访问</h2><p>前台页面信标的落点，共 ${num(overview.pageviews)} 次。</p></div>
        <span class="mono">PAGES</span>
      </div>
      <div class="bar-list">${pageRows}</div>
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>界面语言</h2><p>中英文两个界面各被打开的页面数。</p></div>
        <span class="mono">LANG</span>
      </div>
      <div class="bar-list">${langRows}</div>
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>访问地区</h2><p>Cloudflare 边缘 GeoIP 解析出的国家与城市，只算打过页面信标的访客。</p></div>
        <span class="mono">GEO</span>
      </div>
      <div class="bar-list">${geoRows}</div>
      ${suspectGeoNote}
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>访问来源</h2><p>访客的真实 IP，按事件数排序；压暗的行是没执行页面脚本或来自机房、代理网段的来源。</p></div>
        <span class="mono">SOURCE IP</span>
      </div>
      ${ipRows}
    </section>
  </div>

  <div class="board-grid three">
    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>访客活跃度</h2><p>真实访客在前；机房来源与未执行页面脚本的编号排在后面。</p></div>
        <span class="mono">VISITORS</span>
      </div>
      ${data.visitors.length ? `<div class="visitor-list">${data.visitors.map((entry) => `
        <div class="visitor-row${entry.real ? "" : entry.hosting ? " is-hosting" : " is-suspect"}">
          <span class="visitor-avatar">${esc(entry.id.slice(0, 2).toUpperCase())}</span>
          <div class="visitor-main"><strong>${esc(entry.label)}</strong><small>${entry.ip ? `${esc(entry.ip)} · ` : ""}${entry.real ? `最近 ${relativeTime(entry.lastAt)}` : entry.hosting ? `机房来源${entry.asOrg ? ` ${esc(entry.asOrg)}` : ""} · 最近 ${relativeTime(entry.lastAt)}` : `未执行页面脚本 · 最近 ${relativeTime(entry.lastAt)}`}</small></div>
          <div class="visitor-counts"><span>页 <b>${entry.pages}</b></span><span>搜 <b>${entry.searches}</b></span><span>看 <b>${entry.views}</b></span><span>点 <b>${entry.clicks}</b></span></div>
        </div>`).join("")}</div>` : `<div class="rank-empty">还没有访客行为。</div>`}
      <div class="privacy-note">${ICONS.shield}<span>访客编号来自随机 Cookie，只用于去重；事件另带来源 IP、GeoIP 解析出的国家与城市，以及 Cloudflare 边缘给出的 ASN 与网络组织，用来认出反复打点的采集脚本和机房来源。这些只在这个本地后台可见，前台公开接口不返回，也不接第三方统计。只有打过页面信标、且不是机房或代理网段的编号才计入「真实访客」；其余落在「未执行页面脚本」或「机房来源」里。</span></div>
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>最近动态</h2><p>最新的搜索、浏览与跳转。</p></div>
        <span class="mono">LIVE</span>
      </div>
      ${data.recent.length ? `<div class="activity">${data.recent.map((event) => `
        <div class="activity-item">
          <span class="activity-dot ${esc(event.type)}"></span>
          <div class="activity-main"><strong>${esc(event.label)}</strong><small>${esc(event.detail)}</small></div>
          <span class="activity-time">${relativeTime(event.at)}</span>
        </div>`).join("")}</div>` : `<div class="rank-empty">还没有行为记录。</div>`}
    </section>

    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>最新反馈</h2><p>来自前台「许个愿」的留言。</p></div>
        <a class="mono panel-link" href="#/feedback">查看全部 ${ICONS.arrowRight}</a>
      </div>
      ${data.feedback.length ? `<div class="feedback-list">${data.feedback.map((entry) => `
        <div class="feedback-item">
          <p>${esc(entry.message)}</p>
          <small><span>${esc(entry.contact || "未留联系方式")}</span><time>${dateTime(entry.createdAt)}</time></small>
        </div>`).join("")}</div>` : `<div class="rank-empty">还没有收到反馈。</div>`}
    </section>
  </div>`;
}

function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
}

function chartHTML(trend) {
  const width = 920;
  const height = 250;
  const pad = { left: 44, right: 18, top: 20, bottom: 34 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxValue = niceMax(Math.max(1, ...trend.map((point) => Math.max(point.pageviews || 0, point.searches, point.views))));
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : 0;
  const x = (index) => trend.length > 1 ? pad.left + index * stepX : pad.left + innerW / 2;
  const y = (value) => pad.top + innerH - (value / maxValue) * innerH;

  const line = (key) => trend
    .map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point[key] || 0).toFixed(1)}`)
    .join(" ");
  const area = trend.length > 1
    ? `M${x(0).toFixed(1)} ${(pad.top + innerH).toFixed(1)} ${trend.map((point, index) => `L${x(index).toFixed(1)} ${y(point.views).toFixed(1)}`).join(" ")} L${x(trend.length - 1).toFixed(1)} ${(pad.top + innerH).toFixed(1)} Z`
    : "";

  const grid = [0, 1, 2, 3, 4].map((index) => {
    const value = Math.round((maxValue / 4) * (4 - index));
    const lineY = pad.top + (innerH / 4) * index;
    return `<line x1="${pad.left}" y1="${lineY}" x2="${width - pad.right}" y2="${lineY}" stroke="rgba(13,42,46,.1)" stroke-dasharray="3 5"/>
      <text x="${pad.left - 10}" y="${lineY + 3.5}" text-anchor="end" fill="#98a19c" font-family="JetBrains Mono, monospace" font-size="8.5">${value}</text>`;
  }).join("");

  const labelEvery = Math.max(1, Math.ceil(trend.length / 7));
  const xLabels = trend.map((point, index) => {
    if (index % labelEvery !== 0 && index !== trend.length - 1) return "";
    return `<text x="${x(index)}" y="${height - 10}" text-anchor="middle" fill="#98a19c" font-family="JetBrains Mono, monospace" font-size="8.5">${point.date.slice(5)}</text>`;
  }).join("");

  const dots = trend.length <= 31 ? trend.map((point, index) => `
    <g>
      <circle cx="${x(index)}" cy="${y(point.pageviews || 0)}" r="3" fill="#fbf7ef" stroke="#9a6b22" stroke-width="1.6"/>
      <circle cx="${x(index)}" cy="${y(point.searches)}" r="3" fill="#fbf7ef" stroke="#a83232" stroke-width="1.6"/>
      <circle cx="${x(index)}" cy="${y(point.views)}" r="3" fill="#fbf7ef" stroke="#2d7a5a" stroke-width="1.6"/>
      <circle cx="${x(index)}" cy="${y(point.searches)}" r="12" fill="transparent">
        <title>${point.date} · 页面 ${point.pageviews || 0} · 搜索 ${point.searches} · 浏览 ${point.views} · 访客 ${point.visitors}</title>
      </circle>
    </g>`).join("") : "";

  return `<div class="chart-scroll">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="页面浏览、搜索与详情浏览趋势">
      <defs>
        <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2d7a5a" stop-opacity=".16"/>
          <stop offset="100%" stop-color="#2d7a5a" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      ${area ? `<path d="${area}" fill="url(#viewsFill)"/>` : ""}
      <path d="${line("pageviews")}" fill="none" stroke="#9a6b22" stroke-width="1.6" stroke-dasharray="4 3" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${line("views")}" fill="none" stroke="#2d7a5a" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${line("searches")}" fill="none" stroke="#a83232" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${xLabels}
    </svg>
  </div>`;
}

function bindDashboard() {
  $$("[data-days]").forEach((button) => {
    button.addEventListener("click", () => {
      const days = Number(button.dataset.days);
      if (!days || days === state.days) return;
      state.days = days;
      renderDashboard();
    });
  });
  const refresh = $("[data-refresh-dashboard]");
  if (refresh) refresh.addEventListener("click", () => renderDashboard());
}

/* ---------------- feedback ---------------- */

function feedbackHTML(data) {
  const fb = state.feedback;
  const pageCount = Math.max(1, Math.ceil(data.matched / data.limit));
  const page = Math.min(fb.page, pageCount - 1);
  const items = data.items;
  const pager = data.matched
    ? `<div class="feedback-pager">
        <span>第 ${page + 1} / ${pageCount} 页 · 共 ${num(data.matched)} 条${fb.q ? "匹配" : ""}</span>
        <div class="pager-actions">
          <button class="btn btn-ghost btn-sm" type="button" data-feedback-page="${page - 1}"${page <= 0 ? " disabled" : ""}>${ICONS.arrowLeft} 上一页</button>
          <button class="btn btn-ghost btn-sm" type="button" data-feedback-page="${page + 1}"${page >= pageCount - 1 ? " disabled" : ""}>下一页 ${ICONS.arrowRight}</button>
        </div>
      </div>`
    : "";

  return `${pageHead({
    eyebrow: "Feedback",
    title: "用户反馈",
    sub: "来自前台「许个愿」的留言，按时间倒序。",
    actions: `<button class="btn btn-ghost" type="button" data-refresh-feedback>${ICONS.refresh} 刷新</button>`
  })}
  <div class="feedback-summary">
    <div class="feedback-stat">
      <span>全部反馈</span>
      <strong>${num(data.stats.total)}</strong>
      <small>累计留言</small>
    </div>
    <div class="feedback-stat">
      <span>最近 7 天</span>
      <strong>${num(data.stats.week)}</strong>
      <small>新增留言</small>
    </div>
    <div class="feedback-stat">
      <span>留有联系方式</span>
      <strong>${num(data.stats.contact)}</strong>
      <small>可回访用户</small>
    </div>
  </div>
  <section class="panel panel-pad feedback-panel">
    <div class="list-toolbar feedback-toolbar">
      <div class="search-box">${ICONS.search}<input id="feedback-search" type="search" value="${esc(fb.q)}" placeholder="搜索留言或联系方式…" autocomplete="off"></div>
      ${fb.q ? `<button class="btn btn-ghost btn-sm" type="button" data-clear-feedback>清除搜索</button>` : ""}
      <span class="toolbar-count">${fb.q
        ? `匹配 <b>${num(data.matched)}</b> 条`
        : `共 <b>${num(data.total)}</b> 条`}</span>
    </div>
    ${items.length
      ? `<div class="feedback-feed">${items.map((entry) => `
        <article class="feedback-card">
          <div class="feedback-card-head">
            <span class="feedback-avatar">${esc(firstChar(entry.contact || "匿"))}</span>
            <div class="feedback-who">
              <strong>${esc(entry.contact || "匿名访客")}</strong>
              <small>${dateTime(entry.createdAt)}</small>
            </div>
            <time class="feedback-when" datetime="${esc(entry.createdAt || "")}">${relativeTime(entry.createdAt)}</time>
          </div>
          <p class="feedback-message">${esc(entry.message)}</p>
        </article>`).join("")}</div>`
      : emptyState(
        fb.q ? "没有匹配的反馈" : "还没有收到反馈",
        fb.q ? "换个关键词，或清除搜索条件。" : "前台「许个愿」提交的留言会出现在这里。"
      )}
    ${pager}
    <div class="privacy-note">${ICONS.shield}<span>反馈内容仅在后台可见；联系方式由用户自愿填写。</span></div>
  </section>`;
}

async function renderFeedback({ silent = false } = {}) {
  const token = ++state.routeToken;
  const fb = state.feedback;
  if (!silent) {
    shell("feedback", "用户反馈", `${pageHead({
      eyebrow: "Feedback",
      title: "用户反馈",
      sub: "正在读取反馈…"
    })}<div class="panel panel-pad"><div class="title-loading">正在读取反馈…</div></div>`);
  }

  const request = { q: fb.q, page: fb.page };
  const params = new URLSearchParams({
    limit: String(fb.limit),
    offset: String(request.page * fb.limit)
  });
  if (request.q) params.set("q", request.q);

  try {
    const data = await api(`/api/feedback?${params.toString()}`);
    if (token !== state.routeToken) return;
    if (request.q !== state.feedback.q || request.page !== state.feedback.page) return;
    const pageCount = Math.max(1, Math.ceil(data.matched / data.limit));
    state.feedback.page = Math.min(request.page, pageCount - 1);
    shell("feedback", "用户反馈", feedbackHTML(data));
    bindFeedback();
  } catch (err) {
    if (token !== state.routeToken || err.code === "unauthorized") return;
    shell("feedback", "用户反馈", `${pageHead({
      eyebrow: "Feedback",
      title: "用户反馈",
      sub: "反馈加载失败"
    })}<div class="panel panel-pad">${emptyState(err.message, "请确认服务仍在运行，然后重试。")}<div class="head-actions" style="justify-content:center"><button class="btn btn-ghost" type="button" data-retry-feedback>${ICONS.refresh} 重试</button></div></div>`);
    const retry = $("[data-retry-feedback]");
    if (retry) retry.addEventListener("click", () => renderFeedback());
  }
}

function bindFeedback() {
  const refresh = $("[data-refresh-feedback]");
  if (refresh) {
    refresh.addEventListener("click", () => {
      state.feedback.focus = false;
      renderFeedback();
    });
  }

  const search = $("#feedback-search");
  if (search) {
    if (state.feedback.focus) {
      search.focus();
      const end = search.value.length;
      search.setSelectionRange(end, end);
      state.feedback.focus = false;
    }
    search.addEventListener("input", () => {
      clearTimeout(state.feedbackTimer);
      state.feedback.q = search.value;
      state.feedback.page = 0;
      state.feedback.focus = true;
      state.feedbackTimer = setTimeout(() => renderFeedback({ silent: true }), 280);
    });
  }

  const clear = $("[data-clear-feedback]");
  if (clear) {
    clear.addEventListener("click", () => {
      state.feedback.q = "";
      state.feedback.page = 0;
      state.feedback.focus = false;
      renderFeedback();
    });
  }

  $$("[data-feedback-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = Number(button.dataset.feedbackPage);
      if (!Number.isFinite(page) || page < 0 || page === state.feedback.page) return;
      state.feedback.page = page;
      state.feedback.focus = false;
      renderFeedback();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

/* ---------------- global ---------------- */

document.addEventListener("click", async (event) => {
  const logout = event.target.closest("[data-logout]");
  if (!logout) return;
  event.preventDefault();
  logout.disabled = true;
  try {
    await api("/api/logout", { method: "POST" });
  } catch (err) {
    /* Local logout still clears the UI. */
  }
  state.session = { authenticated: false };
  state.booted = false;
  state.meta = null;
  state.dashboard = null;
  state.routeToken += 1;
  renderLogin("已退出登录。");
  showToast("已退出登录");
});

/* ---------------- boot ---------------- */

async function boot() {
  try {
    await loadBrand();
    const session = await api("/api/session", { auth: false });
    state.session = session;
    state.usingDefaultPassword = Boolean(session.usingDefaultPassword);
    if (session.authenticated) {
      await startApp();
    } else {
      renderLogin();
    }
  } catch (err) {
    renderFatal(err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
