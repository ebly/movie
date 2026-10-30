"use strict";

/**
 * 本地存储：访客编号、搜索历史、bootstrap 缓存。
 *
 * 访客编号对应后台的「真实访客」口径：小程序没有 Cookie 罐，
 * 所以用一个持久化的 UUID 放在请求头里，后台据此把同一个人的多次访问算成一个人。
 * 编号本身是随机的，不含任何设备信息。
 */

const VISITOR_KEY = "yt_vid";
const HISTORY_KEY = "yt_history";
const BOOT_KEY = "yt_bootstrap";
const HISTORY_MAX = 8;
const VISITOR_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function randomHex(size) {
  const chars = "0123456789abcdef";
  let text = "";
  for (let i = 0; i < size; i += 1) text += chars[Math.floor(Math.random() * 16)];
  return text;
}

function newVisitorId() {
  return `${randomHex(8)}-${randomHex(4)}-4${randomHex(3)}-a${randomHex(3)}-${randomHex(12)}`;
}

function visitorId() {
  let id = wx.getStorageSync(VISITOR_KEY);
  if (!VISITOR_RE.test(id || "")) {
    id = newVisitorId();
    wx.setStorageSync(VISITOR_KEY, id);
  }
  return id;
}

function history() {
  const list = wx.getStorageSync(HISTORY_KEY);
  return Array.isArray(list) ? list.filter((entry) => typeof entry === "string" && entry) : [];
}

function pushHistory(query) {
  const value = String(query || "").trim();
  if (!value) return history();
  const list = [value].concat(history().filter((entry) => entry !== value)).slice(0, HISTORY_MAX);
  wx.setStorageSync(HISTORY_KEY, list);
  return list;
}

function clearHistory() {
  wx.removeStorageSync(HISTORY_KEY);
}

/** bootstrap 里是平台名、免责声明这些几乎不变的东西，缓存一天，离线也能先把页面画出来。 */
function readBootstrap() {
  const cached = wx.getStorageSync(BOOT_KEY);
  if (!cached || typeof cached !== "object") return null;
  if (!cached.at || Date.now() - cached.at > 24 * 60 * 60 * 1000) return null;
  return cached.data || null;
}

function writeBootstrap(data) {
  if (!data || typeof data !== "object") return;
  wx.setStorageSync(BOOT_KEY, { at: Date.now(), data });
}

module.exports = {
  clearHistory,
  history,
  newVisitorId,
  pushHistory,
  readBootstrap,
  visitorId,
  writeBootstrap
};
