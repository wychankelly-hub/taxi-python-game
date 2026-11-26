'use strict';
/* 關卡 JSON 檢查：用模擬器執行每一關（及收工小測）的開始狀態及操作，結果必須等於 JSON 內的答案。
 * 任何一關不符 → 測試失敗 → 不可發佈。
 */
const fs = require('fs');
const path = require('path');
const { describe, check, Sims, PyRun } = require('./lib.js');
const fmt = PyRun.fmt;

function functionLines(src, name) {
  const lines = src.split('\n');
  const start = lines.findIndex(l => l.startsWith('def ' + name + '('));
  let end = start + 1;
  while (end < lines.length && (lines[end].startsWith(' ') || (lines[end] === '' && (lines[end + 1] || '').startsWith(' ')))) end++;
  return lines.slice(start, end);
}

/** 數一數 trace 內某一行（程式原文）執行了多少次 */
function lineCount(trace, prog, text, srcIds) {
  const srcs = { prog: prog.split('\n') };
  return (trace || []).filter(s => {
    const lines = srcIds && srcIds[s.loc.src] ? srcIds[s.loc.src] : srcs[s.loc.src];
    return lines && (lines[s.loc.line - 1] || '').trim() === text;
  }).length;
}

function routeOf(it) {
  const c = it.clone();
  const r = c.run('show_route()', 'route', { stepLimit: 400 });
  return r.ok ? r.output.join(' → ') : 'LOOP';
}

function runChecks(it, r, checks) {
  return checks.map(c => {
    if (c.printed) return r && r.output.includes(c.printed) ? 'ok' : `沒有輸出「${c.printed}」`;
    if (c.output !== undefined) { const o = r ? r.output.join('、') : ''; return o === c.output ? 'ok' : `輸出「${o}」（應為「${c.output}」）`; }
    if (c.error) { const e = r && !r.ok ? (r.error.pyType || 'StepLimit') : null; return e === c.error ? 'ok' : `錯誤 ${e}（應為 ${c.error}）`; }
    const v = fmt(it.eval(c.expr));
    return v === c.value ? 'ok' : `${c.expr} = ${v}（應為 ${c.value}）`;
  }).filter(x => x !== 'ok');
}

/** 在新模擬器上用另一個版本的函式執行示範 */
function runVariant(sim, code, demo) {
  const it = Sims.create(sim, demo.setup);
  const d = it.run(code, 'variant');
  if (!d.ok) return { r: d, it };
  return { r: it.run(demo.run, 'run', { stepLimit: demo.stepLimit || 2000 }), it };
}
function demoMatches(res, exp) {
  if (exp.error) return (res.r.ok ? null : (res.r.error.pyType || 'StepLimit')) === exp.error;
  if (exp.output !== undefined) return res.r.output.join('、') === exp.output;
  const v = exp.expr === 'result' ? fmt(res.r.result) : fmt(res.it.eval(exp.expr));
  return v === exp.value;
}

function checkOptions(id, opts) {
  const correct = opts.filter(o => o.correct);
  check(`${id} 剛好一個正確選項`, correct.length, 1);
  check(`${id} 每個錯誤選項都有回饋`, opts.filter(o => !o.correct && !o.fb).map(o => o.text), []);
  check(`${id} 選項不重複`, new Set(opts.map(o => o.text)).size, opts.length);
  return correct[0];
}

/** 把 then 那行移到 first 之後（排列題「錯誤次序」示範） */
function wrongOrder(target, sp) {
  const w = target.slice();
  const ti = w.indexOf(sp.then);
  const [line] = w.splice(ti, 1);
  w.splice(w.indexOf(sp.first) + 1, 0, line);
  return w;
}

