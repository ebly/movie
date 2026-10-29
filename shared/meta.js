// meta.js — 页面元信息与 sitemap 的唯一实现，Node（server/pages.js）与 Worker（worker/index.js）共用。
"use strict";

const PLACEHOLDER = "<!--SEO-->";

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

function metaBlock({ title, description, canonical, image, robots, ogType = "website", jsonld }) {
  return [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    robots ? `<meta name="robots" content="${esc(robots)}">` : "",
    `<meta property="og:type" content="${esc(ogType)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : "",
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""
  ].filter(Boolean).join("\n  ");
}

function detailMeta(item, id, brand, origin) {
  const canonical = `${origin}/title/${encodeURIComponent(id)}`;
  if (!item) {
    return {
      status: 404,
      meta: metaBlock({
        title: `没有找到这部作品 — ${brand.name}`,
        description: `${brand.name} 暂未收录编号为 ${id} 的作品，可以回到首页按片名重新搜索。`,
        canonical,
        robots: "noindex,follow"
      })
    };
  }

  const providerCount = new Set((item.offers || []).map((offer) => offer.pid)).size;
  const where = providerCount ? `可在 ${providerCount} 个平台查看观看方式` : "查看观看渠道";
  return {
    status: 200,
    meta: metaBlock({
      title: `${item.title} 在哪里看 — ${brand.name}`,
      description: clip(
        `${item.year} 年${item.type}《${item.title}》${item.original ? `（${item.original}）` : ""}，${where}：${item.synopsis || ""}`,
        150
      ),
      canonical,
      image: item.poster || "",
      ogType: item.type === "电影" ? "video.movie" : "video.tv_show",
      jsonld: {
        "@context": "https://schema.org",
        "@type": item.type === "电影" ? "Movie" : "TVSeries",
        name: item.title,
        alternateName: item.original || undefined,
        datePublished: item.year ? String(item.year) : undefined,
        description: item.synopsis || undefined,
        url: canonical,
        image: item.poster || undefined
      }
    })
  };
}

function searchMeta(url, brand, origin) {
  const query = (url.searchParams.get("q") || "").trim();
  const quark = url.searchParams.get("source") === "quark";
  const canonical = quark
    ? `${origin}/search?source=quark${query ? `&q=${encodeURIComponent(query)}` : ""}`
    : `${origin}/search${query ? `?q=${encodeURIComponent(query)}` : ""}`;
  if (quark) return {
    status: 200,
    meta: metaBlock({
      title: `${query ? `搜索「${clip(query, 24)}」` : "搜索"}夸克公开分享 — ${brand.name}`,
      description: "搜索 PanSou 已接入公开来源中的夸克分享，不是夸克全量或私人文件搜索。",
      canonical, robots: "noindex,follow"
    })
  };
  return {
    status: 200,
    meta: metaBlock({
      title: query ? `搜索「${clip(query, 24)}」的结果 — ${brand.name}` : `搜索影视剧 — ${brand.name}`,
      description: `在 ${brand.name} 搜索「${query || "影视剧"}」，比较 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台的观看方式和价格。`,
      canonical,
      robots: "noindex,follow"
    })
  };
}

function listMeta(brand, origin) {
  return {
    status: 200,
    meta: metaBlock({
      title: `我的收藏 — ${brand.name}`,
      description: "收藏的影视作品与网盘分享链接，数据只保存在你自己的浏览器里。",
      canonical: `${origin}/list`,
      robots: "noindex,follow"
    })
  };
}

function homeMeta(brand, origin) {
  return {
    status: 200,
    meta: metaBlock({
      title: `${brand.name} — ${brand.slogan}`,
      description: "在 Netflix、Max、Apple TV+、Prime Video、Disney+ 与国内平台之间找到观看入口，比较订阅、租赁、购买方式与画质，先弄清楚去哪儿看。",
      canonical: `${origin}/`
    })
  };
}

function sitemapXML(items, origin) {
  const urls = [
    { loc: `${origin}/`, priority: "1.0", changefreq: "daily" },
    ...items.map((item) => ({
      loc: `${origin}/title/${encodeURIComponent(item.id)}`,
      lastmod: (item.updatedAt || "").slice(0, 10) || undefined,
      changefreq: "weekly",
      priority: "0.8"
    }))
  ];
  const body = urls
    .map((entry) => [
      "  <url>",
      `    <loc>${esc(entry.loc)}</loc>`,
      entry.lastmod ? `    <lastmod>${esc(entry.lastmod)}</lastmod>` : "",
      entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : "",
      entry.priority ? `    <priority>${entry.priority}</priority>` : "",
      "  </url>"
    ].filter(Boolean).join("\n"))
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** 把 <!--SEO--> 占位替换成 meta 块；没有占位符时把 meta 插到 </head> 前。 */
function inject(template, meta) {
  if (template.includes(PLACEHOLDER)) return template.replace(PLACEHOLDER, meta);
  return template.replace("</head>", `  ${meta}\n</head>`);
}

module.exports = {
  PLACEHOLDER,
  esc,
  clip,
  metaBlock,
  detailMeta,
  searchMeta,
  listMeta,
  homeMeta,
  sitemapXML,
  inject
};
