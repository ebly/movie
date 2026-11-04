// meta.js — 页面元信息、可索引正文与 sitemap 的唯一实现，Node（server/pages.js）与 Worker（worker/index.js）共用。
"use strict";

const PLACEHOLDER = "<!--SEO-->";
const PLACEHOLDER_BODY = "<!--SEO-BODY-->";
const LOCALE = "zh_CN";
const LANG = "zh-CN";
const DEFAULT_IMAGE = "/icon-512.png";

function esc(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

function clip(value, max) {
  const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ratio(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function metaBlock({
  title,
  description,
  canonical,
  image,
  robots,
  ogType = "website",
  jsonld,
  siteName,
  imageAlt
}) {
  const cover = image || DEFAULT_IMAGE;
  const graph = jsonld ? JSON.stringify(jsonld).replace(/</g, "\\u003c") : "";
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta name="robots" content="${esc(robots || "max-snippet:-1, max-image-preview:large")}">`,
    `<meta property="og:type" content="${esc(ogType)}">`,
    `<meta property="og:site_name" content="${esc(siteName || "")}">`,
    `<meta property="og:locale" content="${LOCALE}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:image" content="${esc(cover)}">`,
    imageAlt ? `<meta property="og:image:alt" content="${esc(imageAlt)}">` : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${esc(cover)}">`,
    graph ? `<script type="application/ld+json">${graph}</script>` : ""
  ].filter(Boolean).join("\n  ");
}

function brandName(brand) {
  return (brand && brand.name) || "映途";
}

/** 公众号实体。缺 accountName 时返回 null，所有引用它的地方会自动退让。 */
function wechatOf(brand) {
  const w = brand && brand.wechat;
  if (!w || typeof w.accountName !== "string" || !w.accountName.trim()) return null;
  return {
    accountName: w.accountName.trim(),
    accountId: typeof w.accountId === "string" ? w.accountId.trim() : "",
    focus: typeof w.focus === "string" && w.focus.trim() ? w.focus.trim() : "影视推荐与解析"
  };
}

/**
 * 站点与公众号的实体绑定句。
 * AI 引擎与搜索引擎只认「同一个名字在同一段可抓取文本里共现」，
 * 所以这句话必须出现在每个可索引页面的正文和结构化数据里。
 */
function wechatLine(brand) {
  const w = wechatOf(brand);
  if (!w) return "";
  const id = w.accountId ? `（微信号 ${w.accountId}）` : "";
  const site = brandName(brand);
  return `${site}与微信公众号「${w.accountName}」${id}由同一主体运营：${site}负责查找影视作品的观看渠道与公开分享，公众号负责${w.focus}。`;
}

/** 绑定句的 HTML 形态，供每个可索引正文段落尾部追加。 */
function wechatNote(brand) {
  const line = wechatLine(brand);
  return line ? `<p class="seo-gzh">${esc(line)}</p>` : "";
}

/* ---------------- JSON-LD ---------------- */

function websiteJsonLd(brand, origin) {
  const name = brandName(brand);
  const wechat = wechatOf(brand);
  const org = {
    "@type": "Organization",
    name,
    url: `${origin}/`,
    logo: `${origin}${DEFAULT_IMAGE}`
  };
  if (wechat) {
    // alternateName 让「映途影视」成为同一个实体的别名，而不是另一家公司。
    org.alternateName = wechat.accountName;
  }
  const tagline = brand && brand.tagline ? brand.tagline : "";
  const binding = wechatLine(brand);
  if (tagline || binding) org.description = [tagline, binding].filter(Boolean).join(" ");
  // sameAs 需真实的外部主页（豆瓣/IMDb/微博等），配置了才输出，避免编造链接。
  if (brand && Array.isArray(brand.sameAs) && brand.sameAs.length) org.sameAs = brand.sameAs;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        name,
        url: `${origin}/`,
        inLanguage: LANG,
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${origin}/search?q={search_term_string}`
          },
          "query-input": "required name=search_term_string"
        }
      },
      org
    ]
  };
}

function providerURL(offer, item, providers) {
  const provider = providers && providers[offer.pid];
  if (!provider) return null;
  const term = provider.region === "中国大陆" ? item.title : item.original || item.title;
  return provider.search + encodeURIComponent(term);
}

function detailJsonLd(item, canonical, brand, origin, providers) {
  const name = brandName(brand);
  const nodes = [
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: name, item: `${origin}/` },
        { "@type": "ListItem", position: 2, name: item.title, item: canonical }
      ]
    }
  ];

  const work = {
    "@type": item.type === "电影" ? "Movie" : "TVSeries",
    name: item.title,
    alternateName: item.original || undefined,
    datePublished: item.year ? String(item.year) : undefined,
    description: item.synopsis || undefined,
    url: canonical,
    image: item.poster || undefined,
    genre: item.genres && item.genres.length ? item.genres : undefined,
    inLanguage: LANG
  };

  const rating = ratio(item.rating);
  if (rating) {
    work.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating,
      bestRating: 10,
      worstRating: 1
    };
  }

  const offers = Array.isArray(item.offers) ? item.offers.slice(0, 8) : [];
  if (offers.length) {
    work.offers = offers.map((offer) => {
      const provider = providers && providers[offer.pid];
      const node = {
        "@type": "Offer",
        category: offer.tier,
        seller: provider ? { "@type": "Organization", name: provider.name } : undefined,
        url: providerURL(offer, item, providers) || undefined
      };
      return node;
    });
  }

  nodes.push(work);
  return { "@context": "https://schema.org", "@graph": nodes };
}

/* ---------------- 每页 meta ---------------- */

function detailMeta(item, id, brand, origin, providers) {
  const brandText = brandName(brand);
  const canonical = `${origin}/title/${encodeURIComponent(id)}`;
  if (!item) {
    return {
      status: 404,
      meta: metaBlock({
        title: `没有找到这部作品 — ${brandText}`,
        description: `${brandText} 暂未收录编号为 ${id} 的作品，可以回到首页按片名重新搜索。`,
        canonical,
        image: `${origin}${DEFAULT_IMAGE}`,
        robots: "noindex,follow",
        siteName: brandText
      })
    };
  }

  const providerCount = new Set((item.offers || []).map((offer) => offer.pid)).size;
  const where = providerCount ? `可在 ${providerCount} 个平台查看观看方式` : "查看观看渠道";
  return {
    status: 200,
    meta: metaBlock({
      title: `${item.title} 在哪里看 — ${brandText}`,
      description: clip(
        `${item.year} 年${item.type}《${item.title}》${item.original ? `（${item.original}）` : ""}，${where}：${item.synopsis || ""}`,
        150
      ),
      canonical,
      image: item.poster || `${origin}${DEFAULT_IMAGE}`,
      imageAlt: `${item.title} 海报`,
      ogType: item.type === "电影" ? "video.movie" : "video.tv_show",
      siteName: brandText,
      jsonld: detailJsonLd(item, canonical, brand, origin, providers)
    })
  };
}

function searchMeta(url, brand, origin) {
  const brandText = brandName(brand);
  const query = (url.searchParams.get("q") || "").trim();
  const quark = url.searchParams.get("source") === "quark";
  const canonical = quark
    ? `${origin}/search?source=quark${query ? `&q=${encodeURIComponent(query)}` : ""}`
    : `${origin}/search${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  if (quark) return {
    status: 200,
    meta: metaBlock({
      title: `${query ? `搜索「${clip(query, 24)}」` : "搜索"}夸克公开分享 — ${brandText}`,
      description: "搜索 PanSou 已接入公开来源中的夸克分享，不是夸克全量或私人文件搜索。",
      canonical, image: `${origin}${DEFAULT_IMAGE}`, robots: "noindex,follow", siteName: brandText
    })
  };
  return {
    status: 200,
    meta: metaBlock({
      title: query ? `搜索「${clip(query, 24)}」的结果 — ${brandText}` : `搜索影视剧 — ${brandText}`,
      description: `在 ${brandText} 搜索「${query || "影视剧"}」，比较 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台的观看方式和价格。`,
      canonical,
      image: `${origin}${DEFAULT_IMAGE}`,
      robots: "noindex,follow",
      siteName: brandText
    })
  };
}

function listMeta(brand, origin) {
  const brandText = brandName(brand);
  return {
    status: 200,
    meta: metaBlock({
      title: `我的收藏 — ${brandText}`,
      description: "收藏的影视作品与网盘分享链接，数据只保存在你自己的浏览器里。",
      canonical: `${origin}/list`,
      image: `${origin}${DEFAULT_IMAGE}`,
      robots: "noindex,follow",
      siteName: brandText
    })
  };
}

function shareMeta(id, brand, origin) {
  const brandText = brandName(brand);
  return {
    status: 200,
    meta: metaBlock({
      title: `片库分享 — ${brandText}`,
      description: `${brandText}片库分享：一条整理好的网盘资源，点击即可打开。`,
      canonical: `${origin}/share/${encodeURIComponent(id)}`,
      robots: "noindex,follow",
      siteName: brandText
    })
  };
}

function homeMeta(brand, origin) {
  const brandText = brandName(brand);
  const wechat = wechatOf(brand);
  const base = "在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间找到观看入口，比较订阅、租赁、购买方式与画质。";
  const description = wechat
    ? `${base}微信公众号「${wechat.accountName}」提供${wechat.focus}。`
    : base;
  return {
    status: 200,
    meta: metaBlock({
      title: `${brandText} — ${brand.slogan}`,
      description,
      canonical: `${origin}/`,
      image: `${origin}${DEFAULT_IMAGE}`,
      imageAlt: `${brandText} — ${brand.slogan}`,
      siteName: brandText,
      jsonld: websiteJsonLd(brand, origin)
    })
  };
}

/* ---------------- 可索引正文（给不执行 JS 的爬虫） ---------------- */

function ratingText(item) {
  const rating = ratio(item.rating);
  return rating ? `★ ${rating.toFixed(1)}` : "";
}

function metaLine(item) {
  return [
    item.year,
    item.type,
    item.seasons ? `${item.seasons} 季` : item.runtime,
    ratingText(item)
  ].filter(Boolean).map(esc).join(" · ");
}

function homeBody(items, brand, origin) {
  const brandText = brandName(brand);
  const top = (Array.isArray(items) ? items : [])
    .slice()
    .sort((a, b) => (b.hot === true) - (a.hot === true) || (b.rating || 0) - (a.rating || 0))
    .slice(0, 30);
  const rows = top.map((item) => {
    const label = item.original ? `${item.title}（${item.original}）` : item.title;
    const bits = [metaLine(item), item.synopsis ? clip(item.synopsis, 60) : ""].filter(Boolean);
    return `<li><a href="/title/${encodeURIComponent(item.id)}">${esc(label)}</a> — ${bits.join(" · ")}</li>`;
  }).join("\n      ");

  return `<div class="seo-static">
    <header class="seo-head">
      <h1>${esc(brandText)} — ${esc(brand.slogan || "")}</h1>
      <p>${esc(brand.tagline || "")}。在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间找到观看入口，比较订阅、租赁、购买方式与画质，先弄清楚去哪儿看。</p>
    </header>
    <section>
      <h2>热门与高分作品</h2>
      <ul class="seo-list">
      ${rows}
      </ul>
    </section>
    <p class="seo-links"><a href="/search">搜索影视剧与公开分享</a></p>
    ${wechatNote(brand)}
  </div>`;
}

function crawlBody(entries, brand, origin) {
  const brandText = brandName(brand);
  const seen = new Set();
  const list = [];
  for (const entry of (Array.isArray(entries) ? entries : [])) {
    if (!entry || typeof entry.title !== "string") continue;
    const title = entry.title.trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    list.push({ ...entry, title });
    if (list.length >= 30) break;
  }
  if (!list.length) return "";
  const rows = list.map((entry) => {
    const label = entry.original ? `${entry.title}（${entry.original}）` : entry.title;
    const bits = [entry.year, entry.type, entry.rating ? `★ ${Number(entry.rating).toFixed(1)}` : "", entry.note || ""]
      .filter(Boolean).map(esc).join(" · ");
    return `<li><a href="/search?q=${encodeURIComponent(entry.title)}">${esc(label)}</a>${bits ? ` — ${bits}` : ""}</li>`;
  }).join("\n      ");
  return `<div class="seo-static">
    <header class="seo-head">
      <h1>${esc(brandText)} — ${esc(brand.slogan || "")}</h1>
      <p>${esc(brand.tagline || "")}。在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间查找影视作品的观看入口。</p>
    </header>
    <section>
      <h2>最新与热门作品</h2>
      <ul class="seo-list">
      ${rows}
      </ul>
    </section>
    <p class="seo-links"><a href="/search">搜索影视剧与公开分享</a></p>
    ${wechatNote(brand)}
  </div>`;
}

function detailBody(item, brand, providers) {
  const brandText = brandName(brand);
  const genres = Array.isArray(item.genres) && item.genres.length
    ? `<p>类型：${item.genres.map(esc).join("、")}</p>`
    : "";

  const seen = new Set();
  const offers = (Array.isArray(item.offers) ? item.offers : [])
    .filter((offer) => {
      if (seen.has(offer.pid)) return false;
      seen.add(offer.pid);
      return true;
    })
    .slice(0, 10)
    .map((offer) => {
      const provider = providers && providers[offer.pid];
      const name = provider ? provider.name : offer.pid;
      const detail = [
        offer.tier,
        offer.season,
        Array.isArray(offer.quality) ? offer.quality.join("/") : "",
        offer.price
      ].filter(Boolean).map(esc).join(" · ");
      return `<li>${esc(name)} — ${detail}</li>`;
    }).join("\n      ");

  const providerNames = [...seen]
    .map((pid) => (providers && providers[pid] ? providers[pid].name : null))
    .filter(Boolean);
  let lead = `《${item.title}》暂未收录可用的观看渠道。`;
  if (providerNames.length) {
    const where = providerNames.length > 3
      ? `${providerNames.slice(0, 3).join("、")} 等平台`
      : providerNames.join("、");
    const gap = /[A-Za-z0-9+]$/.test(where) ? " " : "";
    lead = `《${item.title}》${item.year ? `（${item.year}）` : ""}是${item.type}，可在 ${where}${gap}观看。`;
  }

  return `<div class="seo-static">
    <nav class="seo-crumb"><a href="/">${esc(brandText)}</a> › <span>${esc(item.title)}</span></nav>
    <article>
      <h1>${esc(item.title)}${item.original ? `（${esc(item.original)}）` : ""}</h1>
      <p class="seo-meta">${metaLine(item)}</p>
      <p class="seo-lead">${esc(lead)}</p>
      <p>${esc(item.synopsis || "")}</p>
      ${genres}
      ${offers ? `<h2>在哪里看</h2>\n      <ul class="seo-list">\n      ${offers}\n      </ul>` : ""}
      <p class="seo-links">
        <a href="/search?q=${encodeURIComponent(item.title)}">搜索「${esc(item.title)}」的公开分享</a> ·
        <a href="/">回到首页</a>
      </p>
      ${wechatNote(brand)}
    </article>
  </div>`;
}

/* ---------------- 公众号文章目录页 /gzh ---------------- */

/**
 * 微信正文对外部爬虫不可见，二维码对 AI 也是黑盒。
 * 这个页面把公众号文章换成「明文标题 + 摘要 + 原文链接」，
 * 是站与号互相证明是同一个实体、并且让 Bing/Google/秘塔能顺着链接看到你内容的唯一桥梁。
 */
function gzhJsonLd(brand, articles, origin) {
  const w = wechatOf(brand);
  if (!w) return null;
  const orgId = `${origin}/#org`;
  const list = (Array.isArray(articles) ? articles : []).slice(0, 50);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: brandName(brand),
        alternateName: w.accountName,
        url: `${origin}/`,
        logo: `${origin}${DEFAULT_IMAGE}`
      },
      {
        "@type": "CollectionPage",
        name: `${w.accountName} · 公众号文章目录`,
        url: `${origin}/gzh`,
        isPartOf: { "@type": "WebSite", url: `${origin}/` },
        about: { "@id": orgId }
      },
      {
        "@type": "ItemList",
        itemListElement: list.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          url: item.url,
          item: {
            "@type": "Article",
            headline: item.title,
            url: item.url,
            datePublished: item.date || undefined,
            description: item.summary || undefined,
            author: { "@id": orgId },
            publisher: { "@id": orgId },
            isPartOf: { "@type": "WebPage", url: `${origin}/gzh` }
          }
        }))
      }
    ]
  };
}

