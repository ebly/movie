"use strict";

const fs = require("fs");
const path = require("path");
const BRAND = require("../config/brand.json");
const { candidateId } = require("./validate");

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
 * 片库仓库（后台侧）。
 *
 * 与前台项目不同：后台是独立进程，前台进程可能随时写入 analytics/feedback，
 * 而片库文件由后台独占写入。因此这里每次读取都先比对文件 mtime，变了就重新载入，
 * 保证「后台改完 → 前台立刻能搜到」的同时，后台也不会拿着过期快照覆盖别人的修改。
 */
class TitleRepository {
  constructor({ file, logger = console }) {
    this.file = file;
    this.logger = logger;
    this.items = [];
    this.byId = new Map();
    this.stamp = null;
    this.queue = Promise.resolve();
    this.load();
  }

  readFromDisk() {
    const parsed = JSON.parse(fs.readFileSync(this.file, "utf8"));
    const items = Array.isArray(parsed) ? parsed : parsed && parsed.items;
    if (!Array.isArray(items) || !items.every(isValidItem)) throw new Error("invalid title file");
    return items;
  }

  load() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });

    try {
      this.stamp = fs.statSync(this.file).mtimeMs;
      this.items = this.readFromDisk();
      this.reindex();
      return;
    } catch (err) {
      if (err.code !== "ENOENT") {
        this.logger.error(`${BRAND.logPrefix} 片库文件无法读取：${this.file}`, err);
        this.items = [];
        this.reindex();
        this.stamp = null;
        return;
      }
    }

    // 文件还不存在（前台项目尚未启动过）：建一份空片库，避免后台一上来就崩。
    this.items = [];
    this.reindex();
    this.stamp = null;
    try {
      fs.writeFileSync(this.file, this.serialize(), "utf8");
      this.stamp = fs.statSync(this.file).mtimeMs;
      this.logger.warn(`${BRAND.logPrefix} 片库文件不存在，已创建空片库：${this.file}`);
    } catch (err) {
      this.logger.error(`${BRAND.logPrefix} 无法创建片库文件，修改只保存在内存中`, err);
    }
  }

  /** 文件被其他进程改过就重新载入；解析失败时保留当前内容，不覆盖、不备份。 */
  refresh() {
    let mtimeMs;
    try {
      mtimeMs = fs.statSync(this.file).mtimeMs;
    } catch (err) {
      return;
    }
    if (mtimeMs === this.stamp) return;
    try {
      const items = this.readFromDisk();
      this.items = items;
      this.reindex();
      this.stamp = mtimeMs;
    } catch (err) {
      this.logger.error(`${BRAND.logPrefix} 片库文件此刻无法解析，继续使用内存中的版本`, err);
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

  nextId(title, original) {
    const base = candidateId(title, original);
    if (!this.byId.has(base)) return base;
    let index = 2;
    while (this.byId.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
  }

  async create(input) {
    this.refresh();
    const now = new Date().toISOString();
    const item = {
      ...input,
      id: this.nextId(input.title, input.original),
      createdAt: now,
      updatedAt: now
    };
    this.items.push(item);
    this.byId.set(item.id, item);
    try {
      await this.save();
    } catch (err) {
      this.items.pop();
      this.byId.delete(item.id);
      throw err;
    }
    return item;
  }

  async update(id, input) {
    this.refresh();
    const current = this.get(id);
    if (!current) return null;
    const index = this.items.indexOf(current);
    const next = {
      ...input,
      id: current.id,
      createdAt: current.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.items[index] = next;
    this.byId.set(next.id, next);
    try {
      await this.save();
    } catch (err) {
      this.items[index] = current;
      this.byId.set(current.id, current);
      throw err;
    }
    return next;
  }

  async remove(id) {
    this.refresh();
    const current = this.get(id);
    if (!current) return null;
    const index = this.items.indexOf(current);
    this.items.splice(index, 1);
    this.byId.delete(current.id);
    try {
      await this.save();
    } catch (err) {
      this.items.splice(index, 0, current);
      this.byId.set(current.id, current);
      throw err;
    }
    return current;
  }

  serialize() {
    return JSON.stringify({
      version: 1,
      updatedAt: new Date().toISOString(),
      items: this.items
    }, null, 2) + "\n";
  }

  save() {
    const body = this.serialize();
    const run = this.queue.then(() => this.atomicWrite(body));
    this.queue = run.catch(() => {});
    return run;
  }

  async atomicWrite(body) {
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temp, body, "utf8");
      await fs.promises.rename(temp, this.file);
      this.stamp = fs.statSync(this.file).mtimeMs;
    } catch (err) {
      await fs.promises.unlink(temp).catch(() => {});
      throw err;
    }
  }
}

module.exports = { TitleRepository, clone };
