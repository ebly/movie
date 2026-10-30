/* 映途 i18n：界面文案的中英两套。片名、简介、价格等片库内容保持原文，不做翻译。 */
"use strict";

const LANG_KEY = "yingtu-lang";
const LANG_META = { zh: "zh-CN", en: "en" };

const ZH = {
  "brand.homeAria": "{name} 首页",
  "brand.note": "影视索引与公开分享搜索",
  "foot.tagline": "影视索引与公开分享搜索 · 不存储任何影片或网盘文件",

  "action.back": "返回",
  "action.theme": "切换深浅色",
  "action.feedback": "留句话",
  "action.lang": "切换到英文",
  "action.retry": "重试",
  "action.home": "回到首页",
  "action.copy": "复制",

  "fav.link": "收藏",
  "fav.linkAria": "我的收藏",
  "fav.add": "加入收藏",
  "fav.remove": "取消收藏",
  "fav.saved": "已收藏",
  "fav.panAdd": "收藏这条分享",

  "search.label": "搜索网盘公开分享关键词",
  "search.submit": "搜索",
  "search.suggestWeb": "在网盘搜「{q}」",

  "home.lead": "想看什么？",
  "home.accent": "直接搜",
  "home.docTitle": "{name} — 影视索引与公开分享搜索",
  "home.featuredAria": "最新电影",
  "home.foot": "{name} · 影视条目与网盘公开分享搜索，不存储任何影片或网盘文件",
  "home.hot": "大家都在搜",
  "home.hotMore": "展开更多",
  "home.hotMoreAria": "展开更多热门搜索",
  "poster.alt": "《{title}》海报",

  "boot.preparing": "正在准备映途…",
  "noscript": "映途需要 JavaScript 才能搜索，请开启后重试。",
  "backTop": "返回顶部",

  "err.network": "连接不到服务端。请确认已在项目目录运行 npm start（或 npx wrangler dev），然后访问对应地址。",
  "err.generic": "请稍后重试。",
  "err.loadTitle": "加载失败 — {name}",
  "err.loadHead": "没有连上服务端",
  "err.bootTitle": "{name} — 启动失败",
  "err.bootHead": "服务端还没有启动",
  "err.rateLimited": "请求太频繁，请稍后再试。",
  "err.busy": "当前搜索任务较多，请稍后再试。",
  "err.queryRequired": "请输入搜索关键词。",
  "err.invalidQuery": "关键词最多 120 个字符，且不能包含控制字符。",
  "err.panUnconfigured": "服务端还没有配置网盘搜索，请稍后再试。",
  "err.panTimeout": "网盘搜索超时，请稍后再试。",
  "err.panUnreachable": "连接不到网盘搜索服务，请稍后再试。",
  "err.panAuth": "网盘搜索服务认证失败，请联系站点维护者。",
  "err.panFormat": "网盘搜索服务返回了异常结果，请稍后再试。",
  "err.panTooLarge": "结果太大，请换更具体的关键词。",

  "pan.quark": "夸克",
  "pan.baidu": "百度",
  "pan.xunlei": "迅雷",
  "pan.aliyun": "阿里",
  "pan.type": "网盘",
  "pan.unnamed": "未命名公开分享",
  "pan.noTitle": "未提供标题",
  "pan.noTime": "未提供时间",
  "pan.localTime": "{time}（本地时间）",
  "pan.source": "来源：",
  "pan.noSource": "未提供来源",
  "pan.sourceTime": "来源时间：",
  "pan.badUrl": "链接格式不符合要求，已禁用打开与复制",
  "pan.code": "提取码：",
  "pan.noCode": "未提供",
  "pan.open": "打开分享 ↗",
  "pan.copyLink": "复制链接",
  "pan.copyCode": "复制提取码",
  "pan.urlMismatch": "链接与该网盘类型不匹配，已禁用打开与复制",
  "pan.tabsAria": "按网盘类型筛选",
  "pan.prev": "上一页",
  "pan.next": "下一页",
  "pan.pageAria": "第 {page} 页",
  "pan.paginationAria": "网盘搜索结果分页",
  "pan.jumpPrefix": "第",
  "pan.jumpSuffix": "/ {pages} 页",
  "pan.jumpGo": "跳转",
  "pan.pageNote": "每页 {limit} 条 · 页数按当前已返回的结果计算，不代表全部公开来源。",
  "pan.reload": "重新获取",
  "pan.reloadNote": "手动跳过本站短缓存，不刷新上游；不会自动重试或轮询。",
  "pan.docTitle": "网盘资源 — {name}",
  "pan.docTitleQ": "{q} — 网盘资源 — {name}",
  "pan.emptyQueryHead": "请输入搜索关键词",
  "pan.emptyQueryBody": "输入名称或其他关键词，再点击搜索。",
  "pan.searching": "正在搜索公开分享…",
  "pan.reloading": "正在重新获取公开分享…",
  "pan.errorHead": "搜索暂未成功",
  "pan.retryPage": "重试本页",
  "pan.backPrev": "返回上一页",
  "pan.sumTotal": "{type}结果总数 {total} 条",
  "pan.sumPage": "本页 {n} 条",
  "pan.sumCached": "本站缓存命中",
  "pan.sumUncached": "未命中本站缓存",
  "pan.sumTook": "请求耗时 {ms} ms",
  "pan.sumComplete": "上游报告来源已完成（未验证内容）",
  "pan.sumPartial": "上游未提供完成标记，结果可能不完整",
  "pan.noPageResults": "当前页没有结果",
  "pan.noTypeResults": "暂未找到{type}公开分享",
  "pan.emptyHintDone": "可换关键词或切换上面的网盘类型，也可以手动重新获取。",
  "pan.emptyHintOpen": "尚不能断定所有来源都没有结果；可换关键词、切换类型，或手动重新获取。",
  "pan.backFirst": "返回第一页",
  "fallback.top": "不如试试站内评分最高的",
  "fallback.hot": "大家都在搜",

  "detail.loadTitle": "正在整理观看渠道 — {name}",
  "detail.loadHead": "正在为你整理观看渠道…",
  "detail.loadSub": "通常几秒 · 正好去倒杯水",
  "detail.step1": "匹配作品元数据",
  "detail.step2": "核对正版渠道",
  "detail.step3": "比价与画质",
  "detail.step4": "校验片源可用性",
  "detail.share": "分享",
  "detail.panSearch": "搜索网盘公开分享 →",
  "detail.channels": "观看渠道",
  "detail.channelsSub": "共 {total} 个 · {verified} 个已验证可看",
  "detail.onlyVerified": "仅显示可看",
  "detail.priceNote": "价格为演示数据，跳转后以平台实际页面为准。{name}不存储任何影片，只负责把正版入口找齐。",
  "detail.related": "相似作品",
  "detail.relatedSub": "根据类型与题材推荐",
  "detail.seasonN": "第 {n} 季",
  "offer.verified": "已验证",
  "offer.pending": "待确认",
  "offer.watch": "去观看",
  "offer.check": "去确认",
  "offer.empty": "当前筛选下没有渠道，试试放宽条件。",
  "offer.groupVerified": "已验证可看",
  "offer.groupPending": "待确认",
  "notFound.title": "没有找到这部作品 — {name}",
  "notFound.head": "这部作品不在演示片库里",
  "notFound.body": "编号 {id} 没有对应数据，回到首页重新搜索吧。",

  "filter.all": "全部",
  "filter.season": "季",
  "filter.region": "地区",
  "filter.tier": "方式",
  "filter.quality": "画质",

  "list.status": "已收藏",
  "list.cta": "查看渠道 →",
  "list.docTitle": "我的收藏 — {name}",
  "list.kicker": "只保存在这台设备的浏览器里",
  "list.heading": "我的收藏",
  "list.subBase": "共 {n} 项",
  "list.subTitles": " · 作品 {n} 部",
  "list.subPan": " · 网盘分享 {n} 条",
  "list.subWarn": " · 换浏览器或清缓存会丢失",
  "list.copyShare": "复制分享链接",
  "list.clearTitles": "清空作品",
  "list.panHeading": "网盘分享收藏",
  "list.panSub": "共 {n} 条 · 链接与提取码只存在这台设备",
  "list.clearPan": "清空分享",
  "list.emptyHead": "还没有收藏",
  "list.emptyBody": "搜索结果卡片右上角有个心形，点一下就会存到这台设备的浏览器里；再点一次取消。",
  "list.emptyCta": "去看看首页推荐",
  "list.sharedHeading": "别人分享的片单",
  "list.sharedSub": "共 {n} 部，只有你点了才会存进自己的片单",
  "list.importAll": "全部加入片单",

  "toast.storageFull": "浏览器存储已满，收藏没有保存",
  "toast.copyFailed": "复制失败，请手动选择并复制页面上的链接或提取码",
  "toast.copyIncomplete": "复制未完成",
  "toast.favAdded": "已收藏 · {title}",
  "toast.favRemoved": "已取消收藏",
  "toast.panStale": "这条分享的信息已失效，请重新搜索",
  "toast.badLink": "链接格式不符合要求，不能复制",
  "toast.codeCopied": "提取码已复制",
  "toast.linkCopied": "分享链接已复制",
  "toast.titleLink": "作品链接已复制",
  "toast.listLink": "片单链接已复制，发给朋友就能一起看",
  "confirm.clearTitles": "确定清空 {n} 部作品收藏吗？清空后只能用分享链接找回。",
  "toast.titlesCleared": "作品收藏已清空",
  "confirm.clearPan": "确定清空 {n} 条网盘分享收藏吗？链接与提取码将一并删除。",
  "toast.panCleared": "分享收藏已清空",
  "toast.imported": "已加入 {n} 部",
  "toast.importNone": "这些都已经在你的片单里了",
  "toast.tooShort": "再多写两个字吧",
  "toast.feedbackSent": "收到，谢谢你的留言",
  "share.fallback": "这条分享",

  "api.needStart": "请先在项目目录运行 npm start，再访问 http://127.0.0.1:4173",
  "api.httpError": "请求失败（HTTP {status}）",
  "api.queryRequired": "请输入网盘资源搜索关键词。",
  "api.badOffset": "分页位置无效。",
  "api.panFormat": "网盘搜索响应或分页格式异常，请稍后重试。",

  "feedback.kicker": "想看的，都可以说",
  "feedback.title": "给我们留句话",
  "feedback.close": "关闭反馈窗口",
  "feedback.copy": "无论是补片建议、筛选体验还是页面问题，都欢迎直接写在这里。",
  "feedback.msgLabel": "留言内容",
  "feedback.msgPlaceholder": "比如：希望能按“已有会员的平台”筛选……",
  "feedback.contactLabel": "联系方式",
  "feedback.optional": "选填",
  "feedback.contactPlaceholder": "邮箱或其他联系方式",
  "feedback.note": "演示环境 · 留言只保存在本地服务端",
  "feedback.sending": "发送中…",
  "feedback.send": "发送",

  "enum.电影": "电影",
  "enum.剧集": "剧集",
  "enum.动画": "动画",
  "enum.纪录片": "纪录片",
  "enum.订阅": "订阅",
  "enum.购买": "购买",
  "enum.租赁": "租赁",
  "enum.免费": "免费",
  "enum.中字": "中字",
  "enum.中国大陆": "中国大陆",
  "enum.海外": "海外",
  "enum.含在订阅": "含在订阅"
};

