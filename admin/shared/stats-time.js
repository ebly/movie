"use strict";

/**
 * 统计分日口径 —— 统一按北京时间（UTC+8）切一天。
 *
 * 为什么单独抽这一个文件：Worker 版原来按 UTC 切天（日界落在北京时间早上 8 点），
 * Node 版按服务器本地时区切天，同一份 events 数据在两套部署下日趋势并不一致，
 * 看板上「今天」的数字也就对不上直觉。这里用固定偏移做纯算术，不依赖 Intl、
 * 不依赖宿主机 TZ，Worker 与 Node 的结果必然相同。
 *
 * admin/shared/stats-time.js 是本文件的同步副本（admin/ 是自包含项目），
 * 改这里请同步改那里。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 相对 UTC 的偏移分钟数：480 = UTC+8（北京时间）。 */
const DEFAULT_OFFSET_MINUTES = 480;

/** Workers 运行时没有 process，取值前先确认环境，避免模块加载就抛错。 */
function resolveOffsetMinutes() {
  const raw = typeof process !== "undefined" && process.env
    ? process.env.STATS_TZ_OFFSET_MINUTES
    : undefined;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= 840 ? value : DEFAULT_OFFSET_MINUTES;
}

const OFFSET_MINUTES = resolveOffsetMinutes();

function pad(value) {
  return String(value).padStart(2, "0");
}

/** 事件属于统计时区的哪一天：'YYYY-MM-DD'。入参是真实 UTC 时刻。 */
function dayKey(date) {
  const shifted = new Date(date.getTime() + OFFSET_MINUTES * 60000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** 统计时区「今天零点」对应的真实时刻，用于圈定看板的时间区间。 */
function startOfDay(date) {
  const shifted = new Date(date.getTime() + OFFSET_MINUTES * 60000);
  const shiftedStart = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
  return new Date(shiftedStart - OFFSET_MINUTES * 60000);
}

module.exports = { DAY_MS, OFFSET_MINUTES, dayKey, startOfDay };
