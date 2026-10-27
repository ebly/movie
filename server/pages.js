"use strict";

const fs = require("fs");
const path = require("path");
const meta = require("../shared/meta.js");

/**
 * Node 端的页面外壳渲染：读取 client/index.html 并注入 meta。
 * 元信息本身来自 shared/meta.js，与 Worker 完全同源。
 */
class PageRenderer {
  constructor({ clientRoot, brand, repository }) {
    this.brand = brand;
    this.repository = repository;
    this.file = path.join(clientRoot, "index.html");
    this.template = null;
    this.mtime = 0;
  }

  load() {
    const stat = fs.statSync(this.file);
    if (!this.template || stat.mtimeMs !== this.mtime) {
      this.template = fs.readFileSync(this.file, "utf8");
      this.mtime = stat.mtimeMs;
    }
    return this.template;
  }

  render(result) {
    const { meta: block } = result;
    return { status: result.status, html: meta.inject(this.load(), block) };
  }

  detail(id, origin) {
    return this.render(meta.detailMeta(this.repository.get(id), id, this.brand, origin));
  }

  search(url, origin) {
    return this.render(meta.searchMeta(url, this.brand, origin));
  }

  list(url, origin) {
    return this.render(meta.listMeta(this.brand, origin));
  }

  home(origin) {
    return this.render(meta.homeMeta(this.brand, origin));
  }

  sitemap(origin) {
    return meta.sitemapXML(this.repository.all(), origin);
  }
}

function originOf(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1").split(",")[0].trim();
  return `${proto}://${host}`;
}

module.exports = { PageRenderer, originOf };