const EN = {
  "brand.homeAria": "{name} home",
  "brand.note": "Movie index & public share search",
  "foot.tagline": "Movie index & public share search · hosts no video or cloud files",

  "action.back": "Back",
  "action.theme": "Toggle theme",
  "action.feedback": "Leave a note",
  "action.lang": "Switch to Chinese",
  "action.retry": "Retry",
  "action.home": "Back home",
  "action.copy": "Copy",

  "fav.link": "Saved",
  "fav.linkAria": "My saved items",
  "fav.add": "Save",
  "fav.remove": "Unsave",
  "fav.saved": "Saved",
  "fav.panAdd": "Save this share",

  "search.label": "Search public cloud-drive shares",
  "search.submit": "Search",
  "search.suggestWeb": "Search cloud drives for “{q}”",

  "home.lead": "Looking for something?",
  "home.accent": "Just search",
  "home.docTitle": "{name} — movie index & public share search",
  "home.featuredAria": "Latest titles",
  "home.foot": "{name} · Movie metadata and public share search. No files are hosted.",
  "home.hot": "Trending searches",
  "home.hotMore": "Show more",
  "home.hotMoreAria": "Show more trending searches",
  "poster.alt": "{title} poster",

  "boot.preparing": "Preparing Yingtu…",
  "noscript": "Yingtu needs JavaScript to search. Enable it and reload.",
  "backTop": "Back to top",

  "err.network": "Can't reach the server. Start it with npm start (or npx wrangler dev), then reload this page.",
  "err.generic": "Please try again later.",
  "err.loadTitle": "Load failed — {name}",
  "err.loadHead": "Can't reach the server",
  "err.bootTitle": "{name} — Startup failed",
  "err.bootHead": "The server isn't running yet",
  "err.rateLimited": "Too many requests. Please wait a moment.",
  "err.busy": "Many searches are running right now. Try again shortly.",
  "err.queryRequired": "Enter a search term.",
  "err.invalidQuery": "Keywords are limited to 120 characters.",
  "err.panUnconfigured": "Cloud-drive search isn't configured on the server yet.",
  "err.panTimeout": "Cloud-drive search timed out. Try again.",
  "err.panUnreachable": "Can't reach the cloud-drive search service.",
  "err.panAuth": "Cloud-drive search authentication failed.",
  "err.panFormat": "The cloud-drive service returned an unexpected response.",
  "err.panTooLarge": "Too much data. Try a more specific keyword.",

  "pan.quark": "Quark",
  "pan.baidu": "Baidu",
  "pan.xunlei": "Xunlei",
  "pan.aliyun": "Alipan",
  "pan.type": "Cloud drive",
  "pan.unnamed": "Untitled public share",
  "pan.noTitle": "No title",
  "pan.noTime": "No timestamp",
  "pan.localTime": "{time} (local time)",
  "pan.source": "Source: ",
  "pan.noSource": "No source",
  "pan.sourceTime": "Shared: ",
  "pan.badUrl": "Link failed the format check; opening and copying are disabled",
  "pan.code": "Code: ",
  "pan.noCode": "None",
  "pan.open": "Open share ↗",
  "pan.copyLink": "Copy link",
  "pan.copyCode": "Copy code",
  "pan.urlMismatch": "Link doesn't match this drive type; opening and copying are disabled",
  "pan.tabsAria": "Filter by cloud drive",
  "pan.prev": "Previous",
  "pan.next": "Next",
  "pan.pageAria": "Page {page}",
  "pan.paginationAria": "Search result pages",
  "pan.jumpPrefix": "Page",
  "pan.jumpSuffix": "of {pages}",
  "pan.jumpGo": "Go",
  "pan.pageNote": "{limit} per page · page count reflects returned results, not every public source.",
  "pan.reload": "Fetch again",
  "pan.reloadNote": "Skips the site cache only; the upstream isn't refreshed. No auto retry or polling.",
  "pan.docTitle": "Cloud-drive results — {name}",
  "pan.docTitleQ": "{q} — Cloud-drive results — {name}",
  "pan.emptyQueryHead": "Enter a search term",
  "pan.emptyQueryBody": "Type a title or keyword, then hit search.",
  "pan.searching": "Searching public shares…",
  "pan.reloading": "Fetching public shares again…",
  "pan.errorHead": "Search didn't finish",
  "pan.retryPage": "Retry this page",
  "pan.backPrev": "Back to previous page",
  "pan.sumTotal": "{type}: {total} results",
  "pan.sumPage": "{n} on this page",
  "pan.sumCached": "served from site cache",
  "pan.sumUncached": "not cached",
  "pan.sumTook": "took {ms} ms",
  "pan.sumComplete": "upstream reports all sources finished (content unverified)",
  "pan.sumPartial": "upstream sent no completion flag; results may be partial",
  "pan.noPageResults": "No results on this page",
  "pan.noTypeResults": "No {type} public shares found",
  "pan.emptyHintDone": "Try another keyword, switch drive type above, or fetch again manually.",
  "pan.emptyHintOpen": "Some sources may still be running. Try another keyword, switch type, or fetch again.",
  "pan.backFirst": "Back to first page",
  "fallback.top": "Try our highest-rated titles",
  "fallback.hot": "Trending searches",

  "detail.loadTitle": "Finding where to watch — {name}",
  "detail.loadHead": "Finding where to watch…",
  "detail.loadSub": "Usually a few seconds · good time for a sip of water",
  "detail.step1": "Matching title metadata",
  "detail.step2": "Checking official stores",
  "detail.step3": "Comparing price and quality",
  "detail.step4": "Verifying availability",
  "detail.share": "Share",
  "detail.panSearch": "Search public shares →",
  "detail.channels": "Where to watch",
  "detail.channelsSub": "{total} offers · {verified} verified",
  "detail.onlyVerified": "Verified only",
  "detail.priceNote": "Prices are demo data; the store page is authoritative. {name} hosts no video — it only collects official entry points.",
  "detail.related": "Similar titles",
  "detail.relatedSub": "Picked by genre and theme",
  "detail.seasonN": "Season {n}",
  "offer.verified": "Verified",
  "offer.pending": "Unconfirmed",
  "offer.watch": "Watch",
  "offer.check": "Check",
  "offer.empty": "No offers match these filters. Try loosening them.",
  "offer.groupVerified": "Verified",
  "offer.groupPending": "Unconfirmed",
  "notFound.title": "Title not found — {name}",
  "notFound.head": "This title isn't in the demo catalog",
  "notFound.body": "No data for ID {id}. Head back home and search again.",

  "filter.all": "All",
  "filter.season": "Season",
  "filter.region": "Region",
  "filter.tier": "Access",
  "filter.quality": "Quality",

  "list.status": "Saved",
  "list.cta": "View offers →",
  "list.docTitle": "Saved — {name}",
  "list.kicker": "Stored only in this browser",
  "list.heading": "Saved",
  "list.subBase": "{n} items",
  "list.subTitles": " · {n} titles",
  "list.subPan": " · {n} shares",
  "list.subWarn": " · lost if you switch browsers or clear cache",
  "list.copyShare": "Copy share link",
  "list.clearTitles": "Clear titles",
  "list.panHeading": "Saved shares",
  "list.panSub": "{n} items · links and codes stay on this device",
  "list.clearPan": "Clear shares",
  "list.emptyHead": "Nothing saved yet",
  "list.emptyBody": "Tap the heart on a result card to store it in this browser. Tap again to remove.",
  "list.emptyCta": "See home picks",
  "list.sharedHeading": "A shared list",
  "list.sharedSub": "{n} titles · nothing is saved unless you tap",
  "list.importAll": "Import all",

  "toast.storageFull": "Browser storage is full; nothing was saved",
  "toast.copyFailed": "Copy failed — select and copy the link or code manually",
  "toast.copyIncomplete": "Copy didn't complete",
  "toast.favAdded": "Saved · {title}",
  "toast.favRemoved": "Removed",
  "toast.panStale": "This share is gone. Search again.",
  "toast.badLink": "Link failed the format check; can't copy",
  "toast.codeCopied": "Code copied",
  "toast.linkCopied": "Share link copied",
  "toast.titleLink": "Title link copied",
  "toast.listLink": "List link copied — send it to friends",
  "confirm.clearTitles": "Clear all {n} saved titles? You can only restore them from a share link.",
  "toast.titlesCleared": "Saved titles cleared",
  "confirm.clearPan": "Clear all {n} saved shares? Links and codes will be deleted too.",
  "toast.panCleared": "Saved shares cleared",
  "toast.imported": "Added {n} titles",
  "toast.importNone": "They're already in your list",
  "toast.tooShort": "A couple more characters, please",
  "toast.feedbackSent": "Thanks — we got your note",
  "share.fallback": "this share",

  "api.needStart": "Start the project with npm start, then open http://127.0.0.1:4173",
  "api.httpError": "Request failed (HTTP {status})",
  "api.queryRequired": "Enter a keyword to search public shares.",
  "api.badOffset": "Invalid page position.",
  "api.panFormat": "The search response or pagination looked wrong. Try again later.",

  "feedback.kicker": "Tell us what you want to watch",
  "feedback.title": "Leave us a note",
  "feedback.close": "Close feedback",
  "feedback.copy": "Requests, filtering feedback, or page issues — write them all here.",
  "feedback.msgLabel": "Message",
  "feedback.msgPlaceholder": "e.g. filter by the platforms I already subscribe to…",
  "feedback.contactLabel": "Contact",
  "feedback.optional": "optional",
  "feedback.contactPlaceholder": "Email or other contact",
  "feedback.note": "Demo · notes are stored on the local server only",
  "feedback.sending": "Sending…",
  "feedback.send": "Send",

  "enum.电影": "Movie",
  "enum.剧集": "Series",
  "enum.动画": "Animation",
  "enum.纪录片": "Documentary",
  "enum.订阅": "Subscription",
  "enum.购买": "Buy",
  "enum.租赁": "Rent",
  "enum.免费": "Free",
  "enum.中字": "Subtitled",
  "enum.中国大陆": "Mainland China",
  "enum.海外": "Overseas",
  "enum.含在订阅": "Included"
};

