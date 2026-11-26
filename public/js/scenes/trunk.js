/* scenes/trunk.js — 第一章主場景：車尾箱
 * 行李由車尾箱地台向上疊起（索引 0 在最底），左邊是索引 0–4，右邊是 top 箭咀。
 * 已不在堆疊內、但仍留在陣列的資料以灰色顯示。
 * 下方「咪錶」顯示 top、函式內變量、傳回值及輸出。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt;

  // 行李顏色 → 素材名稱（素材未有時用色塊）
  const BAGS = {
    紅: { asset: 'bag_red', color: '#d63a33', dark: '#8f1f1b' },
    藍: { asset: 'bag_blue', color: '#2f6fd6', dark: '#1b3f86' },
    黃: { asset: 'bag_yellow', color: '#e8b51c', dark: '#9a7408' },
    紫: { asset: 'bag_purple', color: '#8a4fd0', dark: '#55298a' },
    橙: { asset: 'bag_orange', color: '#ec7a1c', dark: '#9c4808' },
  };

  function bag(v) {
    const b = BAGS[v];
    const label = el('span', { class: 'bag-label' }, fmt(v));
    if (!b) return el('div', { class: 'bag plain' }, label);
    const block = () => el('span', { class: 'bag-block', style: { '--c': b.color, '--d': b.dark } });
    return el('div', { class: 'bag' }, TSD.sprite(b.asset, 'bag-img', block), label);
  }

  function pickable(node, key, opts) {
    if (!opts.pick) return node;
    node.classList.add('pick');
    if (opts.found && opts.found.has(key)) node.classList.add('found');
    if (opts.miss === key) node.classList.add('miss');
    node.setAttribute('role', 'button');
    node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', '選 ' + key);
    const fn = () => opts.pick(key);
    node.addEventListener('click', fn);
    node.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
    return node;
  }

  /**
   * stage：主場景元素；meter：咪錶元素
   * view：{ state, locals, localNames, access, ret }
   * opts：{ output, pick, found, miss }
   */
  function render(stage, meter, cfg, view, opts) {
    opts = opts || {};
    const st = view.state || {};
    const arr = st[cfg.array] || [];
    const top = st[cfg.pointer];
    const hl = {};
    (view.access || []).forEach(a => { if (a.name === cfg.array) hl[a.i] = a.w ? 'hl-w' : 'hl-r'; });

    if (!stage.dataset.bg) {
      const src = TSD.asset('bg_ch1_trunk');
      if (src) stage.style.backgroundImage = `url("${src}")`;
      stage.dataset.bg = '1';
      stage.classList.add('stage-trunk');
    }

    const layer = el('div', { class: 'overlay', role: 'img',
      'aria-label': `${cfg.array} 由索引 0 至 4：${arr.map(fmt).join('、')}；${cfg.pointer} = ${top}` });
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      const inStack = typeof top === 'number' && i <= top && v !== null;
      const key = `${cfg.array}[${i}]`;
      const slot = el('div', { class: ['slot', v === null ? 'empty' : inStack ? 'in' : 'old', hl[i] || ''].join(' '), style: { '--i': i } },
        v === null ? null : bag(v),
        v !== null && !inStack ? el('span', { class: 'old-tag' }, '舊資料') : null);
      layer.append(pickable(slot, key, opts), el('div', { class: 'idx', style: { '--i': i } }, String(i)));
    }
    // top 箭咀；空堆疊（-1）時指向地台下面
    layer.append(el('div', { class: 'ptr-arrow' + (top === -1 ? ' minus' : ''), style: { '--i': top } },
      el('span', null, '◀ ' + cfg.pointer), top === -1 ? el('small', null, '-1（空）') : null));

    stage.replaceChildren(layer);

    // 咪錶
    const prev = meter._prevTop;
    const items = [];
    items.push(pickable(el('div', { class: 'm-item' }, el('span', { class: 'k' }, cfg.pointer),
      el('b', { class: 'v' + (prev !== undefined && prev !== top ? ' flash' : '') }, String(top))), cfg.pointer, opts));
    meter._prevTop = top;
    const loc = view.locals || {};
    for (const k of Array.from(new Set((view.localNames || []).concat(Object.keys(loc))))) {
      const has = Object.prototype.hasOwnProperty.call(loc, k);
      items.push(pickable(el('div', { class: 'm-item' }, el('span', { class: 'k' }, k),
        el('b', { class: 'v' }, has ? fmt(loc[k]) : '—')), k, opts));
    }
    if (opts.hand) items.push(el('div', { class: 'm-item hand' }, el('span', { class: 'k' }, '手上'), el('span', { class: 'mini-bag' }, bag(opts.hand))));
    if (view.ret !== undefined) items.push(el('div', { class: 'm-item ret' }, el('span', { class: 'k' }, '傳回'), el('b', { class: 'v' }, view.ret)));
    const out = opts.output || [];
    if (out.length) items.push(el('div', { class: 'm-item out' }, el('span', { class: 'k' }, '輸出'), el('b', { class: 'v' }, out[out.length - 1])));
    meter.replaceChildren(...items);
  }

  TSD.bag = bag;
  TSD.scenes = TSD.scenes || {};
  TSD.scenes.stack = { render, icon: bag };
})();
