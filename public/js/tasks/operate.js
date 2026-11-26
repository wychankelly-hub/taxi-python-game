/* tasks/operate.js — 「操作」題：用大型彩色按鈕，自己一步一步完成每個操作
 * 每粒按鈕在關卡 JSON 定義：中文、英文、顏色、圖示，以及按下時執行的一句 Python（真的由模擬器執行）。
 *   buttons: [{ id, zh, en, color, icon, code, locked }]
 *   ops:     [{ run, item }]           每個操作（例如 push("紅")）；item 會成為 x 的值
 *   order:   ["top", "put"]            嚴格次序：按錯次序 → 回饋，不執行
 *   flow: "free" + before: [["a","b"]] 自由次序：a 要在 b 之前；違反時照執行，之後顯示陷阱（trap）
 *   rules:   { early: { 按鈕id: 回饋 | "placeFirst" }, dup: 回饋, wrong: 回饋 }
 * 每個操作完成後，與模擬器執行 op.run 的結果比對，一致才算完成。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt;
  const { Sims } = window;

  const ARROW = '<svg viewBox="0 0 16 16" width="28" height="28" shape-rendering="crispEdges" aria-hidden="true">'
    + '<path fill="#fff" d="M7 2h2v1h1v1h1v1h1v1h1v2h-3v6H6V8H3V6h1V5h1V4h1V3h1z"/><path fill="#0b1b3a" d="M7 1h2v1H7zM6 2h1v1H6zM9 2h1v1H9zM5 3h1v1H5zM10 3h1v1h-1zM4 4h1v1H4zM11 4h1v1h-1zM3 5h1v1H3zM12 5h1v1h-1zM2 6h1v3h3v6h4V9h3V6h1v3h-3v6H5V9H2z"/></svg>';

  function icon(spec, item, cfg) {
    if (!spec) return el('span', { class: 'b-ic' });
    if (spec === 'arrow') return el('span', { class: 'b-ic', html: ARROW });
    if (spec === 'item') return el('span', { class: 'b-ic bagic' }, TSD.itemIcon(cfg, item));
    if (spec.startsWith('sprite:')) return el('span', { class: 'b-ic' }, TSD.sprite(spec.slice(7), 'taxi-ic'));
    if (spec.startsWith('glyph:')) return el('span', { class: 'b-ic glyph' }, spec.slice(6));
    return el('span', { class: 'b-ic' });
  }

  /** 第一章「未郁 top 就放入」：讀出當時 top 的數值，說明會放到邊一格、會發生什麼事 */
  function placeFirstText(rules, state, cfg) {
    const top = state[cfg.pointer];
    const arr = state[cfg.array];
    const n = arr.length;
    const cell = arr[((top % n) + n) % n];
    const fx = rules.placeFirstEffects || {};
    let effect;
    if (top < 0) effect = fx.minus || '。';
    else if (cell !== null && cell !== undefined) effect = (fx.cover || '。').replace('{bag}', fmt(cell));
    else effect = fx.empty || '。';
    return rules.placeFirst.replace(/\{top\}/g, String(top)).replace('{effect}', effect);
  }
  TSD.placeFirstText = placeFirstText;

  /** 比較畫面上的陣列及指標 */
  function sameView(cfg, a, b) {
    return TSD.viewArrays(cfg).every(n => fmt(a[n]) === fmt(b[n])) && TSD.viewPointers(cfg).every(n => fmt(a[n]) === fmt(b[n]));
  }

  TSD.tasks.operate = function (L, t) {
    const cfg = L.ch.view;
    const rules = t.rules || {};
    const zh = id => (t.buttons.find(x => x.id === id) || {}).zh || id;
    const fnLines = TSD.functionLines(Sims.PROGRAMS[L.ch.sim], t.focus || L.lv.focus);
    const lineOf = text => { const x = text && fnLines.find(f => f.t.trim() === text.trim()); return x ? { src: 'prog', line: x.n } : null; };
    L.showCode({ focus: t.focus || L.lv.focus });
    let k = 0;

    const startOp = () => {
      if (k >= t.ops.length) {
        L.renderScene();
        L.code.mark(null);
        L.say('發哥', t.doneSay || '做得好！', 'happy');
        L.setPanel(L.taskHead(Object.assign({}, t, { prompt: t.prompt })), L.doneBox(t));
        return;
      }
      const op = t.ops[k];
      // 工作用的模擬器：x 是今次要放的資料
      const w = L.it.clone();
      if (op.item !== undefined) w.run(`x = ${JSON.stringify(op.item)}`, 'setup');
      const done = [];
      let busy = false;
      const usesX = id => /\bx\b/.test((t.buttons.find(b => b.id === id) || {}).code || '');
      const draw = access => L.renderScene({ state: w.snapshot(), access: access || [] }, { hand: done.some(usesX) ? null : op.item });

      const finishOp = async () => {
        const c = L.it.clone();
        c.run(op.run, 'run');
        if (sameView(cfg, w.snapshot(), c.snapshot())) {
          L.it.run(op.run, 'run');
          L.say('發哥', op.okSay || `啱！\`${op.run.split('\n')[0]}\` 完成。`, 'happy');
          k++;
          busy = true;
          setTimeout(startOp, 900);
          return;
        }
        // 自由次序的陷阱（例如鏈表指向自己）
        L.countWrong(t, `${op.run.split('\n')[0]}：次序錯（${done.map(zh).join('→')}）`);
        if (t.trap) {
          L.say('發哥', t.trap.say, 'shocked');
          const watch = el('button', {
            class: 'pxbtn ghost', type: 'button',
            onclick: async () => {
              const c2 = w.clone();
              const pre = c2.snapshot();
              const r = c2.run(t.trap.run, 'run', { trace: true, stepLimit: t.trap.stepLimit || 60 });
              await new TSD.Stepper(L, r, pre, { scored: false, run: t.trap.run, focus: t.trap.focus, maxSteps: t.trap.maxSteps || 30, title: t.trap.title || '睇吓架車點行（不計分）' }).open();
            },
          }, '▶ 睇吓架車點行');
          const again = el('button', { class: 'pxbtn primary', type: 'button', onclick: () => startOp() }, '↺ 重新嚟過');
          L.setPanel(L.taskHead(Object.assign({}, t, { prompt: t.trap.prompt || '次序錯咗！' })), el('div', { class: 'row-btns' }, watch, again));
        } else {
          L.say('發哥', rules.wrong || '結果唔啱，再嚟過。', 'angry');
          setTimeout(startOp, 900);
        }
      };

      const press = b => {
        if (busy) return;
        if (done.includes(b.id)) {
          L.countWrong(t, `${op.run.split('\n')[0]}：重複按「${zh(b.id)}」`);
          L.say('發哥', rules.dup || '呢一步已經做咗。', 'angry');
          return;
        }
        if (t.order) {
          const expected = t.order[done.length];
          if (b.id !== expected) {
            L.countWrong(t, `${op.run.split('\n')[0]}：未按「${zh(expected)}」就按「${zh(b.id)}」`);
            const fb = (rules.early || {})[b.id];
            L.code.mark(lineOf(b.code), 'err');
            if (fb === 'placeFirst') {
              const st = w.snapshot();
              L.say('發哥', placeFirstText(rules, st, cfg), 'angry');
              const n = st[cfg.array].length, top = st[cfg.pointer];
              draw([{ name: cfg.array, i: ((top % n) + n) % n, w: true }]);
              setTimeout(() => { if (!busy) draw(); }, 900);
            } else {
              L.say('發哥', fb || '次序唔啱，諗清楚邊一步先。', 'angry');
            }
            return;
          }
        }
        const r = w.run(b.code, 'op', { trace: true });
        if (!r.ok) {
          L.countWrong(t, `${op.run.split('\n')[0]}：「${zh(b.id)}」出錯`);
          L.say('發哥', TSD.errorText(r.error), 'shocked');
          return;
        }
        done.push(b.id);
        L.code.mark(lineOf(b.code));
        const acc = (r.trace || []).flatMap(s => s.access || []);
        draw(acc);
        const btn = btns.querySelector(`[data-id="${b.id}"]`);
        if (btn) btn.classList.add('done');
        const need = t.order || t.buttons.filter(x => x.code).map(x => x.id);
        if (need.every(id => done.includes(id))) { busy = true; setTimeout(() => { busy = false; finishOp(); }, 350); }
        else if (b.say) L.say('發哥', b.say.replace(/\{(\w+)\}/g, (m, n) => fmt(w.snapshot()[n])), 'normal');
      };

      const btns = el('div', { class: 'bigbtns n' + t.buttons.length }, t.buttons.map(b => el('button', {
        type: 'button', class: `bigbtn c-${b.color || 'blue'}${b.locked ? ' locked' : ''}`, 'data-id': b.id,
        disabled: !!b.locked, 'aria-label': `${b.zh} ${b.en}`, onclick: () => press(b),
      }, el('span', { class: 'b-zh' }, b.zh), icon(b.icon, op.item, cfg), el('span', { class: 'b-en' }, b.en),
        b.locked ? el('span', { class: 'b-lock' }, b.locked) : null)));
      const title = t.ops.length > 1 ? `第 ${k + 1}/${t.ops.length} 步：\`${op.run}\`` : t.prompt;
      L.setPanel(L.taskHead(Object.assign({}, t, { prompt: title })), btns);
      L.code.mark(null);
      if (k === 0) L.say('發哥', t.say || '一步一步嚟！', 'normal');
      draw();
    };
    startOp();
  };
})();
