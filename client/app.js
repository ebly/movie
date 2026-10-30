/* 映途 — public client for the local API (hash router, no dependencies) */

const fontLink = document.getElementById("font-css");
if (fontLink) fontLink.media = "all";

const app = document.getElementById("app");
const toastEl = document.getElementById("toast");
const THEME_KEY = "yingtu-theme";

applyStaticI18n();

let PROVIDERS = {};
let BOOT = { hot: [], types: [], stats: { providers: 0 }, disclaimer: "" };

const state = {
  lastQuery: "",
  current: null,
  filters: null,
  toastTimer: null,
  routeToken: 0,
  detailController: null,
  searchController: null,
  retry: null,
  byId: new Map(),
  panById: new Map(),
  panReloadCoolUntil: 0,
  suggest: { timer: 0, items: [], active: -1 },
  suggestController: null
};

/* ---------------- utils ---------------- */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (value) =>
  String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));

/* ---------------- 本地收藏（只用 localStorage，不上传服务端） ---------------- */

const FAV_KEY = "yingtu-favorites";
const FAV_LIMIT = 200;

const ICON_HEART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20.3 4.7 13a4.6 4.6 0 0 1 6.5-6.5l.8.8.8-.8A4.6 4.6 0 0 1 19.3 13z"/></svg>`;

function readFavorites() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAV_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.id === "string").slice(0, FAV_LIMIT);
  } catch (err) {
    return [];
  }
}

function favoriteRecord(item) {
  return {
    id: item.id,
    title: item.title || item.id,
    original: item.original || "",
    year: item.year || "",
    type: item.type || "",
    rating: Number.isFinite(item.rating) ? item.rating : null,
    poster: item.poster || null,
    art: item.art || null,
    savedAt: Date.now()
  };
}

function writeFavorites(list) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(list.slice(0, FAV_LIMIT)));
  } catch (err) {
    showToast(t("toast.storageFull"));
  }
  syncFavoriteButtons();
}

function isFavorite(id) {
  return readFavorites().some((entry) => entry.id === id);
}

function toggleFavorite(item) {
  const list = readFavorites();
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    list.splice(index, 1);
    writeFavorites(list);
    return false;
  }
  list.unshift(favoriteRecord(item));
  writeFavorites(list);
  return true;
}

function favButtonHTML(item, extraClass = "") {
  const on = isFavorite(item.id);
  return `<button class="fav-btn${on ? " on" : ""}${extraClass ? ` ${extraClass}` : ""}" type="button" data-fav="${esc(item.id)}" aria-pressed="${on}" aria-label="${t(on ? "fav.remove" : "fav.add")}">${ICON_HEART}</button>`;
}

function favWideHTML(item) {
  const on = isFavorite(item.id);
  return `<button class="fav-wide${on ? " on" : ""}" type="button" data-fav="${esc(item.id)}" aria-pressed="${on}">
    ${ICON_HEART}<span>${t(on ? "fav.saved" : "fav.add")}</span>
  </button>`;
}

/** 刷新页面上所有收藏按钮与头部计数，避免整页重渲染。 */
function syncFavoriteButtons() {
  const ids = new Set(readFavorites().map((entry) => entry.id));
  $$("[data-fav]").forEach((button) => {
    const on = ids.has(button.dataset.fav);
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", t(on ? "fav.remove" : "fav.add"));
    const label = button.querySelector("span");
    if (label && button.classList.contains("fav-wide")) {
      label.textContent = t(on ? "fav.saved" : "fav.add");
    }
  });
  syncFavBadge();
}

function favoritesLinkHTML() {
  const count = readFavorites().length + readPanFavs().length;
  return `<a class="fav-link" href="/list" aria-label="${t("fav.linkAria")}">
    ${ICON_HEART}<span>${t("fav.link")}</span><b data-fav-count${count ? "" : " hidden"}>${count}</b>
  </a>`;
}

function shareURL() {
  const ids = readFavorites().map((entry) => entry.id);
  return `${location.origin}/list${ids.length ? `?ids=${ids.map(encodeURIComponent).join(",")}` : ""}`;
}

async function copyText(text, message) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:absolute;left:-9999px;top:0";
      document.body.appendChild(area);
      area.select();
      let copied = false;
      try { copied = document.execCommand("copy"); }
      finally { document.body.removeChild(area); }
      if (!copied) throw new Error(t("toast.copyIncomplete"));
    }
    showToast(message);
  } catch (err) {
    showToast(t("toast.copyFailed"));
  }
}


/* brand mark: a route over ridgelines */
const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <path d="M6 24 16 9l10 15" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M12 24l5-7 5 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity=".5"/>
  <circle cx="16" cy="7.4" r="2.2" fill="currentColor" opacity=".85"/>
</svg>`;

const ICON_SEARCH = `<svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>`;

const ICON_BACK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 19l-7-7 7-7"/></svg>`;

const ICON_SUN = `<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;

const ICON_MOON = `<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`;

const ICON_EMPTY = `<svg class="empty-mark" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M8 37 22 15l18 22"/>
  <path d="M16 37l7-10 7 10" opacity=".5"/>
  <circle cx="22" cy="12.5" r="3"/>
