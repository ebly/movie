"use strict";

const { applySecurityHeaders, sendText, clientKey, clientGeo, visitorId } = require("./lib/http");
const { createRateLimiter } = require("./feedback");

function createGoHandler({ store, analytics }) {
  const allow = createRateLimiter({ windowMs: 60_000, max: 60 });

  return async function handleGo(req, res, rawId, rawIndex) {
    let id;
    try {
      id = decodeURIComponent(rawId);
    } catch (err) {
      sendText(res, 400, "400 · 作品编号不合法");
      return;
    }

    const resolved = store.resolveOffer(id, rawIndex);
    if (!resolved || !/^https?:\/\//i.test(resolved.url)) {
      sendText(res, 404, "404 · 观看渠道不存在");
      return;
    }

    const visitor = visitorId(req, res);
    if (analytics && allow(clientKey(req))) {
      await analytics.recordClick({
        titleId: resolved.item.id,
        title: resolved.item.title,
        providerId: resolved.offer.pid,
        provider: (store.providers[resolved.offer.pid] || {}).name || resolved.offer.pid,
        visitorId: visitor,
        geo: clientGeo(req)
      });
    }

    applySecurityHeaders(res);
    res.writeHead(302, {
      Location: resolved.url,
      "Cache-Control": "no-store",
      "Content-Length": "0"
    });
    res.end();
  };
}

module.exports = { createGoHandler };
