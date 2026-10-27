"use strict";

const test = require("node:test");
const assert = require("node:assert");
const { toPinyin, matchScore } = require("../shared/pinyin.js");
const { norm, scoreItem } = require("../shared/search.js");
const seed = require("../server/data/seed.js");

const items = seed.DATA;
const top = (query) =>
  items
    .map((item) => ({ title: item.title, score: scoreItem(item, norm(query)) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

test("拼音：全拼与首字母", () => {
  assert.deepEqual(toPinyin("权力的游戏"), { full: "quanlideyouxi", initials: "qldyx" });
  assert.deepEqual(toPinyin("沙丘2"), { full: "shaqiu", initials: "sq" });
  assert.deepEqual(toPinyin("Stranger Things"), { full: "strangerthings", initials: "strangerthings" });
});

test("拼音：首字母与全拼都能命中作品", () => {
  assert.equal(top("qldyx")[0].title, "权力的游戏");
  assert.equal(top("quanlideyouxi")[0].title, "权力的游戏");
  assert.equal(top("sq")[0].title, "沙丘2");
  assert.equal(top("longzhijiazu")[0].title, "龙之家族");
});

test("拼音：中文与英文查询行为不变", () => {
  assert.equal(top("沙丘")[0].title, "沙丘2");
  assert.equal(top("dune")[0].title, "沙丘2");
  // 单字母不参与拼音匹配，避免噪音
  assert.equal(matchScore("龙之家族", "l"), 0);
  assert.equal(matchScore("龙之家族", ""), 0);
});