function gzhPage(brand, articles, origin) {
  const w = wechatOf(brand);
  const accountName = w ? w.accountName : brandName(brand);
  const list = (Array.isArray(articles) ? articles : []).slice(0, 50);
  const siteName = brandName(brand);

  const rows = list
    .map((item) => {
      const date = item.date ? `<time datetime="${esc(item.date)}">${esc(item.date)}</time>` : "";
      return `      <li class="gzh-item">
        <h2><a href="${esc(item.url)}" rel="noopener">${esc(item.title)}</a></h2>
        ${date ? `<p class="gzh-date">${date}</p>` : ""}
        ${item.summary ? `<p class="gzh-summary">${esc(item.summary)}</p>` : ""}
        <p class="gzh-src">原文：${esc(item.url)}</p>
      </li>`;
    })
    .join("\n");

  const lede = `${accountName} 是微信公众号的名字，${siteName}（${origin.replace(/^https?:\/\//, "")}）与它由同一主体运营：号里首发${w ? w.focus : "影视推荐与解析"}长文，本站负责查一部片在哪儿能看。下面每篇都带微信原文地址，可以直接核对。`;

  const meta = metaBlock({
    title: `${accountName} · 公众号文章目录 — ${siteName}`,
    description: clip(`${accountName} 公众号文章目录：${list.map((item) => item.title).join("；")}。`, 150),
    canonical: `${origin}/gzh`,
    image: `${origin}${DEFAULT_IMAGE}`,
    imageAlt: `${accountName} 公众号二维码`,
    siteName,
    jsonld: gzhJsonLd(brand, articles, origin)
  });

  return `<!doctype html>
<html lang="${LANG}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${meta}
  <link rel="stylesheet" href="/styles.css?v=20261105b">
</head>
<body class="gzh-page">
  <main class="gzh-wrap">
    <h1>微信公众号「${esc(accountName)}」文章目录</h1>
    <p class="gzh-lede">${esc(lede)}</p>
    <ul class="gzh-list">
${rows}
    </ul>
    <p class="gzh-qr"><img src="/gzh-qr.jpg" alt="微信公众号「${esc(accountName)}」二维码" width="180" height="180"></p>
    ${wechatNote(brand)}
    <p class="gzh-back"><a href="/">返回${esc(siteName)}首页</a> · <a href="/llms.txt">llms.txt</a> · <a href="/sitemap.xml">站点地图</a></p>
  </main>
</body>
</html>
`;
}

