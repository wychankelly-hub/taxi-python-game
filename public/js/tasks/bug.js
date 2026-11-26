/* tasks/bug.js — 「捉錯」題：直接點程式區有錯的一行，再揀改正方法
 * 「▶ 試行」：用逐行視窗執行有錯的版本（不計分），睇吓出咩事。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, rich = TSD.rich;

  TSD.tasks.bug = function (L, t) {
    L.showStage(false);
    const lines = t.code.split('\n');
    const tryBtn = t.demo ? el('button', {
      class: 'pxbtn ghost', type: 'button', 'aria-label': '試行有錯的版本（不計分）',
      onclick: () => L.tryVariant(t.code, t.demo, '試行有錯的版本（不計分）'),
    }, '▶ 試行') : null;
    let phase = 1;

    const drawCode = mark => {
      L.code.setExpanded(true);
      L.code.toggle.hidden = true;
      L.code.lineEls = {};
      L.code.lines.replaceChildren();
      lines.forEach((text, i) => {
        const no = i + 1;
        const row = el('div', { class: 'ln' + (phase === 1 ? ' tapme' : '') + (mark && mark.includes(no) ? ' marked' : '') },
          el('span', { class: 'no' }, String(no)), el('span', { class: 'tx', html: TSD.highlight(text) || ' ' }));
        if (phase === 1) {
          row.setAttribute('role', 'button');
          row.setAttribute('aria-label', `第 ${no} 行`);
          row.addEventListener('click', () => tapLine(no));
        }
        L.code.lines.append(row);
      });
    };

    const tapLine = no => {
      if (!t.bugLines.includes(no)) {
        L.countWrong(t, `點了第 ${no} 行`);
        L.say('發哥', (t.lineFb && t.lineFb[no]) || t.lineFbDefault, 'angry');
        return;
      }
      phase = 2;
      drawCode(t.bugLines);
      L.say('發哥', `係喇，第 ${no} 行有問題！點樣改？`, 'happy');
      const grid = el('div', { class: 'opts one' });
      const buttons = [];
      for (const o of TSD.shuffle(t.fixes)) {
        const b = el('button', { class: 'opt small-text', type: 'button', html: rich(o.text) });
        b.addEventListener('click', () => {
          if (!o.correct) { L.countWrong(t, o.text); b.classList.add('wrong'); b.disabled = true; L.say('發哥', o.fb, 'angry'); return; }
          buttons.forEach(x => { x.disabled = true; });
          b.classList.add('right');
          L.showCode({ focus: t.fn });
          L.code.setExpanded(true);
          L.say('發哥', '改好喇！', 'happy');
          grid.replaceWith(L.doneBox(t));
        });
        buttons.push(b);
        grid.append(b);
      }
      L.setPanel(L.taskHead(Object.assign({}, t, { prompt: '應該點樣改正？' }), tryBtn), grid);
    };

    drawCode();
    L.say('發哥', t.say || '有一行出事，搵佢出嚟！可以先按「試行」睇吓結果。', 'normal');
    L.setPanel(L.taskHead(t, tryBtn), el('p', { class: 'hint-line' }, '↑ 直接點程式區入面有錯的一行'));
  };
})();
