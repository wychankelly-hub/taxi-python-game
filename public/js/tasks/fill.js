/* tasks/fill.js — 「填空」題：程式有一格空位，揀一個選項
 *   fn + blank（+ line）：函式內的空位；line 指定在哪一行（同一字眼出現多次時用）
 *   code：獨立幾句程式（例如第四章「插站」），空位寫作 ____
 * 答錯 → 回饋，並可「▶ 試行」錯誤版本（逐行視窗，不計分），親眼睇佢點出錯。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el;
  const { Sims } = window;

  /** 傳回 { withBlank, fill(opt) } */
  TSD.fillTemplate = function (src, t) {
    if (t.code) return { withBlank: t.code, fill: o => t.code.replace('____', o), standalone: true };
    const lines = TSD.functionLines(src, t.fn).map(x => x.t);
    const idx = t.line ? lines.findIndex(l => l.trim() === t.line.trim()) : lines.findIndex(l => l.includes(t.blank));
    const make = o => lines.map((l, i) => (i === idx ? l.replace(t.blank, o) : l)).join('\n');
    return { withBlank: make('____'), fill: make, standalone: false };
  };

  TSD.tasks.fill = function (L, t) {
    const tpl = TSD.fillTemplate(Sims.PROGRAMS[L.ch.sim], t);
    const srcId = tpl.standalone ? 'run' : 'prog';
    const blankLoc = () => ({ src: srcId, line: tpl.withBlank.split('\n').findIndex(x => x.includes('____')) + 1 });
    const show = fill => {
      L.code.show({ src: tpl.withBlank, srcId, blank: true, fill });
      L.code.mark(blankLoc());
    };
    L.renderScene();
    show();
    L.say('發哥', t.say || '揀啱嗰格先，程式先至行得通！', 'normal');

    const grid = el('div', { class: 'opts fill' + (t.options.length === 4 ? '' : ' one') });
    const head = L.taskHead(t);
    const buttons = [];
    for (const o of TSD.shuffle(t.options)) {
      const b = el('button', { class: 'opt mono', type: 'button' }, o.text);
      b.addEventListener('click', () => {
        if (!o.correct) {
          L.countWrong(t, o.text);
          b.classList.add('wrong'); b.disabled = true;
          L.say('發哥', o.fb, 'angry');
          if (t.scenario) {
            const old = head.querySelector('.replay');
            if (old) old.remove();
            const title = `試行：填入 ${o.text}（不計分）`;
            head.querySelector('.qbtns').prepend(el('button', {
              class: 'pxbtn ghost replay', type: 'button', 'aria-label': `試行填入 ${o.text} 的版本（不計分）`,
              onclick: () => (tpl.standalone
                ? L.tryRun(t.scenario.setup, tpl.fill(o.text) + (t.scenario.after ? '\n' + t.scenario.after : ''), title, t.scenario.stepLimit)
                : L.tryVariant(tpl.fill(o.text), t.scenario, title)),
            }, '▶ 試行'));
          }
          return;
        }
        buttons.forEach(x => { x.disabled = true; });
        b.classList.add('right');
        const r = head.querySelector('.replay'); if (r) r.remove();
        show(o.text);
        L.say('發哥', '啱喇！', 'happy');
        grid.replaceWith(L.doneBox(t));
      });
      buttons.push(b);
      grid.append(b);
    }
    L.setPanel(head, grid);
  };
})();
