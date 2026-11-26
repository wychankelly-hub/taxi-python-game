/* tasks/predict.js — 「預測」題：看程式及陣列，揀執行後的結果
 * 答對 → 彈出「逐行執行」視窗（計分）；答錯 → 回饋 + 可「睇返執行過程」（不計分）。
 * 收工小測：每題只有一次機會，答完顯示正確答案，不彈出逐行視窗。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt, rich = TSD.rich;

  TSD.tasks.predict = function (L, t) {
    L.renderScene();
    L.showCode(Object.assign(L.codeFor(t), { run: t.run }));
    if (t.run) L.code.mark({ src: 'run', line: 1 });
    L.say('發哥', t.say || (t.run ? '睇住個程式，未執行之前估吓結果先！' : '睇清楚畫面，再答！'), 'normal');

    const plain = o => o.text.replace(/`/g, '');
    const short = t.options.every(o => plain(o).length <= 4);
    const long = t.options.some(o => plain(o).length > 9);
    const grid = el('div', { class: 'opts' + (long ? ' one' : short && t.options.length >= 3 ? ' n' + Math.min(t.options.length, 4) : '') });
    const buttons = [];

    const choose = async (o, b) => {
      if (L.quiz) {
        buttons.forEach(x => { x.disabled = true; if (x._opt.correct) x.classList.add('right'); });
        if (o.correct) { L.quizScore++; L.updateFare(); L.say('發哥', '啱！', 'happy'); }
        else { b.classList.add('wrong'); TSD.record({ type: 'error', level: L.lv.id, question: t.id, choice: o.text }); L.say('發哥', o.fb, 'angry'); }
        if (t.run) {
          const r = L.it.run(t.run, 'run', { trace: true, stepLimit: t.stepLimit || 20000 });
          L.moves = L.countMoves(r.trace, L.moves);
          L.output = L.output.concat(r.output);
          L.ret = r.result !== undefined && r.result !== null ? fmt(r.result) : undefined;
          L.renderScene();
        }
        grid.after(L.doneBox(t));
        return;
      }
      if (!o.correct) {
        L.countWrong(t, o.text);
        b.classList.add('wrong'); b.disabled = true;
        L.say('發哥', o.fb, 'angry');
        if (t.run && !head.querySelector('.replay')) {
          head.querySelector('.qbtns').prepend(el('button', {
            class: 'pxbtn ghost replay', type: 'button', 'aria-label': '睇返執行過程（不計分）',
            onclick: async ev => { const btn = ev.currentTarget; btn.disabled = true; await L.replay(t); btn.disabled = false; },
          }, '▶ 睇返'));
        }
        return;
      }
      buttons.forEach(x => { x.disabled = true; });
      b.classList.add('right');
      if (t.run) {
        L.say('發哥', '啱喇！而家一行一行行一次，睇吓電腦點樣做。', 'happy');
        await TSD.sleep(600);
        await L.stepThrough(t);
        L.code.mark(null);
      }
      L.say('發哥', '啱喇！', 'happy');
      const r = head.querySelector('.replay'); if (r) r.remove();
      grid.replaceWith(L.doneBox(t));
    };

    for (const o of TSD.shuffle(t.options)) {
      const b = el('button', { class: 'opt', type: 'button', html: rich(o.text) });
      b._opt = o;
      b.addEventListener('click', () => choose(o, b));
      buttons.push(b);
      grid.append(b);
    }
    const head = L.taskHead(t);
    L.setPanel(head, grid);
  };
})();
