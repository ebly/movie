"use strict";

const fs = require("fs");
const path = require("path");
const meta = require("../shared/meta.js");

/**
 * Node 端的页面外壳渲染：读取 client/index.html 并注入 meta。
 * 元信息本身来自 shared/meta.js，与 Worker 完全同源。
 */
class PageRenderer {
  constructor({ clientRoot, brand, repository, providers }) {
    this.brand = brand;
    this.repository = repository;
    this.providers = providers || {};
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

  render(result, body) {
    const { meta: block } = result;
    return { status: result.status, html: meta.inject(this.load(), block, body) };
  }

  detail(id, origin) {
    const item = this.repository.get(id);
    const body = item ? meta.detailBody(item, this.brand, this.providers) : "";
    return this.render(meta.detailMeta(item, id, this.brand, origin, this.providers), body);
  }

  search(url, origin) {
    return this.render(meta.searchMeta(url, this.brand, origin));
  }

  list(url, origin) {
    return this.render(meta.listMeta(this.brand, origin));
  }

  home(origin) {
    return this.render(
      meta.homeMeta(this.brand, origin),
      meta.homeBody(this.repository.all(), this.brand, origin)
    );
  }

  sitemap(origin) {
    return meta.sitemapXML(this.repository.all(), origin);
  }

  robots(origin) {
    return meta.robotsTxt(origin);
  }

  llms(origin) {
    return meta.llmsTxt(this.brand, this.repository.all(), origin);
  }

  share(id, origin) {
    return this.render(meta.shareMeta(id, this.brand, origin));
  }
}

function originOf(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() || "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "127.0.0.1").split(",")[0].trim();
  return `${proto}://${host}`;
}

module.exports = { PageRenderer, originOf };