</svg>`;

/* ---------------- theme / toast ---------------- */

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#232423" : "#f7f3ee");
}

function initTheme() {
  let stored = null;
  try { stored = localStorage.getItem(THEME_KEY); } catch (err) { /* private mode */ }
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(stored || (prefersDark ? "dark" : "light"));
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* ignore */ }
}

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2300);
}

/* ---------------- chrome ---------------- */

function brandHTML() {
  return `<a class="brand" href="/" aria-label="${esc(t("brand.homeAria", { name: BRAND.name }))}">
    ${BRAND_MARK}
    <span class="brand-copy">
      <span class="brand-word">${BRAND.name}</span>
      <span class="brand-note">${t("brand.note")}</span>
    </span>
  </a>`;
}

function themeButtonHTML() {
  return `<button class="icon-btn" type="button" data-action="theme" aria-label="${t("action.theme")}">
    ${ICON_SUN}${ICON_MOON}
  </button>`;
}

function feedbackButtonHTML() {
  return `<button class="quiet-btn" type="button" data-action="feedback">${t("action.feedback")}</button>`;
}

function searchURL(query, type = "quark", page = 1) {
  const params = new URLSearchParams({ source: "quark" });
  if (query) params.set("q", query);
  if (type && type !== "quark") params.set("type", type);
  if (page > 1) params.set("page", String(page));
  return `/search?${params.toString()}`;
}

function searchFormHTML(query = "") {
  const label = t("search.label");
  return `<div class="search-box" data-search-box>
    <form class="search-field" data-search data-source="quark" role="search" aria-label="${label}">
      ${ICON_SEARCH}
      <input type="text" name="q" value="${esc(query)}" placeholder="${label}…" autocomplete="off" spellcheck="false" required data-search-input aria-label="${label}">
      <button class="search-submit" type="submit" ${String(query || "").trim() ? "" : "disabled"}>${t("search.submit")}</button>
    </form>
    <div class="search-suggest" data-suggest hidden></div>
  </div>`;
}

/* ---------------- 搜索联想：站内片名（拼音 / 英文 / 别名），走 /api/search 打分内核 ---------------- */

const SUGGEST_LIMIT = 6;
const SUGGEST_DEBOUNCE = 150;

function suggestOpen() {
  const box = document.querySelector("[data-suggest]:not([hidden])");
  return Boolean(box && state.suggest.items.length);
}

function closeSuggest() {
  if (state.suggest.timer) {
    clearTimeout(state.suggest.timer);
    state.suggest.timer = 0;
  }
  if (state.suggestController) {
    state.suggestController.abort();
    state.suggestController = null;
  }
  state.suggest.items = [];
  state.suggest.active = -1;
  $$("[data-suggest]").forEach((box) => {
    box.hidden = true;
    box.innerHTML = "";
  });
}

function highlightSuggest() {
  document.querySelectorAll("[data-suggest]:not([hidden]) .suggest-item").forEach((node) => {
    const index = node.dataset.suggestIndex !== undefined ? Number(node.dataset.suggestIndex) : -1;
    node.classList.toggle("on", index === state.suggest.active);
  });
}

function moveSuggest(step) {
  const count = state.suggest.items.length + 1; // + 1 是「在网盘搜」兜底行
  state.suggest.active = (state.suggest.active + step + count + 1) % (count + 1) - 1;
  highlightSuggest();
}

function pickSuggest(input, index) {
  const items = state.suggest.items;
  const q = input ? input.value.trim() : "";
  closeSuggest();
  if (index >= 0 && index < items.length) {
    const item = items[index];
    state.lastQuery = item.title;
    navigate(`/title/${encodeURIComponent(item.id)}`);
    return;
  }
  // 兜底行或无命中：按原逻辑去网盘搜
  if (!q) return;
  state.lastQuery = q;
  const type = location.pathname === "/search" ? panTypeOf(new URLSearchParams(location.search)) : "quark";
  navigate(searchURL(q, type));
}

async function requestSuggest(input) {
  const q = input.value.trim();
  if (!q) {
    closeSuggest();
    return;
  }
  if (state.suggestController) state.suggestController.abort();
  const controller = new AbortController();
  state.suggestController = controller;
  try {
    const data = await API.search({ q, limit: SUGGEST_LIMIT, signal: controller.signal, suggest: true });
    if (controller.signal.aborted || !document.contains(input) || input.value.trim() !== q) return;
    const items = (data.items || []).slice(0, SUGGEST_LIMIT);
    const box = input.closest(".search-box");
    const list = box ? box.querySelector("[data-suggest]") : null;
    if (!list) return;
    state.suggest.items = items;
    state.suggest.active = -1;
    if (!items.length) {
      // 没有站内命中就不弹下拉，直接回车走网盘搜索
      list.hidden = true;
      list.innerHTML = "";
      return;
    }
    const rows = items.map((item, index) => `
      <button type="button" class="suggest-item" data-suggest-index="${index}">
        <span class="suggest-title">${esc(item.title)}</span>
        <span class="suggest-meta">${esc([item.type, item.year].filter(Boolean).join(" · "))}</span>
      </button>`).join("");
    list.innerHTML = `${rows}
      <button type="button" class="suggest-item suggest-web" data-suggest-web>
        <span class="suggest-title">${esc(t("search.suggestWeb", { q }))}</span>
        <span class="suggest-meta">Enter ↵</span>
      </button>`;
    list.hidden = false;
  } catch (err) {
    if (!controller.signal.aborted) closeSuggest();
  }
}

function scheduleSuggest(input) {
  if (state.suggest.timer) clearTimeout(state.suggest.timer);
  if (!input.value.trim()) {
    closeSuggest();
    return;
  }
  state.suggest.timer = setTimeout(() => {
    state.suggest.timer = 0;
    requestSuggest(input);
  }, SUGGEST_DEBOUNCE);
}

function headerHTML({ compact = false, query = "" } = {}) {
  if (!compact) {
    return `<header class="site-head">
      ${brandHTML()}
      <div class="head-actions">
        ${favoritesLinkHTML()}
        ${themeButtonHTML()}
        ${feedbackButtonHTML()}
        ${langSwitchHTML()}
      </div>
    </header>`;
  }
  return `<header class="sub-head">
    <button class="back-btn" type="button" data-action="back" aria-label="${t("action.back")}">${ICON_BACK}</button>
    <div class="head-search">${searchFormHTML(query)}</div>
    <div class="head-actions compact">
      ${favoritesLinkHTML()}
      ${themeButtonHTML()}
      ${feedbackButtonHTML()}
      ${langSwitchHTML()}
    </div>
  </header>`;
}

function footerHTML() {
  return `<footer class="site-foot"><div class="foot-inner">
    <span class="foot-brand">${BRAND_MARK}${BRAND.name}</span>
    <span>${t("foot.tagline")}</span>
    <span class="foot-tmdb">海报与影视资料部分来自 <a href="https://www.themoviedb.org/" target="_blank" rel="noopener noreferrer nofollow">TMDB</a>。This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
  </div></footer>`;
}

/* ---------------- poster art ---------------- */

function shortTitle(item) {
  let title = (item.art && item.art.title) || item.title || "";
  if (!(item.art && item.art.title)) {
    if (title.includes("：")) title = title.split("：").pop();
    title = title.replace(/\s+(I{1,3}|IV|V)$/u, "");
  }
  return title;
}

function motifSVG(art) {
  switch (art.motif) {
    case "plate":
      return `<circle cx="196" cy="250" r="118" fill="none" stroke="currentColor" stroke-opacity=".22" stroke-width="1.2"/>
        <circle cx="196" cy="250" r="92" fill="var(--p3)" opacity=".18"/>
        <circle cx="196" cy="250" r="64" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-dasharray="2 6"/>
        <circle cx="196" cy="250" r="10" fill="var(--p3)" opacity=".8"/>
        <path d="M30 380 Q196 330 366 380" fill="none" stroke="currentColor" stroke-opacity=".18"/>`;
    case "ember":
      return `<circle cx="205" cy="300" r="120" fill="var(--p3)" opacity=".22"/>
        <circle cx="205" cy="300" r="66" fill="var(--p3)" opacity=".45"/>
        <path d="M40 360 Q205 300 370 360" fill="none" stroke="currentColor" stroke-opacity=".25"/>
        <path d="M70 230 q55 -70 110 0 t110 0" fill="none" stroke="currentColor" stroke-opacity=".3"/>
        <path d="M0 420 H400" stroke="var(--p3)" stroke-opacity=".35"/>
        <circle cx="110" cy="150" r="2" fill="var(--p3)"/><circle cx="300" cy="120" r="1.5" fill="var(--p3)"/>`;
    case "vault":
      return `<circle cx="196" cy="252" r="126" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="1.5"/>
        <circle cx="196" cy="252" r="100" fill="var(--p3)" opacity=".12"/>
        <circle cx="196" cy="252" r="72" fill="none" stroke="var(--p3)" stroke-opacity=".5"/>
        <path d="M196 126 v252 M70 252 h252 M107 163 l178 178 M285 163 L107 341" stroke="currentColor" stroke-opacity=".16"/>
        <circle cx="196" cy="252" r="16" fill="var(--p3)" opacity=".7"/>
        <path d="M0 430 H400" stroke="currentColor" stroke-opacity=".12"/>`;
    case "neon":
      return `<ellipse cx="200" cy="250" rx="150" ry="90" fill="var(--p3)" opacity=".1"/>
        <path d="M110 300 L200 160 L290 300 Z" fill="none" stroke="var(--p3)" stroke-opacity=".75" stroke-width="1.4"/>
        <path d="M70 120 H330 M60 150 H340" stroke="var(--p3)" stroke-opacity=".18"/>
        <path d="M150 330 H250 M140 350 H260 M155 370 H245" stroke="var(--p3)" stroke-opacity=".4"/>
        <circle cx="200" cy="300" r="4" fill="var(--p3)"/>`;
    case "sun":
      return `<circle cx="200" cy="270" r="116" fill="var(--p3)" opacity=".5"/>
        <circle cx="200" cy="270" r="116" fill="none" stroke="currentColor" stroke-opacity=".25"/>
        <path d="M0 372 H400" stroke="currentColor" stroke-opacity=".3"/>
        <path d="M128 340 q20 -8 40 0 l10 14 h-60 z" fill="currentColor" opacity=".35"/>
        <path d="M64 110 H336" stroke="currentColor" stroke-opacity=".12"/>`;
    case "arch":
      return `<path d="M120 420 V210 Q120 96 200 96 Q280 96 280 210 V420" fill="none" stroke="currentColor" stroke-opacity=".3" stroke-width="1.2"/>
        <path d="M145 420 V215 Q145 128 200 128 Q255 128 255 215 V420" fill="none" stroke="var(--p3)" stroke-opacity=".35"/>
        <path d="M200 128 V420 M145 240 H255 M145 300 H255 M145 360 H255" stroke="currentColor" stroke-opacity=".14"/>
        <rect x="176" y="300" width="48" height="120" fill="var(--p3)" opacity=".22"/>
        <circle cx="200" cy="88" r="4" fill="var(--p3)"/>`;
    case "blades":
      return `<g stroke="currentColor" stroke-opacity=".22">
        <path d="M56 430 V168 l7 -18 7 18 V430"/>
        <path d="M96 430 V132 l7 -18 7 18 V430"/>
        <path d="M136 430 V106 l7 -18 7 18 V430"/>
        <path d="M176 430 V88 l7 -18 7 18 V430"/>
        <path d="M216 430 V96 l7 -18 7 18 V430"/>
        <path d="M256 430 V118 l7 -18 7 18 V430"/>
        <path d="M296 430 V146 l7 -18 7 18 V430"/>
        <path d="M336 430 V178 l7 -18 7 18 V430"/>
      </g>
      <circle cx="200" cy="250" r="60" fill="var(--p3)" opacity=".16"/>
      <path d="M132 402 H268" stroke="var(--p3)" stroke-opacity=".45"/>
      <path d="M164 402 v-26 h72 v26" fill="none" stroke="currentColor" stroke-opacity=".24"/>`;
    case "ruins":
      return `<circle cx="250" cy="180" r="58" fill="var(--p3)" opacity=".22"/>
        <path d="M0 420 H400" stroke="currentColor" stroke-opacity=".2"/>
        <path d="M40 420 V330 h38 v90 M96 420 V292 h46 v128 M154 420 V352 h30 v68 M214 420 V276 h40 v144 M272 420 V318 h36 v102 M326 420 V360 h30 v60" fill="currentColor" opacity=".22"/>
        <path d="M60 120 q80 -40 150 0" fill="none" stroke="currentColor" stroke-opacity=".2"/>
        <circle cx="110" cy="150" r="2" fill="currentColor" opacity=".4"/>`;
    case "cave":
      return `<ellipse cx="200" cy="290" rx="160" ry="120" fill="none" stroke="currentColor" stroke-opacity=".18"/>
        <ellipse cx="200" cy="290" rx="122" ry="90" fill="none" stroke="var(--p3)" stroke-opacity=".35"/>
        <ellipse cx="200" cy="290" rx="82" ry="60" fill="none" stroke="currentColor" stroke-opacity=".26"/>
        <ellipse cx="200" cy="290" rx="44" ry="32" fill="var(--p3)" opacity=".18"/>
        <circle cx="200" cy="290" r="4" fill="var(--p3)"/>
        <path d="M0 100 L400 60" stroke="currentColor" stroke-opacity=".08"/>`;
    case "bust":
      return `<path d="M140 420 q0 -90 60 -90 q60 0 60 90" fill="currentColor" opacity=".18"/>
        <circle cx="200" cy="250" r="48" fill="currentColor" opacity=".26"/>
        <path d="M152 250 q48 -66 96 0 q-8 54 -48 54 q-40 0 -48 -54z" fill="none" stroke="currentColor" stroke-opacity=".3"/>
        <path d="M60 420 H340" stroke="currentColor" stroke-opacity=".22"/>
        <circle cx="200" cy="150" r="3" fill="var(--p3)"/>`;
    case "dune":
      return `<circle cx="150" cy="190" r="46" fill="var(--p3)" opacity=".35"/>
        <circle cx="272" cy="160" r="26" fill="var(--p3)" opacity=".55"/>
        <path d="M0 360 Q120 300 240 360 T400 340 V430 H0 Z" fill="currentColor" opacity=".14"/>
        <path d="M0 410 Q140 350 280 410 T400 390 V470 H0 Z" fill="currentColor" opacity=".18"/>
        <path d="M0 330 H400" stroke="currentColor" stroke-opacity=".18"/>`;
    case "flash":
      return `<circle cx="200" cy="250" r="70" fill="var(--p3)" opacity=".55"/>
        <circle cx="200" cy="250" r="120" fill="none" stroke="var(--p3)" stroke-opacity=".18"/>
        <path d="M200 60 V180 M200 320 V440 M60 250 H140 M260 250 H340 M100 150 L150 200 M300 150 L250 200 M100 350 L150 300 M300 350 L250 300" stroke="currentColor" stroke-opacity=".18"/>
        <circle cx="200" cy="250" r="10" fill="var(--p3)" opacity=".9"/>`;
    case "multiverse":
      return `<circle cx="150" cy="220" r="90" fill="var(--p4)" opacity=".18"/>
        <circle cx="250" cy="250" r="100" fill="var(--p3)" opacity=".22"/>
        <circle cx="200" cy="290" r="118" fill="none" stroke="var(--p4)" stroke-opacity=".35"/>
        <path d="M40 340 L360 120" stroke="var(--p3)" stroke-opacity=".35"/>
        <path d="M40 300 L340 80" stroke="var(--p4)" stroke-opacity=".18"/>
        <circle cx="200" cy="250" r="6" fill="currentColor" opacity=".7"/>
        <g fill="var(--p4)" opacity=".3"><circle cx="80" cy="140" r="2"/><circle cx="320" cy="200" r="2"/><circle cx="110" cy="300" r="1.5"/><circle cx="290" cy="120" r="1.5"/></g>`;
    case "earth":
      return `<circle cx="200" cy="240" r="128" fill="none" stroke="var(--p3)" stroke-opacity=".55" stroke-width="1.5"/>
        <circle cx="200" cy="240" r="128" fill="var(--p3)" opacity=".08"/>
        <ellipse cx="200" cy="240" rx="128" ry="42" fill="none" stroke="var(--p3)" stroke-opacity=".3"/>
        <path d="M200 112 V368 M72 240 H328" stroke="currentColor" stroke-opacity=".12"/>
        <g fill="currentColor" opacity=".5"><circle cx="120" cy="110" r="1.5"/><circle cx="300" cy="100" r="1"/><circle cx="330" cy="300" r="1.5"/><circle cx="80" cy="330" r="1"/><circle cx="280" cy="150" r="1"/></g>
        <path d="M0 440 H400" stroke="currentColor" stroke-opacity=".16"/>`;
    case "reactor":
      return `<rect x="0" y="300" width="400" height="90" fill="var(--p3)" opacity=".12"/>
        <path d="M86 420 V180 h30 v240 M180 420 V130 h36 v290 M280 420 V210 h28 v210" fill="currentColor" opacity=".18"/>
        <path d="M70 180 H320 M180 130 H216" stroke="currentColor" stroke-opacity=".22"/>
        <path d="M60 300 H340" stroke="var(--p3)" stroke-opacity=".5"/>
        <circle cx="250" cy="90" r="34" fill="var(--p3)" opacity=".12"/>
        <path d="M210 90 q40 -30 80 0" fill="none" stroke="currentColor" stroke-opacity=".2"/>`;
    case "orbit":
    default:
      return `<circle cx="196" cy="262" r="132" fill="none" stroke="var(--p3)" stroke-opacity=".55"/>
        <circle cx="196" cy="262" r="98" fill="none" stroke="var(--p3)" stroke-opacity=".4"/>
        <circle cx="196" cy="262" r="62" fill="none" stroke="currentColor" stroke-opacity=".3"/>
        <circle cx="196" cy="262" r="26" fill="var(--p3)" opacity=".16"/>
        <circle cx="292" cy="178" r="7" fill="var(--p3)"/>
        <circle cx="120" cy="330" r="3" fill="var(--p3)" opacity=".7"/>
        <path d="M0 430 H400" stroke="currentColor" stroke-opacity=".12"/>`;
  }
}

/** 外部海报直链（后台可填）。图片盖在程序化海报之上，加载失败由全局 error 监听回退到生成的封面。 */
function imageSrc(url, small) {
  if (typeof url !== "string" || !url) return "";
  try {
    const parsed = new URL(url, location.origin);
    const host = parsed.hostname;
    // 豆瓣图片有防盗链；TMDB 图国内常被墙——都统一走 Worker 代理（我们域名 + 边缘缓存）。
    if (/(^|\.)doubanio\.com$/i.test(host)) {
      const href = small ? parsed.href.replace("/l_ratio_poster/", "/m_ratio_poster/") : parsed.href;
      return `/api/img?src=${encodeURIComponent(href)}`;
    }
    if (/(^|\.)tmdb\.org$/i.test(host)) {
      const href = small ? parsed.href.replace("/t/p/w500/", "/t/p/w342/") : parsed.href;
      return `/api/img?src=${encodeURIComponent(href)}`;
    }
    return url;
  } catch (err) {
    return url;
  }
}

function posterImgHTML(item, small = false) {
  if (!item.poster) return "";
  return `<img class="poster-img" src="${esc(imageSrc(item.poster, small))}" alt="${esc(t("poster.alt", { title: item.title }))}" loading="lazy" decoding="async">`;
}

function posterHTML(item) {
  const art = item.art || {};
  const p4 = art.p4 || art.p3 || "#a4684f";
  return `<div class="poster${item.poster ? " has-img" : ""}" style="--p1:${art.p1 || "#d9d0c6"};--p2:${art.p2 || "#77776d"};--p3:${art.p3 || "#a4684f"};--p4:${p4};--p-ink:${art.ink || "#2f3230"}">
    <svg class="poster-art" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g class="motif">${motifSVG(art)}</g>
    </svg>
    ${posterImgHTML(item)}
    <div class="poster-copy">
      <span class="poster-kicker">${BRAND.name}</span>
      <h3 class="poster-title">${esc(shortTitle(item))}</h3>
      <p class="poster-meta">${item.year} · ${esc(enumText(item.type))}</p>
      <span class="poster-line"></span>
    </div>
  </div>`;
}

/* ---------------- data helpers ---------------- */

function providerURL(offerItem, item) {
  if (offerItem.url) return offerItem.url;
  const provider = PROVIDERS[offerItem.pid];
  if (!provider) return "#";
  const term = provider.region === "中国大陆" ? item.title : item.original;
  return provider.search + encodeURIComponent(term);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setRouteBusy(on) {
  document.body.classList.toggle("is-routing", Boolean(on));
}

const ERROR_TEXT = {
  rate_limited: "err.rateLimited",
  busy: "err.busy",
  pansou_busy: "err.busy",
  pansou_rate_limited: "err.rateLimited",
  query_required: "err.queryRequired",
  invalid_query: "err.invalidQuery",
  pansou_unconfigured: "err.panUnconfigured",
  pansou_config: "err.panUnconfigured",
  pansou_timeout: "err.panTimeout",
  pansou_unreachable: "err.panUnreachable",
  pansou_auth: "err.panAuth",
  pansou_format: "err.panFormat",
  pansou_error: "err.panFormat",
  pansou_http: "err.panFormat",
  pansou_too_large: "err.panTooLarge"
};

function friendlyError(err) {
  if (err && err.name === "TypeError") return t("err.network");
  const key = err && err.code ? ERROR_TEXT[err.code] : "";
  if (key) return t(key);
  const message = (err && err.message) || "";
  // 服务端可能只返回中文提示；英文界面下宁可给通用文案，也不混排中文。
  if (getLang() === "en" && /[\u4e00-\u9fa5]/.test(message)) return t("err.generic");
  return message || t("err.generic");
}

function renderLoadError(err, retry) {
  state.retry = retry;
  setRouteBusy(false);
  document.title = t("err.loadTitle", { name: BRAND.name });
  app.innerHTML = `<div class="view">
    ${headerHTML({ compact: true, query: state.lastQuery })}
    <main class="magazine-page">
      <div class="empty">
        ${ICON_EMPTY}
        <h3>${t("err.loadHead")}</h3>
        <p>${esc(friendlyError(err))}</p>
        <div class="chips">
          <button class="chip" type="button" data-retry>${t("action.retry")}</button>
          <a class="chip" href="/">${t("action.home")}</a>
        </div>
      </div>
    </main>
    ${footerHTML()}
  </div>`;
  updateScrollState();
}

function renderBootError(err) {
  state.retry = init;
  document.title = t("err.bootTitle", { name: BRAND.name });
  app.innerHTML = `<div class="view">
    ${headerHTML()}
    <main class="home-main">
      <div class="empty">
        ${ICON_EMPTY}
        <h3>${t("err.bootHead")}</h3>
        <p>${esc(friendlyError(err))}</p>
        <div class="chips"><button class="chip" type="button" data-retry>${t("action.retry")}</button></div>
      </div>
    </main>
    ${footerHTML()}
  </div>`;
}

/* ---------------- home ---------------- */

function leadCardHTML(item) {
  if (!item) return "";
  const art = item.art || {};
  const p4 = art.p4 || art.p3 || "#a4684f";
  const genres = (item.genres || []).slice(0, 3).join(" · ");
  const rating = Number(item.rating) > 0 ? `★ ${Number(item.rating).toFixed(1)}` : "";
  const year = item.year ? `${item.year} · ` : "";
  const href = item.href || `/title/${encodeURIComponent(item.id)}`;
  return `<a class="feature-lead" href="${esc(href)}">
    <div class="poster poster-wide${item.poster ? " has-img" : ""}" style="--p1:${art.p1 || "#d9d0c6"};--p2:${art.p2 || "#77776d"};--p3:${art.p3 || "#a4684f"};--p4:${p4};--p-ink:${art.ink || "#2f3230"}">
      <svg class="poster-art" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="motif">${motifSVG(art)}</g></svg>
      ${posterImgHTML(item, true)}
      <div class="poster-copy">
        <span class="poster-kicker">${BRAND.name}</span>
        <h3 class="poster-title">${esc(item.title)}</h3>
        <p class="poster-meta">${year}${esc(enumText(item.type))}${genres ? ` <span class="poster-genres">· ${esc(genres)}</span>` : ""}${rating ? ` · ${rating}` : ""}</p>
        <span class="poster-line"></span>
      </div>
    </div>
  </a>`;
}

function miniCardHTML(item) {
  const art = item.art || {};
  const href = item.href || `/title/${encodeURIComponent(item.id)}`;
  const rating = Number(item.rating) > 0 ? ` · ★ ${Number(item.rating).toFixed(1)}` : "";
  return `<a class="mini-card" href="${esc(href)}">
    <div class="mini-poster${item.poster ? " has-img" : ""}" style="--p1:${art.p1 || "#d9d0c6"};--p2:${art.p2 || "#77776d"};--p3:${art.p3 || "#a4684f"};--p-ink:${art.ink || "#2f3230"}">
      <svg class="poster-art" viewBox="0 0 400 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><g class="motif">${motifSVG(art)}</g></svg>
      ${posterImgHTML(item, true)}
    </div>
    <div class="mini-body">
      <h4 class="mini-title">${esc(item.title)}</h4>
      <p class="mini-meta">${item.year ? `${item.year} · ` : ""}${esc(enumText(item.type))}${rating}</p>
    </div>
  </a>`;
}

function featureGroupHTML(items) {
  if (!items || !items.length) return "";
  const [first, ...rest] = items;
  return `<div class="feature-group">
    ${leadCardHTML(first)}
    ${rest.length ? `<div class="group-rows">${rest.map(miniCardHTML).join("")}</div>` : ""}
  </div>`;
}

/* 豆瓣条目没有本地配色，按片名散列出一组固定色调，避免每次刷新变色 */
const HOME_PALETTES = [
  { p1: "#d9d0c6", p2: "#77776d", p3: "#a4684f", p4: "#8d5647", ink: "#2f3230" },
  { p1: "#cfd6cf", p2: "#6f7a72", p3: "#5f7f6b", p4: "#4c6856", ink: "#25302a" },
  { p1: "#d6d2e0", p2: "#77728c", p3: "#6f6390", p4: "#584a79", ink: "#2b2838" },
  { p1: "#ded2c8", p2: "#8a7568", p3: "#b07a56", p4: "#8f5f41", ink: "#332a24" },
  { p1: "#ccd5da", p2: "#6d7a85", p3: "#5c7a90", p4: "#486275", ink: "#242e35" },
  { p1: "#dcd4c6", p2: "#847a66", p3: "#9c8452", p4: "#7c6739", ink: "#302b1f" }
];

function paletteFor(seed) {
  let hash = 0;
  for (const ch of String(seed || "")) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  return HOME_PALETTES[hash % HOME_PALETTES.length];
}

/** 片名归一化：去空格、书名号、常见标点，用于片库与豆瓣同名判重。 */
function titleKey(value) {
  return String(value || "").toLowerCase().replace(/[\s《》〈〉「」『』【】\[\]（）()：:·.,，。!！?？\-_—\/\\]/g, "");
}

/** 首页 11 部：片库在前，豆瓣「最新」补足；按归一化片名去重，片库优先。 */
function mergeHomeFeeds(mine, douban, max) {
  const out = [];
  const seen = new Set();
  const push = (entry) => {
    const key = titleKey(entry.title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };
  for (const item of mine) {
    if (out.length >= max) return out;
    if (!item.featured) continue; // 只有勾选「加入最热」的片库条目才进最热
    const title = typeof item.title === "string" ? item.title.trim() : "";
    if (!title) continue;
    push({ id: `catalog-${item.id}`, title, year: item.year || null, type: item.kind || "电影", rating: item.rating || null, poster: item.poster || "" });
  }
  for (const item of douban) {
    if (out.length >= max) return out;
    if (item && item.title) push(item);
  }
  return out;
}

/** 首页右侧只展示豆瓣「最新」榜 10 部；「大家都在搜」另行取热门榜片名。 */
let latestCache = null;
// 热门榜片名池：[{ title, hue }]；先显示 10 个，点箭头再追加 10 个
let hotTitlePool = [];
const HOT_PAGE = 10;

/* 豆瓣榜单上次成功的快照：接口挂了先退回这份，缓存也是空的才整块不显示 */
const DOUBAN_CACHE_KEY = "yingtu-douban-cache";
const DOUBAN_CACHE_FIELDS = ["id", "title", "year", "type", "rating", "poster", "genres"];

function readDoubanCache(kind) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DOUBAN_CACHE_KEY) || "{}");
    const items = parsed && Array.isArray(parsed[kind]) ? parsed[kind] : [];
    return items.filter((item) => item && typeof item.id === "string" && item.title);
  } catch (err) {
    return [];
  }
}

function writeDoubanCache(kind, items) {
  try {
    const parsed = JSON.parse(localStorage.getItem(DOUBAN_CACHE_KEY) || "{}");
    parsed[kind] = items.map((item) => {
      const picked = {};
      for (const key of DOUBAN_CACHE_FIELDS) if (item[key] !== undefined) picked[key] = item[key];
      return picked;
    });
    localStorage.setItem(DOUBAN_CACHE_KEY, JSON.stringify(parsed));
  } catch (err) {
    // 存不下（隐私模式 / 配额满）就不缓存，不影响页面
  }
}

// 每次进首页换一套起点：黄金角步进保证相邻色相差得开，刷新后组合不同
const HOT_HUE_START = Math.random() * 360;
const HUE_STEP = 137.5;

function hotChipHTML(item) {
  return `<button class="chip hot-chip" type="button" style="--h:${item.hue}" data-q="${esc(item.title)}">${esc(item.title)}</button>`;
}

/** 「大家都在搜」取热门榜前 20 个片名，分批显示。 */
function applyHotChips(items, latestTitles = []) {
  const box = document.getElementById("home-hot");
  if (!box) return;
  const titles = [];
  const seen = new Set();
  const pushTitle = (title) => {
    const key = titleKey(title);
    if (!key || seen.has(key)) return;
    seen.add(key);
    titles.push(title);
  };
  // 片库「最新」排最前，可无限添加；豆瓣热门补足（最多 20 个）
  for (const title of (Array.isArray(latestTitles) ? latestTitles : [])) if (title) pushTitle(title);
  let doubanAdded = 0;
  for (const item of (Array.isArray(items) ? items : [])) {
    if (doubanAdded >= HOT_PAGE * 2) break;
    if (!item || !item.title) continue;
    const before = titles.length;
    pushTitle(item.title);
    if (titles.length > before) doubanAdded += 1;
  }
  hotTitlePool = titles.map((title, index) => ({
    title,
    hue: Math.round((HOT_HUE_START + index * HUE_STEP) % 360)
  }));
  if (!hotTitlePool.length) return;
  const first = hotTitlePool.slice(0, HOT_PAGE);
  const needsMore = hotTitlePool.length > HOT_PAGE;
  // 最后一张和箭头绑成一组，换行时不会出现「箭头孤零零一行」
  const head = needsMore ? first.slice(0, -1) : first;
  const tail = needsMore
    ? `<span class="hot-tail">${hotChipHTML(first[first.length - 1])}<button class="hot-more" type="button" data-hot-more aria-label="${t("home.hotMoreAria")}" title="${t("home.hotMore")}">↓</button></span>`
    : "";
  box.innerHTML = `<span class="hot-label">${t("home.hot")}</span>${head.map(hotChipHTML).join("")}${tail}`;
  box.hidden = false;
}

/** 展开第二批片名，箭头随之消失。 */
function expandHotChips() {
  const box = document.getElementById("home-hot");
  if (!box) return;
  const rest = hotTitlePool.slice(HOT_PAGE);
  const more = box.querySelector("[data-hot-more]");
  if (more) more.remove();
  if (rest.length) box.insertAdjacentHTML("beforeend", rest.map(hotChipHTML).join(""));
}

async function loadLatestList() {
  const body = document.getElementById("feature-body");
  if (!body) return;
  if (latestCache) {
    body.innerHTML = latestCache;
    revealFeatured();
    return;
  }
  let douban = readDoubanCache("latest").slice(0, 11);
  try {
    const data = await API.doubanList({ kind: "latest", limit: 11 });
    if (location.pathname !== "/") return;
    const fresh = (data.items || []).filter((item) => item && item.title).slice(0, 11);
    if (fresh.length >= 2) {
      douban = fresh;
      writeDoubanCache("latest", fresh);
    }
  } catch (err) {
    // 豆瓣拿不到就用上次成功的缓存，缓存也空就整块不显示
  }
  let mine = [];
  try {
    const cat = await API.catalog();
    mine = (cat && Array.isArray(cat.items)) ? cat.items : [];
  } catch (err) {
    // 片库拿不到就只用豆瓣榜
  }
  if (location.pathname !== "/") return;
  const merged = mergeHomeFeeds(mine, douban, 11);
  if (merged.length < 2) return;
  const html = featureGroupHTML(merged.map((item) => ({
    ...item,
    href: searchURL(item.title),
    art: paletteFor(item.title)
  })));
  latestCache = html;
  const target = document.getElementById("feature-body");
  if (!target) return;
  target.innerHTML = html;
  revealFeatured();
}

/** 榜单到了才把右栏放出来，首页保持单列居中 */
function revealFeatured() {
  const body = document.getElementById("feature-body");
  if (!body || !body.children.length) return;
  const aside = body.closest(".home-featured");
  if (!aside) return;
  aside.hidden = false;
  const grid = aside.closest(".hero-grid");
  if (grid) grid.classList.remove("solo");
}

async function loadHotChips() {
  let items = readDoubanCache("hot");
  try {
    const data = await API.doubanList({ kind: "hot", limit: HOT_PAGE * 2 });
    if (location.pathname !== "/") return;
    const fresh = (data.items || []).filter((item) => item && item.title).slice(0, HOT_PAGE * 2);
    if (fresh.length) {
      items = fresh;
      writeDoubanCache("hot", fresh);
    }
  } catch (err) {
    // 热门榜失败就退回上次成功的片名，缓存也空就不显示这一行
  }
  let latestTitles = [];
  try {
    const cat = await API.catalog();
    latestTitles = (cat && Array.isArray(cat.items))
      ? cat.items.filter((item) => item && item.latest).map((item) => item.title)
      : [];
  } catch (err) {
    latestTitles = [];
  }
  if (location.pathname !== "/") return;
  applyHotChips(items, latestTitles);
}

function renderHome() {
  setRouteBusy(false);
  document.title = t("home.docTitle", { name: BRAND.name });

  app.innerHTML = `<div class="home view">
    ${headerHTML()}
    <main class="home-main">
      <section class="hero-grid solo">
        <div class="hero-copy">
          <h1 class="display-title animate d1">${t("home.lead")}<span class="hero-accent">${t("home.accent")}</span></h1>
          <div class="hero-search animate d2">${searchFormHTML("")}</div>
          <div class="hot animate d3" id="home-hot" hidden></div>
        </div>
        <aside class="home-featured animate d4" aria-label="${t("home.featuredAria")}" hidden>
          <div id="feature-body"></div>
        </aside>
      </section>
    </main>
    <div class="home-foot">${t("home.foot", { name: BRAND.name })}</div>
  </div>`;
  updateScrollState();
  loadLatestList();
  loadHotChips();
}

/* ---------------- 网盘公开分享搜索（PanSou：夸克 / 百度 / 迅雷 / 阿里） ---------------- */

const PAN_LIMIT = 30;
const PAN_TYPES = [{ id: "quark" }, { id: "baidu" }, { id: "xunlei" }, { id: "aliyun" }];
const PAN_TYPE_MAP = new Map(PAN_TYPES.map((item) => [item.id, item]));
const PAN_URL_RULES = {
  quark: /^https:\/\/pan\.quark\.cn\/s\/[a-zA-Z0-9]+$/,
  baidu: /^https:\/\/pan\.baidu\.com\/s\/[a-zA-Z0-9_-]+$/,
  xunlei: /^https:\/\/pan\.xunlei\.com\/s\/[a-zA-Z0-9_-]+$/,
  aliyun: /^https:\/\/(?:www\.)?(?:alipan|aliyundrive)\.com\/s\/[a-zA-Z0-9_-]+$/
};

function panTypeOf(params) {
  const type = params.get("type") || "quark";
  return PAN_TYPE_MAP.has(type) ? type : "quark";
}

function panTypeLabel(type) {
  return PAN_TYPE_MAP.has(type) ? t(`pan.${type}`) : t("pan.type");
}

/* ---------------- 网盘分享收藏（localStorage，键与影视片单分开） ---------------- */

const PAN_FAV_KEY = "yingtu-pan-favorites";

function readPanFavs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PAN_FAV_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry) => entry && typeof entry.id === "string" && typeof entry.url === "string")
      .slice(0, FAV_LIMIT);
  } catch (err) {
    return [];
  }
}

function panFavRecord(item) {
  const type = PAN_TYPE_MAP.has(item.type) ? item.type : "quark";
  return {
    id: item.id,
    type,
    title: item.title || "",
    url: item.url,
    password: item.password || "",
    sources: Array.isArray(item.sources) ? item.sources.slice(0, 8) : [],
    datetime: item.datetime || null,
    savedAt: Date.now()
  };
}

function writePanFavs(list) {
  try {
    localStorage.setItem(PAN_FAV_KEY, JSON.stringify(list.slice(0, FAV_LIMIT)));
  } catch (err) {
    showToast(t("toast.storageFull"));
  }
  syncPanFavButtons();
}

function isPanFav(id) {
  return readPanFavs().some((entry) => entry.id === id);
}

function togglePanFav(item) {
  const list = readPanFavs();
  const index = list.findIndex((entry) => entry.id === item.id);
  if (index >= 0) {
    list.splice(index, 1);
    writePanFavs(list);
    return false;
  }
  list.unshift(panFavRecord(item));
  writePanFavs(list);
  return true;
}

function panFavButtonHTML(item) {
  const on = isPanFav(item.id);
  return `<button class="fav-btn${on ? " on" : ""}" type="button" data-pan-fav="${esc(item.id)}" aria-pressed="${on}" aria-label="${t(on ? "fav.remove" : "fav.panAdd")}">${ICON_HEART}</button>`;
}

function syncPanFavButtons() {
  const ids = new Set(readPanFavs().map((entry) => entry.id));
  $$("[data-pan-fav]").forEach((button) => {
    const on = ids.has(button.dataset.panFav);
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", String(on));
    button.setAttribute("aria-label", t(on ? "fav.remove" : "fav.panAdd"));
  });
  syncFavBadge();
}

/** 头部「片单」角标：影视收藏 + 网盘分享收藏的合计。 */
function syncFavBadge() {
  const total = readFavorites().length + readPanFavs().length;
  $$("[data-fav-count]").forEach((badge) => {
    badge.textContent = String(total);
    badge.hidden = total === 0;
  });
}

function safePanURL(value, type) {
  if (typeof value !== "string") return "";
  const rule = PAN_URL_RULES[type];
  // 不做 URL 归一化：端口、参数、片段、空白和相似域名一律拒绝。
  return rule && rule.test(value) ? value : "";
}

/** 复制按钮用：链接来自已渲染的卡片，这里再按四类规则整体复核一次。 */
function safePanAnyURL(value) {
  return PAN_TYPES.some((item) => safePanURL(value, item.id)) ? value : "";
}

function panPage(params) {
  const page = Number(params.get("page") || 1);
  return Number.isSafeInteger(page) && page > 0
    && page <= Math.floor(Number.MAX_SAFE_INTEGER / PAN_LIMIT) ? page : 1;
}

function panTabsHTML(q, type) {
  return `<nav class="pan-tabs" role="tablist" aria-label="${t("pan.tabsAria")}">
    ${PAN_TYPES.map((item) => {
      const on = item.id === type;
      return `<a class="pan-tab${on ? " on" : ""}" role="tab" aria-selected="${on}" href="${esc(searchURL(q, item.id))}">${esc(panTypeLabel(item.id))}</a>`;
    }).join("")}
  </nav>`;
}

function panCardHTML(item, currentType) {
  if (!item || typeof item !== "object") return "";
  const type = PAN_TYPE_MAP.has(item.type) ? item.type : currentType;
  const url = safePanURL(item.url, type);
  const password = typeof item.password === "string" ? item.password : "";
  const sources = Array.isArray(item.sources) ? item.sources.filter((source) => typeof source === "string") : [];
  const date = typeof item.datetime === "string" ? new Date(item.datetime) : null;
  const time = date && Number.isFinite(date.getTime())
    ? `<time datetime="${esc(item.datetime)}" title="${esc(item.datetime)}">${esc(t("pan.localTime", { time: date.toLocaleString(langTag(), { hour12: false }) }))}</time>`
    : t("pan.noTime");
  return `<article class="pan-card">
    ${panFavButtonHTML(item)}
    <div class="pan-card-head">
      <h3>${esc(item.title || t("pan.noTitle"))}</h3>
    </div>
    <div class="pan-meta">
      <span>${t("pan.source")}${sources.length ? sources.map((source) => `<span class="pan-source">${esc(source)}</span>`).join(" ") : t("pan.noSource")}</span>
      <span>${t("pan.sourceTime")}${time}</span>
    </div>
    <p class="pan-url">${url ? esc(url) : t("pan.badUrl")}</p>
    <p class="pan-password">${t("pan.code")}${password ? `<code>${esc(password)}</code>` : t("pan.noCode")}</p>
    <div class="pan-actions">
      ${url ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${t("pan.open")}</a>
        <button class="quiet-btn" type="button" data-pan-copy="link" data-pan-url="${esc(url)}">${t("pan.copyLink")}</button>
        ${password ? `<button class="quiet-btn" type="button" data-pan-copy="password" data-pan-url="${esc(url)}" data-pan-password="${esc(password)}">${t("pan.copyCode")}</button>` : ""}`
        : `<span class="pan-invalid">${t("pan.urlMismatch")}</span>`}
    </div>
  </article>`;
}