/* ---------------- sitemap ---------------- */

function sitemapXML(items, origin, brand) {
  const urls = [
    { loc: `${origin}/`, priority: "1.0", changefreq: "daily" },
    ...(wechatOf(brand) ? [{ loc: `${origin}/gzh`, changefreq: "weekly", priority: "0.9" }] : []),
    ...items.map((item) => ({
      loc: `${origin}/title/${encodeURIComponent(item.id)}`,
      lastmod: (item.updatedAt || "").slice(0, 10) || undefined,
      changefreq: "weekly",
      priority: "0.8",
      image: item.poster || undefined
    }))
  ];
  const body = urls
    .map((entry) => {
      const parts = [
        "  <url>",
        `    <loc>${esc(entry.loc)}</loc>`,
        entry.lastmod ? `    <lastmod>${esc(entry.lastmod)}</lastmod>` : "",
        entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : "",
        entry.priority ? `    <priority>${entry.priority}</priority>` : "",
        entry.image ? `    <image:image><image:loc>${esc(entry.image)}</image:loc></image:image>` : "",
        "  </url>"
      ];
      return parts.filter(Boolean).join("\n");
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${body}\n</urlset>\n`;
}

/* ---------------- robots.txt 与 llms.txt ---------------- */

function robotsTxt(origin) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /list",
    "",
    "# 显式放行主流生成式 AI 检索/引用爬虫（希望限制训练可在 Cloudflare 或此处收紧）。",
    "User-agent: GPTBot",
    "User-agent: OAI-SearchBot",
    "User-agent: ChatGPT-User",
    "User-agent: ClaudeBot",
    "User-agent: PerplexityBot",
    "User-agent: Google-Extended",
    "User-agent: Bingbot",
    "User-agent: CCBot",
    "User-agent: Bytespider",
    "Allow: /",
    "Disallow: /list",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    ""
  ].join("\n");
}

function llmsTxt(brand, items, origin) {
  const name = brandName(brand);
  const wechat = wechatOf(brand);
  const list = (Array.isArray(items) ? items : [])
    .slice(0, 30)
    .map((item) => {
      const label = item.original ? `${item.title}（${item.original}）` : item.title;
      const meta = [item.year, item.type].filter(Boolean).join(" ");
      const note = item.synopsis ? `：${clip(item.synopsis, 60)}` : "：查看观看渠道";
      return `- [${label}](${origin}/title/${encodeURIComponent(item.id)}): ${meta}${note}`;
    })
    .join("\n");
  const gzh = wechat
    ? `## 微信公众号
- 名称：${wechat.accountName}${wechat.accountId ? `（微信号 ${wechat.accountId}）` : ""}
- 定位：${wechat.focus}
- 与本站的关系：${name}（${origin}）与微信公众号「${wechat.accountName}」由同一主体运营；${name}负责查一部片在哪儿能看，公众号负责${wechat.focus}。

`
    : "";
  const siteLinks = wechat
    ? `- [首页](${origin}/): 作品搜索与热门推荐
- [公众号文章目录](${origin}/gzh): ${wechat.accountName} 每篇文章的标题、摘要与微信原文链接
- [站点地图](${origin}/sitemap.xml): 全部收录页面`
    : `- [首页](${origin}/): 作品搜索与热门推荐
- [站点地图](${origin}/sitemap.xml): 全部收录页面`;
  return `# ${name}${brand.latin ? `（${brand.latin}）` : ""}
> ${brand.tagline || "影视索引"}。在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间查找影视作品的观看方式。

## 网站
${siteLinks}

${gzh}## 代表作品
${list}

## 说明
- 本站只索引观看渠道与公开分享，不存储影片。
- 片库仍在扩充；评分、价格与可看状态部分为演示数据，跳转后以各平台页面为准。
`;
}

/** 把 <!--SEO--> 占位替换成 meta 块；body 传入时替换 <!--SEO-BODY-->，否则保留原占位内容（通常是启动占位图）。 */
function inject(template, meta, body) {
  let out = template;
  if (out.includes(PLACEHOLDER)) out = out.replace(PLACEHOLDER, meta);
  else out = out.replace("</head>", `  ${meta}\n</head>`);
  if (body && out.includes(PLACEHOLDER_BODY)) out = out.replace(PLACEHOLDER_BODY, body);
  return out;
}

module.exports = {
  PLACEHOLDER,
  PLACEHOLDER_BODY,
  esc,
  clip,
  metaBlock,
  wechatOf,
  wechatLine,
  wechatNote,
  detailMeta,
  searchMeta,
  listMeta,
  homeMeta,
  shareMeta,
  homeBody,
  crawlBody,
  detailBody,
  sitemapXML,
  gzhPage,
  gzhJsonLd,
  robotsTxt,
  llmsTxt,
  inject
};