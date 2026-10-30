// shared/geo.js — 事件地区与来源字段的清洗、展示名，Worker 与 Node 共用一份口径。
//
// 地区来自 Cloudflare 边缘 GeoIP 已经解析好的结果（request.cf.country / request.cf.city，
// 或经 Cloudflare 回源的 cf-ipcountry 头）。ip 是访客的真实来源地址，落库只为在本地后台
// 认出「同一个 IP 在刷」；asn / asOrg 是该地址所属网络（AS 号与组织名），用来判定机房来源。
// 这些都只走管理端接口，不出现在任何公开响应里。
// 限流用的 clientKey() 与这里是两条路径：那个只在内存里用，不入库。

const COUNTRY_RE = /^[A-Z]{2}$/;
// Cloudflare 保留值：XX 未知、TT 保留段、T1 Tor 出口节点，这些一律按「没有地区」处理。
const UNKNOWN_CODES = new Set(["XX", "TT", "T1"]);
const CITY_MAX = 48;
// 网络组织名限长：Cloudflare 给的是自由文本，够看清是哪个厂商就行。
const ORG_MAX = 64;
// ASN 是 32 位无符号整数（点分写法不落库，统一折成十进制）。
const ASN_MAX = 4294967295;
// IPv6 完整写法最长 45 字符（含映射到 IPv4 的形式），超出一律视为非法。
const IP_MAX = 45;
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;

/** 国家码：两位大写才收，未知值收敛成空串，避免看板出现无意义分组。 */
function cleanCountry(raw) {
  const value = String(raw == null ? "" : raw).trim().toUpperCase();
  if (!COUNTRY_RE.test(value) || UNKNOWN_CODES.has(value)) return "";
  return value;
}

/** 城市名：Cloudflare 给的是自由文本，去掉控制字符与注入风险，限长后再入库。 */
function cleanCity(raw) {
  return String(raw == null ? "" : raw)
    .replace(/[^\p{L}\p{N} .,'()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CITY_MAX);
}

/** 点分十进制 IPv4：四段、每段 0-255 且不允许前导零（"01.2.3.4" 视为伪造）。 */
function isIpv4(value) {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && String(Number(part)) === part && Number(part) <= 255);
}

/**
 * IPv6：手写一个够用就好的校验——字符集受限、最多一个 "::"、每组 1-4 位十六进制、
 * 展开后不超过 8 组；末尾允许挂一段 IPv4（::ffff:1.2.3.4 记两组）。
 */
function isIpv6(value) {
  if (!value.includes(":") || !/^[0-9a-f:.]+$/.test(value)) return false;
  const halves = value.split("::");
  if (halves.length > 2) return false;

  const countGroups = (chunk) => {
    if (chunk === "") return 0;
    let total = 0;
    for (const group of chunk.split(":")) {
      if (IPV4_RE.test(group)) {
        if (!isIpv4(group)) return null;
        total += 2;
      } else if (/^[0-9a-f]{1,4}$/.test(group)) {
        total += 1;
      } else {
        return null;
      }
    }
    return total;
  };

  if (halves.length === 2) {
    const left = countGroups(halves[0]);
    const right = countGroups(halves[1]);
    if (left === null || right === null) return false;
    return left + right <= 7;
  }
  return countGroups(value) === 8;
}

/**
 * 来源 IP：只收合法地址，其余（含 "unknown"、空、注入串）一律收敛成空串。
 * 顺手去掉 IPv6 区域标识和 ::ffff: 前缀，让同一台机器不会因写法不同被拆成两个来源。
 */
function cleanIp(raw) {
  let value = String(raw == null ? "" : raw).trim().toLowerCase().split("%")[0];
  if (!value) return "";
  if (value.startsWith("::ffff:") && IPV4_RE.test(value.slice(7))) value = value.slice(7);
  if (!isIpv4(value) && !isIpv6(value)) return "";
  return value.slice(0, IP_MAX);
}

/**
 * ASN：只收 32 位正整数。Cloudflare 给的是数字，点分写法（AS1.2）与 0 一律当没有。
 * 返回值是数字或 0（0 表示不写这一列）。
 */
function cleanAsn(raw) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > ASN_MAX) return 0;
  return value;
}

