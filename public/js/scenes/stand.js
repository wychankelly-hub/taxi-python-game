/* scenes/stand.js — 第二、三章主場景：的士站
 * 5 個車位橫排，車位 0 在左（近上客位置；背景左右反轉，令站牌在左邊）。
 * queue（第二章，移位版）：count 箭咀指向下一個空位 rank[count]；移動次數 + 黑煙。
 * circular（第三章，環形隊列）：head（下一架）、tail（空位）牌；左上角環形圖；指標由 4 回到 0 時「兜返個圈」。
 * 已不在隊列內、但仍留在陣列的車以灰色顯示。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt;
  const TAXIS = ['taxi_red_top', 'taxi_green_top', 'taxi_blue_top'];

  function colorOf(name) {
    let h = 0;
    for (const c of String(name)) h = (h * 31 + c.codePointAt(0)) % 997;
    return TAXIS[h % 3];
  }

  /** 一架的士（俯視）+ 司機名 */
  function car(v, small) {
    const block = () => el('span', { class: 'car-block' });
    return el('div', { class: 'car' + (small ? ' small' : '') }, TSD.sprite(colorOf(v), 'car-img', block), el('span', { class: 'car-label' }, fmt(v)));
  }

  /** 第幾格屬於隊列 */
  function inQueue(cfg, st, i) {
    const count = st.count;
    if (cfg.type === 'queue') return i < count;
    const n = (st[cfg.arrays[0]] || []).length;
    return count > 0 && (((i - st.head) % n) + n) % n < count;
  }

  function render(stage, meter, cfg, view, opts) {
    opts = opts || {};
    const st = view.state || {};
    const name = cfg.arrays[0];
    const arr = st[name] || [];
    const n = arr.length;
    const hl = {};
    (view.access || []).forEach(a => { if (a.name === name) hl[a.i] = a.w ? 'hl-w' : 'hl-r'; });

    if (!stage.dataset.bg) {
      const src = TSD.asset(cfg.bg);
      stage.classList.add('stage-stand');
      stage.replaceChildren();
      const bg = el('div', { class: 'stand-bg' });
      if (src) bg.style.backgroundImage = `url("${src}")`;
      stage.append(bg);
      stage.dataset.bg = '1';
    }
    const bgLayer = stage.querySelector('.stand-bg');

    const layer = el('div', { class: 'overlay stand', role: 'img',
      'aria-label': `${name} 由車位 0 至 4：${arr.map(fmt).join('、')}；` + (cfg.pointers || []).map(p => `${p} = ${fmt(st[p])}`).join('，') });
    layer.append(el('div', { class: 'pickup' }, '◀ 上客'));
    for (let i = 0; i < n; i++) {
      const v = arr[i];
      const inside = v !== null && inQueue(cfg, st, i);
      const key = `${name}[${i}]`;
      const bay = el('div', { class: ['bay', v === null ? 'empty' : inside ? 'in' : 'old', hl[i] || ''].join(' '), style: { '--i': i } },
        v === null ? null : car(v),
        v !== null && !inside ? el('span', { class: 'old-tag' }, '舊資料') : null,
        hl[i] === 'hl-w' && cfg.type === 'queue' ? TSD.sprite('fx_smoke', 'smoke') : null);
      layer.append(TSD.pickable(bay, key, opts), el('div', { class: 'bay-idx', style: { '--i': i } }, String(i)));
    }

    // 指標牌
    const marks = {};
    const addMark = (i, label, cls) => { (marks[i] = marks[i] || []).push(el('span', { class: 'mk ' + cls }, label)); };
    if (cfg.type === 'queue') {
      if (st.count < n) addMark(st.count, '▲ rank[count]', 'count');
      else addMark(n - 1, '已滿', 'full');
    } else {
      addMark(st.head, '▲ head 下一架', 'head');
      addMark(st.tail, '▲ tail 空位', 'tail');
    }
    for (const [i, list] of Object.entries(marks)) layer.append(el('div', { class: 'marks', style: { '--i': +i } }, list));

    // 第三章：環形圖
    if (cfg.type === 'circular') {
      const ring = el('div', { class: 'ring', 'aria-hidden': 'true' }, el('span', { class: 'ring-title' }, '環形圖'));
      for (let i = 0; i < n; i++) {
        const v = arr[i];
        const inside = v !== null && inQueue(cfg, st, i);
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        ring.append(el('span', {
          class: ['rnode', v === null ? 'empty' : inside ? 'in' : 'old', hl[i] || '', st.head === i ? 'is-head' : '', st.tail === i ? 'is-tail' : ''].join(' '),
          style: { left: `${50 + 36 * Math.cos(a)}%`, top: `${54 + 34 * Math.sin(a)}%` },
        }, String(i)));
      }
      layer.append(ring);
      // 兜返個圈：head 或 tail 由最後一格回到 0
      const prev = stage._prev || {};
      const wrapped = ['head', 'tail'].filter(p => prev[p] === n - 1 && st[p] === 0);
      if (wrapped.length) layer.append(el('div', { class: 'wrap-banner' }, `${wrapped.join('、')} 兜返個圈！${n - 1} → 0`));
      stage._prev = { head: st.head, tail: st.tail };
    }
    if (cfg.type === 'queue' && opts.moves !== undefined) {
      layer.append(el('div', { class: 'move-count' }, TSD.sprite('fx_smoke', 'smoke-ic'), `移動 ${opts.moves} 次`));
    }

    stage.replaceChildren(bgLayer, layer);
    meter.replaceChildren(...TSD.meterItems(cfg, view, Object.assign({}, opts, { moves: undefined })));
  }

  TSD.scenes = TSD.scenes || {};
  TSD.scenes.queue = { render, icon: v => car(v, true) };
  TSD.scenes.circular = { render, icon: v => car(v, true) };
})();
