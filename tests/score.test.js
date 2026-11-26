'use strict';
// 星數及營收規則（1 星 = $10）
const { describe, check } = require('./lib.js');
const { Score } = require('../public/js/store.js');

describe('星數及營收', () => {
  check('答錯 0 次 → 3 星', Score.starsFor(0, false), 3);
  check('答錯 1 次 → 2 星', Score.starsFor(1, false), 2);
  check('答錯 2 次 → 1 星', Score.starsFor(2, false), 1);
  check('答錯 9 次 → 仍有 1 星', Score.starsFor(9, false), 1);
  check('用了提示、無答錯 → 最多 2 星', Score.starsFor(0, true), 2);
  check('用了提示、答錯 2 次 → 1 星', Score.starsFor(2, true), 1);
  check('本程車資：3 星 = $30', Score.fare(0, false), 30);
  check('本程車資：答錯 1 次 = $20', Score.fare(1, false), 20);
  check('本程車資：最少 $10', Score.fare(5, true), 10);
  check('只保留最佳成績', [Score.best(3, 1), Score.best(1, 3), Score.best(undefined, 2)], [3, 3, 2]);

  const p = { stars: { '1-1': 3, '1-2': 2, '1-3': 1, '2-1': 3 }, quiz: { 1: 2 } };
  check('第一章營收 = (3+2+1 星 + 小測 2 題) × $10', Score.chapterRevenue(p, 1), 80);
  check('第二章營收', Score.chapterRevenue(p, 2), 30);
  check('全部營收', Score.revenue(p), 110);
  check('空進度營收 $0', Score.revenue({}), 0);
  check('滿分上限：24 關 × 3 星 + 4 小測 × 3 題 = $840',
    Score.revenue({ stars: Object.fromEntries([1, 2, 3, 4].flatMap(c => [1, 2, 3, 4, 5, 6].map(l => [`${c}-${l}`, 3]))), quiz: { 1: 3, 2: 3, 3: 3, 4: 3 } }), 840);
  check('顯示格式', Score.money(450), '$450');
});
