/* store.js — 進度、星數及營收
 *
 * 規則（作者 2026-11-24 確認）：
 * - 每關星數：答錯 0 次 3 粒，1 次 2 粒，2 次或以上 1 粒；用了提示最多 2 粒。
 * - 1 星 = $10。
 * - 營收 = 各關「最佳」星數總和 × $10，加上收工小測每答對一題 $10（取最佳成績）。
 * - 關卡進行中「本程」車資 = 現時可得星數 × $10，答錯即時減少。
 * 進度存在 localStorage；讀寫失敗時遊戲照玩，只是不保存。
 */
(function (root) {
  'use strict';

  const STAR_VALUE = 10;

  const Score = {
    STAR_VALUE,

    /** 現時可得星數 */
    starsFor(wrong, hintUsed) {
      let s = wrong <= 0 ? 3 : wrong === 1 ? 2 : 1;
      if (hintUsed) s = Math.min(s, 2);
      return s;
    },

    /** 本程車資 */
    fare(wrong, hintUsed) { return Score.starsFor(wrong, hintUsed) * STAR_VALUE; },

    /** 合併新成績：只保留最佳 */
    best(prev, now) { return Math.max(prev || 0, now || 0); },

    /** 某章營收；progress = { stars: { "1-1": 3, … }, quiz: { "1": 2, … } } */
    chapterRevenue(progress, chapter) {
      const p = progress || {};
      const stars = Object.entries(p.stars || {})
        .filter(([id]) => id.split('-')[0] === String(chapter))
        .reduce((n, [, s]) => n + (s || 0), 0);
      const quiz = (p.quiz || {})[chapter] || 0;
      return (stars + quiz) * STAR_VALUE;
    },

    /** 全部營收 */
    revenue(progress) {
      const p = progress || {};
      const stars = Object.values(p.stars || {}).reduce((n, s) => n + (s || 0), 0);
      const quiz = Object.values(p.quiz || {}).reduce((n, s) => n + (s || 0), 0);
      return (stars + quiz) * STAR_VALUE;
    },

    money(n) { return '$' + n; },
  };

  /* 瀏覽器內的進度儲存（Node 測試時不使用） */
  const KEY = 'tsd:progress';
  const Store = {
    load() {
      try {
        const v = JSON.parse(root.localStorage.getItem(KEY) || 'null');
        return v && typeof v === 'object' ? Object.assign({ stars: {}, quiz: {} }, v) : { stars: {}, quiz: {} };
      } catch (e) { return { stars: {}, quiz: {} }; }
    },
    save(p) {
      try { root.localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* 無法儲存時照玩 */ }
    },
    recordLevel(id, stars) {
      const p = Store.load();
      p.stars[id] = Score.best(p.stars[id], stars);
      Store.save(p);
      return p;
    },
    recordQuiz(chapter, correct) {
      const p = Store.load();
      p.quiz[chapter] = Score.best(p.quiz[chapter], correct);
      Store.save(p);
      return p;
    },
  };

  const api = { Score, Store };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Score = Score; root.Store = Store; }
})(typeof window !== 'undefined' ? window : globalThis);
