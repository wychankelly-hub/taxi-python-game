/* teacher.js — 老師控制台（只限設定工作表內「老師」的 Google 帳戶）
 * 全班進度（24 關顏色格）、最常錯的 10 題、個別學生、按班別及日期篩選、解鎖。
 * 資料由 Apps Script 驗證老師身份後提供；學生帳戶會被拒絕。
 */
(function () {
  'use strict';
  const cfg = window.TSD_CONFIG || {};
  const LEVELS = [1, 2, 3, 4].flatMap(c => [1, 2, 3, 4, 5, 6].map(l => `${c}-${l}`));
  const KEY = 'tsd:teacherSession';

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  const root = document.getElementById('app');
  const get = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const put = v => { try { if (v) localStorage.setItem(KEY, v); else localStorage.removeItem(KEY); } catch (e) { /* 照用 */ } };

  async function call(action, body) {
    const res = await fetch(cfg.appsScriptUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ action }, body)) });
    return res.json();
  }

  const state = { data: null, cls: '', from: '', to: '', tab: 'progress' };

  function header(extra) {
    return el('header', { class: 'status home' }, el('b', { class: 'shift' }, '老師控制台'), extra || null);
  }

  /* ---------- 登入 ---------- */
  function showLogin(msg) {
    const btn = el('div', { class: 'gis-btn' });
    root.replaceChildren(header(),
      el('section', { class: 'card px-frame' },
        el('h2', null, '用老師的 Google 帳戶登入'),
        el('p', { class: 'small' }, '只有「設定」工作表內列為「老師」的帳戶才可以使用。'),
        msg ? el('p', { class: 'need' }, msg) : null,
        btn));
    if (!cfg.googleClientId || !cfg.appsScriptUrl) { btn.textContent = '未設定：請先填好 js/config.js（見 docs/設定教學.md）。'; return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => {
      window.google.accounts.id.initialize({ client_id: cfg.googleClientId, callback: r => login(r.credential), ux_mode: 'popup' });
      window.google.accounts.id.renderButton(btn, { theme: 'filled_black', size: 'large', locale: 'zh-HK' });
    };
    document.head.append(s);
  }

  async function login(idToken) {
    const r = await call('login', { idToken });
    if (!r.ok) return showLogin('登入失敗：' + r.error);
    if (!r.teacher) return showLogin(`${r.email} 不是老師帳戶。請在「設定」工作表加入這個電郵。`);
    put(r.session);
    load();
  }

  async function load() {
    root.replaceChildren(header(), el('p', { class: 'small' }, '載入中……'));
    let r;
    try { r = await call('teacher.data', { session: get() }); } catch (e) { return showLogin('連線失敗，請稍後再試。'); }
    if (!r.ok) { put(null); return showLogin(r.error === 'forbidden' ? '這個帳戶不是老師帳戶。' : '請重新登入。'); }
    state.data = r;
    render();
  }

  /* ---------- 計算 ---------- */
  const em = x => String(x || '').trim().toLowerCase();
  function inRange(t) {
    const d = String(t).slice(0, 10);
    return (!state.from || d >= state.from) && (!state.to || d <= state.to);
  }
  function students() {
    return state.data.roster.filter(s => !state.cls || String(s['班別']) === state.cls)
      .sort((a, b) => String(a['班別']).localeCompare(String(b['班別'])) || a['班號'] - b['班號']);
  }
  function bestStars(email) {
    const best = {}, quiz = {};
    let last = '';
    for (const r of state.data.levels) {
      if (em(r['電郵']) !== email || !inRange(r['時間'])) continue;
      const lv = String(r['關卡']), v = +r['星數'] || 0;
      const m = lv.match(/^小測([1-4])$/);
      if (m) quiz[m[1]] = Math.max(quiz[m[1]] || 0, v); else best[lv] = Math.max(best[lv] || 0, v);
      if (String(r['時間']) > last) last = String(r['時間']);
    }
    return { best, quiz, last };
  }
  function examBest(email) {
    let b = null;
    for (const r of state.data.exams) if (em(r['電郵']) === email && inRange(r['時間'])) b = Math.max(b || 0, +r['總分 /20'] || 0);
    return b;
  }
  function unlockedFor(s) {
    return state.data.unlocks.some(u => u['值'] === '是' && (em(u['對象']) === em(s['電郵']) || String(u['對象']) === String(s['班別'])));
  }

  /* ---------- 畫面 ---------- */
  function render() {
    const d = state.data;
    const classes = Array.from(new Set(d.roster.map(s => String(s['班別'])))).sort();
    const filters = el('section', { class: 'card px-frame filters' },
      el('label', null, '班別 ', el('select', { onchange: e => { state.cls = e.target.value; render(); } },
        el('option', { value: '' }, '全部'), classes.map(c => el('option', { value: c, selected: c === state.cls ? true : null }, c)))),
      el('label', null, '由 ', el('input', { type: 'date', value: state.from, onchange: e => { state.from = e.target.value; render(); } })),
      el('label', null, '至 ', el('input', { type: 'date', value: state.to, onchange: e => { state.to = e.target.value; render(); } })),
      el('button', { type: 'button', class: 'pxbtn', onclick: load }, '重新載入'));
    const tabs = el('nav', { class: 'exam-tabs t3' }, [['progress', '全班進度'], ['errors', '最常錯的題目'], ['unlock', '解鎖']].map(([k, label]) =>
      el('button', { type: 'button', class: 'tab' + (state.tab === k ? ' on' : ''), onclick: () => { state.tab = k; render(); } }, el('b', null, label))));
    const body = state.tab === 'progress' ? progress() : state.tab === 'errors' ? topErrors() : unlockView(classes);
    root.replaceChildren(header(el('button', { type: 'button', class: 'pxbtn', onclick: () => { put(null); showLogin(); } }, '登出')),
      el('p', { class: 'small' }, `老師：${d.teacher}`), filters, tabs, body);
  }

  function progress() {
    const list = students();
    const head = el('tr', null, el('th', { class: 'sticky' }, '學生'), LEVELS.map(l => el('th', null, l)), ['小測1', '小測2', '小測3', '小測4'].map(q => el('th', null, q)), el('th', null, '考試'), el('th', null, '最後上線'));
    const rows = list.map(s => {
      const e = em(s['電郵']);
      const { best, quiz, last } = bestStars(e);
      const ex = examBest(e);
      return el('tr', null,
        el('th', { class: 'sticky' }, el('button', { type: 'button', class: 'link', onclick: () => studentView(s) }, `${s['班別']} ${s['班號']} ${s['姓名']}`)),
        LEVELS.map(l => el('td', { class: 'cell s' + (best[l] || 0), title: `${l}：${best[l] ? best[l] + ' 星' : '未玩'}` }, best[l] ? '★'.repeat(best[l]) : '')),
        [1, 2, 3, 4].map(c => el('td', { class: 'num' }, quiz[c] === undefined ? '—' : `${quiz[c]}/3`)),
        el('td', { class: 'num' }, ex === null ? '—' : `${ex}/20`),
        el('td', { class: 'num' }, last ? last.slice(0, 10) : '—'));
    });
    return el('section', { class: 'card px-frame' },
      el('p', { class: 'legend' }, el('span', { class: 'cell s0' }), ' 未玩　', el('span', { class: 'cell s1' }), ' 1 星　', el('span', { class: 'cell s2' }), ' 2 星　', el('span', { class: 'cell s3' }), ' 3 星　（點姓名看個別學生）'),
      list.length ? el('div', { class: 'scroll' }, el('table', { class: 'grid' }, el('thead', null, head), el('tbody', null, rows)))
        : el('p', { class: 'small' }, '沒有學生（請檢查「學生名單」工作表或篩選）。'));
  }

  function topErrors() {
    const emails = new Set(students().map(s => em(s['電郵'])));
    const agg = {};
    for (const r of state.data.errors) {
      if (!emails.has(em(r['電郵'])) || !inRange(r['時間'])) continue;
      const k = `${r['關卡']} ${r['題目']}`;
      const a = agg[k] = agg[k] || { key: k, n: 0, people: new Set(), choices: {} };
      a.n++; a.people.add(em(r['電郵']));
      const c = String(r['選了的錯誤選項']);
      a.choices[c] = (a.choices[c] || 0) + 1;
    }
    const top = Object.values(agg).sort((a, b) => b.n - a.n).slice(0, 10);
    return el('section', { class: 'card px-frame' },
      el('h2', null, '答錯次數最多的 10 題'),
      top.length ? el('div', { class: 'scroll' }, el('table', { class: 'grid errors' },
        el('thead', null, el('tr', null, el('th', null, '#'), el('th', null, '關卡及題目'), el('th', null, '答錯次數'), el('th', null, '人數'), el('th', null, '最多人選的錯誤選項'))),
        el('tbody', null, top.map((a, i) => {
          const [c, n] = Object.entries(a.choices).sort((x, y) => y[1] - x[1])[0];
          return el('tr', null, el('td', { class: 'num' }, String(i + 1)), el('td', null, a.key), el('td', { class: 'num' }, String(a.n)), el('td', { class: 'num' }, String(a.people.size)), el('td', null, `${c}（${n} 次）`));
        }))))
        : el('p', { class: 'small' }, '在這個篩選範圍內沒有錯誤紀錄。'));
  }

  function studentView(s) {
    const e = em(s['電郵']);
    const { best, quiz } = bestStars(e);
    const errs = state.data.errors.filter(r => em(r['電郵']) === e && inRange(r['時間'])).sort((a, b) => String(b['時間']).localeCompare(String(a['時間'])));
    const exams = state.data.exams.filter(r => em(r['電郵']) === e && inRange(r['時間']));
    const close = () => box.remove();
    const box = el('div', { class: 'modal' }, el('div', { class: 'mpanel', role: 'dialog', 'aria-label': '個別學生' },
      el('div', { class: 'mhead' }, el('b', null, `${s['班別']} ${s['班號']} ${s['姓名']}`), el('span', { class: 'mcount' }, e)),
      el('h3', null, '每關星數'),
      el('div', { class: 'lv-grid' }, LEVELS.map(l => el('div', { class: 'cell big s' + (best[l] || 0) }, el('b', null, l), el('span', null, best[l] ? '★'.repeat(best[l]) : '未玩')))),
      el('p', { class: 'small' }, '收工小測：' + [1, 2, 3, 4].map(c => `第${'一二三四'[c - 1]}更 ${quiz[c] === undefined ? '—' : quiz[c] + '/3'}`).join('　')),
      el('h3', null, `考試（${exams.length} 次）`),
      exams.length ? el('div', { class: 'scroll' }, el('table', { class: 'grid' },
        el('thead', null, el('tr', null, ['第幾次', '時間', '題1 /3', '題2 /4', '題3 /3', '題4 /5', '題5 /5', '總分 /20'].map(h => el('th', null, h)))),
        el('tbody', null, exams.map(x => el('tr', null, ['第幾次', '時間', '題1 /3', '題2 /4', '題3 /3', '題4 /5', '題5 /5', '總分 /20'].map(h => el('td', { class: 'num' }, h === '時間' ? String(x[h]).slice(0, 16).replace('T', ' ') : String(x[h]))))))))
        : el('p', { class: 'small' }, '未考過。'),
      el('h3', null, `錯誤紀錄（${errs.length} 筆）`),
      errs.length ? el('div', { class: 'scroll' }, el('table', { class: 'grid errors' },
        el('thead', null, el('tr', null, ['時間', '關卡', '題目', '選了的錯誤選項'].map(h => el('th', null, h)))),
        el('tbody', null, errs.slice(0, 200).map(x => el('tr', null, el('td', { class: 'num' }, String(x['時間']).slice(0, 16).replace('T', ' ')), el('td', null, String(x['關卡'])), el('td', null, String(x['題目'])), el('td', null, String(x['選了的錯誤選項'])))))))
        : el('p', { class: 'small' }, '沒有錯誤紀錄。'),
      el('div', { class: 'row-btns' },
        unlockBtn(e, unlockedFor(s), `為 ${s['姓名']} 解鎖全部`),
        el('button', { type: 'button', class: 'pxbtn primary', onclick: close }, '關閉'))));
    document.body.append(box);
  }

  function unlockBtn(target, on, label) {
    return el('button', { type: 'button', class: 'pxbtn' + (on ? ' on' : ''), onclick: async ev => {
      ev.currentTarget.disabled = true;
      const r = await call('teacher.unlock', { session: get(), target, on: !on });
      if (!r.ok) { alertBox('未能設定：' + r.error); return; }
      document.querySelectorAll('.modal').forEach(m => m.remove());
      await load();
    } }, on ? `已解鎖（按此取消）` : label);
  }
  function alertBox(t) { root.prepend(el('p', { class: 'need' }, t)); }

  function unlockView(classes) {
    return el('section', { class: 'card px-frame' },
      el('h2', null, '解鎖全部關卡及考試模式'),
      el('p', { class: 'small' }, '解鎖後，學生下次開遊戲（已登入）就可以直接玩任何一關及考試模式，方便中六直接溫習或考試。'),
      el('div', { class: 'list' }, classes.map(c => {
        const on = state.data.unlocks.some(u => u['值'] === '是' && String(u['對象']) === c);
        return el('div', { class: 'unlock-row' }, el('b', null, c), unlockBtn(c, on, `為 ${c} 全班解鎖`));
      })),
      el('p', { class: 'small' }, '個別學生：在「全班進度」點姓名。'));
  }

  if (get() && cfg.appsScriptUrl) load(); else showLogin();
})();
