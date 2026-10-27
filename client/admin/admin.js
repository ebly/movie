/* 字体样式表以 media="print" 载入，避免 Google Fonts 不可达时阻塞首屏。 */
(function enableFonts() {
  const link = document.getElementById("font-css");
  if (link) link.media = "all";
})();

/* 映途管理后台 — 无依赖看板与片库编辑器。品牌文案来自 /api/bootstrap 的 brand 字段（唯一来源 config/brand.json）。 */
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
  films: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-3.4-3.4"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>`,
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
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M19 17l.7 2.3L22 20l-2.3.7L19 23l-.7-2.3L16 20l2.3-.7z"/></svg>`,
  film: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 3v18M16 3v18M3 9h5M16 9h5M3 15h5M16 15h5"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`
};

const MOTIF_LABELS = {
  orbit: "轨道", plate: "餐盘", ember: "余烬", blades: "王座",
  vault: "金库", neon: "霓虹", sun: "烈日", arch: "拱门",
  ruins: "废墟", cave: "洞穴", bust: "胸像", dune: "沙丘",
  flash: "闪光", multiverse: "多元宇宙", earth: "地球", reactor: "反应堆"
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
  meta: null,
  titles: [],
  dashboard: null,
  days: 30,
  filters: { q: "", type: "", hot: false },
  feedback: { q: "", page: 0, limit: 12, focus: false },
  feedbackTimer: null,
  view: "login",
  booted: false,
  routingBound: false,
  routeToken: 0,
  saving: false,
  toastTimer: null,
  tmdbDraft: null,
  tmdbResults: []
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

function splitList(value) {
  return String(value || "")
    .split(/[,，\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean);
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

/* 品牌文案：兜底值只在服务端不可用时出现，正常由 /api/bootstrap 下发覆盖。 */
let BRAND = { name: "映途", latin: "Yingtu", tagline: "正版观看渠道索引", slogan: "找到正版影视的观看去处" };

async function loadBrand() {
  try {
    const boot = await api("/api/bootstrap", { auth: false });
    if (boot && boot.brand) BRAND = Object.assign(BRAND, boot.brand);
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
        <h1>把片库和<em>观众</em><br>握在手里。</h1>
        <p>更新作品、核对观看渠道，看看大家在找什么、点开了哪一部。所有数据都留在这台服务器上。</p>
        <div class="login-facts"><span>片库维护</span><span>搜索洞察</span><span>匿名统计</span><span>反馈收件箱</span></div>
      </div>
      <div class="login-foot"><span>${BRAND.name} · ${BRAND.tagline}</span><span>仅限授权人员</span></div>
    </section>
    <section class="login-panel">
      <div class="login-card">
        <div class="eyebrow">Private access</div>
        <h2>进入管理后台</h2>
        <p class="lede">输入管理密码，开始整理片库与查看行为数据。</p>
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
      await api("/api/admin/login", {
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
      const session = await api("/api/admin/session", { auth: false });
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
  if (!state.meta) state.meta = await api("/api/admin/meta");
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
  if (raw === "titles") return renderTitles();
  if (raw === "feedback") return renderFeedback();
  if (raw === "titles/new") return renderEditor(null);
  const edit = /^titles\/([^/]+)\/edit$/.exec(raw);
  if (edit) {
    let id;
    try {
      id = decodeURIComponent(edit[1]);
    } catch (err) {
      showToast("作品编号不合法", "error");
      location.hash = "#/titles";
      return;
    }
    return renderEditor(id);
  }
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
      <div class="sb-tag">片库 · 行为 · 反馈</div>
      <nav class="sb-nav">
        <div class="sb-label">工作台</div>
        ${navLink("dashboard", "#/dashboard", "数据看板", ICONS.dashboard)}
        ${navLink("titles", "#/titles", "片库管理", ICONS.films)}
        ${navLink("feedback", "#/feedback", "用户反馈", ICONS.message)}
        <div class="sb-label">站点</div>
        <a class="sb-front" href="/" target="_blank" rel="noopener">${ICONS.external}<span>查看前台</span></a>
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
          <a class="topbar-link" href="/" target="_blank" rel="noopener">${ICONS.external}<span>查看前台</span></a>
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
    sub: `过去 ${state.days} 天 · 匿名行为统计，不记录 IP 或设备指纹`
  })}<div class="panel panel-pad"><div class="title-loading">正在汇总行为数据…</div></div>`);

  try {
    const data = await api(`/api/admin/dashboard?days=${state.days}`);
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
      label: "独立访客",
      value: overview.visitors,
      change: data.comparison.visitors,
      note: "匿名 Cookie 去重 · 不记录 IP",
      icon: ICONS.users,
      color: "var(--ink-2)"
    })}
  </section>

  <section class="panel panel-pad chart-panel">
    <div class="panel-head">
      <div>
        <h2>行为趋势</h2>
        <p>搜索与详情浏览的每日变化，悬停查看具体数字。</p>
      </div>
      <div class="chart-legend">
        <span><i class="search"></i>搜索</span>
        <span><i class="view"></i>详情浏览</span>
      </div>
    </div>
    ${chartHTML(data.trend)}
    ${data.trend.some((point) => point.searches || point.views) ? "" : `<p class="chart-empty">还没有行为数据。去前台搜索或打开一部作品，这里就会开始记录。</p>`}
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
        <a class="rank-item" href="/#/title/${encodeURIComponent(entry.id)}" target="_blank" rel="noopener">
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

  <div class="board-grid three">
    <section class="panel panel-pad">
      <div class="panel-head">
        <div><h2>访客活跃度</h2><p>按最近活跃排序的匿名访客。</p></div>
        <span class="mono">VISITORS</span>
      </div>
      ${data.visitors.length ? `<div class="visitor-list">${data.visitors.map((entry) => `
        <div class="visitor-row">
          <span class="visitor-avatar">${esc(entry.id.slice(0, 2).toUpperCase())}</span>
          <div class="visitor-main"><strong>${esc(entry.label)}</strong><small>最近 ${relativeTime(entry.lastAt)}</small></div>
          <div class="visitor-counts"><span>搜 <b>${entry.searches}</b></span><span>看 <b>${entry.views}</b></span><span>点 <b>${entry.clicks}</b></span></div>
        </div>`).join("")}</div>` : `<div class="rank-empty">还没有访客行为。</div>`}
      <div class="privacy-note">${ICONS.shield}<span>访客编号来自随机 Cookie，只用于去重。统计不保存 IP、设备信息或登录身份。</span></div>
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
  const maxValue = niceMax(Math.max(1, ...trend.map((point) => Math.max(point.searches, point.views))));
  const stepX = trend.length > 1 ? innerW / (trend.length - 1) : 0;
  const x = (index) => trend.length > 1 ? pad.left + index * stepX : pad.left + innerW / 2;
  const y = (value) => pad.top + innerH - (value / maxValue) * innerH;

  const line = (key) => trend
    .map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)} ${y(point[key]).toFixed(1)}`)
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
      <circle cx="${x(index)}" cy="${y(point.searches)}" r="3" fill="#fbf7ef" stroke="#a83232" stroke-width="1.6"/>
      <circle cx="${x(index)}" cy="${y(point.views)}" r="3" fill="#fbf7ef" stroke="#2d7a5a" stroke-width="1.6"/>
      <circle cx="${x(index)}" cy="${y(point.searches)}" r="12" fill="transparent">
        <title>${point.date} · 搜索 ${point.searches} · 浏览 ${point.views} · 访客 ${point.visitors}</title>
      </circle>
    </g>`).join("") : "";

  return `<div class="chart-scroll">
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="搜索与详情浏览趋势">
      <defs>
        <linearGradient id="viewsFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#2d7a5a" stop-opacity=".16"/>
          <stop offset="100%" stop-color="#2d7a5a" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      ${area ? `<path d="${area}" fill="url(#viewsFill)"/>` : ""}
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
    const data = await api(`/api/admin/feedback?${params.toString()}`);
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

/* ---------------- titles ---------------- */

async function renderTitles() {
  const token = ++state.routeToken;
  shell("titles", "片库管理", `${pageHead({
    eyebrow: "Library",
    title: "片库管理",
    sub: "读取片库中…"
  })}<div class="panel panel-pad"><div class="title-loading">正在加载作品…</div></div>`);

  try {
    const data = await api("/api/admin/titles");
    if (token !== state.routeToken) return;
    state.titles = data.items;
    shell("titles", "片库管理", titlesHTML());
    bindTitles();
  } catch (err) {
    if (token !== state.routeToken || err.code === "unauthorized") return;
    shell("titles", "片库管理", `${pageHead({
      eyebrow: "Library",
      title: "片库管理",
      sub: "片库加载失败"
    })}<div class="panel panel-pad">${emptyState(err.message, "请稍后重试。")}</div>`);
  }
}

function titlesHTML() {
  const types = state.meta ? state.meta.types : [];
  const actions = `<button class="btn-icon" type="button" data-refresh-titles title="刷新片库" aria-label="刷新片库">${ICONS.refresh}</button>
    <button class="btn btn-ghost" type="button" data-tmdb-open>${ICONS.search} TMDB 导入</button>
    <a class="btn btn-accent" href="#/titles/new">${ICONS.plus} 新增作品</a>`;

  return `${pageHead({
    eyebrow: "Library",
    title: "片库管理",
    sub: `<span id="library-sub">共 ${state.titles.length} 部作品</span> · 编辑后前台即时生效`,
    actions
  })}
  <div class="list-toolbar">
    <div class="search-box">
      ${ICONS.search}
      <input id="title-search" type="text" value="${esc(state.filters.q)}" placeholder="搜索中文名、原名或编号…" autocomplete="off" aria-label="搜索作品">
    </div>
    <select id="type-filter" class="select-box" aria-label="按类型筛选">
      <option value="">全部类型</option>
      ${types.map((type) => `<option value="${esc(type)}"${state.filters.type === type ? " selected" : ""}>${esc(type)}</option>`).join("")}
    </select>
    <label class="check-pill"><input id="hot-filter" type="checkbox"${state.filters.hot ? " checked" : ""}> 仅热门</label>
    <button class="btn btn-ghost btn-sm" type="button" data-reset-filters>重置</button>
    <span class="toolbar-count" id="toolbar-count"></span>
  </div>
  <div class="table-wrap">
    <table class="title-table">
      <thead><tr><th>作品</th><th>类型</th><th>评分</th><th>观看渠道</th><th>状态</th><th>更新</th><th style="text-align:right">操作</th></tr></thead>
      <tbody id="title-rows"></tbody>
    </table>
  </div>`;
}

function bindTitles() {
  const search = $("#title-search");
  if (search) {
    search.addEventListener("input", () => {
      state.filters.q = search.value;
      renderTitleRows();
    });
  }
  const type = $("#type-filter");
  if (type) {
    type.addEventListener("change", () => {
      state.filters.type = type.value;
      renderTitleRows();
    });
  }
  const hot = $("#hot-filter");
  if (hot) {
    hot.addEventListener("change", () => {
      state.filters.hot = hot.checked;
      renderTitleRows();
    });
  }
  const reset = $("[data-reset-filters]");
  if (reset) {
    reset.addEventListener("click", () => {
      state.filters = { q: "", type: "", hot: false };
      shell("titles", "片库管理", titlesHTML());
      bindTitles();
    });
  }
  const refresh = $("[data-refresh-titles]");
  if (refresh) {    refresh.addEventListener("click", async () => {
      refresh.disabled = true;
      try {
        const data = await api("/api/admin/titles");
        state.titles = data.items;
        shell("titles", "片库管理", titlesHTML());
        bindTitles();
        showToast("片库已刷新");
      } catch (err) {
        if (err.code !== "unauthorized") showToast(err.message, "error");
      } finally {
        if (document.contains(refresh)) refresh.disabled = false;
      }
    });
  }
  const tmdbOpen = $("[data-tmdb-open]");
  if (tmdbOpen) tmdbOpen.addEventListener("click", openTmdbImport);

  const rows = $("#title-rows");
  if (rows) {
    rows.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-delete-title]");
      if (!button) return;
      const id = button.dataset.deleteTitle;
      const item = state.titles.find((entry) => entry.id === id);
      if (!item) return;
      const confirmed = await confirmDialog({
        title: "删除这部作品？",
        message: `「${item.title}」将从片库和前台搜索中移除，历史统计数据会保留。此操作无法撤销。`,
        confirmLabel: "删除作品",
        danger: true
      });
      if (!confirmed) return;
      button.disabled = true;
      try {
        await api(`/api/admin/titles/${encodeURIComponent(id)}`, { method: "DELETE" });
        state.titles = state.titles.filter((entry) => entry.id !== id);
        state.dashboard = null;
        renderTitleRows();
        showToast("作品已删除");
      } catch (err) {
        if (err.code !== "unauthorized") showToast(err.message, "error");
        if (document.contains(button)) button.disabled = false;
      }
    });
  }
  renderTitleRows();
}

