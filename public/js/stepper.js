/* stepper.js — 逐行執行視窗
 * 彈出視窗，學生要逐行執行完才可關閉。
 * scored = true（答對題目後）：if 條件要判斷成立與否；會改變嘢的行要先點出改變的格／變量，再揀新數值。
 *   答錯計入星數及錯誤紀錄。
 * scored = false（睇返／試行）：每行按「下一步」，附說明，不計分。
 * 執行多句時，只有 expand 指定的一句逐行展開，其餘每句一步完成。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt, rich = TSD.rich;

  const COND_RE = /^\s*(if|elif|while)\s+(.*):\s*$/;
  const ASSIGN_RE = /^\s*([A-Za-z_]\w*(?:\[[^\]]+\])?)\s*=(?!=)\s*(.+)$/;

  /** 這一步改變了的陣列格、指標及函式內變量（只限畫面上顯示的） */
  /** 一個場景顯示的陣列及指標（第一章只有一個陣列及一個指標） */
  TSD.viewArrays = cfg => cfg.arrays || [cfg.array];
  TSD.viewPointers = cfg => cfg.pointers || [cfg.pointer];

  function changes(cfg, prev, sameFrame, step) {
    const out = [];
    for (const name of TSD.viewArrays(cfg)) {
      const a0 = prev.state[name] || [], a1 = step.state[name] || [];
      a1.forEach((v, i) => { if (fmt(v) !== fmt(a0[i])) out.push(`${name}[${i}]`); });
    }
    for (const name of TSD.viewPointers(cfg)) {
      if (fmt(prev.state[name]) !== fmt(step.state[name])) out.push(name);
    }
    if (sameFrame) {
      for (const [k, v] of Object.entries(step.locals || {})) {
        const had = Object.prototype.hasOwnProperty.call(prev.locals || {}, k);
        if (!had || fmt(prev.locals[k]) !== fmt(v)) out.push(k);
      }
    }
    return out;
  }
  TSD.changes = changes;

  class Stepper {
    /**
     * level：關卡（提供 ch、penalty）
     * res：解譯器 run() 的結果（trace、error）
     * pre：執行前的狀態快照
     * opts：{ scored, run, title, focus, code, expand, output }
     */
    constructor(level, res, pre, opts) {
      this.L = level; this.pre = pre; this.opts = opts;
      this.scored = !!opts.scored; this.title = opts.title; this.run = opts.run || '';
      this.error = res.error;
      this.out = (opts.output || []).slice();
      this.trace = this.collapse(res.trace || [], opts.expand || 0);
      if (opts.maxSteps && this.trace.length > opts.maxSteps) {
        // 無限迴圈：只顯示頭幾步，然後當作「停不了」
        this.trace = this.trace.slice(0, opts.maxSteps);
        this.error = this.error || { pyType: null, loc: null };
      }
      this.asked = {};
      this.moves = opts.moves || 0;
      this.cfg = level.ch.view;
      this.moveLine = this.cfg.moveLine || null;
      this.scene = TSD.scenes[this.cfg.type];
    }

    collapse(trace, expand) {
      const groups = [];
      let cur = [];
      for (const s of trace) { cur.push(s); if (s.loc.src === 'run') { groups.push(cur); cur = []; } }
      if (cur.length) groups.push(cur);
      const ex = expand === 'last' ? groups.length - 1 : expand;
      return groups.flatMap((g, i) => (i === ex || g.length === 1 ? g : [Object.assign({}, g[g.length - 1], { collapsed: true })]));
    }

    open() {
      return new Promise(resolve => {
        this.resolve = resolve;
        this.counter = el('span', { class: 'mcount' });
        this.bar = el('div', { class: 'mbar' }, el('span'));
        this.face = el('div', { class: 'portrait' });
        this.bubble = el('div', { class: 'speech', 'aria-live': 'polite' });
        this.stage = el('div', { class: 'stage' });
        this.meter = el('div', { class: 'meter' });
        const codeBox = el('div', { class: 'code' });
        this.code = new TSD.CodeView(codeBox);
        this.code.show({
          src: this.opts.code || window.Sims.PROGRAMS[this.L.ch.sim],
          focus: this.opts.code ? null : this.opts.focus,
          srcId: this.opts.code ? (this.opts.codeSrcId || 'variant') : 'prog',
        });
        this.act = el('div', { class: 'mact' });
        const panel = el('div', { class: 'mpanel', role: 'dialog', 'aria-modal': 'true', 'aria-label': this.title },
          el('div', { class: 'mhead' }, el('b', null, this.title), this.counter), this.bar,
          el('div', { class: 'comms small' }, this.face, this.bubble),
          el('div', { class: 'stage-wrap px-frame' }, this.stage, this.meter),
          codeBox,
          el('div', { class: 'panel px-frame' }, this.act));
        this.modal = el('div', { class: 'modal' }, panel);
        document.body.append(this.modal);
        document.body.classList.add('locked');
        this.loop();
      });
    }

    close() { this.modal.remove(); document.body.classList.remove('locked'); this.resolve(); }

    say(text, mood) {
      this.face.replaceChildren(TSD.sprite(TSD.portrait('發哥', mood || 'normal'), 'face'));
      this.bubble.className = 'speech' + (mood === 'angry' ? ' bad' : mood === 'happy' ? ' good' : '');
      this.bubble.innerHTML = '<span class="say">' + rich(text) + '</span>';
    }

    draw(view, loc, extra) {
      this.scene.render(this.stage, this.meter, this.cfg, view, Object.assign({ output: this.out, moves: this.moveLine ? this.moves : undefined }, extra || {}));
      this.code.mark(loc);
    }

    lineText(loc) {
      const row = this.code.rowOf(loc);
      if (row) return row.dataset.text;
      if (loc.src === 'run') return this.run.split('\n')[loc.line - 1] || '';
      return '';
    }
    lineName(loc) {
      const row = this.code.rowOf(loc);
      const no = row ? row.querySelector('.no').textContent : '';
      return /^\d+$/.test(no) ? `第 ${no} 行` : '呢行';
    }

    /** 把運算式中的變量換成目前數值，例如 top == -1 → 2 == -1 */
    subst(expr, view) {
      return expr.replace(/("[^"]*")|\b([A-Za-z_]\w*)\b/g, (m, str, name) => {
        if (str) return str;
        if (['and', 'or', 'not', 'None', 'True', 'False'].includes(name)) return name;
        if (view.locals && Object.prototype.hasOwnProperty.call(view.locals, name)) return fmt(view.locals[name]);
        const v = view.state[name];
        if (v !== undefined && !Array.isArray(v)) return fmt(v);
        return name;
      });
    }

    valueOf(view, key) {
      const m = key.match(/^(\w+)\[(\d+)\]$/);
      if (m) return (view.state[m[1]] || [])[+m[2]];
      if (view.locals && Object.prototype.hasOwnProperty.call(view.locals, key)) return view.locals[key];
      return view.state[key];
    }

    async loop() {
      const n = this.trace.length;
      let prev = { state: this.pre, locals: {}, fn: null };
      for (let k = 0; k < n; k++) {
        const step = this.trace[k];
        this.counter.textContent = `第 ${k + 1} / ${n} 步`;
        this.bar.firstChild.style.width = (100 * k / n) + '%';
        const sameFrame = !step.call && !step.collapsed && prev.fn === step.fn;
        const before = { state: prev.state, locals: sameFrame ? prev.locals : {}, localNames: step.collapsed ? [] : step.localNames };
        const after = { state: step.state, locals: step.collapsed ? {} : step.locals, localNames: step.collapsed ? [] : step.localNames,
          access: step.access, ret: step.ret !== undefined ? step.ret : step.result };
        const text = this.lineText(step.loc);
        const cond = step.collapsed ? null : COND_RE.exec(text);
        let targets = changes(this.cfg, prev, sameFrame, step);
        if (step.collapsed) targets = changes(this.cfg, prev, false, step);
        // 迴圈內同一行只問頭兩次，之後自動行（避免太長）
        const key = step.loc.src + ':' + step.loc.line;
        const asked = this.asked[key] || 0;
        const ask = this.scored && !step.collapsed && (cond || targets.length) && asked < 2;
        if (ask) this.asked[key] = asked + 1;
        if (this.moveLine && step.loc.src === 'prog' && text.trim() === this.moveLine) this.moves++;

        if (ask) {
          this.draw(before, step.loc);
          if (cond) await this.askCond(step, cond[2], before);
          if (targets.length) {
            await this.askPick(step, targets, before);
            for (const t of targets) await this.askValue(step, t, before, after, text);
          }
        }
        if (step.printed) this.out.push(step.printed);
        this.draw(after, step.loc);
        this.say(this.describe(step, text, cond, targets, before, after), ask ? 'happy' : 'normal');
        await this.next(k === n - 1 && !this.error ? '完成 ▸' : '下一步 ▸', ask ? 500 : 0);
        prev = { state: step.state, locals: step.locals, fn: step.fn };
      }
      this.bar.firstChild.style.width = '100%';
      this.counter.textContent = '完成';
      if (this.error) {
        this.code.mark(this.error.loc, 'err');
        const row = this.code.rowOf(this.error.loc);
        this.say(`${row ? this.lineName(this.error.loc) + '出事！' : ''}${TSD.errorText(this.error)}`, 'shocked');
      } else {
        this.code.mark(null);
        const last = this.trace[n - 1];
        this.say(last && last.result !== undefined && !this.run.includes('\n') ? `執行完畢！\`${this.run}\` 傳回 ${last.result}。` : '執行完畢！', 'happy');
      }
      this.act.replaceChildren(el('button', { class: 'pxbtn primary', type: 'button', onclick: () => this.close() }, '關閉，返回題目'));
    }

    describe(step, text, cond, targets, before, after) {
      const t = text.trim();
      const changed = () => targets.map(k => { const o = this.valueOf(before, k); return `\`${k}\` 由 ${o === undefined ? '（未有數值）' : fmt(o)} 變成 ${fmt(this.valueOf(after, k))}`; }).join('；');
      if (step.collapsed) {
        const parts = [];
        if (targets.length) parts.push(changed());
        const m = ASSIGN_RE.exec(t);
        if (m && !/\[/.test(m[1])) parts.push(`\`${m[1]}\` 變成 ${fmt(after.state[m[1]])}`);
        else if (step.result !== undefined) parts.push(`傳回 ${step.result}`);
        if (step.printed) parts.push(`輸出「${step.printed}」`);
        return `\`${t}\`：${parts.length ? parts.join('；') : '冇改變'}。`;
      }
      if (step.call) return `呼叫 \`${step.call}()\`，跳入函式入面執行。`;
      if (cond) return `\`${cond[2]}\` 即係 \`${this.subst(cond[2], before)}\`，${step.cond ? '成立，執行下面縮排的部分。' : '不成立，跳過下面縮排的部分。'}`;
      if (/^global\b/.test(t)) return `宣告 \`${t.slice(7)}\` 是函式外面的變量，之後可以修改它。`;
      if (/^else\s*:/.test(t)) return '上面的 if 不成立，所以執行 else 下面的部分。';
      if (/^return\b/.test(t)) return `傳回 ${step.ret}，回到呼叫函式的地方。`;
      if (step.printed) return `輸出「${step.printed}」。`;
      if (targets.length) return changed() + '。';
      const m = ASSIGN_RE.exec(t);
      if (m && step.loc.src === 'run' && !/\[/.test(m[1])) return `\`${m[1]}\` 變成 ${fmt(after.state[m[1]])}。`;
      if (step.result !== undefined) return `\`${t}\` 傳回 ${step.result}。`;
      return '執行這一行。';
    }

    next(label, delay) {
      return new Promise(res => {
        this.act.replaceChildren();
        const show = () => {
          const b = el('button', { class: 'pxbtn primary', type: 'button', onclick: () => res() }, label);
          this.act.replaceChildren(b);
          b.focus({ preventScroll: true });
        };
        delay ? setTimeout(show, delay) : show();
      });
    }

    choice(options, correct, onWrong) {
      return new Promise(res => {
        const grid = el('div', { class: 'opts' + (options.length >= 3 && options.every(o => o.length <= 4) ? ' n' + Math.min(options.length, 4) : '') });
        for (const o of options) {
          const b = el('button', { class: 'opt mono', type: 'button' }, o);
          b.addEventListener('click', () => {
            if (o === correct) { grid.querySelectorAll('button').forEach(x => { x.disabled = true; }); b.classList.add('right'); setTimeout(res, 350); }
            else { b.classList.add('wrong'); b.disabled = true; onWrong(o); }
          });
          grid.append(b);
        }
        this.act.replaceChildren(grid);
      });
    }

    askCond(step, expr, before) {
      const name = this.lineName(step.loc);
      this.say(`${name}要判斷：\`${expr}\` 成立嗎？睇吓咪錶上的數值。`, 'normal');
      const yes = '成立 (True)', no = '不成立 (False)';
      return this.choice([yes, no], step.cond ? yes : no, o => {
        this.L.penalty(`${name}：${expr} 選了 ${o}`);
        this.say(`唔啱。\`${expr}\` 即係 \`${this.subst(expr, before)}\`，再計一次。`, 'angry');
      });
    }

    askPick(step, targets, before) {
      return new Promise(resolve => {
        const found = new Set();
        const name = this.lineName(step.loc);
        const draw = miss => this.draw(before, step.loc, { pick, found, miss });
        const pick = key => {
          if (found.has(key)) return;
          if (targets.includes(key)) {
            found.add(key);
            draw();
            if (found.size === targets.length) setTimeout(resolve, 300);
            else this.say(`啱！仲有 ${targets.length - found.size} 樣會改變，再搵吓。`, 'happy');
            return;
          }
          this.L.penalty(`${name}：點了 ${key}`);
          const readOnly = (step.access || []).some(a => !a.w && `${a.name}[${a.i}]` === key);
          this.say(readOnly
            ? `${name}只係「讀取」\`${key}\`，冇改變佢。睇吓等號左邊係乜？`
            : `${name}冇改變 \`${key}\`。睇吓等號左邊係乜？`, 'angry');
          draw(key);
          setTimeout(() => draw(), 600);
        };
        this.say(`${name}執行之後，邊樣嘢會改變？`, 'normal');
        this.act.replaceChildren(el('p', { class: 'hint-line' }, '↑ ' + (this.cfg.pickHint || '點上面的格，或者咪錶上的變量')));
        draw();
      });
    }

    askValue(step, key, before, after, text) {
      const name = this.lineName(step.loc);
      const newV = this.valueOf(after, key), oldV = this.valueOf(before, key);
      const correct = fmt(newV);
      const pool = [];
      if (typeof newV === 'number') pool.push(newV - 1, newV + 1, newV + 2);
      else {
        for (const name of TSD.viewArrays(this.cfg)) (before.state[name] || []).forEach(v => { if (v !== null && typeof v !== 'number') pool.push(v); });
        Object.values(before.locals || {}).forEach(v => pool.push(v));
        pool.push(null);
      }
      if (oldV !== undefined) pool.unshift(oldV);
      const others = [];
      for (const v of pool.map(fmt)) if (v !== correct && !others.includes(v)) others.push(v);
      const options = TSD.shuffle([correct].concat(others.slice(0, 3)));
      const m = ASSIGN_RE.exec(text);
      const hint = m ? `\`${text.trim()}\` 即係 \`${m[1]} = ${this.subst(m[2], before)}\`` : '再睇吓亮起的一行';
      this.say(`啱！\`${key}\` 會變成什麼？`, 'happy');
      return this.choice(options, correct, o => {
        this.L.penalty(`${name}：${key} 選了 ${o}`);
        this.say(`唔啱。${hint}，再諗諗。`, 'angry');
      });
    }
  }

  TSD.Stepper = Stepper;
})();
