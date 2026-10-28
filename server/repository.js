"use strict";

const fs = require("fs");
const path = require("path");
const BRAND = require("../config/brand.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isValidItem(item) {
  return Boolean(
    item &&
    typeof item === "object" &&
    !Array.isArray(item) &&
    typeof item.id === "string" &&
    item.id &&
    typeof item.title === "string" &&
    Array.isArray(item.offers)
  );
}

/**
 * 只读片库仓库：前台进程不做任何写入。
 *
 * 写操作全部归独立的后台项目（../movie-admin），它独占写 titles.json。
 * 这里每次读取前比对一次 mtime，后台改完文件，前台下一个请求就能看到，不用重启。
 *
 * 曾经放过的 create/update/remove 已经删除：那套代码没有冲突检测，
 * 一旦被误调用会拿内存快照覆盖后台刚写入的内容。
 */
class TitleRepository {
  constructor({ file, seedData, logger = console }) {
    this.file = file;
    this.seedData = seedData;
    this.logger = logger;
    this.items = [];
    this.byId = new Map();
    this.stamp = null;
    this.load();
  }

  /** 文件被后台进程改过就重新载入；解析失败时保留内存版本，不覆盖、不备份。 */
  refresh() {
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(this.file).mtimeMs;
    } catch (err) {
      return;
    }
    if (mtimeMs === this.stamp) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
      const items = Array.isArray(parsed) ? parsed : parsed && parsed.items;
      if (!Array.isArray(items) || !items.every(isValidItem)) throw new Error("invalid title file");
      this.items = items;
      this.reindex();
      this.stamp = mtimeMs;
    } catch (err) {
      this.logger.error(`${BRAND.logPrefix} 片库文件此刻无法解析，继续使用内存中的版本`, err);
    }
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });

    if (fs.existsSync(this.file)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
        const items = Array.isArray(parsed) ? parsed : parsed && parsed.items;
        if (!Array.isArray(items) || !items.every(isValidItem)) throw new Error("invalid title file");
        this.items = items;
        this.reindex();
        this.stamp = fs.statSync(this.file).mtimeMs;
        return;
      } catch (err) {
        const backup = `${this.file}.broken-${Date.now()}.json`;
        try {
          fs.renameSync(this.file, backup);
          this.logger.warn(`${BRAND.logPrefix} 片库文件无法读取，已备份到 ${backup}`);
        } catch (renameError) {
          this.logger.error(`${BRAND.logPrefix} 片库文件无法读取，且备份失败`, renameError);
        }
      }
    }

    this.items = clone(this.seedData);
    this.reindex();
    try {
      fs.writeFileSync(this.file, this.serialize(), "utf8");
      this.stamp = fs.statSync(this.file).mtimeMs;
    } catch (err) {
      this.logger.error(`${BRAND.logPrefix} 无法创建片库文件，数据只保存在内存中`, err);
    }
  }

  reindex() {
    this.byId = new Map(this.items.map((item) => [item.id, item]));
  }

  all() {
    this.refresh();
    return this.items;
  }

  get(id) {
    this.refresh();
    return this.byId.get(String(id || "")) || null;
  }

  serialize() {
    return JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      items: this.items
    }, null, 2) + "\n";
  }
}

module.exports = { TitleRepository };
