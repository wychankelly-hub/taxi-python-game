/* tasks/order.js — 「排列」題：依次點選打亂了的程式行
 * 程式區顯示已放入的行（點一行可取回）；操作面板顯示未放入的行。
 * 錯誤排列若符合 specials（例如先放後郁 top）→ 專門回饋 + 「▶ 試行」你砌的版本。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el;
  const { Sims } = window;

  const shown = text => text.replace(/^( +)/, m => '·'.repeat(m.length));

  TSD.tasks.order = function (L, t) {
    L.showStage(false);
    const target = TSD.functionLines(Sims.PROGRAMS[L.ch.sim], t.fn).map(x => x.t);
    let pool = TSD.shuffle(target.map((text, id) => ({ id, text })));
    while (pool.length > 2 && pool.every((p, i) => p.id === i)) pool = TSD.shuffle(pool);
    const placed = [];
    const head = L.taskHead(t);
    const poolBox = el('div', { class: 'pool' });
    const okBtn = el('button', { class: 'pxbtn primary', type: 'button', disabled: true, onclick: () => check() }, '確定');
    const backBtn = el('button', { class: 'pxbtn', type: 'button', onclick: () => { pool = pool.concat(placed.splice(0)); draw(); } }, '↺ 全部取回');
    let done = false;

    const draw = () => {
      L.code.setExpanded(true);
      L.code.toggle.hidden = true;
      L.code.lineEls = {};
      L.code.lines.replaceChildren(el('div', { class: 'sec first' }, done ? '砌好的程式' : '你砌的程式（點一行可取回）'));
      // 只顯示已放入的行，加一行「下一行」提示（不顯示一大堆空行，節省位置）
      target.slice(0, Math.min(target.length, placed.length + (done ? 0 : 1))).forEach((_, i) => {
        const p = placed[i];
        const row = el('div', { class: 'ln' + (p ? (done ? '' : ' tapme') : ' empty') },
          el('span', { class: 'no' }, String(i + 1)), el('span', { class: 'tx', html: p ? TSD.highlight(p.text) : `<span class="cm">↓ 第 ${i + 1} 行：喺下面揀（共 ${target.length} 行）</span>` }));
        if (p && !done) {
          row.setAttribute('role', 'button');
          row.setAttribute('aria-label', '取回第 ' + (i + 1) + ' 行');
          row.addEventListener('click', () => { placed.splice(i, 1); pool.push(p); draw(); });
        }
        L.code.lines.append(row);
      });
      poolBox.replaceChildren(...pool.map((p, j) => el('button', {
        class: 'poolline', type: 'button', html: TSD.highlight(shown(p.text)),
        onclick: () => { pool.splice(j, 1); placed.push(p); draw(); },
      })));
      okBtn.disabled = pool.length > 0;
    };

    const check = () => {
      const mine = placed.map(p => p.text);
      const old = head.querySelector('.replay'); if (old) old.remove();
      if (mine.join('\n') === target.join('\n')) {
        done = true;
        draw();
        L.say('發哥', '砌得好！程式而家行得通喇。', 'happy');
        L.setPanel(head, L.doneBox(t));
        return;
      }
      const sp = (t.specials || []).find(s => mine.indexOf(s.first) > -1 && mine.indexOf(s.first) < mine.indexOf(s.then));
      const right = mine.filter((x, i) => x === target[i]).length;
      L.countWrong(t, sp ? sp.id : `${right}/${target.length} 行位置正確`);
      L.say('發哥', sp ? sp.fb : `有 ${right} / ${target.length} 行位置啱，再睇吓。點程式區的行可以取回。`, 'angry');
      if (sp && sp.demo) {
        head.querySelector('.qbtns').prepend(el('button', {
          class: 'pxbtn ghost replay', type: 'button', 'aria-label': '試行你砌的版本（不計分）',
          onclick: () => L.tryVariant(mine.join('\n'), sp.demo, '試行你砌的版本（不計分）'),
        }, '▶ 試行'));
      }
    };

    L.say('發哥', t.say || '由第 1 行開始，依次點選。', 'normal');
    L.setPanel(head, poolBox, el('div', { class: 'row-btns' }, backBtn, okBtn));
    draw();
  };
})();
