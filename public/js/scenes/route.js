/* scenes/route.js — 第四章主場景：維港地圖上的路線（鏈表）
 * 站名方格放在地圖上（已知站名用真實位置），箭咀由 nxt 決定；head 標示第一站；
 * 執行 show_route() 時，小的士停在 p 指着的站。
 * 地圖下面是兩行陣列 data / nxt（索引 0–4），可點選；不在路線內的站以灰色顯示。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt;

  // 地圖上的位置（百分比）
  const PLACES = {
    // 底部（y > 78%）留給右下角的指標及輸出
    深水埗: [30, 17], 旺角: [52, 15], 尖沙咀: [50, 42], 中環: [36, 68], 金鐘: [60, 68],
    九龍: [62, 30], 港島: [46, 68], 新界: [80, 12], 離島: [12, 64],
  };
  const SLOTS = [[18, 22], [50, 12], [82, 24], [72, 66], [28, 66]];

  function pos(name, i) { return PLACES[name] || SLOTS[i % SLOTS.length]; }

  /** 由 head 跟 nxt 行，找出在路線內的索引（遇到重複即停：有循環） */
  function walk(st, cfg) {
    const nxt = st[cfg.arrays[1]] || [];
    const seen = [];
    let p = st[cfg.pointers[0]];
    while (typeof p === 'number' && p >= 0 && p < nxt.length && !seen.includes(p)) { seen.push(p); p = nxt[p]; }
    return { seen, loop: typeof p === 'number' && p >= 0 && seen.includes(p) };
  }

  function render(stage, meter, cfg, view, opts) {
    opts = opts || {};
    const st = view.state || {};
    const [dn, nn] = cfg.arrays;
    const data = st[dn] || [], nxt = st[nn] || [];
    const head = st[cfg.pointers[0]];
    const p = view.locals && Object.prototype.hasOwnProperty.call(view.locals, 'p') ? view.locals.p : undefined;
    const hl = {};
    (view.access || []).forEach(a => { hl[a.name + a.i] = a.w ? 'hl-w' : 'hl-r'; });
    const { seen, loop } = walk(st, cfg);

    if (!stage.dataset.bg) {
      const src = TSD.asset(cfg.bg);
      if (src) stage.style.backgroundImage = `url("${src}")`;
      stage.dataset.bg = '1';
      stage.classList.add('stage-route');
    }

    const layer = el('div', { class: 'overlay route', role: 'img',
      'aria-label': `路線：${seen.map(i => fmt(data[i])).join(' → ')}${loop ? '（不停兜圈）' : ''}` });

    // 箭咀（SVG）
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'arrows');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    const defs = document.createElementNS(NS, 'defs');
    defs.innerHTML = '<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#ffd23f"/></marker>'
      + '<marker id="ahg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="#8a8fa8"/></marker>';
    svg.append(defs);
    for (let i = 0; i < data.length; i++) {
      if (data[i] === null || typeof nxt[i] !== 'number' || nxt[i] < 0 || nxt[i] >= data.length || data[nxt[i]] === null) continue;
      const on = seen.includes(i);
      const [x1, y1] = pos(data[i], i), [x2, y2] = pos(data[nxt[i]], nxt[i]);
      const line = document.createElementNS(NS, 'path');
      if (nxt[i] === i) {
        line.setAttribute('d', `M${x1 + 3} ${y1 - 6} C ${x1 + 14} ${y1 - 22}, ${x1 - 14} ${y1 - 22}, ${x1 - 3} ${y1 - 6}`);
      } else {
        // 線段兩端退後少少，避免蓋住站名
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
        const sx = x1 + dx / len * 7, sy = y1 + dy / len * 9, ex = x2 - dx / len * 7, ey = y2 - dy / len * 9;
        line.setAttribute('d', `M${sx} ${sy} L ${ex} ${ey}`);
      }
      line.setAttribute('class', 'arr' + (on ? ' on' : '') + (hl[nn + i] ? ' ' + hl[nn + i] : ''));
      line.setAttribute('marker-end', on ? 'url(#ah)' : 'url(#ahg)');
      line.setAttribute('vector-effect', 'non-scaling-stroke');
      svg.append(line);
    }
    layer.append(svg);

    // 站名方格
    for (let i = 0; i < data.length; i++) {
      if (data[i] === null) continue;
      const [x, y] = pos(data[i], i);
      const on = seen.includes(i);
      const node = el('div', { class: ['stop', on ? 'on' : 'off', hl[dn + i] || '', i === head ? 'is-head' : '', p === i ? 'is-p' : ''].join(' '), style: { left: x + '%', top: y + '%' } },
        el('span', { class: 'stop-i' }, String(i)), el('span', { class: 'stop-name' }, fmt(data[i])),
        nxt[i] === -1 && on ? el('span', { class: 'stop-end' }, '終點') : null);
      layer.append(node);
      if (i === head) layer.append(el('div', { class: 'head-flag', style: { left: x + '%', top: y + '%' } }, 'head ▶'));
    }
    if (typeof p === 'number' && p >= 0 && data[p] !== null && data[p] !== undefined) {
      const [x, y] = pos(data[p], p);
      layer.append(el('div', { class: 'route-taxi', style: { left: x + '%', top: y + '%' } }, TSD.sprite('taxi_small', 'taxi-ic')));
    }
    if (loop) layer.append(el('div', { class: 'wrap-banner bad' }, '路線有循環：會不停兜圈！'));
    // 指標及變量放在地圖右下角，節省高度
    layer.append(el('div', { class: 'll-vars' }, ...TSD.meterItems(cfg, view, opts)));
    stage.replaceChildren(layer);

    // 下面：data / nxt 兩行陣列 + 指標
    const table = el('div', { class: 'll-table' },
      el('span', { class: 'll-h' }, '索引'), ...data.map((_, i) => el('span', { class: 'll-h' + (p === i ? ' is-p' : '') }, String(i))));
    for (const [nm, arr] of [[dn, data], [nn, nxt]]) {
      table.append(el('span', { class: 'll-k' }, nm));
      arr.forEach((v, i) => {
        const cls = ['ll-c', v === null ? 'empty' : '', seen.includes(i) ? '' : 'out', hl[nm + i] || ''].join(' ');
        table.append(TSD.pickable(el('span', { class: cls }, v === null ? '—' : fmt(v)), `${nm}[${i}]`, opts));
      });
    }
    meter.classList.add('meter-route');
    meter.replaceChildren(table);
  }

  TSD.scenes = TSD.scenes || {};
  TSD.scenes.linked = { render, icon: v => el('span', { class: 'stop mini on' }, el('span', { class: 'stop-name' }, fmt(v))) };
})();
