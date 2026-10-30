// shared/asn.js — 按来源网络的性质判定「机房 / 代理」还是普通宽带。
//
// Cloudflare 边缘在 request.cf 里给出 asn（数字）与 asOrganization（网络组织名），
// 这里只用它回答一个问题：这个访客是不是从机房网络来的？无头浏览器能执行页面脚本，
// 所以「打过页面信标」并不足以证明是人；机房 IP 是一个更硬的旁证。
//
// 判据是启发式的，两层：
// 1. ASN 命中已知云厂商 / 机房 / CDN 名单；
// 2. 组织名里带 hosting / cloud / colo / VPS 之类的词。
// 名字里带 fiber / broadband / telecom 等宽带词的一律放过，避免把真访客误杀。
//
// 判定结果只影响「真实访客」口径与看板上的压暗标注，不改写任何事件：
// 事件仍然照常入库，事后发现误判可以改这份名单重算，不需要补采。

// 常见云厂商 / 机房 / CDN / VPN 出口的 ASN。宁可少收，也不要误认宽带用户。
// 名单里的注释是归属方；数字错了最多是漏判，不会误伤（组织名还会兜一层）。
const HOSTING_ASNS = new Set([
  13335, // Cloudflare
  20940, // Akamai
  54113, // Fastly
  16509, 14618, // Amazon (AWS)
  15169, 396982, 19527, // Google
  8075, // Microsoft (Azure)
  31898, // Oracle Cloud
  14061, // DigitalOcean
  63949, // Linode（现属 Akamai）
  20473, // Vultr / The Constant Company
  16276, // OVH
  24940, // Hetzner
  12876, // Scaleway
  51167, // Contabo
  60781, 28753, // LeaseWeb（NL / DE）
  45102, 37963, // Alibaba Cloud
  132203, 45090, // Tencent Cloud
  136907, 55990, // Huawei Cloud
  9009, // M247
  202425, // IP Volume
  212238, // Datacamp
  199524, // G-Core Labs
  210644, // Aeza
  202015, // Stark Industries Solutions
  396356, // Latitude.sh
  41378, // Kirino（廉价 VPS）
  25820, // IT7 Networks（常见代理出口）
  6939 // Hurricane Electric（大量机房的转接商）
]);

// 组织名关键词：命中即视为机房。用词尽量偏「商号」而不是「技术名词」，减少误伤。
const HOSTING_ORG_RE =
  /\b(amazon|aws|google|microsoft|azure|oracle|alibaba|aliyun|tencent|huawei|digitalocean|linode|vultr|hetzner|ovh|scaleway|contabo|leaseweb|colocation|colo|psychz|nullroute|m247|ip ?volume|datacamp|blix|cloudflare|fastly|akamai|zenlayer|equinix|latitude|it7|aeza|g-?core|stark industries|hosting|hostserver|vps|dedicated server|data ?center)\b/i;

// 宽带 / 移动网络关键词：名字里带这些的一律不算机房（例如 Google Fiber 的宽带用户）。
const CONSUMER_ORG_RE = /\b(fiber|broadband|cable|wireless|mobile|telecom|unicom|communications?)\b/i;

/**
 * 是否为机房 / 代理来源。asn 可以是数字或数字字符串；asOrganization 是网络组织名。
 * 两个都拿不到时返回 false：宁可把可疑流量算进真实访客，也不凭空扣掉。
 */
function isHosting(asn, asOrganization) {
  const number = Number(asn);
  if (Number.isInteger(number) && number > 0 && HOSTING_ASNS.has(number)) return true;
  const org = String(asOrganization == null ? "" : asOrganization).trim();
  if (!org) return false;
  if (CONSUMER_ORG_RE.test(org)) return false;
  return HOSTING_ORG_RE.test(org);
}

/**
 * 把一个窗口里的事件拆成：
 * - pageIds：打过页面信标的编号（旧口径的「人」）；
 * - hosting：所有带 IP 的事件都来自机房 / 代理网段的编号；
 * - humans：pageIds 去掉 hosting，这才是看板口径的真实访客；
 * - hostingVisitors：打过页面信标、但整体来自机房的编号数（用于「已排除 N 个」文案）。
 *
 * 只要有一次事件来自非机房网段就不算机房：家用宽带换 IP、手机切流量都很常见。
 * 没有 IP 的事件（历史行、本地开发）不参与判定，不会因此被踢出真实访客。
 * 事件上的 hosting 布尔值由各存储层在读取时算好（见 isHosting）。
 */
function splitVisitors(events) {
  const pageIds = new Set();
  const state = new Map();
  events.forEach((event) => {
    if (event.type === "page" && event.visitorId) pageIds.add(event.visitorId);
    if (!event.visitorId || !event.ip) return;
    const entry = state.get(event.visitorId) || { any: false, allHosting: true };
    entry.any = true;
    if (!event.hosting) entry.allHosting = false;
    state.set(event.visitorId, entry);
  });
  const hosting = new Set();
  state.forEach((entry, id) => {
    if (entry.any && entry.allHosting) hosting.add(id);
  });
  const humans = new Set();
  let hostingVisitors = 0;
  pageIds.forEach((id) => {
    if (hosting.has(id)) hostingVisitors += 1;
    else humans.add(id);
  });
  return { pageIds, humans, hosting, hostingVisitors };
}

module.exports = { CONSUMER_ORG_RE, HOSTING_ASNS, HOSTING_ORG_RE, isHosting, splitVisitors };
