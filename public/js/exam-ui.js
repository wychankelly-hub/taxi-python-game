/* exam-ui.js — 考試模式畫面
 * 5 題、20 分、限時（Exam.TIME_LIMIT_MIN 分鐘，時間到自動交卷）。全部書面語，不設提示。
 * 作答只用點按：選擇題、數字 − / + 選擇器、在陣列格內由選單揀選。
 * 交卷後才顯示每小題對錯、評卷參考及解釋；「重做」換一組題 1、題 2 的數據。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, rich = TSD.rich, fmt = TSD.fmt;
  const { Exam } = window;

  const KEY = 'tsd:examAttempts';
  const attempts = () => { try { return +(localStorage.getItem(KEY) || 0); } catch (e) { return 0; } };
  const setAttempts = n => { try { localStorage.setItem(KEY, String(n)); } catch (e) { /* 照玩 */ } };

  /** 小題是否已作答 */
  function answered(p, v) {
    if (v === undefined || v === null) return false;
    switch (p.input.type) {
      case 'seq': case 'cells': return v.every(x => x !== undefined && x !== null);
      case 'nums': return v.every(x => x !== undefined && x !== null);
      case 'numseq': return v.num !== undefined && v.num !== null && (v.seq || []).length === p.input.n && v.seq.every(x => x !== undefined && x !== null);
      case 'stance': return !!v.stance && v.reason !== undefined && v.reason !== null;
      default: return true;
    }
  }

  /** 顯示作答內容（結果頁） */
  function showValue(p, v) {
    if (!answered(p, v) && !(Array.isArray(v) && v.some(x => x !== undefined && x !== null))) return '（未答）';
    switch (p.input.type) {
      case 'seq': return v.map(x => x == null ? '？' : x).join(' → ');
      case 'cells': return '[' + v.map(x => x == null ? '？' : x).join(', ') + ']';
      case 'nums': return p.input.names.map((n, i) => `${n} = ${v[i] == null ? '？' : v[i]}`).join('，');
      case 'numseq': return `${p.input.name} = ${v.num == null ? '？' : v.num}；` + (v.seq || []).map(x => x == null ? '？' : x).join(' → ');
      case 'stance': return `${v.stance || '？'}：${v.reason == null ? '？' : p.input.reasons[v.reason].replace(/`/g, '')}`;
      default: return String(v);
    }
  }

  class ExamUI {
    constructor(app) { this.app = app; this.root = app.root; }

    start(variant) {
      this.variant = variant === undefined ? 0 : variant;
      this.exam = Exam.build(this.variant);
      this.resp = {};
      this.exam.questions.forEach(q => { this.resp[q.id] = {}; });
      this.qi = 0;
      this.t0 = Date.now();
      this.limit = Exam.TIME_LIMIT_MIN * 60;
      this.done = false;
      this.build();
      this.showQ();
      clearInterval(this.timer);
      this.timer = setInterval(() => this.tick(), 500);
      this.tick();
    }

    build() {
      this.clock = el('span', { class: 'clock', role: 'timer', 'aria-live': 'off' });
      const status = el('header', { class: 'status home exam' },
        el('button', { type: 'button', class: 'back', 'aria-label': '離開考試', onclick: () => this.confirmLeave() }, '‹'),
        el('b', { class: 'shift' }, '考試模式（20 分）'),
        this.clock);
      this.tabs = el('nav', { class: 'exam-tabs', 'aria-label': '題目' });
      this.card = el('section', { class: 'exam-card px-frame' });
      this.nav = el('div', { class: 'row-btns exam-nav' });
      this.root.replaceChildren(status, this.tabs, this.card, this.nav);
    }

    left() { return Math.max(0, this.limit - Math.floor((Date.now() - this.t0) / 1000)); }
    tick() {
      if (this.done) return;
      const s = this.left();
      this.clock.textContent = `⏱ ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      this.clock.classList.toggle('warn', s <= 60);
      if (s === 0) { this.submit(true); }
    }

    drawTabs() {
      this.tabs.replaceChildren(...this.exam.questions.map((q, i) => {
        const n = q.parts.filter(p => answered(p, this.resp[q.id][p.id])).length;
        return el('button', {
          type: 'button', class: 'tab' + (i === this.qi ? ' on' : '') + (n === q.parts.length ? ' full' : ''),
          'aria-current': i === this.qi ? 'true' : null, onclick: () => { this.qi = i; this.showQ(); },
        }, el('b', null, `題 ${i + 1}`), el('small', null, `${n}/${q.parts.length}`));
      }));
    }

    showQ() {
      window.scrollTo(0, 0);
      const q = this.exam.questions[this.qi];
      this.drawTabs();
      const kids = [
        el('h2', null, `題 ${this.qi + 1}　${q.title}（${q.marks} 分）`),
        el('p', { class: 'exam-intro', html: rich(q.intro).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>') }),
      ];
      if (q.code) {
        const box = el('div', { class: 'code' });
        const cv = new TSD.CodeView(box);
        cv.show({ src: q.code });
        kids.push(el('p', { class: 'small' }, q.codeNote + '（點「全部」展開）'), box);
      }
      for (const p of q.parts) kids.push(this.partBox(q, p));
      this.card.replaceChildren(...kids);
      const last = this.qi === this.exam.questions.length - 1;
      this.nav.replaceChildren(
        el('button', { type: 'button', class: 'pxbtn', disabled: this.qi === 0, onclick: () => { this.qi--; this.showQ(); } }, '◀ 上一題'),
        last ? el('button', { type: 'button', class: 'pxbtn primary', onclick: () => this.confirmSubmit() }, '交卷')
          : el('button', { type: 'button', class: 'pxbtn primary', onclick: () => { this.qi++; this.showQ(); } }, '下一題 ▶'));
    }

    set(q, p, v) { this.resp[q.id][p.id] = v; this.drawTabs(); }

    partBox(q, p) {
      const box = el('div', { class: 'part' },
        el('p', { class: 'part-q', html: `<b>(${p.id.replace(/\d$/, '')})</b> ` + rich(p.prompt) + ` <span class="mk">［${p.marks} 分］</span>` }));
      const body = el('div', { class: 'part-in' });
      box.append(body);
      const redraw = () => body.replaceChildren(...this.input(q, p, redraw));
      redraw();
      return box;
    }

    /* ---------- 作答元件 ---------- */
    input(q, p, redraw) {
      const v = this.resp[q.id][p.id];
      const I = p.input;
      const slots = (arr, n, labels, choices, onSet) => el('div', { class: 'slots n' + n }, Array.from({ length: n }, (_, i) =>
        el('div', { class: 'slot-wrap' },
          el('button', { type: 'button', class: 'xslot' + (arr[i] == null ? ' empty' : ''), 'aria-label': `${labels ? labels[i] || '第 ' + (i + 1) + ' 格' : '索引 ' + i}：${arr[i] == null ? '未選' : arr[i]}`,
            onclick: () => this.menu(choices, arr[i], val => { const a = arr.slice(); a[i] = val; onSet(a); redraw(); }) }, arr[i] == null ? '＋' : arr[i]),
          el('span', { class: 'slot-l' }, labels ? (labels[i] || '') : String(i)))));
      const numPick = (name, val, onSet, opts) => el('div', { class: 'numpick' },
        name ? el('span', { class: 'np-name' }, name) : null,
        opts && opts.big ? el('button', { type: 'button', class: 'np', 'aria-label': `${name || '數值'} 減 10`, onclick: () => onSet(clamp((val == null ? 0 : val) - 10)) }, '−10') : null,
        el('button', { type: 'button', class: 'np', 'aria-label': `${name || '數值'} 減 1`, onclick: () => onSet(clamp(val == null ? I.min : val - 1)) }, '−'),
        el('b', { class: 'np-v' + (val == null ? ' empty' : '') }, val == null ? '—' : String(val)),
        el('button', { type: 'button', class: 'np', 'aria-label': `${name || '數值'} 加 1`, onclick: () => onSet(clamp(val == null ? I.min : val + 1)) }, '+'),
        opts && opts.big ? el('button', { type: 'button', class: 'np', 'aria-label': `${name || '數值'} 加 10`, onclick: () => onSet(clamp((val == null ? 0 : val) + 10)) }, '+10') : null);
      const clamp = x => Math.max(I.min, Math.min(I.max, x));

      switch (I.type) {
        case 'seq':
        case 'cells': {
          const arr = v || Array(I.n).fill(null);
          return [slots(arr, I.n, I.type === 'seq' ? I.labels : null, I.choices, a => this.set(q, p, a))];
        }
        case 'num':
          return [numPick(null, v, x => { this.set(q, p, x); redraw(); }, { big: I.big })];
        case 'nums': {
          const arr = v || I.names.map(() => null);
          return [el('div', { class: 'nums' }, I.names.map((n, i) => numPick(n, arr[i], x => { const a = arr.slice(); a[i] = x; this.set(q, p, a); redraw(); })))];
        }
        case 'numseq': {
          const cur = v || { num: null, seq: Array(I.n).fill(null) };
          return [
            numPick(I.name, cur.num, x => { this.set(q, p, Object.assign({}, cur, { num: x })); redraw(); }),
            slots(cur.seq, I.n, I.labels, I.choices, a => this.set(q, p, Object.assign({}, cur, { seq: a }))),
          ];
        }
        case 'choice':
          return [el('div', { class: 'opts one' }, I.options.map(o => el('button', {
            type: 'button', class: 'opt choice' + (I.mono ? ' mono' : '') + (v === o ? ' picked' : ''), 'aria-pressed': v === o ? 'true' : 'false',
            onclick: () => { this.set(q, p, o); redraw(); }, html: rich(o),
          })))];
        case 'stance': {
          const cur = v || { stance: null, reason: null };
          return [
            el('div', { class: 'opts' }, ['同意', '不同意'].map(s => el('button', {
              type: 'button', class: 'opt choice' + (cur.stance === s ? ' picked' : ''), 'aria-pressed': cur.stance === s ? 'true' : 'false',
              onclick: () => { this.set(q, p, Object.assign({}, cur, { stance: s })); redraw(); },
            }, s))),
            el('p', { class: 'small' }, '原因：'),
            el('div', { class: 'opts one' }, I.reasons.map((r, i) => el('button', {
              type: 'button', class: 'opt choice reason' + (cur.reason === i ? ' picked' : ''), 'aria-pressed': cur.reason === i ? 'true' : 'false',
              onclick: () => { this.set(q, p, Object.assign({}, cur, { reason: i })); redraw(); }, html: rich(r),
            }))),
          ];
        }
      }
      return [];
    }

    /** 選單（由下面彈出），揀一個值 */
    menu(choices, current, onPick) {
      const close = () => sheet.remove();
      const sheet = el('div', { class: 'modal sheet-modal', onclick: e => { if (e.target === sheet) close(); } },
        el('div', { class: 'menu px-frame', role: 'dialog', 'aria-label': '選擇' },
          el('p', { class: 'small' }, '揀一個：'),
          el('div', { class: 'menu-grid' }, choices.map(c => el('button', {
            type: 'button', class: 'opt mono' + (c === current ? ' picked' : ''), onclick: () => { close(); onPick(c); },
          }, c))),
          el('div', { class: 'row-btns' },
            el('button', { type: 'button', class: 'pxbtn', onclick: () => { close(); onPick(null); } }, '清除'),
            el('button', { type: 'button', class: 'pxbtn', onclick: close }, '取消'))));
      document.body.append(sheet);
    }

    confirmBox(title, text, okLabel, onOk, cancelLabel) {
      const close = () => box.remove();
      const box = el('div', { class: 'modal' }, el('div', { class: 'result-card px-frame', role: 'dialog', 'aria-label': title },
        el('h2', null, title), el('p', null, text),
        el('div', { class: 'row-btns' },
          el('button', { type: 'button', class: 'pxbtn', onclick: close }, cancelLabel || '取消'),
          el('button', { type: 'button', class: 'pxbtn primary', onclick: () => { close(); onOk(); } }, okLabel))));
      document.body.append(box);
    }

    confirmSubmit() {
      const missing = this.exam.questions.reduce((n, q) => n + q.parts.filter(p => !answered(p, this.resp[q.id][p.id])).length, 0);
      this.confirmBox('確定交卷？', missing ? `仲有 ${missing} 個小題未答完。交卷後不可以再改。` : '交卷後不可以再改。', '交卷', () => this.submit(false), '繼續作答');
    }
    confirmLeave() {
      this.confirmBox('離開考試？', '離開後今次作答不會保存。', '離開', () => { this.done = true; clearInterval(this.timer); this.app.showHome(); }, '繼續作答');
    }

    /* ---------- 交卷及結果 ---------- */
    submit(timeUp) {
      if (this.done) return;
      this.done = true;
      clearInterval(this.timer);
      document.querySelectorAll('.sheet-modal').forEach(x => x.remove());
      const g = Exam.grade(this.exam, this.resp);
      const n = attempts() + 1;
      setAttempts(n);
      const secs = Math.min(this.limit, Math.round((Date.now() - this.t0) / 1000));
      TSD.record({ type: 'exam', attempt: n, variant: this.variant, total: g.total, byQ: Object.fromEntries(Object.entries(g.byQ).map(([k, x]) => [k, x.marks])), seconds: secs, timeUp: !!timeUp });
      this.showResult(g, timeUp, n, secs);
    }

    showResult(g, timeUp, n, secs) {
      window.scrollTo(0, 0);
      const mood = g.total >= 17 ? 'happy' : g.total >= 12 ? 'normal' : g.total >= 6 ? 'normal' : 'shocked';
      const say = { 的士王: '的士王！DSE 都唔怕！', 熟手司機: '熟手司機，有少少位要執吓。', 學師中: '仲係學師中，返去睇吓啲錯題。', 返去重溫第一章: '唔緊要，返去重溫第一章，慢慢嚟。' }[g.level];
      const list = this.exam.questions.map((q, i) => {
        const r = g.byQ[q.id];
        return el('details', { class: 'res-q px-frame', open: r.marks < q.marks ? true : null },
          el('summary', null, el('b', null, `題 ${i + 1}　${q.title}`), el('span', { class: 'res-m' + (r.marks === q.marks ? ' full' : '') }, `${r.marks} / ${q.marks}`)),
          ...q.parts.map(p => {
            const got = r.parts[p.id];
            const ok = got === p.marks;
            return el('div', { class: 'res-p ' + (ok ? 'ok' : got > 0 ? 'half' : 'bad') },
              el('p', { class: 'part-q', html: `<b>${ok ? '✔' : got > 0 ? '△' : '✘'} (${p.id.replace(/\d$/, '')})</b> ` + rich(p.prompt) + ` <span class="mk">${got}/${p.marks}</span>` }),
              el('p', { class: 'res-line' }, '你的答案：', el('span', null, showValue(p, this.resp[q.id][p.id]))),
              ok ? null : el('p', { class: 'res-line' }, '評卷參考：', el('span', null, showValue(p, p.answer))),
              el('p', { class: 'res-exp', html: rich(q.explain[p.id] || '') }));
          }));
      });
      this.root.replaceChildren(
        el('header', { class: 'status home exam' },
          el('button', { type: 'button', class: 'back', 'aria-label': '返回首頁', onclick: () => this.app.showHome() }, '‹'),
          el('b', { class: 'shift' }, `考試結果（第 ${n} 次）`)),
        el('section', { class: 'comms' },
          el('div', { class: 'face-wrap' }, el('div', { class: 'portrait' }, TSD.sprite(TSD.portrait('發哥', mood), 'face')), el('span', { class: 'who' }, '發哥')),
          el('div', { class: 'speech' }, say)),
        el('section', { class: 'score-card px-frame' },
          el('div', { class: 'score' }, el('b', null, String(g.total)), el('span', null, ' / 20')),
          el('div', { class: 'grade' }, g.level),
          el('p', { class: 'small' }, `${timeUp ? '時間到，自動交卷。' : ''}用時 ${Math.floor(secs / 60)} 分 ${secs % 60} 秒`)),
        ...list,
        el('div', { class: 'row-btns exam-nav' },
          el('button', { type: 'button', class: 'pxbtn', onclick: () => this.app.showHome() }, '返回首頁'),
          el('button', { type: 'button', class: 'pxbtn primary', onclick: () => this.start(n) }, '重做（換數據）')));
    }
  }

  TSD.ExamUI = ExamUI;
})();
