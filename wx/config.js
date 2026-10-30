"use strict";

/**
 * 小程序只依赖一件事：能访问映途的公开 API。
 *
 * - baseUrl 必须是 https，且域名要加进微信公众平台「开发管理 → 开发设置 → 服务器域名 → request 合法域名」。
 * - 本地调试可以在微信开发者工具右上角「详情 → 本地设置」勾选「不校验合法域名」，
 *   这台机器就能直接连 yinto.top，不必等后台配置生效。
 * - 换域名只改这一处，页面里没有任何硬编码的地址。
 */
module.exports = {
  baseUrl: "https://yinto.top",
  timeout: 12000
};
