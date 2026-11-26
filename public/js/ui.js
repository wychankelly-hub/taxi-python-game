/* ui.js — 共用工具：建立元素、文字、Python 着色、程式區、素材路徑、紀錄 */
(function () {
  'use strict';
  const TSD = window.TSD = window.TSD || {};
  const fmt = window.PyRun.fmt;
  TSD.fmt = fmt;
  TSD.CN = ['一', '二', '三', '四'];

  TSD.el = function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [p, x] of Object.entries(v)) {
          if (p.startsWith('--')) e.style.setProperty(p, String(x));
          else e.style[p] = x;
        }
      }
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  };
  const el = TSD.el;
  TSD.esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  TSD.rich = s => TSD.esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
  TSD.sleep = ms => new Promise(r => setTimeout(r, ms));
  TSD.shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  TSD.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  /* ---------- 素材 ----------
   * 打包版（單一 HTML）把圖片放在 window.TSD_ASSETS；沒有的素材傳回 null（用色塊代替）。
   * 開發版直接用 assets/ 資料夾，載入失敗時亦改用色塊。 */
  TSD.asset = function (name) {
    const b = window.TSD_ASSETS;
    if (b) return b[name] || null;
    return name.startsWith('bg_') ? `assets/bg/${name}.jpg` : `assets/${name}@2x.png`;
  };
  /** 像素圖；缺素材時改用 fallback() 產生的元素 */
  TSD.sprite = function (name, cls, fallback) {
    const src = TSD.asset(name);
    if (!src) return fallback ? fallback() : el('span', { class: cls });
    const img = el('img', { src, class: 'px-img ' + (cls || ''), alt: '', draggable: 'false' });
    if (fallback) img.addEventListener('error', () => img.replaceWith(fallback()));
    return img;
  };

  /* ---------- 成績及錯誤紀錄（先存在手機；第 6 步傳到 Google Sheets） ---------- */
  TSD.record = function (obj) {
    try {
      const q = JSON.parse(localStorage.getItem('tsd:outbox') || '[]');
      q.push(Object.assign({ id: TSD.uid(), time: new Date().toISOString() }, obj));
      localStorage.setItem('tsd:outbox', JSON.stringify(q.slice(-1000)));
    } catch (e) { /* 無法儲存時照玩 */ }
    if (TSD.Sync && TSD.Sync.enabled()) TSD.Sync.flushSoon();
  };

  /* ---------- Python 着色 ---------- */
  const PY_RE = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|if|elif|else|while|for|in|return|global|and|or|not|pass)\b|\b(None|True|False)\b|\b(print|range|len)\b|\b(\d+)\b/g;
  TSD.highlight = function (text) {
    let out = '', last = 0, m;
    PY_RE.lastIndex = 0;
    while ((m = PY_RE.exec(text))) {
      out += TSD.esc(text.slice(last, m.index));
      const cls = m[1] ? 'cm' : m[2] ? 'st' : m[3] ? 'kw' : m[4] ? 'nu' : m[5] ? 'fn' : 'nu';
      out += `<span class="${cls}">${TSD.esc(m[0])}</span>`;
      last = m.index + m[0].length;
    }
    return out + TSD.esc(text.slice(last));
  };

  /** 取出程式中某個函式的行（含原本行號）；沒有 focus 則全部 */
  TSD.functionLines = function (src, name) {
    const lines = src.split('\n');
    const start = name ? lines.findIndex(l => l.startsWith('def ' + name + '(')) : -1;
    if (start < 0) return lines.map((t, i) => ({ t, n: i + 1 }));
    let end = start + 1;
    while (end < lines.length && (lines[end].startsWith(' ') || (lines[end] === '' && (lines[end + 1] || '').startsWith(' ')))) end++;
    return lines.slice(start, end).map((t, i) => ({ t, n: start + i + 1 }));
  };

  /* ---------- 程式區 ----------
   * 平時顯示約 5 行，執行中的一行亮起並捲到中間；點「全部」展開。 */
  class CodeView {
    constructor(box, opts) {
      this.box = box;
      this.opts = opts || {};
      this.expanded = false;
      this.lines = el('div', { class: 'code-lines' });
      this.toggle = el('button', { type: 'button', class: 'code-toggle', 'aria-expanded': 'false', onclick: () => this.setExpanded(!this.expanded) }, '全部 ▾');
      box.replaceChildren(this.lines, this.toggle);
      box.classList.add('codeview');
    }
    setExpanded(on) {
      this.expanded = on;
      this.box.classList.toggle('open', on);
      this.toggle.textContent = on ? '收起 ▴' : '全部 ▾';
      this.toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      this.scrollToActive();
    }
    /** o: { src, focus, srcId, run, blank, fill } */
    show(o) {
      this.expanded = false;
      this.box.classList.remove('open');
      this.toggle.textContent = '全部 ▾';
      this.toggle.setAttribute('aria-expanded', 'false');
      this.active = null;
      this.lineEls = {};
      this.lines.replaceChildren();
      TSD.functionLines(o.src, o.focus).forEach((L, i) => {
        let html = TSD.highlight(L.t) || ' ';
        if (o.blank && html.includes('____')) html = html.replace('____', `<span class="blank${o.fill ? ' filled' : ''}">${o.fill ? TSD.esc(o.fill) : '____'}</span>`);
        const row = el('div', { class: 'ln' }, el('span', { class: 'no' }, String(i + 1)), el('span', { class: 'tx', html }));
        row.dataset.text = L.t;
        this.lineEls[(o.srcId || 'prog') + ':' + L.n] = row;
        this.lines.append(row);
      });
      if (o.run) {
        this.lines.append(el('div', { class: 'sec' }, '# 執行'));
        o.run.split('\n').forEach((t, i) => {
          const row = el('div', { class: 'ln run' }, el('span', { class: 'no' }, '▶'), el('span', { class: 'tx', html: TSD.highlight(t) }));
          row.dataset.text = t;
          this.lineEls['run:' + (i + 1)] = row;
          this.lines.append(row);
        });
      }
      const total = this.lines.children.length;
      this.toggle.hidden = total <= 5;
      this.lines.scrollTop = 0;
      return this.lineEls;
    }
    rowOf(loc) { return loc && this.lineEls[loc.src + ':' + loc.line]; }
    mark(loc, cls) {
      Object.values(this.lineEls).forEach(r => r.classList.remove('on', 'err'));
      const r = this.rowOf(loc);
      if (r) r.classList.add(cls || 'on');
      this.active = r || null;
      this.scrollToActive();
    }
    scrollToActive() {
      if (this.expanded) return;
      const r = this.active || this.lines.querySelector('.run');
      if (!r) { this.lines.scrollTop = 0; return; }
      // 亮起的一行放在第 3 行左右，並對齊整行（不會切開半行）
      const lh = r.offsetHeight || 19;
      const pad = this.lines.firstElementChild ? this.lines.firstElementChild.offsetTop : 0;
      const k = Math.max(0, Math.round((r.offsetTop - pad) / lh) - 2);
      this.lines.scrollTop = k * lh;
    }
  }
  TSD.CodeView = CodeView;

  /** 錯誤訊息（學生看得明） */
  TSD.errorText = function (e) {
    if (!e) return '';
    if (!e.pyType) return '程式不停兜圈，停不了（無限迴圈）。';
    const why = {
      IndexError: '索引超出陣列範圍',
      UnboundLocalError: '函式內用了未有數值的變量（漏寫 global？）',
      TypeError: '資料類型不啱',
      NameError: '用了未定義的名稱',
      SyntaxError: '程式寫法有錯',
      IndentationError: '縮排有錯',
    }[e.pyType] || '程式出錯';
    return `運行錯誤 \`${e.pyType}\`：${why}。`;
  };

  TSD.shiftName = ch => `第${TSD.CN[ch.chapter - 1]}更　${ch.title}（${ch.topic.replace(/ \(.*\)/, '')}）`;

  /* ---------- 花名（存在手機） ---------- */
  /** 整理學生輸入的花名：去掉前後空格及控制字元，連續空格變一個，最多 10 個字；空白傳回 '' */
  TSD.cleanNick = v => {
    const t = String(v || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim();
    return Array.from(t).slice(0, 10).join('');
  };
  TSD.getNick = () => { try { return localStorage.getItem('tsd:nick'); } catch (e) { return null; } };
  TSD.setNick = n => { try { localStorage.setItem('tsd:nick', n); } catch (e) { /* 照玩 */ } };

  /** 逐行執行時可點選的格／變量 */
  TSD.pickable = function (node, key, opts) {
    if (!opts || !opts.pick) return node;
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
  };

  /** 咪錶上一個變量（指標或函式內變量） */
  TSD.meterItem = function (k, v, opts, cls) {
    return TSD.pickable(el('div', { class: 'm-item' + (cls ? ' ' + cls : '') }, el('span', { class: 'k' }, k), el('b', { class: 'v' }, v)), k, opts);
  };

  /** 場景底部咪錶：指標、函式內變量、移動次數、傳回、輸出 */
  TSD.meterItems = function (cfg, view, opts, skip) {
    const st = view.state || {};
    const items = [];
    for (const k of (cfg.pointers || [cfg.pointer])) if (!(skip || []).includes(k)) items.push(TSD.meterItem(k, String(fmt(st[k])), opts));
    const loc = view.locals || {};
    for (const k of Array.from(new Set((view.localNames || []).concat(Object.keys(loc))))) {
      const has = Object.prototype.hasOwnProperty.call(loc, k);
      items.push(TSD.meterItem(k, has ? fmt(loc[k]) : '—', opts, 'local'));
    }
    if (opts.moves !== undefined) items.push(el('div', { class: 'm-item moves' }, el('span', { class: 'k' }, '移動次數'), el('b', { class: 'v' }, String(opts.moves))));
    if (view.ret !== undefined) items.push(el('div', { class: 'm-item ret' }, el('span', { class: 'k' }, '傳回'), el('b', { class: 'v' }, view.ret)));
    const out = opts.output || [];
    if (out.length) items.push(el('div', { class: 'm-item out' }, el('span', { class: 'k' }, '輸出'), el('b', { class: 'v' }, out.slice(-3).join('、'))));
    return items;
  };

  /** 操作題按鈕上「手上」的資料圖示（行李、的士……） */
  TSD.itemIcon = (cfg, item) => {
    const sc = TSD.scenes && TSD.scenes[cfg.type];
    return sc && sc.icon ? sc.icon(item) : el('span', { class: 'chip-item' }, fmt(item));
  };

  /* ---------- 人物頭像 ---------- */
  const PEOPLE = {
    發哥: { normal: 'fa_normal', happy: 'fa_happy', angry: 'fa_angry', shocked: 'fa_shocked' },
    阿婆: { normal: 'p_granny' },
    趕飛機太太: { normal: 'p_rushlady' },
    '阿 Ken': { normal: 'p_ken', sorry: 'p_ken_sorry' },
    乘客: { normal: 'p_passenger' },
  };
  TSD.portrait = function (who, mood) {
    const p = PEOPLE[who] || PEOPLE['乘客'];
    return p[mood] || p.normal;
  };
})();
