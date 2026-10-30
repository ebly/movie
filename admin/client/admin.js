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
  lists: {},
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
  if (raw === "catalog") return renderCatalog();
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
      <div class="sb-tag">行为 · 反馈 · 片库</div>
      <div class="sb-mode ${state.mode === "remote" ? "is-remote" : ""}" title="${state.mode === "remote" ? `数据来自 ${esc(state.remoteBase || "")}` : "数据来自本地 data/ 目录"}">
        ${state.mode === "remote" ? "线上 D1" : "本地文件"}
      </div>
      <nav class="sb-nav">
        <div class="sb-label">工作台</div>
        ${navLink("dashboard", "#/dashboard", "数据看板", ICONS.dashboard)}
        ${navLink("feedback", "#/feedback", "用户反馈", ICONS.message)}
        ${navLink("catalog", "#/catalog", "片库管理", ICONS.film)}
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

const CARD_LIMIT = 10;

function barRow(name, value, max, color) {
  return `<div class="bar-row">
          <span class="bar-name">${esc(name)}</span>
          <span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((value / max) * 100))}%;--bar-color:${color}"></span></span>
          <span class="bar-count">${num(value)}</span>
        </div>`;
}

function listCard({ key, title, sub, mono, listClass, entries, row, empty, extra = "" }) {
  state.lists[key] = { title, entries, row, listClass };
  const shown = entries.slice(0, CARD_LIMIT);
  const right = entries.length > CARD_LIMIT
    ? `<button class="panel-link" type="button" data-open-list="${esc(key)}">查看全部 ${ICONS.arrowRight}</button>`
    : `<span class="mono">${mono || ""}</span>`;
  return `<section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>${title}</h2><p>${sub}</p></div>
        ${right}
      </div>
      ${shown.length ? `<div class="${listClass}">${shown.map((entry, index) => row(entry, index)).join("")}</div>` : `<div class="rank-empty">${empty || "暂无数据。"}</div>`}
      ${extra}
    </section>`;
}

