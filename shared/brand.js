"use strict";

/**
 * 对外暴露的品牌字段白名单。
 *
 * config/brand.json 同时存放服务端内部配置（defaultPassword、cookies、logPrefix），
 * 这些字段一旦跟着 /api/bootstrap 发出去，等于把后台密码广播给全网。
 * 所以任何返回给浏览器的品牌对象都必须过一遍这里。
 */
const PUBLIC_FIELDS = ["name", "latin", "slug", "tagline", "slogan", "disclaimer"];

function publicBrand(brand) {
  const source = brand && typeof brand === "object" ? brand : {};
  const result = {};
  PUBLIC_FIELDS.forEach((key) => {
    if (source[key] !== undefined) result[key] = source[key];
  });
  return result;
}

module.exports = { publicBrand, PUBLIC_FIELDS };
