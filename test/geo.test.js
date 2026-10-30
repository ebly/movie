"use strict";

/**
 * 来源字段的清洗测试（shared/geo.js）。
 *
 * 这些值最终会出现在后台看板上，而 cf-ipcountry / cf-connecting-ip 这类头理论上可能被伪造：
 * 国家码只认两位大写字母，城市名去控制字符并限长，IP 只收合法的 IPv4/IPv6。
 * 非法值一律收敛成空串，不会带着奇怪字符入库，也不会被拼成脚本。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const geo = require("../shared/geo.js");
const adminGeo = require("../admin/shared/geo.js");

test("国家码只接受两位大写字母，Cloudflare 的未知值收敛成空", () => {
  assert.equal(geo.cleanCountry("cn"), "CN");
  assert.equal(geo.cleanCountry(" CN "), "CN");
  assert.equal(geo.cleanCountry("US"), "US");
  // Cloudflare：XX 未知、TT 保留段、T1 Tor 出口，都不算一个地区。
  assert.equal(geo.cleanCountry("XX"), "");
  assert.equal(geo.cleanCountry("TT"), "");
  assert.equal(geo.cleanCountry("T1"), "");
  // 伪造或异常输入一律丢弃，不会带着奇怪字符入库。
  assert.equal(geo.cleanCountry("CHN"), "");
  assert.equal(geo.cleanCountry("<C"), "");
  assert.equal(geo.cleanCountry("cn<script>"), "");
  assert.equal(geo.cleanCountry(null), "");
  assert.equal(geo.cleanCountry(undefined), "");
  assert.equal(geo.cleanCountry(12), "");
});

test("城市名去控制字符、折叠空白并限长", () => {
  assert.equal(geo.cleanCity(" Shanghai "), "Shanghai");
  assert.equal(geo.cleanCity("Urümqi"), "Urümqi", "拉丁字母带变音符号要保留");
  assert.equal(geo.cleanCity("San  \t Jose"), "San Jose");
  assert.equal(geo.cleanCity("a\u0000b\u001fc"), "a b c");
  assert.equal(geo.cleanCity("<script>alert(1)</script>"), "script alert(1) script",
    "尖括号与斜杠被替换成空格，标签结构无法原样落库");
  assert.equal(geo.cleanCity("x".repeat(200)).length, geo.CITY_MAX);
  assert.equal(geo.cleanCity(null), "");
});

test("来源 IP 只收合法地址，顺手统一写法", () => {
  assert.equal(geo.cleanIp("203.0.113.7"), "203.0.113.7");
  assert.equal(geo.cleanIp(" 203.0.113.7 "), "203.0.113.7", "前后空白要能去掉");
  assert.equal(geo.cleanIp("2001:DB8::1"), "2001:db8::1", "统一小写，同一来源不会被拆成两行");
  assert.equal(geo.cleanIp("::ffff:203.0.113.7"), "203.0.113.7", "IPv4-mapped 写法还原成 IPv4");
  assert.equal(geo.cleanIp("fe80::1%eth0"), "fe80::1", "区域标识不参与身份判定");
  assert.equal(geo.cleanIp("::"), "::", "全零地址合法");
  assert.equal(geo.cleanIp("1:2:3:4:5:6:7:8"), "1:2:3:4:5:6:7:8");
  assert.equal(geo.cleanIp("::2:3:4:5:6:7:8"), "::2:3:4:5:6:7:8", ":: 至少代替一组");
  // 非法或被伪造的输入一律丢弃，不会带着奇怪字符入库。
  assert.equal(geo.cleanIp("203.0.113.256"), "", "八位组超范围");
  assert.equal(geo.cleanIp("03.0.113.7"), "", "前导零按伪造处理");
  assert.equal(geo.cleanIp("1.2.3"), "");
  assert.equal(geo.cleanIp("1:2:3:4:5:6:7"), "", "IPv6 少一组且不省略非法");
  assert.equal(geo.cleanIp("1:2:3:4:5:6:7:8::"), "", "八组再加 :: 越界");
  assert.equal(geo.cleanIp("1::2::3"), "", "只允许一个 ::");
  assert.equal(geo.cleanIp(":::"), "");
  assert.equal(geo.cleanIp("12345::"), "", "每组最多 4 位十六进制");
  assert.equal(geo.cleanIp("unknown"), "", "clientKey() 的兜底值不算来源");
  assert.equal(geo.cleanIp("<img src=x onerror=1>"), "");
  assert.equal(geo.cleanIp("203.0.113.7; DROP TABLE events"), "");
  assert.equal(geo.cleanIp(null), "");
  assert.equal(geo.cleanIp(undefined), "");
  assert.equal(geo.cleanIp("x".repeat(200)), "");
});

test("写入字段：三者都空才不占键位", () => {
  assert.deepEqual(geo.geoFields({ country: "CN", city: "Shanghai" }), { country: "CN", city: "Shanghai", ip: "" });
  assert.deepEqual(geo.geoFields({ country: "cn" }), { country: "CN", city: "", ip: "" });
  assert.deepEqual(geo.geoFields({ country: "XX", city: "" }), {}, "未知值整条不写");
  assert.deepEqual(geo.geoFields({ country: "XX", ip: "203.0.113.7" }), { country: "", city: "", ip: "203.0.113.7" },
    "地区未知但 IP 合法时，来源仍然要记");
  assert.deepEqual(geo.geoFields(), {});
  // Node 侧只有 Cloudflare 回源头，拿不到城市，IP 由 clientKey() 补。
  assert.deepEqual(geo.geoFromHeaders({ "cf-ipcountry": "US" }, "203.0.113.7"), { country: "US", city: "", ip: "203.0.113.7" });
  assert.deepEqual(geo.geoFromHeaders({ "cf-ipcountry": "US" }), { country: "US", city: "", ip: "" });
  assert.deepEqual(geo.geoFromHeaders({}), {});
  assert.deepEqual(geo.geoFromHeaders(), {});
});

test("ASN 只收 32 位正整数，组织名去控制字符并限长", () => {
  assert.equal(geo.cleanAsn(12876), 12876);
  assert.equal(geo.cleanAsn("12876"), 12876, "字符串形式的数字也收");
  assert.equal(geo.cleanAsn(0), 0, "0 表示没有 ASN，不写这一列");
  assert.equal(geo.cleanAsn(-1), 0);
  assert.equal(geo.cleanAsn(1.5), 0);
  assert.equal(geo.cleanAsn(geo.ASN_MAX + 1), 0);
  assert.equal(geo.cleanAsn("AS12876"), 0, "点分 / 带前缀写法一律不收");
  assert.equal(geo.cleanAsn(NaN), 0);
  assert.equal(geo.cleanAsn(null), 0);

  assert.equal(geo.cleanAsOrg("  Amazon.com, Inc. "), "Amazon.com, Inc.");
  assert.equal(geo.cleanAsOrg("Scaleway  \t SAS"), "Scaleway SAS");
  assert.equal(geo.cleanAsOrg("<script>alert(1)</script>"), "script alert(1) script",
    "尖括号与斜杠被替换成空格，标签结构无法原样落库");
  assert.equal(geo.cleanAsOrg("x".repeat(200)).length, geo.ORG_MAX);
  assert.equal(geo.cleanAsOrg(null), "");
});

test("ASN 与组织名只在拿到时才占键位", () => {
  assert.deepEqual(
    geo.geoFields({ country: "FR", city: "Paris", ip: "203.0.113.7", asn: 12876, asOrganization: "Scaleway" }),
    { country: "FR", city: "Paris", ip: "203.0.113.7", asn: 12876, asOrg: "Scaleway" }
  );
  // 只有 ASN 没有组织名（或反之）也要能写进去：两个键各自独立。
  assert.deepEqual(geo.geoFields({ country: "FR", ip: "203.0.113.7", asn: 12876 }),
    { country: "FR", city: "", ip: "203.0.113.7", asn: 12876 });
  assert.deepEqual(geo.geoFields({ asOrganization: "Cloudflare" }), { country: "", city: "", ip: "", asOrg: "Cloudflare" });
  // 非法 ASN 被清成 0，不占键位。
  assert.deepEqual(geo.geoFields({ country: "US", asn: -3 }), { country: "US", city: "", ip: "" });
  assert.deepEqual(geo.geoFields({ asn: 0, asOrganization: "" }), {});
});

test("看板展示名：有城市到城市，没城市到国家，空值归未知", () => {
  assert.equal(geo.geoLabel("CN", "Shanghai"), "中国 · Shanghai");
  assert.equal(geo.geoLabel("us", ""), "美国");
  assert.equal(geo.geoLabel("HK", "Hong Kong"), "中国香港 · Hong Kong");
  assert.equal(geo.geoLabel("", ""), "未知地区");
  assert.equal(geo.geoLabel("XX", "Nowhere"), "未知地区 · Nowhere");
  assert.equal(geo.geoLabel("ZZ", ""), "ZZ", "词表里没有的码原样显示，不编造名字");
});

test("根与 admin 两份 geo.js 行为一致", () => {
  assert.deepEqual(Object.keys(adminGeo).sort(), Object.keys(geo).sort());
  assert.equal(adminGeo.geoLabel("CN", "Hangzhou"), geo.geoLabel("CN", "Hangzhou"));
  assert.equal(Object.keys(adminGeo.COUNTRY_NAMES).length, Object.keys(geo.COUNTRY_NAMES).length);
  assert.equal(adminGeo.cleanCountry("XX"), "");
});