const MESSAGES = { zh: ZH, en: EN };
const LANGS = Object.keys(MESSAGES);

let currentLang = readStoredLang();

function readStoredLang() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch (err) {
    // 隐私模式下拿不到 localStorage，按中文处理
  }
  return "zh";
}

function getLang() {
  return currentLang;
}

/** 当前语言的 BCP 47 标记，给 <html lang> 和日期格式化用。 */
function langTag() {
  return LANG_META[currentLang] || LANG_META.zh;
}

/** 词表查不到就退回中文，再退回 key，避免界面出现空白。 */
function t(key, vars) {
  const table = MESSAGES[currentLang] || ZH;
  const raw = table[key] || ZH[key] || key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => (vars[name] == null ? match : String(vars[name])));
}

/** 数据枚举（电影/剧集、订阅、中字……），未知值原样返回。 */
function enumText(value) {
  if (value == null || value === "") return "";
  const key = `enum.${value}`;
  const table = MESSAGES[currentLang];
  return (table && table[key]) || value;
}

/** 静态 HTML 里带 data-i18n* 的节点，切语言时原地重写。 */
function applyStaticI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
}

function applyLangAttribute() {
  document.documentElement.lang = langTag();
}

function setLang(lang) {
  currentLang = LANGS.includes(lang) ? lang : "zh";
  try { localStorage.setItem(LANG_KEY, currentLang); } catch (err) { /* 隐私模式忽略 */ }
  applyLangAttribute();
  applyStaticI18n();
}

/** 左上角开关：显示「要去」的那门语言。 */
function langSwitchHTML() {
  const next = currentLang === "zh" ? "en" : "zh";
  return `<button class="lang-btn" type="button" data-action="lang" aria-label="${t("action.lang")}" title="${t("action.lang")}">${next === "en" ? "EN" : "中文"}</button>`;
}

applyLangAttribute();
