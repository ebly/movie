"use strict";

/**
 * 机房 / 代理来源判定测试（shared/asn.js）。
 *
 * 判定只影响「真实访客」口径和看板压暗，不改写事件；但名单写错会直接改变 UV，
 * 所以这里把两类容易误判的边界钉住：
 * 1. 云厂商 ASN 与组织名要认得出来（无头浏览器也会执行页面脚本）；
 * 2. 宽带 / 移动网络的用户不能因为名字里带 Google、Amazon 之类被误杀。
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const asn = require("../shared/asn.js");
const adminAsn = require("../admin/shared/asn.js");

test("已知云厂商 / 机房 ASN 直接命中", () => {
  assert.equal(asn.isHosting(12876, ""), true, "Scaleway");
  assert.equal(asn.isHosting("13335", ""), true, "Cloudflare，字符串形式也认");
  assert.equal(asn.isHosting(16509, "Amazon.com, Inc."), true);
  assert.equal(asn.isHosting(20473, ""), true, "Vultr");
  assert.equal(asn.isHosting(14061, ""), true, "DigitalOcean");
});

test("组织名兜底：ASN 不在名单里也能认出机房", () => {
  assert.equal(asn.isHosting(0, "Datacamp Limited"), true);
  assert.equal(asn.isHosting(null, "IP Volume inc"), true);
  assert.equal(asn.isHosting(undefined, "Blix Group AB"), true);
  assert.equal(asn.isHosting(1, "M247 Europe SRL"), true);
  assert.equal(asn.isHosting(1, "IT7 Networks Inc"), true, "常见代理出口");
});

test("宽带与移动网络不能误杀", () => {
  assert.equal(asn.isHosting(4134, "China Telecom"), false, "ASN 不在名单，组织名带 telecom");
  assert.equal(asn.isHosting(1, "Google Fiber Inc."), false, "Google Fiber 是宽带用户");
  assert.equal(asn.isHosting(1, "Comcast Cable Communications, LLC"), false);
  assert.equal(asn.isHosting(1, "China Mobile Communications Group"), false);
  assert.equal(asn.isHosting(1, "RCN"), false);
  assert.equal(asn.isHosting(0, ""), false, "什么都没拿到就不判");
  assert.equal(asn.isHosting(null, null), false);
});

test("splitVisitors：机房来源不计入真实访客，换过网段的仍算人", () => {
  const events = [
    // 家用宽带：正常访客
    { type: "page", visitorId: "human-1", ip: "203.0.113.7", hosting: false },
    // Scaleway 上跑的无头浏览器：执行了页面脚本，但整体来自机房
    { type: "page", visitorId: "host-1", ip: "45.1.1.1", hosting: true },
    { type: "search", visitorId: "host-1", ip: "45.1.1.1", hosting: true },
    // 机房登录后切到家用宽带：只要有一次非机房事件就不算机房
    { type: "page", visitorId: "mixed", ip: "45.1.1.2", hosting: true },
    { type: "view", visitorId: "mixed", ip: "203.0.113.8", hosting: false },
    // 不带 Cookie 的采集脚本：没有页面信标
    { type: "search", visitorId: "bot-1", ip: "192.0.2.99", hosting: false },
    // 没有 IP 的历史行 / 本地开发：不能因此被踢出真实访客
    { type: "page", visitorId: "noip" },
    // 只打过接口的机房来源：进 hosting，但不影响 hostingVisitors 的页面口径
    { type: "view", visitorId: "host-2", ip: "45.1.1.3", hosting: true }
  ];
  const split = asn.splitVisitors(events);
  assert.deepEqual([...split.pageIds].sort(), ["host-1", "human-1", "mixed", "noip"]);
  assert.deepEqual([...split.humans].sort(), ["human-1", "mixed", "noip"]);
  assert.deepEqual([...split.hosting].sort(), ["host-1", "host-2"]);
  assert.equal(split.hostingVisitors, 1, "只有打过页面信标又被判为机房的编号才计入已排除");
});

test("根与 admin 两份 asn.js 行为一致", () => {
  assert.deepEqual(Object.keys(adminAsn).sort(), Object.keys(asn).sort());
  assert.equal(adminAsn.HOSTING_ASNS.size, asn.HOSTING_ASNS.size);
  assert.equal(adminAsn.isHosting(12876, ""), asn.isHosting(12876, ""));
  assert.equal(adminAsn.isHosting(1, "Google Fiber Inc."), false);
});