/* ---------------- TMDB 导入 ---------------- */

const TMDB_KEY_STORAGE = "yingtu-tmdb-key";

function tmdbDialogEl() {
  let dialog = document.getElementById("tmdb-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "tmdb-dialog";
  dialog.className = "tmdb-sheet";
  document.body.appendChild(dialog);
  return dialog;
}

function tmdbRowHTML(result, index) {
  const meta = [result.original, result.year, result.type].filter(Boolean).join(" · ");
  return `<button class="tmdb-result" type="button" data-tmdb-pick="${index}">
    <span class="tmdb-thumb">${result.poster ? `<img src="${esc(result.poster)}" alt="" loading="lazy" decoding="async">` : `<i>${esc(firstChar(result.title))}</i>`}</span>
    <span class="tmdb-meta">
      <b>${esc(result.title || "未命名")}</b>
      <em>${esc(meta)}</em>
      <span class="tmdb-overview">${esc(result.overview || "TMDB 没有提供简介")}</span>
    </span>
    <span class="tmdb-go">导入</span>
  </button>`;
}

function openTmdbImport() {
  const dialog = tmdbDialogEl();
  let key = "";
  try { key = localStorage.getItem(TMDB_KEY_STORAGE) || ""; } catch (err) { key = ""; }
  dialog.innerHTML = `<div class="tmdb-inner">
    <header class="tmdb-head">
      <div>
        <p class="tmdb-kicker">快速补片</p>
        <h2>从 TMDB 导入作品</h2>
      </div>
      <button class="btn-icon" type="button" data-tmdb-close aria-label="关闭">×</button>
    </header>
    <div class="tmdb-key">
      <label for="tmdb-key">TMDB API Key</label>
      <input id="tmdb-key" type="password" value="${esc(key)}" placeholder="v3 API Key 或 v4 Read Token" autocomplete="off">
      <span class="hint">只保存在这台浏览器；服务端也可以用 <code>TMDB_API_KEY</code> 环境变量统一配置。</span>
    </div>
    <form class="tmdb-search" data-tmdb-form>
      <input id="tmdb-query" type="search" placeholder="输入片名，中英文都可以" autocomplete="off" required>
      <button class="btn btn-accent" type="submit">搜索</button>
    </form>
    <p class="tmdb-note">只导入名称、原名、年份、类型、评分、简介与海报地址；简介来自 TMDB，授权与准确性请自行确认。</p>
    <div id="tmdb-results" class="tmdb-results"></div>
  </div>`;
  if (!dialog.open) dialog.showModal();
  bindTmdb(dialog);
  const input = dialog.querySelector("#tmdb-query");
  if (input) setTimeout(() => input.focus(), 40);
}

function bindTmdb(dialog) {
  if (dialog.dataset.bound) return;
  dialog.dataset.bound = "1";

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-tmdb-close]")) {
      dialog.close();
      return;
    }

    const pick = event.target.closest("[data-tmdb-pick]");
    if (!pick) return;
    const result = state.tmdbResults[Number(pick.dataset.tmdbPick)];
    if (!result) return;
    state.tmdbDraft = {
      title: result.title || "",
      original: result.original || "",
      year: result.year || new Date().getFullYear(),
      type: result.type || "剧集",
      rating: result.rating || 0,
      genres: result.genres || [],
      synopsis: result.overview || "",
      poster: result.poster || "",
      tags: []
    };
    dialog.close();
    if (currentRoute() === "titles/new") route("titles/new");
    else location.hash = "#/titles/new";
    showToast("已填入 TMDB 数据，确认后保存");
  });

  dialog.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-tmdb-form]");
    if (!form) return;
    event.preventDefault();
    const query = dialog.querySelector("#tmdb-query").value.trim();
    const keyInput = dialog.querySelector("#tmdb-key");
    const key = keyInput ? keyInput.value.trim() : "";
    const box = dialog.querySelector("#tmdb-results");
    if (!query) return;
    try { localStorage.setItem(TMDB_KEY_STORAGE, key); } catch (err) { /* ignore */ }

    box.innerHTML = `<p class="tmdb-empty">正在搜索「${esc(query)}」…</p>`;
    try {
      const data = await api(`/api/admin/tmdb/search?q=${encodeURIComponent(query)}`, {
        headers: key ? { "x-tmdb-key": key } : {}
      });
      state.tmdbResults = data.results || [];
      box.innerHTML = state.tmdbResults.length
        ? state.tmdbResults.map(tmdbRowHTML).join("")
        : `<p class="tmdb-empty">没搜到，换个名字或填英文原名试试</p>`;
    } catch (err) {
      if (err.code === "unauthorized") return;
      const extra = err.code === "missing_key" ? "：到 themoviedb.org 免费申请后粘贴到上方" : "";
      box.innerHTML = `<p class="tmdb-empty">${esc(err.message)}${extra}</p>`;
    }
  });
}

