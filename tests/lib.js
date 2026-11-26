'use strict';
// 極簡測試工具（不需安裝任何套件）
const PyRun = require('../public/js/pyrun.js');
const Sims = require('../public/js/sims.js');

const results = { pass: 0, fail: [], warn: [] };
let section = '';

function describe(name, fn) { section = name; fn(); }

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function check(name, actual, expected) {
  if (same(actual, expected)) results.pass++;
  else results.fail.push(`[${section}] ${name}\n      預期：${JSON.stringify(expected)}\n      模擬：${JSON.stringify(actual)}`);
}

// 文件內容與模擬結果不符、但屬於回饋文字等需要作者確認的項目
function warn(name, detail) { results.warn.push(`[${section}] ${name}\n      ${detail}`); }

const fmt = PyRun.fmt;

/** 建立模擬器；setup 為 Python 程式 */
function sim(name, setup) { return Sims.create(name, setup); }

/** 執行程式碼，傳回 { ok, error, trace, output, result } */
function run(it, code, opts) {
  return it.run(code, 'run', Object.assign({ trace: true }, opts || {}));
}

/** 執行並要求無錯誤，傳回最後一個運算式語句的值 */
function exec(it, code) {
  const r = run(it, code);
  if (!r.ok) throw new Error(`[${section}] 執行 ${code} 出錯：${r.error.message}`);
  return r.result;
}

/** 計算一個運算式並以遊戲顯示格式傳回 */
function ev(it, expr) { return fmt(it.eval(expr)); }

/** 數一數某一行程式在 trace 中執行了多少次 */
function countLine(trace, progName, lineText) {
  const lines = Sims.PROGRAMS[progName].split('\n');
  const target = lines.findIndex(l => l.trim() === lineText.trim()) + 1;
  if (!target) throw new Error('找不到程式行：' + lineText);
  return trace.filter(s => s.loc.src === 'prog' && s.loc.line === target).length;
}

/** 以另一段程式取代函式定義（用來測試錯誤版本） */
function redefine(it, code) {
  const r = it.run(code, 'variant');
  if (!r.ok) throw new Error('錯誤版本程式無法剖析：' + r.error.message);
  return it;
}

function errType(r) { return r.ok ? null : (r.error.pyType || 'StepLimit'); }

module.exports = { describe, check, warn, results, sim, run, exec, ev, fmt, countLine, redefine, errType, PyRun, Sims };
