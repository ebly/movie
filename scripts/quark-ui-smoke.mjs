// Browser smoke test with in-memory synthetic PanSou data. No live share links are searched.
// Uses installed Edge headless and CDP; no browser packages needed. Node >=22.
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { createApp } = require("../server/app");
const { createPansouClient } = require("../shared/pansou");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browserPath = process.env.EDGE_BIN || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!fs.existsSync(browserPath)) throw new Error("Set EDGE_BIN to installed Chromium/Edge.");
const temp = fs.mkdtempSync(path.join(root, ".verify-quark-"));
const results = [];
let server, browser, ws, session, id = 0;
const pending = new Map(), errors = [];
let upstreamCalls = 0;
function call(method, params = {}, inPage = true) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(new Error(`CDP timed out: ${method}`)); }, 15000);
    pending.set(n, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: n, method, params, ...(inPage && session ? { sessionId: session } : {}) }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function wait(expression) {
  return evaluate(`(async()=>{const end=performance.now()+6000;while(performance.now()<end){if(${expression})return true;await new Promise(r=>setTimeout(r,40));}throw new Error('UI wait failed: '+${JSON.stringify(expression)})})()`);
}
async function check(label, expression) {
  assert.equal(await evaluate(expression), true, label); results.push(label); console.log("PASS", label);
}
try {
  const pansou = createPansouClient({ baseUrl: "http://127.0.0.1:8888", fetchImpl: async (_url, opts) => {
    upstreamCalls++;
    const q = JSON.parse(opts.body).kw;
    if (q === "slow") await new Promise((resolve) => setTimeout(resolve, 300));
    if (q === "error") return new Response("{}", { status: 503 });
    const quark = q === "empty" ? [] : Array.from({ length: 65 }, (_, index) => ({
      url: `https://pan.quark.cn/s/Test${index}`, note: index === 0 ? "<img src=x onerror=alert(1)> 合成测试数据" : `合成测试数据 ${index}`,
      password: "demo", source: "plugin:synthetic-test", datetime: "2025-01-01T00:00:00Z"
    }));
    return new Response(JSON.stringify({ code: 0, data: { total: quark.length, merged_by_type: { quark } } }));
  }});
  server = http.createServer(createApp({ pansou, logger: false,
    dataFile: path.join(temp, "titles.json"), analyticsFile: path.join(temp, "analytics.ndjson"), feedbackFile: path.join(temp, "feedback.ndjson") }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ready = new Promise((resolve, reject) => {
    browser = spawn(browserPath, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${path.join(temp, "profile")}`, "--no-first-run", "--no-default-browser-check", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
    const timer = setTimeout(() => reject(new Error("Edge startup timed out")), 15000);
    let log = "";
    browser.stderr.on("data", (chunk) => { log += chunk; const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(log); if (match) { clearTimeout(timer); resolve(match[1]); } });
    browser.once("error", (err) => { clearTimeout(timer); reject(err); });
    browser.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Edge exited ${code}: ${log.slice(-1000)}`)); });
  });
  ws = new WebSocket(await ready);
  await new Promise((resolve, reject) => { ws.addEventListener("open", resolve, { once: true }); ws.addEventListener("error", reject, { once: true }); });
  ws.addEventListener("message", (event) => {
    const data = JSON.parse(event.data);
    if (data.method === "Runtime.exceptionThrown") errors.push(data.params.exceptionDetails);
    const waiter = pending.get(data.id);
    if (waiter) { clearTimeout(waiter.timer); pending.delete(data.id); data.error ? waiter.reject(new Error(data.error.message)) : waiter.resolve(data.result); }
  });
  const target = await call("Target.createTarget", { url: "about:blank" }, false);
  session = (await call("Target.attachToTarget", { targetId: target.targetId, flatten: true }, false)).sessionId;
  await call("Page.enable"); await call("Runtime.enable"); await call("Network.enable");
  await call("Network.setBlockedURLs", { urls: ["*fonts.googleapis.com*", "*fonts.gstatic.com*"] });
  await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
  await call("Page.navigate", { url: base });
  await wait("document.querySelector('[data-search]')");
  await check("home search targets quark by default", "document.querySelector('[data-search]').dataset.source==='quark'");
  await evaluate("document.querySelector('[data-search-input]').value='sample'; document.querySelector('[data-search-input]').dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-search]').requestSubmit()");
  await wait("document.querySelectorAll('.pan-card').length===30");
  await check("query uses dedicated mode and first page", "location.search.includes('source=quark')&&document.querySelectorAll('.pan-card').length===30");
  await check("source HTML is escaped", "document.querySelector('.pan-card h3').textContent.includes('<img')&&!document.querySelector('.pan-card img')");
  await check("external links are safe", "[...document.querySelectorAll('.pan-card a')].every(a=>a.hostname==='pan.quark.cn'&&a.target==='_blank'&&a.rel.includes('noopener')&&a.rel.includes('noreferrer'))");
  await check("desktop fits viewport", "document.documentElement.scrollWidth<=innerWidth");
  await evaluate("document.querySelector('a[aria-label=下一页]').click()");
  await wait("location.search.includes('page=2')&&document.querySelector('.pan-card h3')?.textContent.includes('30')");
  await check("page two returns next thirty rows", "document.querySelectorAll('.pan-card').length===30");
  await evaluate("document.querySelector('a[aria-label=下一页]').click()");
  await wait("document.querySelectorAll('.pan-card').length===5");
  await check("last page returns remaining five rows", "document.querySelector('.pan-card h3').textContent.includes('60')");
  assert.equal(upstreamCalls, 1, "pagination uses cache"); results.push("pagination uses cache");
  await evaluate("document.querySelector('[data-pan-reload]').click()");
  await wait("document.querySelectorAll('.pan-card').length===5");
  assert.equal(upstreamCalls, 2); results.push("manual reload bypasses local cache");
  await call("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await check("390px fits viewport", "document.documentElement.scrollWidth<=innerWidth");
  await evaluate("document.querySelector('[data-action=theme]').click()");
  await check("dark theme remains readable", "document.documentElement.dataset.theme==='dark'&&getComputedStyle(document.querySelector('.pan-card')).color!=='rgb(0, 0, 0)'");
  await evaluate("navigate('/search?source=quark&q=empty')");
  await wait("document.querySelector('.empty h3')?.textContent==='暂未找到公开分享'"); results.push("empty state");
  await evaluate("navigate('/search?source=quark&q=error')");
  await wait("document.querySelector('.empty h3')?.textContent==='夸克搜索暂未成功'");
  await check("error preserves mode and input", "document.querySelector('[data-search]').dataset.source==='quark'&&document.querySelector('[data-search-input]').value==='error'");
  await evaluate("navigate('/search?source=quark&q=slow');navigate('/')");
  await wait("document.querySelector('.home')");
  await evaluate("new Promise(r=>setTimeout(r,400))");
  await check("late response cannot replace home", "!!document.querySelector('.home')");
  assert.equal(errors.length, 0, JSON.stringify(errors)); results.push("no runtime exceptions");
  // Optional real website capture. This is not the synthetic fixture screen.
  if (process.env.UI_SCREENSHOT) {
    await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 850, deviceScaleFactor: 1, mobile: false });
    await call("Page.navigate", { url: "http://127.0.0.1:4173/search?source=quark" });
    await wait("document.querySelector('.pan-view')");
    await evaluate("document.documentElement.dataset.theme='light'");
    const shot = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(process.env.UI_SCREENSHOT, Buffer.from(shot.data, "base64"));
  }
  console.log(JSON.stringify({ passed: results.length, checks: results, syntheticUpstream: true }, null, 2));
} finally {
  if (ws && ws.readyState === WebSocket.OPEN) { try { await call("Browser.close", {}, false); } catch {} ws.close(); }
  if (browser && browser.exitCode === null) { browser.kill(); await new Promise((resolve) => browser.once("exit", resolve)); }
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const waiter of pending.values()) clearTimeout(waiter.timer);
  // Test files intentionally stay under the ignored project .verify-* directory, never in personal folders.
}
