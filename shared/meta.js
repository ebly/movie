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

/* ---------------- JSON-LD ---------------- */

function websiteJsonLd(brand, origin) {
  const name = brandName(brand);
  const org = {
    "@type": "Organization",
    name,
    url: `${origin}/`,
    logo: `${origin}${DEFAULT_IMAGE}`
  };
  if (brand && brand.tagline) org.description = brand.tagline;
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
  return {
    status: 200,
    meta: metaBlock({
      title: `${brandText} — ${brand.slogan}`,
      description: "在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间找到观看入口，比较订阅、租赁、购买方式与画质，先弄清楚去哪儿看。",
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
    </article>
  </div>`;
}

/* ---------------- sitemap ---------------- */

function sitemapXML(items, origin) {
  const urls = [
    { loc: `${origin}/`, priority: "1.0", changefreq: "daily" },
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
  const list = (Array.isArray(items) ? items : [])
    .slice(0, 30)
    .map((item) => {
      const label = item.original ? `${item.title}（${item.original}）` : item.title;
      const meta = [item.year, item.type].filter(Boolean).join(" ");
      const note = item.synopsis ? `：${clip(item.synopsis, 60)}` : "：查看观看渠道";
      return `- [${label}](${origin}/title/${encodeURIComponent(item.id)}): ${meta}${note}`;
    })
    .join("\n");
  return `# ${name}${brand.latin ? `（${brand.latin}）` : ""}
> ${brand.tagline || "影视索引"}。在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间查找影视作品的观看方式。

## 网站
- [首页](${origin}/): 作品搜索与热门推荐
- [站点地图](${origin}/sitemap.xml): 全部收录页面

## 代表作品
${list}

## 说明
- 本站只索引观看渠道与公开分享，不存储影片。
- 评分、价格与可看状态为演示数据，以各平台为准。
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
  detailMeta,
  searchMeta,
  listMeta,
  homeMeta,
  shareMeta,
  homeBody,
  crawlBody,
  detailBody,
  sitemapXML,
  robotsTxt,
  llmsTxt,
  inject
};