function testLevel(ch, lv) {
  const prog = Sims.PROGRAMS[ch.sim];
  const view = ch.view;
  const arrays = view.arrays || [view.array];
  const pointers = view.pointers || [view.pointer];
  let it = Sims.create(ch.sim, lv.setup);
  let lastTrace = null;
  for (const t of lv.tasks) {
    const id = t.id;
    if (t.setup !== undefined) it = Sims.create(ch.sim, t.setup);
    if (t.variant) check(`${id} 錯誤版本可以執行`, it.run(t.variant, 'variant').ok, true);
    if (t.options) checkOptions(id, t.options);
    if (t.fixes) checkOptions(id + ' 改正', t.fixes);

    if (t.type === 'predict') {
      const correct = t.options.find(o => o.correct);
      const want = t.expect || correct.text;
      let r = null, value, target = it;
      if (t.verify) {
        target = it.clone();
        r = target.run(t.verify, 'verify', { trace: true, stepLimit: 2000 });
        check(`${id} 驗證程式無錯誤`, r.ok, true);
      } else if (t.run) {
        r = it.run(t.run, 'run', { trace: true, stepLimit: t.stepLimit || 20000 });
        if (!(t.checks || []).some(c => c.error)) check(`${id} 執行 ${t.run.replace(/\n/g, '；')} 無錯誤`, r.ok ? null : r.error.message, null);
        lastTrace = r.trace;
      }
      const label = `${id} ${t.prompt}`;
      if (t.concept) {
        check(`${id} 概念題（答案已在設計文件測試核對）`, true, true);
      } else if (t.checks || t.route) {
        if (t.checks) check(`${label} → 模擬結果符合`, runChecks(target, r, t.checks), []);
        if (t.route) check(`${label} → 路線`, routeOf(target), t.route);
      } else if (t.checkMoves) {
        check(`${label} → 移動次數`, String(lineCount(r ? r.trace : lastTrace, prog, view.moveLine)), want);
      } else if (t.checkWrites) {
        const n = (r ? r.trace : lastTrace).reduce((k, s) => k + s.access.filter(a => a.w && a.name === t.checkWrites).length, 0);
        check(`${label} → 寫入 ${t.checkWrites} 的次數`, String(n), want);
      } else if (t.lineCount) {
        check(`${label} → 「${t.lineCount}」執行次數`, String(lineCount(r ? r.trace : lastTrace, prog, t.lineCount)), want);
      } else {
        value = t.check === 'result' ? r.result : target.eval(t.check);
        check(`${label} → 模擬結果等於正確答案`, fmt(value), want);
        if (!t.expect) check(`${id} 錯誤選項都不等於模擬結果`, t.options.filter(o => !o.correct && o.text === fmt(value)).map(o => o.text), []);
      }
    }

    if (t.type === 'operate') {
      const ids = t.buttons.map(b => b.id);
      for (const k of Object.keys((t.rules || {}).early || {})) check(`${id} 回饋對應的按鈕存在：${k}`, ids.includes(k), true);
      // 「未郁 top 就放入」回饋（第一章）：先放後郁時，袋放入的格與回饋所講一致
      if (t.rules && t.rules.placeFirstEffects) {
        const probe = Sims.create(ch.sim, lv.setup);
        for (const op of t.ops) {
          const before = probe.snapshot();
          const top = before[view.pointer], arr = before[view.array], n = arr.length;
          const w = probe.clone();
          w.run(`x = ${JSON.stringify(op.item)}`, 'setup');
          w.run(t.buttons.find(b => b.id === 'put').code, 'op');
          const after = w.snapshot()[view.array];
          const changed = after.map((x, i) => (fmt(x) !== fmt(arr[i]) ? i : -1)).filter(i => i >= 0);
          check(`${id} ${op.run}：先放後郁時，回饋說放入 ${view.array}[${((top % n) + n) % n}]（top = ${top}）`, changed, [((top % n) + n) % n]);
          probe.run(op.run, 'run');
        }
      }
      for (const op of t.ops) {
        // 按正確次序按鈕，結果要等於執行 op.run
        const order = t.order || t.buttons.filter(b => b.code).map(b => b.id);
        const w = it.clone();
        if (op.item !== undefined) w.run(`x = ${JSON.stringify(op.item)}`, 'setup');
        for (const bid of order) check(`${id} 按鈕 ${bid} 可執行`, w.run(t.buttons.find(b => b.id === bid).code, 'op').ok, true);
        const c = it.clone();
        const r = c.run(op.run, 'run');
        check(`${id} 執行 ${op.run.split('\n')[0]}`, r.ok, true);
        const same = arrays.every(a => fmt(w.eval(a)) === fmt(c.eval(a))) && pointers.every(p => fmt(w.eval(p)) === fmt(c.eval(p)));
        check(`${id} 按鈕次序 ${order.join('→')} 的結果等於 ${op.run.split('\n')[0]}`, same, true);
        if (op.item !== undefined) check(`${id} ${op.run} 的 item`, op.run.includes(JSON.stringify(op.item)), true);
        // 陷阱：自由次序時，違反次序要真的出事
        if (t.trap) {
          const bad = it.clone();
          for (const bid of ['d3', 'n2', 'n3']) bad.run(t.buttons.find(b => b.id === bid).code, 'op');
          check(`${id} 陷阱：先改舊路再接後路 → 路線不停兜圈`, routeOf(bad), 'LOOP');
        }
        it.run(op.run, 'run');
      }
      for (const [k, v] of Object.entries(t.expectFinal)) check(`${id} 完成後 ${k}`, fmt(it.eval(k)), v);
    }

    if (t.type === 'fill') {
      if (t.code) {
        check(`${id} 填空位置只有一個 ____`, t.code.split('____').length - 1, 1);
        for (const o of t.options) {
          const v = Sims.create(ch.sim, t.scenario.setup);
          const code = t.code.replace('____', o.text) + (t.scenario.after ? '\n' + t.scenario.after : '');
          const r = v.run(code.replace(/？/g, '4'), 'run', { stepLimit: t.scenario.stepLimit || 2000 });
          const errs = r.ok ? runChecks(v, r, t.scenario.checks) : [r.error ? (r.error.message || 'StepLimit') : 'error'];
          if (o.correct) check(`${id} 填 ${o.text} → 正確`, errs, []);
          else check(`${id} 填 ${o.text} → 出錯或結果錯（錯誤選項必須真的錯）`, errs.length > 0, true);
        }
      } else {
        const lines = functionLines(prog, t.fn);
        const idx = t.line ? lines.findIndex(l => l.trim() === t.line.trim()) : lines.findIndex(l => l.includes(t.blank));
        check(`${id} 填空所在的行存在`, idx >= 0, true);
        check(`${id} 該行只有一個空位`, lines[idx].split(t.blank).length - 1, 1);
        for (const o of t.options) {
          const code = lines.map((l, i) => (i === idx ? l.replace(t.blank, o.text) : l)).join('\n');
          const res = runVariant(ch.sim, code, t.scenario);
          const errs = res.r.ok ? runChecks(res.it, res.r, t.scenario.checks) : [res.r.error.message || 'StepLimit'];
          if (o.correct) check(`${id} 填 ${o.text} → 程式正確`, errs, []);
          else check(`${id} 填 ${o.text} → 程式出錯或結果錯（錯誤選項必須真的錯）`, errs.length > 0, true);
        }
      }
    }

    if (t.type === 'order') {
      const target = functionLines(prog, t.fn);
      check(`${id} 排列的行來自程式`, target.length > 2, true);
      check(`${id} 排列的行不重複`, new Set(target).size, target.length);
      for (const sp of t.specials || []) {
        const a = target.indexOf(sp.first), b = target.indexOf(sp.then);
        check(`${id} 特別檢查「${sp.id}」的兩行存在，且正確次序是 then 在前`, [a > -1, b > -1, b < a], [true, true, true]);
        const res = runVariant(ch.sim, wrongOrder(target, sp).join('\n'), sp.demo);
        check(`${id} 特別檢查「${sp.id}」示範結果`, demoMatches(res, sp.expectDemo), true);
        const good = runVariant(ch.sim, target.join('\n'), sp.demo);
        check(`${id} 特別檢查「${sp.id}」正確版本結果不同`, demoMatches(good, sp.expectDemo), false);
      }
    }

    if (t.type === 'bug') {
      const target = functionLines(prog, t.fn);
      const bug = t.code.split('\n');
      const diff = target.map((l, i) => (l === bug[i] ? null : i + 1)).filter(Boolean);
      check(`${id} 錯誤版本與正確程式只差在 bugLines`, diff, t.bugLines);
      check(`${id} 試行錯誤版本的結果`, demoMatches(runVariant(ch.sim, t.code, t.demo), t.expectDemo), true);
      check(`${id} 正確版本結果不同`, demoMatches(runVariant(ch.sim, target.join('\n'), t.demo), t.expectDemo), false);
    }
  }
}

const dir = path.join(__dirname, '..', 'public', 'levels');
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.json')).sort()) {
  const ch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const lv of ch.levels) describe(`${f} ${lv.id} ${lv.title}`, () => testLevel(ch, lv));
  if (ch.quiz) describe(`${f} 收工小測`, () => {
    check('小測 3 題', ch.quiz.tasks.length, 3);
    check('小測不設提示', ch.quiz.tasks.filter(t => t.hint).length, 0);
    testLevel(ch, ch.quiz);
  });
  describe(`${f} 關卡數目`, () => check('每章 6 關', ch.levels.length, 6));
}