function filteredTitles() {
  const query = state.filters.q.trim().toLowerCase();
  return state.titles.filter((item) => {
    if (state.filters.type && item.type !== state.filters.type) return false;
    if (state.filters.hot && !item.hot) return false;
    if (!query) return true;
    return [item.id, item.title, item.original, ...(item.genres || [])]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function renderTitleRows() {
  const rows = $("#title-rows");
  if (!rows) return;
  const items = filteredTitles();
  const count = $("#toolbar-count");
  if (count) count.innerHTML = `筛选后 <b>${items.length}</b> 部 · 共 <b>${state.titles.length}</b> 部`;
  const sub = $("#library-sub");
  if (sub) sub.textContent = `共 ${state.titles.length} 部作品`;

  if (!items.length) {
    rows.innerHTML = `<tr><td colspan="7">${emptyState(
      state.titles.length ? "没有符合筛选的作品" : "片库还是空的",
      state.titles.length ? "换个关键词或类型试试。" : "点击右上角「新增作品」开始整理片库。"
    )}</td></tr>`;
    return;
  }

  rows.innerHTML = items.map((item) => {
    const art = item.art || {};
    const style = `--p1:${esc(art.p1 || "#e7dfcf")};--p2:${esc(art.p2 || "#b8aaa0")};--p3:${esc(art.p3 || "#8c3327")}`;
    const updated = item.updatedAt ? relativeTime(item.updatedAt) : "初始";
    return `<tr>
      <td>
        <div class="cell-title">
          <span class="mini-poster${item.poster ? " has-img" : ""}" style="${style}" aria-hidden="true">${item.poster ? `<img src="${esc(item.poster)}" alt="" loading="lazy" decoding="async">` : ""}<i>${esc(firstChar(item.title))}</i></span>
          <div>
            <strong>${esc(item.title)}</strong>
            <small>${esc(item.original)} · ${esc(item.year)}</small>
            ${item.hot ? `<div class="row-tags"><span class="tag hot">热门推荐</span></div>` : ""}
          </div>
        </div>
      </td>
      <td data-label="类型"><span class="tag">${esc(item.type)}</span></td>
      <td data-label="评分"><span class="rank-count">${Number(item.rating || 0).toFixed(1)}</span></td>
      <td data-label="渠道"><span class="cell-muted">${num(item.offerCount)} 个${item.verifiedCount ? ` · ${num(item.verifiedCount)} 已验证` : ""}</span></td>
      <td data-label="状态">${item.hot ? `<span class="tag hot">热门</span>` : `<span class="tag">常规</span>`}</td>
      <td data-label="更新"><span class="cell-muted">${esc(updated)}</span></td>
      <td>
        <div class="cell-actions">
          <a class="btn btn-ghost btn-sm" href="#/titles/${encodeURIComponent(item.id)}/edit">${ICONS.edit} 编辑</a>
          <button class="btn btn-danger btn-sm" type="button" data-delete-title="${esc(item.id)}">${ICONS.trash} 删除</button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

/* ---------------- editor ---------------- */

async function renderEditor(id) {
  const token = ++state.routeToken;
  const isNew = !id;
  shell("titles", isNew ? "新增作品" : "编辑作品", `${pageHead({
    eyebrow: "Library",
    title: isNew ? "新增作品" : "编辑作品",
    sub: "正在读取作品信息…"
  })}<div class="panel panel-pad"><div class="title-loading">正在准备编辑表单…</div></div>`);

  try {
    if (!state.meta) state.meta = await api("/api/admin/meta");
    let item = null;
    if (id) {
      const data = await api(`/api/admin/titles/${encodeURIComponent(id)}`);
      item = data.item;
    }
    if (token !== state.routeToken) return;
    const draft = !id && state.tmdbDraft ? state.tmdbDraft : null;
    if (draft) state.tmdbDraft = null;
    const defaults = defaultTitle();
    const base = draft ? { ...defaults, ...draft } : defaults;
    const merged = item ? { ...defaults, ...item, art: { ...defaults.art, ...(item.art || {}) } } : base;
    shell("titles", isNew ? "新增作品" : "编辑作品", editorHTML(merged, id));
    bindEditor(id);
  } catch (err) {
    if (token !== state.routeToken || err.code === "unauthorized") return;
    if (err.status === 404) {
      showToast("作品不存在，可能已被删除", "error");
      location.hash = "#/titles";
      return;
    }
    shell("titles", "编辑作品", `${pageHead({
      eyebrow: "Library",
      title: "编辑作品",
      sub: "加载失败"
    })}<div class="panel panel-pad">${emptyState(err.message, "请返回片库重试。")}<div class="head-actions" style="justify-content:center;margin-top:14px"><a class="btn btn-ghost" href="#/titles">返回片库</a></div></div>`);
  }
}

function defaultTitle() {
  return {
    title: "",
    original: "",
    year: new Date().getFullYear(),
    type: "剧集",
    rating: 0,
    seasons: null,
    runtime: "",
    genres: [],
    synopsis: "",
    aliases: [],
    tags: [],
    hot: false,
    poster: "",
    art: { ...(state.meta.defaultArt || { p1: "#e7dfcf", p2: "#b8aaa0", p3: "#8c3327", ink: "#1b2422", motif: "orbit" }) },
    offers: [defaultOffer()]
  };
}

function defaultOffer() {
  const providers = state.meta ? state.meta.providers : [];
  return {
    pid: providers.length ? providers[0].id : "netflix",
    tier: "订阅",
    season: "",
    quality: ["1080P", "中字"],
    price: "含在订阅",
    verified: false
  };
}

function fieldShell(label, control, { full = false, hint = "", req = false } = {}) {
  return `<div class="field${full ? " full" : ""}">
    <label>${esc(label)}${req ? ` <span class="req">*</span>` : ""}</label>
    ${control}
    ${hint ? `<span class="hint">${esc(hint)}</span>` : ""}
  </div>`;
}

function offerRowHTML(offer) {
  const providers = state.meta ? state.meta.providers : [];
  const qualities = state.meta ? state.meta.qualities : ["4K", "HDR", "1080P", "中字"];
  const tiers = state.meta ? state.meta.tiers : ["订阅", "租赁", "购买", "免费"];
  const pid = providers.some((provider) => provider.id === offer.pid)
    ? offer.pid
    : (providers[0] ? providers[0].id : "netflix");

  return `<div class="offer-row">
    <div class="offer-main-row">
      <select data-field="pid" aria-label="平台">
        ${providers.map((provider) => `<option value="${esc(provider.id)}"${provider.id === pid ? " selected" : ""}>${esc(provider.name)} · ${esc(provider.region)}</option>`).join("")}
      </select>
      <select data-field="tier" aria-label="观看方式">
        ${tiers.map((tier) => `<option value="${esc(tier)}"${tier === offer.tier ? " selected" : ""}>${esc(tier)}</option>`).join("")}
      </select>
      <input data-field="season" type="text" value="${esc(offer.season || "")}" placeholder="S01" aria-label="季数" maxlength="4">
      <input data-field="price" type="text" value="${esc(offer.price || "")}" placeholder="价格说明" aria-label="价格">
      <label class="offer-verified"><input data-field="verified" type="checkbox"${offer.verified ? " checked" : ""}> 已验证</label>
      <button class="remove-offer" type="button" data-remove-offer aria-label="移除渠道" title="移除渠道">${ICONS.trash}</button>
    </div>
    <div class="offer-qualities">
      <span class="qlabel">画质</span>
      ${qualities.map((quality) => `<label class="qchip"><input type="checkbox" data-quality value="${esc(quality)}"${(offer.quality || []).includes(quality) ? " checked" : ""}><span>${esc(quality)}</span></label>`).join("")}
    </div>
  </div>`;
}

function editorHTML(item, id) {
  const isNew = !id;
  const art = item.art;
  const idText = isNew ? "保存后自动生成编号" : `编号 ${id}`;
  const updatedText = item.updatedAt
    ? `更新于 ${dateTime(item.updatedAt)}`
    : (isNew ? "创建后会出现在前台片库" : "暂无更新时间");

  const topActions = `<a class="btn btn-ghost" href="#/titles">取消</a>
    ${!isNew ? `<button class="btn btn-danger" type="button" data-delete-current>${ICONS.trash} 删除</button>` : ""}
    <button class="btn btn-accent" type="submit" form="title-form" data-save>${ICONS.check} ${isNew ? "创建作品" : "保存修改"}</button>`;

  const offerRows = (item.offers || []).map((offer) => offerRowHTML(offer)).join("");

  return `<div class="editor-head">
    <div>
      <a class="back" href="#/titles">${ICONS.arrowLeft} 返回片库</a>
      <h1>${isNew ? "新增作品" : "编辑作品"}</h1>
      <div class="sub">${esc(idText)} · ${esc(updatedText)}</div>
    </div>
    <div class="editor-actions">
      ${topActions}
    </div>
  </div>

  <form id="title-form" novalidate>
    <div class="form-error" id="form-error" role="alert"></div>
    <div class="editor-grid">
      <div class="editor-col">
        <section class="panel panel-pad">
          <div class="form-section-head">
            <h2 class="form-section-title">基本信息 <span>01</span></h2>
            <label class="switch"><input type="checkbox" name="hot"${item.hot ? " checked" : ""}><span class="track"></span><span>热门推荐</span></label>
          </div>
          <div class="form-grid">
            ${fieldShell("中文名", `<input id="f-title" name="title" type="text" value="${esc(item.title)}" placeholder="例如：龙之家族" maxlength="80" required>`, { req: true })}
            ${fieldShell("原名", `<input name="original" type="text" value="${esc(item.original)}" placeholder="House of the Dragon" maxlength="160" required>`, { req: true })}
            ${fieldShell("年份", `<input name="year" type="number" value="${esc(item.year)}" min="1888" max="${new Date().getFullYear() + 5}" required>`)}
            ${fieldShell("类型", `<select name="type">${(state.meta.types || []).map((type) => `<option value="${esc(type)}"${type === item.type ? " selected" : ""}>${esc(type)}</option>`).join("")}</select>`)}
            ${fieldShell("评分", `<input name="rating" type="number" value="${esc(item.rating)}" min="0" max="10" step="0.1">`, { hint: "0–10，保留一位小数" })}
            ${fieldShell("季数", `<input name="seasons" type="number" value="${item.seasons == null ? "" : esc(item.seasons)}" min="0" max="100" placeholder="剧集填季数">`, { hint: "电影可留空" })}
            ${fieldShell("片长", `<input name="runtime" type="text" value="${esc(item.runtime || "")}" placeholder="2 小时 20 分" maxlength="40">`, { hint: "电影或纪录片填写，剧集可留空" })}
          </div>
        </section>

        <section class="panel panel-pad">
          <h2 class="form-section-title">文案与检索 <span>02</span></h2>
          <div class="form-grid">
            ${fieldShell("类型标签", `<input name="genres" type="text" value="${esc((item.genres || []).join(", "))}" placeholder="科幻, 悬疑, 剧情" required>`, { full: true, req: true, hint: "用逗号分隔，最多 8 个" })}
            ${fieldShell("别名", `<input name="aliases" type="text" value="${esc((item.aliases || []).join(", "))}" placeholder="权游, 冰与火之歌">`, { hint: "用户常用的其他叫法，逗号分隔" })}
            ${fieldShell("标签", `<input name="tags" type="text" value="${esc((item.tags || []).join(", "))}" placeholder="维斯特洛, 龙, 权谋">`, { hint: "用于搜索加权与相似推荐" })}
            ${fieldShell("简介", `<textarea name="synopsis" maxlength="500" rows="5" placeholder="用两三句话讲清楚这部作品。" required>${esc(item.synopsis)}</textarea>`, { full: true, req: true, hint: "最多 500 字，会显示在详情页" })}
          </div>
        </section>
      </div>

      <div class="editor-col">
        <div class="editor-art">
          <section class="panel panel-pad">
            <h2 class="form-section-title">海报风格 <span>03</span></h2>
            <div class="preview-shell">
              <div class="preview-poster${item.poster ? " has-poster" : ""}" id="poster-preview" style="--p1:${esc(art.p1)};--p2:${esc(art.p2)};--p3:${esc(art.p3)};--preview-ink:${esc(art.ink)}">
                <img class="preview-img" id="preview-img" alt="" decoding="async"${item.poster ? ` src="${esc(item.poster)}"` : " hidden"}>
                <span class="preview-brand">${mark()}<span>${BRAND.name}</span></span>
                <span class="preview-motif">${esc(MOTIF_LABELS[art.motif] || art.motif)}</span>
                <span class="preview-title">${esc(item.title || "未命名作品")}</span>
                <span class="preview-rule"></span>
                <span class="preview-meta">${esc(item.year || "—")} · ${esc(item.type || "未分类")}</span>
              </div>
            </div>
            ${fieldShell("海报图片地址", `<input name="poster" type="url" value="${esc(item.poster || "")}" placeholder="https://example.com/poster.jpg" maxlength="500">`, { full: true, hint: "可选，粘贴 https 图片直链；留空则用下方程序化海报" })}
            <p class="poster-warn" id="poster-warn" hidden>这张图片加载失败，可能是地址有误或对方站点禁止外链；保存后前台会自动回退到程序化海报。</p>
            ${fieldShell("图案", `<select data-art="motif">${(state.meta.motifs || []).map((motif) => `<option value="${esc(motif)}"${motif === art.motif ? " selected" : ""}>${esc(MOTIF_LABELS[motif] || motif)}</option>`).join("")}</select>`, { hint: "程序化生成，无需上传图片" })}
            <div class="color-grid">
              ${[["p1", "主色"], ["p2", "背景色"], ["p3", "强调色"], ["ink", "文字色"]].map(([key, label]) => `
                <label class="color-field">
                  <input type="color" data-art="${key}" value="${esc(art[key])}" aria-label="${label}">
                  <span>${label}<code>${esc(String(art[key]).toUpperCase())}</code></span>
                </label>`).join("")}
            </div>
            <div class="preset-list">
              ${(state.meta.artPresets || []).map((preset, index) => `<button class="preset" type="button" data-preset="${index}"><i style="--s1:${esc(preset.p1)};--s2:${esc(preset.p3)}"></i>${esc(preset.name)}</button>`).join("")}
            </div>
          </section>
        </div>
      </div>
    </div>

    <section class="panel panel-pad" style="margin-top:16px">
      <div class="form-section-head">
        <div>
          <h2 class="form-section-title" style="margin-bottom:4px">观看渠道 <span>04</span></h2>
          <p class="hint">每个渠道对应前台的一张观看卡片。已验证代表你确认过当前价格和可看状态。</p>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" data-add-offer>${ICONS.plus} 添加渠道</button>
      </div>
      <div class="offer-editor" id="offer-editor" style="margin-top:14px">${offerRows}</div>
      <button class="add-offer" type="button" data-add-offer>${ICONS.plus} 添加一个观看渠道</button>
    </section>

    <div class="editor-foot">
      <span class="meta">${esc(isNew ? "保存后会写入 data/titles.json，并立即出现在前台。" : `编号 ${id} · ${updatedText}`)}</span>
      <div class="editor-actions">
        <a class="btn btn-ghost" href="#/titles">取消</a>
        <button class="btn btn-accent" type="submit" data-save>${ICONS.check} ${isNew ? "创建作品" : "保存修改"}</button>
      </div>
    </div>
  </form>`;
}

function bindEditor(id) {
  const form = $("#title-form");
  if (!form) return;
  const errorBox = $("#form-error");
  const isNew = !id;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    saveTitle(form, id, errorBox);
  });

  form.addEventListener("click", async (event) => {
    if (event.target.closest("[data-add-offer]")) {
      const container = $("#offer-editor");
      if (container) container.insertAdjacentHTML("beforeend", offerRowHTML(defaultOffer()));
      return;
    }

    const remove = event.target.closest("[data-remove-offer]");
    if (remove) {
      const row = remove.closest(".offer-row");
      if (row) row.remove();
      return;
    }

    const preset = event.target.closest("[data-preset]");
    if (preset) {
      const entry = (state.meta.artPresets || [])[Number(preset.dataset.preset)];
      if (!entry) return;
      ["p1", "p2", "p3", "ink"].forEach((key) => {
        const input = form.querySelector(`[data-art="${key}"]`);
        if (input && entry[key]) input.value = entry[key];
      });
      updatePreview();
      return;
    }

    const deleteButton = event.target.closest("[data-delete-current]");
    if (deleteButton && id) {
      await deleteCurrentTitle(id, deleteButton);
    }
  });

  form.addEventListener("input", updatePreview);
  form.addEventListener("change", updatePreview);

  const previewImg = $("#preview-img");
  if (previewImg) {
    // CSP 是 script-src 'self'，不能用内联 onerror；失败时回退到程序化海报并提示。
    previewImg.addEventListener("error", () => {
      const box = $("#poster-preview");
      if (box) box.classList.remove("has-poster");
      previewImg.hidden = true;
      const warn = $("#poster-warn");
      if (warn) warn.hidden = false;
    });
  }

  updatePreview();
}

let posterPreviewTimer = null;
let posterPreviewURL = null;

/** 海报地址是外部图片：边打字边请求会连环打请求，停手 400ms 后再尝试加载。 */
function syncPosterPreview(form, preview) {
  const input = form.elements.namedItem("poster");
  const img = $("#preview-img");
  if (!input || !img) return;
  const url = String(input.value || "").trim();
  if (url === posterPreviewURL) return;
  posterPreviewURL = url;
  if (posterPreviewTimer) clearTimeout(posterPreviewTimer);
  posterPreviewTimer = setTimeout(() => {
    posterPreviewTimer = null;
    const usable = /^https:\/\/\S+$/i.test(url);
    preview.classList.toggle("has-poster", usable);
    img.hidden = !usable;
    const warn = $("#poster-warn");
    if (warn) warn.hidden = true;
    if (usable) img.src = url;
    else img.removeAttribute("src");
  }, 400);
}

function updatePreview() {
  const form = $("#title-form");
  const preview = $("#poster-preview");
  if (!form || !preview) return;

  ["p1", "p2", "p3"].forEach((key) => {
    const input = form.querySelector(`[data-art="${key}"]`);
    if (input) {
      preview.style.setProperty(`--${key}`, input.value);
      const code = input.closest(".color-field") ? input.closest(".color-field").querySelector("code") : null;
      if (code) code.textContent = input.value.toUpperCase();
    }
  });
  const ink = form.querySelector('[data-art="ink"]');
  if (ink) {
    preview.style.setProperty("--preview-ink", ink.value);
    const code = ink.closest(".color-field") ? ink.closest(".color-field").querySelector("code") : null;
    if (code) code.textContent = ink.value.toUpperCase();
  }

  const motif = form.querySelector('[data-art="motif"]');
  const motifLabel = preview.querySelector(".preview-motif");
  if (motif && motifLabel) motifLabel.textContent = MOTIF_LABELS[motif.value] || motif.value;

  syncPosterPreview(form, preview);

  const titleInput = form.elements.namedItem("title");
  const previewTitle = preview.querySelector(".preview-title");
  if (titleInput && previewTitle) previewTitle.textContent = titleInput.value.trim() || "未命名作品";

  const yearInput = form.elements.namedItem("year");
  const typeInput = form.elements.namedItem("type");
  const previewMeta = preview.querySelector(".preview-meta");
  if (previewMeta) {
    previewMeta.textContent = `${yearInput && yearInput.value ? yearInput.value : "—"} · ${typeInput ? typeInput.value : "未分类"}`;
  }
}

function collectPayload(form) {
  const read = (name) => {
    const field = form.elements.namedItem(name);
    return field ? String(field.value || "").trim() : "";
  };
  const check = (name) => {
    const field = form.elements.namedItem(name);
    return Boolean(field && field.checked);
  };

  const title = read("title");
  const original = read("original");
  const genres = splitList(read("genres"));
  const synopsis = read("synopsis");

  const required = [
    [title, "中文名", "title"],
    [original, "原名", "original"],
    [genres.length ? "ok" : "", "类型标签", "genres"],
    [synopsis, "简介", "synopsis"]
  ];
  const missing = required.find(([value]) => !value);
  if (missing) {
    throw new Error(`请填写${missing[1]}`);
  }

  const poster = read("poster");
  if (poster && !/^https:\/\/\S+$/i.test(poster)) {
    throw new Error("海报地址需要是以 https:// 开头的图片直链，或者留空");
  }

  const offers = $$(".offer-row", form).map((row) => ({
    pid: row.querySelector('[data-field="pid"]').value,
    tier: row.querySelector('[data-field="tier"]').value,
    season: row.querySelector('[data-field="season"]').value.trim().toUpperCase() || null,
    quality: $$('[data-quality]:checked', row).map((input) => input.value),
    price: row.querySelector('[data-field="price"]').value.trim(),
    verified: row.querySelector('[data-field="verified"]').checked
  }));

  const emptyQuality = offers.find((offer) => !offer.quality.length);
  if (emptyQuality) throw new Error("每个观看渠道至少选择一种画质");

  return {
    title,
    original,
    year: Number(read("year")),
    type: read("type"),
    rating: Number(read("rating") || 0),
    seasons: read("seasons") === "" ? null : Number(read("seasons")),
    runtime: read("runtime") || null,
    genres,
    synopsis,
    aliases: splitList(read("aliases")),
    tags: splitList(read("tags")),
    hot: check("hot"),
    poster: poster || null,
    art: {
      p1: form.querySelector('[data-art="p1"]').value,
      p2: form.querySelector('[data-art="p2"]').value,
      p3: form.querySelector('[data-art="p3"]').value,
      ink: form.querySelector('[data-art="ink"]').value,
      motif: form.querySelector('[data-art="motif"]').value
    },
    offers
  };
}

async function saveTitle(form, id, errorBox) {
  if (state.saving) return;
  errorBox.classList.remove("show");
  let payload;
  try {
    payload = collectPayload(form);
  } catch (err) {
    showFormError(errorBox, err.message);
    return;
  }

  const isNew = !id;
  const buttons = $$("[data-save]", form);
  const originals = buttons.map((button) => button.innerHTML);
  state.saving = true;
  buttons.forEach((button) => {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span> 保存中…`;
  });

  try {
    await api(isNew ? "/api/admin/titles" : `/api/admin/titles/${encodeURIComponent(id)}`, {
      method: isNew ? "POST" : "PUT",
      body: payload
    });
    state.dashboard = null;
    showToast(isNew ? "作品已创建，前台已生效" : "作品已保存，前台已生效");
    location.hash = "#/titles";
  } catch (err) {
    if (err.code !== "unauthorized") showFormError(errorBox, err.message);
  } finally {
    state.saving = false;
    buttons.forEach((button, index) => {
      if (document.contains(button)) {
        button.disabled = false;
        button.innerHTML = originals[index];
      }
    });
  }
}

function showFormError(errorBox, message) {
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.classList.add("show");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteCurrentTitle(id, button) {
  const titleInput = $("#title-form") ? $("#title-form").elements.namedItem("title") : null;
  const title = titleInput ? titleInput.value.trim() || "这部作品" : "这部作品";
  const confirmed = await confirmDialog({
    title: "删除这部作品？",
    message: `「${title}」将从片库和前台搜索中移除，历史统计数据会保留。此操作无法撤销。`,
    confirmLabel: "删除作品",
    danger: true
  });
  if (!confirmed) return;
  button.disabled = true;
  try {
    await api(`/api/admin/titles/${encodeURIComponent(id)}`, { method: "DELETE" });
    state.dashboard = null;
    showToast("作品已删除");
    location.hash = "#/titles";
  } catch (err) {
    if (err.code !== "unauthorized") showToast(err.message, "error");
    if (document.contains(button)) button.disabled = false;
  }
}

/* ---------------- modal / global ---------------- */

// CSP 禁内联 onerror，因此统一在捕获阶段兜住加载失败的外部海报：拿掉图片，回退到程序化封面。
document.addEventListener("error", (event) => {
  const el = event.target;
  if (!el || el.tagName !== "IMG" || !el.closest(".mini-poster")) return;
  const box = el.closest(".mini-poster");
  el.remove();
  box.classList.remove("has-img");
}, true);

function confirmDialog({ title, message, confirmLabel = "确认", danger = false }) {
  const root = $("#modal-root");
  if (!root) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener("keydown", onKey);
      root.innerHTML = "";
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === "Escape") finish(false);
    };

    root.innerHTML = `<div class="modal-backdrop" data-modal-backdrop>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">${esc(title)}</h3>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-ghost" type="button" data-modal-cancel>取消</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" type="button" data-modal-confirm>${esc(confirmLabel)}</button>
        </div>
      </div>
    </div>`;

    const backdrop = $("[data-modal-backdrop]", root);
    const confirm = $("[data-modal-confirm]", root);
    const cancel = $("[data-modal-cancel]", root);
    confirm.addEventListener("click", () => finish(true));
    cancel.addEventListener("click", () => finish(false));
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) finish(false);
    });
    document.addEventListener("keydown", onKey);
    confirm.focus();
  });
}

document.addEventListener("click", async (event) => {
  const logout = event.target.closest("[data-logout]");
  if (!logout) return;
  event.preventDefault();
  logout.disabled = true;
  try {
    await api("/api/admin/logout", { method: "POST" });
  } catch (err) {
    /* Local logout still clears the UI. */
  }
  state.session = { authenticated: false };
  state.booted = false;
  state.meta = null;
  state.titles = [];
  state.dashboard = null;
  state.routeToken += 1;
  renderLogin("已退出登录。");
  showToast("已退出登录");
});

/* ---------------- boot ---------------- */

async function boot() {
  try {
    await loadBrand();
    const session = await api("/api/admin/session", { auth: false });
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