/** 片单页里的收藏卡片：不带心形，改成显式的「取消收藏」。 */
function panFavCardHTML(entry) {
  const url = safePanURL(entry.url, entry.type);
  const password = typeof entry.password === "string" ? entry.password : "";
  return `<article class="pan-card pan-fav-card">
    <div class="pan-card-head">
      <h3>${esc(entry.title || t("pan.unnamed"))}</h3>
    </div>
    <p class="pan-url">${url ? esc(url) : t("pan.badUrl")}</p>
    <p class="pan-password">${t("pan.code")}${password ? `<code>${esc(password)}</code>` : t("pan.noCode")}</p>
    <div class="pan-actions">
      ${url ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">${t("pan.open")}</a>
        <button class="quiet-btn" type="button" data-pan-copy="link" data-pan-url="${esc(url)}">${t("pan.copyLink")}</button>` : ""}
      ${password ? `<button class="quiet-btn" type="button" data-pan-copy="password" data-pan-url="${esc(url)}" data-pan-password="${esc(password)}">${t("pan.copyCode")}</button>` : ""}
      <button class="quiet-btn" type="button" data-pan-unfav="${esc(entry.id)}">${t("fav.remove")}</button>
    </div>
  </article>`;
}

function panPaginationHTML(q, type, data) {  const page = Math.floor(data.offset / data.limit) + 1;
  const pages = Math.max(1, page, Math.ceil(data.total / data.limit), data.hasMore ? page + 1 : page);
  const numbers = [...new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2])]
    .filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  const link = (value, label, extra = "") => `<a class="pan-page-link${extra}" href="${esc(searchURL(q, type, value))}" aria-label="${esc(label)}">${esc(label)}</a>`;
  let previous = 0;
  const numbered = numbers.map((value) => {
    const gap = previous && value - previous > 1 ? `<span class="pan-page-gap" aria-hidden="true">…</span>` : "";
    previous = value;
    return gap + (value === page
      ? `<span class="pan-page-link on" aria-current="page" aria-label="${t("pan.pageAria", { page })}">${page}</span>`
      : link(value, String(value)));
  }).join("");
  return `<nav class="pan-pagination" aria-label="${t("pan.paginationAria")}">
    <div class="pan-page-links">
      ${page > 1 ? link(page - 1, t("pan.prev")) : `<span class="pan-page-link disabled" aria-disabled="true">${t("pan.prev")}</span>`}
      ${numbered}
      ${data.hasMore ? link(page + 1, t("pan.next")) : `<span class="pan-page-link disabled" aria-disabled="true">${t("pan.next")}</span>`}
    </div>
    <form class="pan-page-jump" data-pan-page-form data-pan-query="${esc(q)}" data-pan-type="${esc(type)}">
      <label>${t("pan.jumpPrefix")} <input type="number" name="page" value="${page}" min="1" max="${pages}" step="1" required aria-label="${t("pan.pageAria", { page })}"> ${esc(t("pan.jumpSuffix", { pages }))}</label>
      <button class="quiet-btn" type="submit">${t("pan.jumpGo")}</button>
    </form>
    <p>${esc(t("pan.pageNote", { limit: data.limit }))}</p>
  </nav>`;
}

function panViewHTML(q, type, body, { loading = false } = {}) {
  const cooling = state.panReloadCoolUntil > Date.now();
  return `<div class="view pan-view">
    ${headerHTML({ compact: true, query: q })}
    <main class="magazine-page pan-page">
      ${panTabsHTML(q, type)}
      <div class="pan-toolbar">
        <button class="quiet-btn" type="button" data-pan-reload${!q || loading || cooling ? " disabled" : ""}>${t("pan.reload")}</button>
        <span>${t("pan.reloadNote")}</span>
      </div>
      ${body}
    </main>
    ${footerHTML()}
  </div>`;
}

async function renderPanResults(params, { reload = false } = {}) {
  const token = ++state.routeToken;
  if (state.searchController) state.searchController.abort();
  const controller = new AbortController();
  state.searchController = controller;
  state.retry = null;
  const q = (params.get("q") || "").trim();
  const type = panTypeOf(params);
  const page = panPage(params);
  if (q) state.lastQuery = q;
  document.title = q
    ? t("pan.docTitleQ", { q, name: BRAND.name })
    : t("pan.docTitle", { name: BRAND.name });

  if (!q) {
    setRouteBusy(false);
    app.innerHTML = panViewHTML(q, type, `<div class="empty" role="status">${ICON_EMPTY}<h3>${t("pan.emptyQueryHead")}</h3><p>${t("pan.emptyQueryBody")}</p></div>`);
    updateScrollState();
    return;
  }
  setRouteBusy(true);
  app.innerHTML = panViewHTML(q, type, `<div class="empty" role="status">
    <div class="soft-loader" aria-hidden="true"><i></i><i></i><i></i></div>
    <h3>${reload ? t("pan.reloading") : t("pan.searching")}</h3>
  </div>`, { loading: true });
  updateScrollState();

  let data;
  try {
    data = await API.panSearch({ q, type, offset: (page - 1) * PAN_LIMIT, reload, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError" || controller.signal.aborted || token !== state.routeToken) return;
    setRouteBusy(false);
    state.retry = () => renderPanResults(params);
    const status = err.status ? `HTTP ${err.status}${err.code ? ` · ${err.code}` : ""}` : "";
    app.innerHTML = panViewHTML(q, type, `<div class="empty" role="alert">
      ${ICON_EMPTY}<h3>${t("pan.errorHead")}</h3>
      <p>${esc(friendlyError(err))}</p>
      ${status ? `<p class="pan-error-code">${esc(status)}</p>` : ""}
      <div class="chips"><button class="chip" type="button" data-retry>${t("pan.retryPage")}</button>
        ${page > 1 ? `<a class="chip" href="${esc(searchURL(q, type, page - 1))}">${t("pan.backPrev")}</a>` : ""}
      </div>
    </div>`);
    updateScrollState();
    return;
  }
  if (controller.signal.aborted || token !== state.routeToken) return;
  setRouteBusy(false);
  // 我的资源：只在第一页置顶，样式与 PanSou 卡片一致，用户分不出归属。
  const mine = (data.offset === 0 && Array.isArray(data.mine) ? data.mine : []).map((entry) => ({
    id: `catalog-${entry.id}`,
    type: entry.pan,
    url: entry.link,
    password: entry.password || "",
    sources: [],
    datetime: entry.updatedAt || null,
    title: entry.note || entry.title
  }));
  const items = [...mine, ...data.items];
  // 收藏按钮只拿到 id，点的时候从这里取完整记录
  items.forEach((item) => item.id && state.panById.set(item.id, item));
  const summary = [
    t("pan.sumTotal", { type: panTypeLabel(type), total: data.total + mine.length }),
    t("pan.sumPage", { n: items.length }),
    data.cached ? t("pan.sumCached") : t("pan.sumUncached")
  ];
  if (Number.isFinite(data.tookMs)) summary.push(t("pan.sumTook", { ms: data.tookMs }));
  summary.push(data.complete === true ? t("pan.sumComplete") : t("pan.sumPartial"));
  const body = `<div class="pan-summary" role="status">${esc(summary.join(" · "))}</div>
    ${items.length ? `<div class="pan-results">${items.map((item) => panCardHTML(item, type)).join("")}</div>`
      : `<div class="empty" role="status">${ICON_EMPTY}<h3>${page > 1 ? t("pan.noPageResults") : esc(t("pan.noTypeResults", { type: panTypeLabel(type) }))}</h3>
        <p>${data.complete === true ? t("pan.emptyHintDone") : t("pan.emptyHintOpen")}</p>
        ${page > 1 ? `<div class="chips"><a class="chip" href="${esc(searchURL(q, type))}">${t("pan.backFirst")}</a></div>` : ""}
        ${page === 1 ? emptyFallbackHTML() : ""}
      </div>`}
    ${panPaginationHTML(q, type, data)}`;
  app.innerHTML = panViewHTML(q, type, body);
  updateScrollState();
}

/* ---------------- detail ---------------- */

/* 空搜索兜底：站内片库按评分推几部，boot 失败就退回热门搜索词 */
function emptyFallbackHTML() {
  const pool = (BOOT.all && BOOT.all.length ? [...BOOT.all] : [])
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 5);
  if (pool.length) {
    return `<div class="empty-fallback">
      <span class="empty-fallback-label">${t("fallback.top")}</span>
      <div class="chips">${pool.map((item) => `<a class="chip" href="/title/${encodeURIComponent(item.id)}">${esc(item.title)}</a>`).join("")}</div>
    </div>`;
  }
  const hot = (BOOT.hot || []).filter((item) => item && item.title).slice(0, 5);
  if (hot.length) {
    return `<div class="empty-fallback">
      <span class="empty-fallback-label">${t("fallback.hot")}</span>
      <div class="chips">${hot.map((item) => `<a class="chip" href="${esc(searchURL(item.title))}">${esc(item.title)}</a>`).join("")}</div>
    </div>`;
  }
  return "";
}

function loadingHTML() {
  return `<div class="loading">
    <div class="soft-loader" aria-hidden="true"><i></i><i></i><i></i></div>
    <h2>${t("detail.loadHead")}</h2>
    <p class="sub">${t("detail.loadSub")}</p>
    <ul class="checklist" aria-hidden="true">
      <li><span class="mark"><span>✓</span></span>${t("detail.step1")}</li>
      <li><span class="mark"><span>✓</span></span>${t("detail.step2")}</li>
      <li><span class="mark"><span>✓</span></span>${t("detail.step3")}</li>
      <li><span class="mark"><span>✓</span></span>${t("detail.step4")}</li>
    </ul>
  </div>`;
}

function filterChipHTML(item, key, value, label) {
  const active = state.filters[key] === value;
  let count = "";
  if (value !== "全部") {
    const n = item.offers.filter((offerItem) => {
      if (key === "season") return offerItem.season === value;
      if (key === "region") {
        const provider = PROVIDERS[offerItem.pid];
        return Boolean(provider) && provider.region === value;
      }
      if (key === "tier") return offerItem.tier === value;
      if (key === "quality") return offerItem.quality.includes(value);
      return false;
    }).length;
    count = `<span class="n">${n}</span>`;
  }
  const text = label || (value === "全部" ? t("filter.all") : enumText(value));
  return `<button class="fchip sm ${active ? "on" : ""}" type="button" data-fgroup="${key}" data-value="${esc(value)}" aria-pressed="${active}">${esc(text)}${count}</button>`;
}

function filterLineHTML(item, label, key, values) {
  return `<div class="filter-line">
    <span class="filter-label">${label}</span>
    ${values.map((value) => filterChipHTML(item, key, value)).join("")}
  </div>`;
}

function filtersHTML(item) {
  const seasons = [...new Set(item.offers.map((offerItem) => offerItem.season).filter(Boolean))].sort().reverse();
  const regions = [...new Set(item.offers.map((offerItem) => PROVIDERS[offerItem.pid] && PROVIDERS[offerItem.pid].region).filter(Boolean))];
  const tiers = [...new Set(item.offers.map((offerItem) => offerItem.tier))];
  const qualities = ["4K", "1080P", "HDR"].filter((quality) => item.offers.some((offerItem) => offerItem.quality.includes(quality)));

  let rows = "";
  if (seasons.length > 1) rows += filterLineHTML(item, t("filter.season"), "season", ["全部", ...seasons]);
  rows += filterLineHTML(item, t("filter.region"), "region", ["全部", ...regions]);
  rows += filterLineHTML(item, t("filter.tier"), "tier", ["全部", ...tiers]);
  if (qualities.length) rows += filterLineHTML(item, t("filter.quality"), "quality", ["全部", ...qualities]);
  return `<div class="offer-filters">${rows}</div>`;
}

function detailHTML(item, related = []) {
  const verified = item.offers.filter((offerItem) => offerItem.verified).length;
  const length = item.seasons ? t("detail.seasonN", { n: item.seasons }) : item.runtime;

  return `<div class="detail-page">
    <section class="detail-hero">
      <div class="dh-poster">${posterHTML(item)}</div>
      <div class="dh-main">
        <p class="dh-kicker">${esc(enumText(item.type))} · ${item.year}</p>
        <div class="dh-head"><h1>${esc(item.title)}</h1></div>
        <p class="dh-original">${esc(item.original)}</p>
        <div class="dh-meta">
          <span class="rating"><span class="star">★</span>${item.rating.toFixed(1)}</span>
          <span class="divider"></span>
          <span>${item.year}</span>
          <span>${esc(enumText(item.type))}</span>
          ${length ? `<span>${esc(length)}</span>` : ""}
        </div>
        <div class="dh-actions">
          ${favWideHTML(item)}
          <button class="quiet-btn" type="button" data-share="${esc(item.id)}">${t("detail.share")}</button>
        </div>
        <div class="external-links">
          <a href="https://search.douban.com/movie/subject_search?search_text=${encodeURIComponent(item.title)}" target="_blank" rel="noopener noreferrer nofollow">豆瓣</a>
          <a href="https://www.imdb.com/find/?q=${encodeURIComponent(item.original)}" target="_blank" rel="noopener noreferrer nofollow">IMDb</a>
          <a href="https://www.themoviedb.org/search?query=${encodeURIComponent(item.original)}" target="_blank" rel="noopener noreferrer nofollow">TMDB</a>
          <a href="${esc(searchURL(item.title))}">${t("detail.panSearch")}</a>
        </div>
        <p class="dh-synopsis">${esc(item.synopsis)}</p>
        <div class="tags">${item.genres.map((genre) => `<span class="tag">${esc(genre)}</span>`).join("")}</div>
      </div>
    </section>

    <div class="detail-body">
      <div class="detail-col">
        <section class="content-section">
          <div class="section-head">
            <div>
              <h2>${t("detail.channels")}</h2>
              <p class="sub">${t("detail.channelsSub", { total: item.offers.length, verified })}</p>
            </div>
            <label class="switch">
              <input type="checkbox" id="only-verified">
              <span class="track"><span class="thumb"></span></span>
              <span>${t("detail.onlyVerified")}</span>
            </label>
          </div>
          ${filtersHTML(item)}
          <div id="offer-groups"></div>
          <p class="offer-note">${t("detail.priceNote", { name: BRAND.name })}</p>
        </section>

        ${related.length ? `<section class="section">
          <div class="section-head">
            <div>
              <h2>${t("detail.related")}</h2>
              <p class="sub">${t("detail.relatedSub")}</p>
            </div>
          </div>
          <div class="similar-grid">
            ${related.map((candidate) => `<a class="sim-card" href="/title/${encodeURIComponent(candidate.id)}">
              ${posterHTML(candidate)}
              <p class="sim-title">${esc(candidate.title)}</p>
              <p class="sim-meta">${candidate.year} · ${esc(enumText(candidate.type))}</p>
            </a>`).join("")}
          </div>
        </section>` : ""}
      </div>
    </div>
  </div>`;
}

function offerHTML(offerItem, item) {
  const provider = PROVIDERS[offerItem.pid] || {
    name: offerItem.pid,
    short: "?",
    color: "#6b7280",
    fg: "#fff"
  };
  const season = offerItem.season ? t("detail.seasonN", { n: parseInt(offerItem.season.slice(1), 10) }) : "";
  return `<a class="offer" href="${esc(offerItem.clickUrl || providerURL(offerItem, item))}" target="_blank" rel="noopener noreferrer nofollow">
    <span class="provider-logo" style="--pc:${provider.color};--pf:${provider.fg}">${esc(provider.short)}</span>
    <span class="offer-main">
      <span class="offer-title">${esc(provider.name)}<span class="sep">·</span><span class="tier">${esc(enumText(offerItem.tier))}</span>
        ${offerItem.quality.map((quality) => `<span class="badge">${esc(enumText(quality))}</span>`).join("")}
      </span>
      <span class="offer-meta">
        ${season ? `<span>${season}</span><span class="sep"></span>` : ""}
        <span class="verified ${offerItem.verified ? "" : "pending"}">${offerItem.verified ? t("offer.verified") : t("offer.pending")}</span>
      </span>
    </span>
    <span class="offer-price">${esc(enumText(offerItem.price))}</span>
    <span class="offer-cta">${offerItem.verified ? t("offer.watch") : t("offer.check")} ↗</span>
  </a>`;
}

function offerGroupHTML(title, list, alive, item) {
  return `<div class="offer-group">
    <div class="offer-group-head"><span class="dot ${alive ? "" : "dead"}"></span>${title}<span class="count">${String(list.length).padStart(2, "0")}</span></div>
    ${list.map((offerItem) => offerHTML(offerItem, item)).join("")}
  </div>`;
}

function renderOffers() {
  const item = state.current;
  const box = document.getElementById("offer-groups");
  if (!item || !box || !state.filters) return;
  const filters = state.filters;

  const list = item.offers.filter((offerItem) => {
    if (filters.verified && !offerItem.verified) return false;
    if (filters.season !== "全部" && offerItem.season !== filters.season) return false;
    if (filters.region !== "全部" && (!PROVIDERS[offerItem.pid] || PROVIDERS[offerItem.pid].region !== filters.region)) return false;
    if (filters.tier !== "全部" && offerItem.tier !== filters.tier) return false;
    if (filters.quality !== "全部" && !offerItem.quality.includes(filters.quality)) return false;
    return true;
  });

  if (!list.length) {
    box.innerHTML = `<div class="offer-empty">${t("offer.empty")}</div>`;
    return;
  }

  const online = list.filter((offerItem) => offerItem.verified);
  const pending = list.filter((offerItem) => !offerItem.verified);
  box.innerHTML =
    (online.length ? offerGroupHTML(t("offer.groupVerified"), online, true, item) : "") +
    (pending.length ? offerGroupHTML(t("offer.groupPending"), pending, false, item) : "");
}

async function renderDetail(id, query) {
  const token = ++state.routeToken;
  if (state.detailController) state.detailController.abort();
  const controller = new AbortController();
  state.detailController = controller;

  const initialQuery = (query || state.lastQuery || "").trim();
  if (initialQuery) state.lastQuery = initialQuery;
  document.title = t("detail.loadTitle", { name: BRAND.name });
  setRouteBusy(true);

  app.innerHTML = `<div class="view">
    ${headerHTML({ compact: true, query: initialQuery })}
    <main class="magazine-page detail-main" id="detail-main">${loadingHTML()}</main>
    ${footerHTML()}
  </div>`;
  window.scrollTo(0, 0);
  updateScrollState();

  let data;
  try {
    const result = await Promise.all([API.title(id, controller.signal), delay(900)]);
    data = result[0];
  } catch (err) {
    if (err.name === "AbortError" || token !== state.routeToken) return;
    setRouteBusy(false);
    if (err.status === 404) {
      renderNotFound(id);
      return;
    }
    renderLoadError(err, () => renderDetail(id, query));
    return;
  }
  if (token !== state.routeToken) return;
  setRouteBusy(false);

  const item = data.item;
  const related = data.related || [];
  state.current = item;
  if (item.id) state.byId.set(item.id, item);
  related.forEach((entry) => entry.id && state.byId.set(entry.id, entry));
  state.filters = { season: "全部", region: "全部", tier: "全部", quality: "全部", verified: false };

  const q = (query || state.lastQuery || item.title).trim();
  state.lastQuery = q;
  document.title = `${item.title} — ${BRAND.name}`;

  const input = document.querySelector("[data-search-input]");
  if (input && !input.value.trim()) {
    input.value = q;
    const submit = input.form ? input.form.querySelector('button[type="submit"]') : null;
    if (submit) submit.disabled = !q;
  }

  const main = document.getElementById("detail-main");
  if (!main) return;
  main.innerHTML = detailHTML(item, related);
  main.classList.add("view");
  renderOffers();
  updateScrollState();
}

/* ---------------- 我的片单 ---------------- */

function favCardHTML(record) {
  const rating = Number.isFinite(record.rating) && record.rating != null ? record.rating.toFixed(1) : "";
  return `<div class="result-shell">
    ${favButtonHTML(record)}
    <a class="result-card" href="/title/${encodeURIComponent(record.id)}">
      ${posterHTML(record)}
      <div class="card-body">
        <h3 class="card-title">${esc(record.title)}</h3>
        <p class="card-original">${esc(record.original || "")}</p>
        <div class="card-meta">
          ${rating ? `<span class="rating"><span class="star">★</span>${rating}</span><span class="divider"></span>` : ""}
          <span>${esc(record.year || "")}</span>
          <span>${esc(enumText(record.type))}</span>
        </div>
        <div class="card-foot">
          <span class="status">${t("list.status")}</span>
          <span class="card-cta">${t("list.cta")}</span>
        </div>
      </div>
    </a>
  </div>`;
}

async function renderFavorites(params) {
  const token = ++state.routeToken;
  const sharedIds = (params.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 60);
  const favs = readFavorites();
  const panFavs = readPanFavs();
  const totalFavs = favs.length + panFavs.length;

  document.title = t("list.docTitle", { name: BRAND.name });
  setRouteBusy(true);

  let sharedItems = [];
  if (sharedIds.length) {
    const settled = await Promise.all(
      sharedIds.map((id) => API.title(id).then((payload) => payload.item).catch(() => null))
    );
    sharedItems = settled.filter(Boolean);
  }
  if (token !== state.routeToken) return;
  sharedItems.forEach((item) => item.id && state.byId.set(item.id, item));
  setRouteBusy(false);

  const favCards = favs.map(favCardHTML).join("");
  const sharedCards = sharedItems.map(favCardHTML).join("");
  const subParts = [
    t("list.subBase", { n: totalFavs }),
    favs.length ? t("list.subTitles", { n: favs.length }) : "",
    panFavs.length ? t("list.subPan", { n: panFavs.length }) : "",
    totalFavs ? t("list.subWarn") : ""
  ].join("");

  app.innerHTML = `<div class="view">
    ${headerHTML({ compact: true, query: state.lastQuery })}
    <main class="magazine-page list-page">
      <div class="list-head">
        <div>
          <p class="list-kicker">${t("list.kicker")}</p>
          <h1 class="list-title">${t("list.heading")}</h1>
          <p class="list-sub">${subParts}</p>
        </div>
        ${favs.length ? `<div class="list-actions">
          <button class="quiet-btn" type="button" data-copy-list>${t("list.copyShare")}</button>
          <button class="quiet-btn" type="button" data-clear-favs>${t("list.clearTitles")}</button>
        </div>` : ""}
      </div>

      ${panFavs.length ? `<section class="shared-block pan-fav-block">
        <div class="shared-head">
          <div>
            <h2>${t("list.panHeading")}</h2>
            <p class="sub">${t("list.panSub", { n: panFavs.length })}</p>
          </div>
          <button class="quiet-btn" type="button" data-clear-pan-favs>${t("list.clearPan")}</button>
        </div>
        <div class="pan-results">${panFavs.map(panFavCardHTML).join("")}</div>
      </section>` : ""}

      ${favs.length ? `<div class="list-grid">${favCards}</div>` : ""}

      ${totalFavs ? "" : `<div class="empty">
            <h3>${t("list.emptyHead")}</h3>
            <p>${t("list.emptyBody")}</p>
            <div class="chips"><a class="chip" href="/">${t("list.emptyCta")}</a></div>
          </div>`}

      ${sharedItems.length ? `<section class="shared-block">
        <div class="shared-head">
          <div>
            <h2>${t("list.sharedHeading")}</h2>
            <p class="sub">${t("list.sharedSub", { n: sharedItems.length })}</p>
          </div>
          <button class="quiet-btn" type="button" data-import-ids="${esc(sharedIds.join(","))}">${t("list.importAll")}</button>
        </div>
        <div class="list-grid">${sharedCards}</div>
      </section>` : ""}
    </main>
    ${footerHTML()}
  </div>`;
  updateScrollState();
}

function renderNotFound(id) {
  document.title = t("notFound.title", { name: BRAND.name });
  app.innerHTML = `<div class="view">
    ${headerHTML({ compact: true, query: state.lastQuery })}
    <main class="magazine-page">
      <div class="empty">
        ${ICON_EMPTY}
        <h3>${t("notFound.head")}</h3>
        <p>${t("notFound.body", { id: esc(id) })}</p>
        <div class="chips"><a class="chip" href="/">${t("action.home")}</a></div>
      </div>
    </main>
    ${footerHTML()}
  </div>`;
  updateScrollState();
}

/* ---------------- router ---------------- */

function updateScrollState() {
  const head = document.querySelector(".sub-head");
  if (head) head.classList.toggle("is-scrolled", window.scrollY > 8);
  const backTop = document.getElementById("back-top");
  if (backTop) backTop.hidden = window.scrollY < 480;
}

let lastTrack = { key: "", at: 0 };

/** 匿名页面访问：把真实执行了 JS 的页面记进 D1，用来和 Cloudflare 的请求量对照。 */
function trackPage(pathname) {
  const path = pathname === "/" ? "/"
    : pathname === "/search" ? "/search"
    : pathname === "/list" ? "/list"
    : pathname.startsWith("/title/") ? "/title"
    : "";
  if (!path) return;
  const key = `${path}|${getLang()}`;
  const now = Date.now();
  if (key === lastTrack.key && now - lastTrack.at < 1500) return;
  lastTrack = { key, at: now };
  API.track({ kind: "page", path, lang: getLang() }).catch(() => {});
}

async function route() {
  state.routeToken += 1;
  if (state.detailController) state.detailController.abort();
  if (state.searchController) state.searchController.abort();
  state.retry = null;
  state.current = null;
  state.filters = null;
  setRouteBusy(false);
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  trackPage(pathname);
  const params = new URLSearchParams(location.search);

  if (pathname.startsWith("/title/")) {
    let id = "";
    try {
      id = decodeURIComponent(pathname.slice("/title/".length));
    } catch (err) {
      renderNotFound(id);
      return;
    }
    await renderDetail(id, params.get("q") || state.lastQuery);
  } else if (pathname === "/search") {
    const token = state.routeToken + 1;
    await renderPanResults(params);
    if (token === state.routeToken) window.scrollTo(0, 0);
  } else if (pathname === "/list") {
    const token = state.routeToken + 1;
    await renderFavorites(params);
    if (token === state.routeToken) window.scrollTo(0, 0);
  } else if (pathname.startsWith("/share/")) {
    let id = "";
    try {
      id = decodeURIComponent(pathname.slice("/share/".length));
    } catch (err) {
      id = "";
    }
    await renderShare(id);
    window.scrollTo(0, 0);
  } else if (pathname === "/") {
    renderHome();
    window.scrollTo(0, 0);
  } else {
    renderNotFound(pathname);
  }
}

/** 站内跳转统一走这里：pushState + 重新渲染，不刷新页面。 */
function navigate(url, { replace = false } = {}) {
  let target;
  try {
    target = new URL(url, location.origin);
  } catch (err) {
    return;
  }
  if (target.origin !== location.origin) {
    location.href = url;
    return;
  }
  const next = target.pathname + target.search;
  if (replace) history.replaceState(null, "", next);
  else if (next !== location.pathname + location.search) history.pushState(null, "", next);
  route();
}

/** 兼容旧的 #/ 链接：转成真实路径，保持老分享链接可用。 */
function adoptLegacyHash() {
  if (!location.hash.startsWith("#/")) return false;
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, queryString = ""] = raw.split("?");
  let next = "/";
  if (path.startsWith("title/")) next = `/title/${path.slice("title/".length)}`;
  else if (path.startsWith("search")) next = "/search";
  history.replaceState(null, "", `${next}${queryString ? `?${queryString}` : ""}`);
  return true;
}

/* ---------------- global events ---------------- */

document.addEventListener("click", async (event) => {
  const link = event.target.closest("a[href]");
  if (link && !link.target && !link.hasAttribute("download") && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
    const href = link.getAttribute("href");
    if (href && !href.startsWith("#") && !href.startsWith("mailto:")) {
      const url = new URL(href, location.origin);
      const internal = url.origin === location.origin
        && !url.pathname.startsWith("/go/")
        && !/\.(html|xml|txt|css|js)$/i.test(url.pathname);
      if (internal) {
        event.preventDefault();
        navigate(url.pathname + url.search);
        return;
      }
    }
  }

  // 搜索联想：点选项直达详情，点兜底行走网盘搜索
  const sugItem = event.target.closest("[data-suggest-index], [data-suggest-web]");
  if (sugItem) {
    event.preventDefault();
    const box = sugItem.closest(".search-box");
    const input = box ? box.querySelector("[data-search-input]") : null;
    const index = sugItem.dataset.suggestIndex !== undefined
      ? Number(sugItem.dataset.suggestIndex)
      : state.suggest.items.length;
    pickSuggest(input, index);
    return;
  }

  // 点击联想下拉以外的地方就收起
  if (state.suggest.items.length && !event.target.closest("[data-search-box]")) closeSuggest();

  // 返回顶部（按钮常驻 DOM，滚动超过一屏才出现）
  const backTop = event.target.closest("#back-top");
  if (backTop) {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  const action = event.target.closest("[data-action]");
  if (action) {
    const kind = action.dataset.action;
    if (kind === "theme") { toggleTheme(); return; }
    if (kind === "feedback") { openFeedback(); return; }
    if (kind === "lang") {
      setLang(getLang() === "zh" ? "en" : "zh");
      latestCache = null;
      route();
      return;
    }
    if (kind === "back") {
      if (history.length > 1 && document.referrer) history.back();
      else navigate("/");
      return;
    }
  }

  const reloadBtn = event.target.closest("[data-pan-reload]");
  if (reloadBtn) {
    if (reloadBtn.disabled) return;
    // 10 秒冷却：reload 会让 PanSou 把全部插件重跑一遍，连点等于自伤。
    state.panReloadCoolUntil = Date.now() + 10_000;
    reloadBtn.disabled = true;
    const params = new URLSearchParams(location.search);
    if (location.pathname === "/search") {
      await renderPanResults(params, { reload: true });
    }
    return;
  }

  const panFavBtn = event.target.closest("[data-pan-fav]");
  if (panFavBtn) {
    event.preventDefault();
    event.stopPropagation();
    const item = state.panById.get(panFavBtn.dataset.panFav);
    if (!item) { showToast(t("toast.panStale")); return; }
    const on = togglePanFav(item);
    showToast(on ? t("toast.favAdded", { title: item.title || t("share.fallback") }) : t("toast.favRemoved"));
    if (location.pathname === "/list") await renderFavorites(new URLSearchParams(location.search));
    return;
  }

  const panUnfavBtn = event.target.closest("[data-pan-unfav]");
  if (panUnfavBtn) {
    const id = panUnfavBtn.dataset.panUnfav;
    if (isPanFav(id)) togglePanFav({ id });
    showToast(t("toast.favRemoved"));
    await renderFavorites(new URLSearchParams(location.search));
    return;
  }

  const panCopyBtn = event.target.closest("[data-pan-copy]");
  if (panCopyBtn) {
    const url = safePanAnyURL(panCopyBtn.dataset.panUrl);
    if (!url) { showToast(t("toast.badLink")); return; }
    const password = panCopyBtn.dataset.panPassword;
    if (panCopyBtn.dataset.panCopy === "password") {
      if (password) await copyText(password, t("toast.codeCopied"));
    } else {
      await copyText(url, t("toast.linkCopied"));
    }
    return;
  }

  const favBtn = event.target.closest("[data-fav]");
  if (favBtn) {
    event.preventDefault();
    event.stopPropagation();
    const id = favBtn.dataset.fav;
    const item = state.byId.get(id) || { id, title: id };
    const added = toggleFavorite(item);
    showToast(added ? t("toast.favAdded", { title: item.title || id }) : t("toast.favRemoved"));
    if (location.pathname === "/list") await renderFavorites(new URLSearchParams(location.search));
    return;
  }

  const shareBtn = event.target.closest("[data-share]");
  if (shareBtn) {
    await copyText(`${location.origin}/title/${encodeURIComponent(shareBtn.dataset.share)}`, t("toast.titleLink"));
    return;
  }

  const copyListBtn = event.target.closest("[data-copy-list]");
  if (copyListBtn) {
    await copyText(shareURL(), t("toast.listLink"));
    return;
  }

  const clearBtn = event.target.closest("[data-clear-favs]");
  if (clearBtn) {
    const count = readFavorites().length;
    if (!count) return;
    if (!window.confirm(t("confirm.clearTitles", { n: count }))) return;
    writeFavorites([]);
    await renderFavorites(new URLSearchParams(location.search));
    showToast(t("toast.titlesCleared"));
    return;
  }

  const clearPanBtn = event.target.closest("[data-clear-pan-favs]");
  if (clearPanBtn) {
    const count = readPanFavs().length;
    if (!count) return;
    if (!window.confirm(t("confirm.clearPan", { n: count }))) return;
    writePanFavs([]);
    await renderFavorites(new URLSearchParams(location.search));
    showToast(t("toast.panCleared"));
    return;
  }

  const importBtn = event.target.closest("[data-import-ids]");
  if (importBtn) {
    const ids = importBtn.dataset.importIds.split(",").filter(Boolean);
    const list = readFavorites();
    let added = 0;
    ids.forEach((id) => {
      if (list.some((entry) => entry.id === id)) return;
      const item = state.byId.get(id);
      if (!item) return;
      list.unshift(favoriteRecord(item));
      added += 1;
    });
    if (added) writeFavorites(list);
    await renderFavorites(new URLSearchParams(location.search));
    showToast(added ? t("toast.imported", { n: added }) : t("toast.importNone"));
    return;
  }

  const retryBtn = event.target.closest("[data-retry]");
  if (retryBtn) {
    const retry = state.retry;
    state.retry = null;
    if (retry) retry();
    return;
  }

  const filterChip = event.target.closest(".fchip[data-fgroup]");
  if (filterChip) {
    const key = filterChip.dataset.fgroup;
    const value = filterChip.dataset.value;
    if (!state.filters) return;
    state.filters[key] = value;
    $$(`.fchip[data-fgroup="${key}"]`).forEach((chip) => {
      const isActive = chip === filterChip;
      chip.classList.toggle("on", isActive);
      chip.setAttribute("aria-pressed", String(isActive));
    });
    renderOffers();
    return;
  }

  const hotMore = event.target.closest("[data-hot-more]");
  if (hotMore) {
    expandHotChips();
    return;
  }

  const qChip = event.target.closest("[data-q]");
  if (qChip) {
    const q = qChip.dataset.q;
    state.lastQuery = q;
    navigate(searchURL(q));
  }
});

document.addEventListener("submit", (event) => {
  const pageForm = event.target.closest("form[data-pan-page-form]");
  if (pageForm) {
    event.preventDefault();
    if (!pageForm.reportValidity()) return;
    const input = pageForm.elements.page;
    const page = Number(input.value);
    if (!Number.isSafeInteger(page) || page < 1 || page > Number(input.max)) return;
    navigate(searchURL(pageForm.dataset.panQuery, pageForm.dataset.panType || "quark", page));
    return;
  }
  const form = event.target.closest("form[data-search]");
  if (!form) return;
  event.preventDefault();
  closeSuggest();
  const input = form.querySelector("[data-search-input]");
  const q = (input ? input.value : "").trim();
  if (!q) return;
  state.lastQuery = q;
  // 在结果页再次搜索时保留当前选中的网盘类型，回到首页则默认夸克。
  const type = location.pathname === "/search" ? panTypeOf(new URLSearchParams(location.search)) : "quark";
  navigate(searchURL(q, type));
});

document.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search-input]")) return;
  const form = event.target.closest("form");
  const button = form ? form.querySelector('button[type="submit"]') : null;
  if (button) button.disabled = !event.target.value.trim();
  scheduleSuggest(event.target);
});

document.addEventListener("change", (event) => {
  if (event.target.id === "only-verified" && state.filters) {
    state.filters.verified = event.target.checked;
    renderOffers();
  }
});

window.addEventListener("scroll", updateScrollState, { passive: true });

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

  // 联想下拉键盘导航：↑↓ 选择，Enter 确认，Esc 收起
  const searchInput = target && target.matches && target.matches("[data-search-input]") ? target : null;
  if (searchInput && suggestOpen()) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveSuggest(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter" && state.suggest.active >= 0) {
      event.preventDefault();
      pickSuggest(searchInput, state.suggest.active);
      return;
    }
  }
  if (event.key === "Escape" && suggestOpen()) {
    closeSuggest();
    return;
  }

  if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
    const input = document.querySelector("[data-search-input]");
    if (input) {
      event.preventDefault();
      input.focus();
      input.select();
    }
  }
});

/* ---------------- feedback ---------------- */

const feedbackDialog = document.getElementById("feedback-dialog");
const feedbackForm = document.getElementById("feedback-form");

function openFeedback() {
  if (!feedbackDialog) return;
  if (!feedbackDialog.open) feedbackDialog.showModal();
  const area = feedbackDialog.querySelector("textarea");
  if (area) setTimeout(() => area.focus(), 40);
}

if (feedbackDialog) {
  feedbackDialog.addEventListener("click", (event) => {
    if (event.target === feedbackDialog) feedbackDialog.close();
    if (event.target.closest("[data-close-dialog]")) feedbackDialog.close();
  });
}

if (feedbackForm) {
  feedbackForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const area = feedbackForm.querySelector('textarea[name="message"]');
    const message = area ? area.value.trim() : "";
    if (message.length < 2) {
      showToast(t("toast.tooShort"));
      if (area) area.focus();
      return;
    }

    const contactInput = feedbackForm.querySelector('input[name="contact"]');
    const website = feedbackForm.querySelector('input[name="website"]');
    const button = feedbackForm.querySelector('button[type="submit"]');
    if (button) {
      button.disabled = true;
      button.textContent = t("feedback.sending");
    }

    try {
      await API.feedback({
        message,
        contact: contactInput ? contactInput.value.trim() : "",
        website: website ? website.value : ""
      });
      feedbackDialog.close();
      feedbackForm.reset();
      showToast(t("toast.feedbackSent"));
    } catch (err) {
      showToast(friendlyError(err));
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = t("feedback.send");
      }
    }
  });
}

/* ---------------- boot ---------------- */

let booted = false;

// CSP 是 script-src 'self'，不能用内联 onerror；error 不冒泡，所以在捕获阶段统一兜住加载失败的外部海报，
// 移除图片并摘掉 has-img，让底下的程序化海报重新露出来。
document.addEventListener("error", (event) => {
  const el = event.target;
  if (!el || el.tagName !== "IMG" || !el.classList.contains("poster-img")) return;
  const box = el.parentElement;
  el.remove();
  if (box) box.classList.remove("has-img");
}, true);

async function init() {
  initTheme();
  if (!booted) {
    window.addEventListener("popstate", route);
    booted = true;
  }
  adoptLegacyHash();
  const token = state.routeToken;
  // 搜索页只依赖 PanSou，不依赖影视片库 / D1 是否可用。
  if (location.pathname.replace(/\/+$/, "") === "/search") route();
  try {
    const boot = await API.bootstrap();
    if (boot.brand) BRAND = Object.assign(BRAND, boot.brand);
    PROVIDERS = boot.providers || {};
    BOOT = boot;
    try {
      const all = await API.search({ limit: 50 });
      BOOT.all = all.items || [];
    } catch (err) {
      BOOT.all = boot.hot || [];
    }
    if (token === state.routeToken) await route();
  } catch (err) {
    if (token === state.routeToken) renderBootError(err);
  }
}

const initialQuery = new URLSearchParams(location.search).get("q");
if (initialQuery && location.pathname === "/") {
  history.replaceState(null, "", searchURL(initialQuery));
}

init();

/* ---------------- 片库分享页（/share/:id） ---------------- */

function shareCardHTML(entry) {
  const url = typeof entry.link === "string" ? entry.link : "";
  const password = typeof entry.password === "string" ? entry.password : "";
  const meta = [entry.year, entry.kind, entry.rating ? `★ ${Number(entry.rating).toFixed(1)}` : ""].filter(Boolean).map(esc).join(" · ");
  return `<article class="share-card">
    <div class="share-card-head"><h3>${esc(entry.title)}</h3><p>${meta}</p></div>
    <div class="share-card-meta"><span class="tag">${esc(panTypeLabel(entry.pan))}</span></div>
    <p class="share-card-url">${url ? esc(url) : "暂无链接"}</p>
    ${password ? `<p class="share-card-code">提取码 <code>${esc(password)}</code></p>` : ""}
    <div class="share-card-actions">
      ${url ? `<a class="chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">打开链接</a>
        <button class="quiet-btn" type="button" data-pan-copy="link" data-pan-url="${esc(url)}">复制链接</button>
        ${password ? `<button class="quiet-btn" type="button" data-pan-copy="password" data-pan-url="${esc(url)}" data-pan-password="${esc(password)}">复制提取码</button>` : ""}` : ""}
    </div>
  </article>`;
}

async function renderShare(id) {
  const token = state.routeToken;
  document.title = `片库分享 — ${BRAND.name}`;
  app.innerHTML = `<div class="view">
    ${headerHTML({ compact: true })}
    <main class="share-main">
      <header class="share-top">
        <span class="share-kicker">SHARED LIBRARY</span>
        <h1>片库分享</h1>
        <p>由 ${esc(BRAND.name)} 整理的一份网盘资源。</p>
      </header>
      <div id="share-body"><p class="share-loading">正在载入…</p></div>
    </main>
    ${footerHTML()}
  </div>`;
  updateScrollState();
  let item = null;
  let error = "";
  let notFound = false;
  try {
    const data = await API.catalogItem(id);
    item = data && data.item ? data.item : null;
  } catch (err) {
    if (err && err.status === 404) notFound = true;
    else error = err && err.message ? err.message : "加载失败";
  }
  if (token !== state.routeToken) return;
  const body = document.getElementById("share-body");
  if (!body) return;
  if (notFound || !item) {
    body.innerHTML = `<div class="empty" role="status"><h3>分享不存在</h3><p>链接可能有误，或该分享已被移除。</p><a class="chip" href="/">回到首页</a></div>`;
    return;
  }
  if (error) {
    body.innerHTML = `<div class="empty" role="alert"><h3>加载失败</h3><p>${esc(error)}</p></div>`;
    return;
  }
  body.innerHTML = `<div class="share-grid">${shareCardHTML(item)}</div>`;
  updateScrollState();
}