/** 网络组织名：自由文本，去掉控制字符、引号与注入风险，折叠空白后限长。 */
function cleanAsOrg(raw) {
  return String(raw == null ? "" : raw)
    .replace(/[^\p{L}\p{N} .&,'()+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, ORG_MAX);
}

/** 埋点写入用的展开字段：没有地区时干脆不写键，本地 ndjson 不会被空值撑大。 */
function geoFields({ country, city, ip, asn, asOrganization } = {}) {
  const code = cleanCountry(country);
  const place = cleanCity(city);
  const address = cleanIp(ip);
  const network = cleanAsn(asn);
  const org = cleanAsOrg(asOrganization);
  if (!code && !place && !address && !network && !org) return {};
  const fields = { country: code, city: place, ip: address };
  // asn / asOrg 只在拿到时才占键位：历史行和本地开发没有这两项。
  if (network) fields.asn = network;
  if (org) fields.asOrg = org;
  return fields;
}

/** 从 Node 的原始请求头里取地区：只有经 Cloudflare 回源时才有值，本地开发为空。 */
function geoFromHeaders(headers = {}, ip = "") {
  return geoFields({
    country: headers["cf-ipcountry"] || headers["CF-IPCountry"],
    city: "",
    ip
  });
}

// ISO 3166-1 alpha-2 → 中文名。后台看板是中文界面，展示名在服务端补齐，
// 客户端 admin.js 是普通脚本（非 ES module），不方便再引一份词表。
const COUNTRY_NAMES = {
  CN: "中国",
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
  JP: "日本",
  KR: "韩国",
  KP: "朝鲜",
  MN: "蒙古",
  SG: "新加坡",
  MY: "马来西亚",
  TH: "泰国",
  VN: "越南",
  ID: "印度尼西亚",
  PH: "菲律宾",
  MM: "缅甸",
  KH: "柬埔寨",
  LA: "老挝",
  BN: "文莱",
  TL: "东帝汶",
  NP: "尼泊尔",
  BT: "不丹",
  IN: "印度",
  PK: "巴基斯坦",
  BD: "孟加拉国",
  LK: "斯里兰卡",
  MV: "马尔代夫",
  AF: "阿富汗",
  KZ: "哈萨克斯坦",
  UZ: "乌兹别克斯坦",
  KG: "吉尔吉斯斯坦",
  TJ: "塔吉克斯坦",
  TM: "土库曼斯坦",
  AE: "阿联酋",
  SA: "沙特阿拉伯",
  QA: "卡塔尔",
  KW: "科威特",
  BH: "巴林",
  OM: "阿曼",
  YE: "也门",
  IR: "伊朗",
  IQ: "伊拉克",
  SY: "叙利亚",
  LB: "黎巴嫩",
  JO: "约旦",
  IL: "以色列",
  PS: "巴勒斯坦",
  TR: "土耳其",
  GE: "格鲁吉亚",
  AM: "亚美尼亚",
  AZ: "阿塞拜疆",
  CY: "塞浦路斯",
  RU: "俄罗斯",
  UA: "乌克兰",
  BY: "白俄罗斯",
  PL: "波兰",
  DE: "德国",
  AT: "奥地利",
  CH: "瑞士",
  LI: "列支敦士登",
  FR: "法国",
  BE: "比利时",
  NL: "荷兰",
  LU: "卢森堡",
  GB: "英国",
  IE: "爱尔兰",
  IS: "冰岛",
  DK: "丹麦",
  NO: "挪威",
  SE: "瑞典",
  FI: "芬兰",
  EE: "爱沙尼亚",
  LV: "拉脱维亚",
  LT: "立陶宛",
  CZ: "捷克",
  SK: "斯洛伐克",
  HU: "匈牙利",
  AU: "澳大利亚",
  NZ: "新西兰",
  FJ: "斐济",
  CA: "加拿大",
  US: "美国",
  MX: "墨西哥",
  GT: "危地马拉",
  CU: "古巴",
  DO: "多米尼加",
  HT: "海地",
  JM: "牙买加",
  CO: "哥伦比亚",
  VE: "委内瑞拉",
  EC: "厄瓜多尔",
  PE: "秘鲁",
  BO: "玻利维亚",
  BR: "巴西",
  CL: "智利",
  AR: "阿根廷",
  UY: "乌拉圭",
  PY: "巴拉圭",
  GY: "圭亚那",
  SR: "苏里南",
  EG: "埃及",
  LY: "利比亚",
  TN: "突尼斯",
  DZ: "阿尔及利亚",
  MA: "摩洛哥",
  SD: "苏丹",
  ET: "埃塞俄比亚",
  KE: "肯尼亚",
  TZ: "坦桑尼亚",
  UG: "乌干达",
  GH: "加纳",
  NG: "尼日利亚",
  CM: "喀麦隆",
  ZA: "南非",
  ZW: "津巴布韦",
  ZM: "赞比亚",
  MZ: "莫桑比克",
  AO: "安哥拉",
  MG: "马达加斯加",
  RE: "留尼汪",
  YT: "马约特",
  CW: "库拉索",
  AW: "阿鲁巴",
  PR: "波多黎各",
  GU: "关岛",
  VI: "美属维尔京群岛",
  AS: "美属萨摩亚",
  PF: "法属波利尼西亚",
  NC: "新喀里多尼亚",
  FO: "法罗群岛",
  GL: "格陵兰",
  BM: "百慕大",
  KY: "开曼群岛",
  VG: "英属维尔京群岛",
  TC: "特克斯和凯科斯群岛",
  AI: "安圭拉",
  MS: "蒙特塞拉特",
  FK: "福克兰群岛",
  GI: "直布罗陀",
  MT: "马耳他",
  SI: "斯洛文尼亚",
  HR: "克罗地亚",
  BA: "波斯尼亚和黑塞哥维那",
  RS: "塞尔维亚",
  ME: "黑山",
  MK: "北马其顿",
  AL: "阿尔巴尼亚",
  GR: "希腊",
  BG: "保加利亚",
  RO: "罗马尼亚",
  MD: "摩尔多瓦",
  PT: "葡萄牙",
  ES: "西班牙",
  AD: "安道尔",
  MC: "摩纳哥",
  SM: "圣马力诺",
  VA: "梵蒂冈",
  IT: "意大利",
  SJ: "斯瓦尔巴",
  IM: "马恩岛",
  JE: "泽西岛",
  GG: "根西岛",
  AQ: "南极洲",
  EH: "西撒哈拉",
  SO: "索马里",
  RW: "卢旺达",
  BI: "布隆迪",
  MW: "马拉维",
  BW: "博茨瓦纳",
  NA: "纳米比亚",
  LS: "莱索托",
  SZ: "斯威士兰",
  DJ: "吉布提",
  ER: "厄立特里亚",
  CF: "中非",
  TD: "乍得",
  NE: "尼日尔",
  ML: "马里",
  GN: "几内亚",
  SL: "塞拉利昂",
  LR: "利比里亚",
  CI: "科特迪瓦",
  BF: "布基纳法索",
  TG: "多哥",
  BJ: "贝宁",
  CG: "刚果（布）",
  CD: "刚果（金）",
  GA: "加蓬",
  GQ: "赤道几内亚",
  ST: "圣多美和普林西比",
  GW: "几内亚比绍",
  MR: "毛里塔尼亚",
  GM: "冈比亚",
  CV: "佛得角",
  SC: "塞舌尔",
  KM: "科摩罗",
  MU: "毛里求斯"
};

/** 国家码转中文展示名；没有词表时用码本身，空码归到「未知地区」。 */
function countryName(code) {
  const value = cleanCountry(code);
  if (!value) return "未知地区";
  return COUNTRY_NAMES[value] || value;
}

/** 看板展示名：有城市时「中国 · Shanghai」，没城市只到国家。城市沿用 GeoIP 的拉丁拼写。 */
function geoLabel(code, city) {
  const country = countryName(code);
  const place = cleanCity(city);
  if (country === "未知地区") return place ? `未知地区 · ${place}` : "未知地区";
  return place ? `${country} · ${place}` : country;
}

module.exports = {
  ASN_MAX,
  CITY_MAX,
  COUNTRY_NAMES,
  IP_MAX,
  ORG_MAX,
  cleanAsOrg,
  cleanAsn,
  cleanCity,
  cleanCountry,
  cleanIp,
  countryName,
  geoFields,
  geoFromHeaders,
  geoLabel
};
