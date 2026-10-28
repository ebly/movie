"use strict";

const crypto = require("crypto");
const BRAND = require("../config/brand.json");
const { parseCookies, appendCookie, secureFlag } = require("./lib/http");

const COOKIE_NAME = BRAND.cookies.admin;
const DEFAULT_PASSWORD = BRAND.defaultPassword;
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000;

function digest(value) {
  return crypto.createHash("sha256").update(String(value), "utf8").digest();
}

/**
 * Single-password admin sessions held in memory. Restarting the server logs
 * everyone out, which is acceptable for this self-hosted demo.
 */
class AdminAuth {
  constructor({ password, ttlMs = DEFAULT_TTL_MS } = {}) {
    this.usingDefaultPassword = !password;
    this.passwordHash = digest(password || DEFAULT_PASSWORD);
    this.ttlMs = ttlMs;
    this.sessions = new Map();
  }

  checkPassword(password) {
    return crypto.timingSafeEqual(digest(password || ""), this.passwordHash);
  }

  prune(now = Date.now()) {
    for (const [token, session] of this.sessions) {
      if (session.expiresAt <= now) this.sessions.delete(token);
    }
    while (this.sessions.size > 100) {
      this.sessions.delete(this.sessions.keys().next().value);
    }
  }

  issue(req, res) {
    this.prune();
    const token = crypto.randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + this.ttlMs;
    this.sessions.set(token, { expiresAt, createdAt: Date.now() });
    const maxAge = Math.floor(this.ttlMs / 1000);
    appendCookie(
      res,
      `${COOKIE_NAME}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Strict${secureFlag(req)}`
    );
    return { token, expiresAt };
  }

  authenticate(req) {
    const token = parseCookies(req)[COOKIE_NAME];
    if (!token) return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(token);
      return null;
    }
    return { token, expiresAt: session.expiresAt };
  }

  destroy(req, res) {
    const token = parseCookies(req)[COOKIE_NAME];
    if (token) this.sessions.delete(token);
    appendCookie(
      res,
      `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${secureFlag(req)}`
    );
  }
}

module.exports = { AdminAuth, DEFAULT_PASSWORD };