function dashboardHTML(data) {
  const overview = data.overview;
  const days = data.range.days;
  const note = data.usingDefaultPassword ? "默认密码运行中" : "";
  const actions = `<div class="range-tabs" role="group" aria-label="统计范围">
      ${[7, 30, 90].map((value) => `<button type="button" data-days="${value}" class="${value === days ? "active" : ""}">${value} 天</button>`).join("")}
    </div>
    <button class="btn-icon" type="button" data-refresh-dashboard title="刷新数据" aria-label="刷新数据">${ICONS.refresh}</button>`;

  const providerOf = (id) => (state.meta.providers || []).find((item) => item.id === id);
  const LANG_NAMES = { zh: "中文", en: "English" };

  const platforms = data.platforms || [];
  const platformMax = Math.max(1, ...platforms.map((entry) => entry.clicks));
  const platformRow = (entry) => barRow(entry.name, entry.clicks, platformMax, esc((providerOf(entry.id) || {}).color || "#a83232"));

  const paths = data.topPaths || [];
  const pathMax = Math.max(1, ...paths.map((entry) => entry.views));
  const pageRow = (entry) => barRow(entry.path, entry.views, pathMax, "var(--amber)");

  const langs = data.langs || [];
  const langMax = Math.max(1, ...langs.map((entry) => entry.views));
  const langRow = (entry) => barRow(LANG_NAMES[entry.lang] || entry.lang, entry.views, langMax, "var(--amber)");

  const geo = data.topGeo || [];
  const geoMax = Math.max(1, ...geo.map((entry) => entry.views));
  const geoRow = (entry) => barRow(entry.label, entry.views, geoMax, "var(--amber)");

  // 疑似自动化的来源地单独提一句：它们不进上面的地区分布（那里只算打过页面信标的）。
  const suspectGeo = data.suspectGeo || [];
  const suspectGeoNote = suspectGeo.length
    ? `<p class="geo-suspect">未执行页面脚本的流量来自：${suspectGeo
      .map((entry) => `${esc(entry.label)} ${num(entry.events)}`)
      .join("、")}。</p>`
    : "";

  const searchRow = (entry, index) => `<div class="rank-item">
          <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
          <div class="rank-main"><strong>${esc(entry.query)}</strong><small>最近 ${relativeTime(entry.lastAt)}</small></div>
          <div class="rank-meta">${entry.zeroCount ? `<span class="tag amber">${entry.zeroCount} 次无结果</span>` : ""}<span class="rank-count">${num(entry.count)}</span></div>
        </div>`;

  const zeroRow = (entry, index) => `<div class="rank-item">
          <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
          <div class="rank-main"><strong>${esc(entry.query)}</strong><small>最近 ${relativeTime(entry.lastAt)}</small></div>
          <span class="rank-count">${num(entry.count)}</span>
        </div>`;

  const titleRow = (entry, index) => `<a class="rank-item" href="${FRONTEND}/#/title/${encodeURIComponent(entry.id)}" target="_blank" rel="noopener">
          <span class="rank-no">${String(index + 1).padStart(2, "0")}</span>
          <div class="rank-main"><strong>${esc(entry.title)}</strong><small>${num(entry.views)} 次浏览 · ${num(entry.clicks)} 次跳转</small></div>
          <span class="rank-count">${num(entry.views)}</span>
        </a>`;

  // 来源 IP 明细：按事件数排序，最活跃的来源在前；没打过页面信标的整行压暗，
  // 机房 / 代理网段（按 ASN 判定）额外标出来，哪怕它执行过页面脚本。
  const ipRow = (entry) => `<div class="ip-row${entry.real ? "" : " is-suspect"}${entry.hosting ? " is-hosting" : ""}">
          <div class="ip-main"><strong title="${esc(entry.ip)}">${esc(entry.ip)}</strong><small>${esc(entry.label)}${entry.hosting ? ` · 机房${entry.asOrg ? ` ${esc(entry.asOrg)}` : ""}${entry.asn ? ` · AS${num(entry.asn)}` : ""}` : ""}${entry.visitors > 1 ? ` · ${num(entry.visitors)} 个编号` : ""}</small></div>
          <div class="ip-counts"><b>${num(entry.events)}</b><span>${relativeTime(entry.lastAt)}</span></div>
        </div>`;

  const visitorRow = (entry) => `<div class="visitor-row${entry.real ? "" : entry.hosting ? " is-hosting" : " is-suspect"}">
          <span class="visitor-avatar">${esc(entry.id.slice(0, 2).toUpperCase())}</span>
          <div class="visitor-main"><strong>${esc(entry.label)}</strong><small>${entry.ip ? `${esc(entry.ip)} · ` : ""}${entry.real ? `最近 ${relativeTime(entry.lastAt)}` : entry.hosting ? `机房来源${entry.asOrg ? ` ${esc(entry.asOrg)}` : ""} · 最近 ${relativeTime(entry.lastAt)}` : `未执行页面脚本 · 最近 ${relativeTime(entry.lastAt)}`}</small></div>
          <div class="visitor-counts"><span>页 <b>${entry.pages}</b></span><span>搜 <b>${entry.searches}</b></span><span>看 <b>${entry.views}</b></span><span>点 <b>${entry.clicks}</b></span></div>
        </div>`;

  const activityRow = (event) => `<div class="activity-item">
          <span class="activity-dot ${esc(event.type)}"></span>
          <div class="activity-main"><strong>${esc(event.label)}</strong><small>${esc(event.detail)}</small></div>
          <span class="activity-time">${relativeTime(event.at)}</span>
        </div>`;

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
    ${listCard({ key: "topSearches", title: "热门搜索", sub: "用户正在找什么，按搜索次数排序。", mono: "TOP 8", listClass: "rank-list", entries: data.topSearches || [], row: searchRow, empty: "还没有搜索记录。" })}
    ${listCard({ key: "zeroSearches", title: "搜索无结果", sub: "这些关键词没有匹配到片库，值得补片或加别名。", mono: "GAPS", listClass: "rank-list", entries: data.zeroSearches || [], row: zeroRow, empty: `<span class="check">✓</span>所有搜索都找到了结果。` })}
  </div>

  <div class="board-grid">
    ${listCard({ key: "topTitles", title: "热门作品", sub: "详情页浏览最多的作品，以及被带往平台的次数。", mono: "TITLES", listClass: "rank-list", entries: data.topTitles || [], row: titleRow, empty: "还没有作品浏览数据。" })}
    ${listCard({ key: "platforms", title: "平台跳转", sub: "用户从详情页前往各正版平台的次数。", mono: "PLATFORMS", listClass: "bar-list", entries: platforms, row: platformRow, empty: "还没有平台跳转数据。" })}
  </div>

  <div class="board-grid four">
    ${listCard({ key: "topPaths", title: "页面访问", sub: `前台页面信标的落点，共 ${num(overview.pageviews)} 次。`, mono: "PAGES", listClass: "bar-list", entries: paths, row: pageRow, empty: "还没有页面访问数据。" })}
    ${listCard({ key: "langs", title: "界面语言", sub: "中英文两个界面各被打开的页面数。", mono: "LANG", listClass: "bar-list", entries: langs, row: langRow, empty: "还没有语言数据。" })}
    ${listCard({ key: "topGeo", title: "访问地区", sub: "Cloudflare 边缘 GeoIP 解析出的国家与城市，只算打过页面信标的访客。", mono: "GEO", listClass: "bar-list", entries: geo, row: geoRow, empty: "还没有地区数据。", extra: suspectGeoNote })}
    ${listCard({ key: "topIps", title: "访问来源", sub: "访客的真实 IP，按最近访问时间排序；压暗的行是没执行页面脚本或来自机房、代理网段的来源。", mono: "SOURCE IP", listClass: "ip-list", entries: data.topIps || [], row: ipRow, empty: "还没有来源 IP 数据。" })}
  </div>

  <div class="board-grid">
    ${listCard({ key: "visitors", title: "访客活跃度", sub: "真实访客在前；机房来源与未执行页面脚本的编号排在后面。", mono: "VISITORS", listClass: "visitor-list", entries: data.visitors || [], row: visitorRow, empty: "还没有访客行为。", extra: `<div class="privacy-note">${ICONS.shield}<span>访客编号来自随机 Cookie，只用于去重；事件另带来源 IP、GeoIP 解析出的国家与城市，以及 Cloudflare 边缘给出的 ASN 与网络组织，用来认出反复打点的采集脚本和机房来源。这些只在这个本地后台可见，前台公开接口不返回，也不接第三方统计。只有打过页面信标、且不是机房或代理网段的编号才计入「真实访客」；其余落在「未执行页面脚本」或「机房来源」里。</span></div>` })}
    ${listCard({ key: "recent", title: "最近动态", sub: "最新的搜索、浏览与跳转。", mono: "LIVE", listClass: "activity", entries: data.recent || [], row: activityRow, empty: "还没有行为记录。" })}
  </div>`;
}
function niceMax(value) {
  if (value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  const normalized = value / power;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * power;
}

const CHART_GEOM = { width: 920, height: 250, pad: { left: 44, right: 18, top: 20, bottom: 34 } };

function chartHTML(trend) {
  const { width, height, pad } = CHART_GEOM;
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
      <g class="chart-cross" pointer-events="none" style="display:none">
        <line class="chart-cross-v" stroke="#2f3230" stroke-opacity=".38" stroke-width="1" stroke-dasharray="3 3"/>
        <line class="chart-cross-h" stroke="#2f3230" stroke-opacity=".26" stroke-width="1" stroke-dasharray="3 3"/>
        <circle class="chart-marker" data-series="pageviews" r="4.5" fill="#fbf7ef" stroke="#9a6b22" stroke-width="2"/>
        <circle class="chart-marker" data-series="searches" r="4.5" fill="#fbf7ef" stroke="#a83232" stroke-width="2"/>
        <circle class="chart-marker" data-series="views" r="4.5" fill="#fbf7ef" stroke="#2d7a5a" stroke-width="2"/>
      </g>
      <g class="chart-tip" pointer-events="none" style="display:none">
        <rect class="chart-tip-bg" rx="8" width="150" height="96" fill="#0d2a2e" fill-opacity=".94"/>
        <text class="chart-tip-date" fill="#f7f3ee" font-family="JetBrains Mono, monospace" font-size="9.5" font-weight="600"></text>
        <text class="chart-tip-l1" fill="#e7c98a" font-family="JetBrains Mono, monospace" font-size="9"></text>
        <text class="chart-tip-l2" fill="#e59b9b" font-family="JetBrains Mono, monospace" font-size="9"></text>
        <text class="chart-tip-l3" fill="#9fd7bd" font-family="JetBrains Mono, monospace" font-size="9"></text>
        <text class="chart-tip-l4" fill="#c9d1cc" font-family="JetBrains Mono, monospace" font-size="9"></text>
      </g>
      <rect class="chart-hit" x="${pad.left}" y="${pad.top}" width="${innerW}" height="${innerH}" fill="transparent" pointer-events="all" style="cursor:crosshair"/>
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
  $$("[data-open-list]").forEach((button) => {
    button.addEventListener("click", () => openListModal(button.dataset.openList));
  });
  bindChartInteraction();
}

function bindChartInteraction() {
  const svg = document.querySelector(".chart-scroll svg");
  const trend = state.dashboard && state.dashboard.trend;
  if (!svg || !Array.isArray(trend) || !trend.length) return;

  const { width, height, pad } = CHART_GEOM;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : 0;
  const xAt = (index) => (trend.length > 1 ? pad.left + index * stepX : pad.left + innerW / 2);
  const maxValue = niceMax(Math.max(1, ...trend.map((point) => Math.max(point.pageviews || 0, point.searches, point.views))));
  const yAt = (value) => pad.top + innerH - (value / maxValue) * innerH;

  const cross = svg.querySelector(".chart-cross");
  const vline = svg.querySelector(".chart-cross-v");
  const hline = svg.querySelector(".chart-cross-h");
  const hit = svg.querySelector(".chart-hit");
  const tip = svg.querySelector(".chart-tip");
  const tipBg = svg.querySelector(".chart-tip-bg");
  const tipText = {
    date: svg.querySelector(".chart-tip-date"),
    l1: svg.querySelector(".chart-tip-l1"),
    l2: svg.querySelector(".chart-tip-l2"),
    l3: svg.querySelector(".chart-tip-l3"),
    l4: svg.querySelector(".chart-tip-l4")
  };
  const markers = {
    pageviews: svg.querySelector('.chart-marker[data-series="pageviews"]'),
    searches: svg.querySelector('.chart-marker[data-series="searches"]'),
    views: svg.querySelector('.chart-marker[data-series="views"]')
  };
  if (!cross || !vline || !hline || !hit || !tip || !tipBg) return;

  const toSvg = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    return ctm ? point.matrixTransform(ctm.inverse()) : point;
  };

  const TIP_W = 150;
  const TIP_H = 96;

  function show(event) {
    const p = toSvg(event);
    if (p.x < pad.left - 8 || p.x > width - pad.right + 8) {
      hide();
      return;
    }
    let index = trend.length > 1 ? Math.round((p.x - pad.left) / stepX) : 0;
    index = Math.max(0, Math.min(trend.length - 1, index));
    const point = trend[index];
    const px = xAt(index);
    const py = Math.max(pad.top, Math.min(pad.top + innerH, p.y));

    vline.setAttribute("x1", px); vline.setAttribute("x2", px);
    vline.setAttribute("y1", pad.top); vline.setAttribute("y2", pad.top + innerH);
    hline.setAttribute("x1", pad.left); hline.setAttribute("x2", width - pad.right);
    hline.setAttribute("y1", py); hline.setAttribute("y2", py);

    const placeMarker = (marker, value) => {
      if (!marker) return;
      marker.setAttribute("cx", px);
      marker.setAttribute("cy", yAt(value));
      marker.setAttribute("data-value", value);
    };
    placeMarker(markers.pageviews, point.pageviews || 0);
    placeMarker(markers.searches, point.searches || 0);
    placeMarker(markers.views, point.views || 0);

    let tipX = px + 14;
    if (tipX + TIP_W > width - 6) tipX = px - TIP_W - 14;
    tipX = Math.max(4, tipX);
    let tipY = Math.max(pad.top, Math.min(py - 24, height - pad.bottom - TIP_H));
    tipBg.setAttribute("x", tipX);
    tipBg.setAttribute("y", tipY);
    const textX = tipX + 11;
    const lines = [
      ["date", point.date, tipY + 19],
      ["l1", `页面浏览 ${point.pageviews || 0}`, tipY + 38],
      ["l2", `搜索 ${point.searches || 0}`, tipY + 55],
      ["l3", `详情浏览 ${point.views || 0}`, tipY + 72],
      ["l4", `访客 ${point.visitors || 0}`, tipY + 89]
    ];
    lines.forEach(([key, text, ty]) => {
      const node = tipText[key];
      if (!node) return;
      node.setAttribute("x", textX);
      node.setAttribute("y", ty);
      node.textContent = text;
    });

    cross.style.display = "";
    tip.style.display = "";
  }

  function hide() {
    cross.style.display = "none";
    tip.style.display = "none";
  }

  hit.addEventListener("pointermove", show);
  hit.addEventListener("pointerdown", show);
  hit.addEventListener("pointerleave", hide);
  hit.addEventListener("pointercancel", hide);
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

/* ---------------- 列表弹框（查看全部 + 分页） ---------------- */

const MODAL_PAGE = 20;
let listModal = null;
let listModalState = { key: null, page: 0 };

function ensureListModal() {
  if (listModal) return listModal;
  const el = document.createElement("div");
  el.className = "list-modal";
  el.hidden = true;
  el.innerHTML = `<div class="list-modal-backdrop" data-close-list></div>
    <div class="list-modal-panel" role="dialog" aria-modal="true">
      <header class="list-modal-head">
        <h3 class="list-modal-title"></h3>
        <button type="button" class="list-modal-close" data-close-list aria-label="关闭">${ICONS.close}</button>
      </header>
      <div class="list-modal-body"></div>
      <footer class="list-modal-foot"></footer>
    </div>`;
  document.body.appendChild(el);
  el.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-list]")) { closeListModal(); return; }
    if (event.target.closest("[data-list-prev]")) {
      if (listModalState.page > 0) { listModalState.page -= 1; renderListModal(); }
      return;
    }
    if (event.target.closest("[data-list-next]")) {
      const list = state.lists[listModalState.key];
      if (!list) return;
      const pages = Math.max(1, Math.ceil(list.entries.length / MODAL_PAGE));
      if (listModalState.page < pages - 1) { listModalState.page += 1; renderListModal(); }
    }
  });
  listModal = el;
  return el;
}

function openListModal(key) {
  if (!state.lists[key]) return;
  ensureListModal();
  listModalState = { key, page: 0 };
  renderListModal();
}

function closeListModal() {
  if (!listModal) return;
  listModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderListModal() {
  const list = state.lists[listModalState.key];
  if (!list || !listModal) return;
  const total = list.entries.length;
  const pages = Math.max(1, Math.ceil(total / MODAL_PAGE));
  const page = Math.max(0, Math.min(pages - 1, listModalState.page));
  listModalState.page = page;
  const start = page * MODAL_PAGE;
  const slice = list.entries.slice(start, start + MODAL_PAGE);
  listModal.querySelector(".list-modal-title").textContent = `${list.title} · 共 ${total} 条`;
  listModal.querySelector(".list-modal-body").innerHTML = slice.length
    ? `<div class="${list.listClass}">${slice.map((entry, index) => list.row(entry, start + index)).join("")}</div>`
    : `<div class="rank-empty">暂无数据。</div>`;
  listModal.querySelector(".list-modal-foot").innerHTML = `<span class="list-modal-count">第 ${page + 1} / ${pages} 页 · 共 ${total} 条</span>
    <div class="list-modal-pager">
      <button class="btn btn-ghost btn-sm" type="button" data-list-prev${page <= 0 ? " disabled" : ""}>${ICONS.arrowLeft} 上一页</button>
      <button class="btn btn-ghost btn-sm" type="button" data-list-next${page >= pages - 1 ? " disabled" : ""}>下一页 ${ICONS.arrowRight}</button>
    </div>`;
  listModal.hidden = false;
  document.body.classList.add("modal-open");
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && listModal && !listModal.hidden) closeListModal();
});

/* ---------------- catalog（片库管理） ---------------- */

const CATALOG_PANS = [
  ["quark", "夸克"],
  ["baidu", "百度网盘"],
  ["aliyun", "阿里云盘"],
  ["xunlei", "迅雷"]
];

// 各网盘分享链接的固定前缀：后台按所选类型自动带出，切换类型时跟着换。
const PAN_PREFIX = {
  quark: "https://pan.quark.cn/s/",
  baidu: "https://pan.baidu.com/s/",
  aliyun: "https://www.alipan.com/s/",
  xunlei: "https://pan.xunlei.com/s/"
};

function swapPanPrefix(link, pan) {
  const prefix = PAN_PREFIX[pan] || "";
  const value = String(link || "").trim();
  if (!value) return prefix;
  for (const candidate of Object.values(PAN_PREFIX)) {
    if (candidate && value.startsWith(candidate)) return prefix + value.slice(candidate.length);
  }
  return value;
}

function catalogPanLabel(pan) {
  const hit = CATALOG_PANS.find(([id]) => id === pan);
  return hit ? hit[1] : pan;
}

/** 后台缩略图：豆瓣/TMDB 图走线上 /api/img 代理（后台在本地、国内环境也能显示）。 */
function adminImageSrc(url) {
  if (typeof url !== "string" || !url) return "";
  try {
    const parsed = new URL(url, location.origin);
    if (/(^|\.)(doubanio\.com|tmdb\.org)$/i.test(parsed.hostname)) {
      const base = String(state.remoteBase || FRONTEND || "").replace(/\/+$/, "");
      if (base) return `${base}/api/img?src=${encodeURIComponent(parsed.href)}`;
    }
    return url;
  } catch (err) {
    return url;
  }
}

async function renderCatalog() {
  shell("catalog", "片库管理", `${pageHead({
    eyebrow: "Catalog",
    title: "片库管理",
    sub: "你自己维护的资源：首页优先展示，搜索同名影片时置顶。"
  })}<div id="catalog-main"><div class="panel panel-pad"><div class="title-loading">正在载入片库…</div></div></div>`, "");
  await loadCatalog();
}

async function loadCatalog() {
  try {
    const data = await api("/api/catalog");
    state.catalog = Array.isArray(data.items) ? data.items : [];
    renderCatalogList();
  } catch (err) {
    renderCatalogError(err.message);
  }
}

function renderCatalogError(message) {
  const box = document.getElementById("catalog-main");
  if (!box) return;
  box.innerHTML = `<div class="panel panel-pad">${emptyState(message || "片库加载失败", "请确认登录会话有效后重试。")}<div class="head-actions" style="justify-content:center;margin-top:12px"><button class="btn btn-ghost" type="button" data-catalog-reload>重试</button></div></div>`;
  const retry = box.querySelector("[data-catalog-reload]");
  if (retry) retry.addEventListener("click", loadCatalog);
}

function renderCatalogList() {
  const box = document.getElementById("catalog-main");
  if (!box) return;
  const items = state.catalog || [];
  const rows = items.length ? items.map((entry) => `
    <div class="catalog-row">
      <div class="catalog-main-cell">
        ${entry.poster ? `<img class="catalog-thumb" src="${esc(adminImageSrc(entry.poster))}" alt="" loading="lazy">` : ""}
        <div class="catalog-cell-text">
          <strong>${esc(entry.title)}</strong>
          <small>${[entry.year, entry.kind, entry.rating ? `★ ${entry.rating}` : ""].filter(Boolean).map(esc).join(" · ")}${entry.note ? ` · ${esc(entry.note)}` : ""}</small>
        </div>
      </div>
      <div class="catalog-meta">
        <span class="tag">${esc(catalogPanLabel(entry.pan))}</span>
        ${entry.linkValid === false ? `<span class="tag amber">链接无效</span>` : ""}
        ${entry.password ? `<span>提取码 ${esc(entry.password)}</span>` : ""}
        <span class="catalog-link" title="${esc(entry.link)}">${esc(entry.link)}</span>
      </div>
      <div class="catalog-actions">
        <label class="catalog-check" title="加入首页最热"><input type="checkbox" data-catalog-flag="featured" data-catalog-id="${entry.id}"${entry.featured ? " checked" : ""}> 最热</label>
        <label class="catalog-check" title="加入「大家都在搜」最前"><input type="checkbox" data-catalog-flag="latest" data-catalog-id="${entry.id}"${entry.latest ? " checked" : ""}> 最新</label>
        <button class="btn btn-ghost btn-sm" type="button" data-catalog-share="${entry.id}">分享</button>
        <button class="btn btn-ghost btn-sm" type="button" data-catalog-edit="${entry.id}">编辑</button>
        <button class="btn btn-ghost btn-sm" type="button" data-catalog-del="${entry.id}">删除</button>
      </div>
    </div>`).join("") : `<div class="rank-empty">还没有片库影片，点右上「新增影片」添加。</div>`;
  box.innerHTML = `<div class="panel panel-pad">
    <div class="panel-head">
      <div><h2>影片列表</h2><p>共 ${items.length} 部，按排序值升序；首页优先展示这些影片。</p></div>
      <button class="btn btn-accent" type="button" data-catalog-new>新增影片</button>
    </div>
    <div class="catalog-list">${rows}</div>
  </div>`;
  box.querySelector("[data-catalog-new]").addEventListener("click", () => openCatalogForm(null));
  box.querySelectorAll("[data-catalog-edit]").forEach((btn) => btn.addEventListener("click", () => {
    const entry = items.find((e) => String(e.id) === btn.dataset.catalogEdit);
    openCatalogForm(entry || null);
  }));
  box.querySelectorAll("[data-catalog-del]").forEach((btn) => btn.addEventListener("click", () => deleteCatalog(Number(btn.dataset.catalogDel))));
  box.querySelectorAll("[data-catalog-share]").forEach((btn) => btn.addEventListener("click", () => shareCatalog(Number(btn.dataset.catalogShare))));
  box.querySelectorAll("[data-catalog-flag]").forEach((cb) => cb.addEventListener("change", () => toggleCatalogFlag(Number(cb.dataset.catalogId), cb.dataset.catalogFlag, cb.checked)));
}

function openCatalogForm(entry) {
  const box = document.getElementById("catalog-main");
  if (!box) return;
  const e = entry || { title: "", year: "", kind: "电影", rating: "", pan: "quark", link: "", password: "", note: "", sort: 0 };
  box.innerHTML = `<div class="panel panel-pad">
    <div class="panel-head"><div><h2>${entry ? "编辑影片" : "新增影片"}</h2><p>片库影片会在首页优先展示；搜索同名时置顶。</p></div></div>
    <form id="catalog-form" class="form-grid">
      <div class="field full"><label>片名 <span class="req">*</span></label><input name="title" type="text" value="${esc(e.title)}" required></div>
      <div class="field"><label>年份</label><input name="year" type="number" min="1900" max="2099" value="${e.year || ""}"></div>
      <div class="field"><label>类型</label><select name="kind"><option value="电影"${e.kind === "电影" ? " selected" : ""}>电影</option><option value="剧集"${e.kind === "剧集" ? " selected" : ""}>剧集</option></select></div>
      <div class="field"><label>评分（可选）</label><input name="rating" type="number" step="0.1" min="0" max="10" value="${e.rating || ""}"></div>
      <div class="field"><label>网盘类型 <span class="req">*</span></label><select name="pan">${CATALOG_PANS.map(([id, label]) => `<option value="${id}"${e.pan === id ? " selected" : ""}>${label}</option>`).join("")}</select></div>
      <div class="field full"><label>分享链接 <span class="req">*</span></label><input name="link" type="url" placeholder="${esc(PAN_PREFIX[e.pan] || "https://pan.quark.cn/s/")}" value="${esc(e.link || PAN_PREFIX[e.pan] || "")}" required></div>
      <div class="field full">
        <label>海报图片 <span class="optional">可选</span></label>
        <div class="poster-pick">
          <input name="poster" type="url" placeholder="https://image.tmdb.org/..." value="${esc(e.poster || "")}">
          <button class="btn btn-ghost btn-sm" type="button" data-poster-lookup>按片名找图</button>
        </div>
        <div class="poster-preview" id="poster-preview">${e.poster ? `<img src="${esc(e.poster)}" alt="">` : ""}</div>
      </div>
      <div class="field"><label>提取码</label><input name="password" type="text" value="${esc(e.password || "")}"></div>
      <div class="field"><label>排序（小的在前）</label><input name="sort" type="number" value="${Number(e.sort) || 0}"></div>
      <div class="field full"><label>备注 <span class="optional">可选</span></label><input name="note" type="text" value="${esc(e.note || "")}"></div>
      <div class="field full"><label class="catalog-check"><input type="checkbox" name="featured"${e.featured ? " checked" : ""}> 加入最热（勾选后出现在首页最热顶部，最多 11 条）</label></div>
      <div class="field full"><label class="catalog-check"><input type="checkbox" name="latest"${e.latest ? " checked" : ""}> 加入最新（勾选后出现在「大家都在搜」最前面，可无限添加）</label></div>
      <div class="field full" style="display:none" id="catalog-error"><p class="form-error show" style="margin:0"></p></div>
      <div class="field full" style="display:flex;gap:10px">
        <button class="btn btn-accent" type="submit">${entry ? "保存修改" : "添加"}</button>
        <button class="btn btn-ghost" type="button" data-catalog-cancel>取消</button>
      </div>
    </form>
  </div>`;
  const form = document.getElementById("catalog-form");
  const panSelect = form.querySelector('select[name="pan"]');
  const linkInput = form.querySelector('input[name="link"]');
  if (panSelect && linkInput) {
    panSelect.addEventListener("change", () => {
      linkInput.value = swapPanPrefix(linkInput.value, panSelect.value);
    });
  }
  const posterInput = form.querySelector('input[name="poster"]');
  const posterPreview = form.querySelector("#poster-preview");
  const lookupBtn = form.querySelector("[data-poster-lookup]");
  const renderPosterPreview = () => {
    if (!posterPreview) return;
    const src = posterInput ? posterInput.value.trim() : "";
    posterPreview.innerHTML = src ? `<img src="${esc(src)}" alt="">` : "";
  };
  if (posterInput) posterInput.addEventListener("change", renderPosterPreview);
  if (lookupBtn && posterInput) {
    lookupBtn.addEventListener("click", async () => {
      const titleInput = form.querySelector('input[name="title"]');
      const title = titleInput ? titleInput.value.trim() : "";
      if (!title) { showToast("先填片名再找图", "error"); return; }
      const original = lookupBtn.textContent;
      lookupBtn.disabled = true;
      lookupBtn.textContent = "查找中…";
      try {
        const data = await api(`/api/poster?title=${encodeURIComponent(title)}`);
        if (data && data.poster) {
          posterInput.value = data.poster;
          renderPosterPreview();
          showToast(`已找到海报：${data.title || title}`);
        } else {
          showToast("没找到海报，可手动粘贴图片链接", "error");
        }
      } catch (err) {
        showToast(`找图失败：${err.message}`, "error");
      } finally {
        lookupBtn.disabled = false;
        lookupBtn.textContent = original;
      }
    });
  }
  form.querySelector("[data-catalog-cancel]").addEventListener("click", renderCatalogList);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const fd = new FormData(form);
    const payload = {
      title: String(fd.get("title") || "").trim(),
      year: fd.get("year") ? Number(fd.get("year")) : null,
      kind: fd.get("kind") === "剧集" ? "剧集" : "电影",
      rating: fd.get("rating") ? Number(fd.get("rating")) : null,
      pan: String(fd.get("pan") || "quark"),
      link: String(fd.get("link") || "").trim(),
      password: String(fd.get("password") || "").trim(),
      note: String(fd.get("note") || "").trim(),
      featured: fd.get("featured") ? 1 : 0,
      latest: fd.get("latest") ? 1 : 0,
      poster: String(fd.get("poster") || "").trim(),
      sort: fd.get("sort") ? Number(fd.get("sort")) : 0
    };
    const errBox = form.querySelector("#catalog-error");
    const errText = errBox.querySelector(".form-error");
    try {
      if (entry) await api(`/api/catalog/${entry.id}`, { method: "PUT", body: payload });
      else await api("/api/catalog", { method: "POST", body: payload });
      await loadCatalog();
    } catch (err) {
      errBox.style.display = "";
      errText.textContent = err.message;
    }
  });
}

async function deleteCatalog(id) {
  if (!Number.isInteger(id) || id <= 0) return;
  if (!confirm("确定删除这条片库影片？")) return;
  try {
    await api(`/api/catalog/${id}`, { method: "DELETE" });
    await loadCatalog();
  } catch (err) {
    renderCatalogError(err.message);
  }
}

async function shareCatalog(id) {
  if (!Number.isInteger(id) || id <= 0) return;
  const base = String(FRONTEND || "").replace(/\/+$/, "");
  const url = `${base}/share/${id}`;
  try {
    await navigator.clipboard.writeText(url);
    showToast(`分享链接已复制：${url}`);
  } catch (err) {
    showToast("无法自动复制，请手动复制链接", "error");
    window.prompt("复制分享链接：", url);
  }
}

async function toggleCatalogFlag(id, field, on) {
  const entry = (state.catalog || []).find((item) => item.id === id);
  if (!entry || (field !== "featured" && field !== "latest")) return;
  const payload = {
    title: entry.title,
    year: entry.year,
    kind: entry.kind,
    rating: entry.rating,
    pan: entry.pan,
    link: entry.link,
    password: entry.password,
    note: entry.note,
    sort: entry.sort || 0,
    featured: entry.featured,
    latest: entry.latest
  };
  payload[field] = on ? 1 : 0;
  try {
    await api(`/api/catalog/${id}`, { method: "PUT", body: payload });
    showToast(`${field === "featured" ? "最热" : "最新"}已${on ? "开启" : "关闭"}`);
    await loadCatalog();
  } catch (err) {
    showToast(`操作失败：${err.message}`, "error");
    await loadCatalog();
  }
}

