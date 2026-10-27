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
 * Mutable title repository backed by one JSON file.
 * Mutations are serialized and written atomically (temp file + rename).
 */
class TitleRepository {
  constructor({ file, seedData, logger = console }) {
    this.file = file;
    this.seedData = seedData;
    this.logger = logger;
    this.items = [];
    this.byId = new Map();
    this.queue = Promise.resolve();
    this.load();
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
    } catch (err) {
      this.logger.error(`${BRAND.logPrefix} 无法创建片库文件，数据只保存在内存中`, err);
    }
  }

  reindex() {
    this.byId = new Map(this.items.map((item) => [item.id, item]));
  }

  all() {
    return this.items;
  }

  get(id) {
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
    } catch (err) {
      await fs.promises.unlink(temp).catch(() => {});
      throw err;
    }
  }
}

module.exports = { TitleRepository };
