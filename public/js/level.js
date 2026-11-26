/* level.js — 關卡畫面及流程
 * 由上至下：狀態列 → 發哥對白框 → 主場景（+ 咪錶）→ 程式區 → 操作面板。
 * 題型由 tasks/*.js 提供（TSD.tasks.predict 等）。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, fmt = TSD.fmt, rich = TSD.rich;
  const { Score, Store, Sims } = window;

  class Level {
    constructor(app, ch, lv, opts) {
      this.app = app; this.ch = ch; this.lv = lv;
      this.quiz = !!(opts && opts.quiz);
      this.root = app.root;
    }

    start() {
      this.wrong = 0; this.hintUsed = false; this.taskIdx = -1; this.t0 = Date.now();
      this.quizScore = 0;
      this.revenueBefore = Score.revenue(Store.load());
      this.resetState(this.lv.setup);
      this.build();
      this.renderScene();
      this.showCode({ focus: this.lv.focus });
      this.playDialogue(this.lv.dialogue || [], () => this.nextTask());
    }

    resetState(setup) {
      this.it = Sims.create(this.ch.sim, setup);
      this.ret = undefined; this.output = [];
      this.moves = 0;
    }

    /** 某題用另一個（有錯的）版本的函式：先定義，程式區亦顯示這個版本 */
    applyVariant(t) {
      if (!t.variant) return;
      const r = this.it.run(t.variant, 'variant');
      if (!r.ok) throw r.error;
    }
    codeFor(t) {
      return t.variant ? { src: t.variant, srcId: 'variant' } : { focus: t.focus || this.lv.focus };
    }

    /* ---------- 畫面骨架 ---------- */
    build() {
      const ch = this.ch, lv = this.lv;
      this.fareEl = el('span', { class: 'fare' });
      const status = el('header', { class: 'status' },
        el('button', { type: 'button', class: 'back', 'aria-label': '返回章節', onclick: () => this.app.showChapter(ch) }, '‹'),
        el('b', { class: 'shift' }, TSD.shiftName(ch)),
        el('span', { class: 'revenue' }, TSD.sprite('icon_coin', 'coin'), `營收 ${Score.money(this.revenueBefore)}`),
        el('span', { class: 'lvname' }, this.quiz ? '收工小測（每題一次機會）' : `${lv.id}　${lv.title}（${lv.kind}）`),
        this.fareEl);
      this.face = el('div', { class: 'portrait' });
      this.whoEl = el('span', { class: 'who' });
      this.bubble = el('div', { class: 'speech', 'aria-live': 'polite' });
      const comms = el('section', { class: 'comms', 'aria-label': '對白' },
        el('div', { class: 'face-wrap' }, this.face, this.whoEl), this.bubble);
      this.stage = el('div', { class: 'stage' });
      this.meter = el('div', { class: 'meter', 'aria-label': '變量' });
      const codeBox = el('section', { class: 'code', 'aria-label': '程式' });
      this.code = new TSD.CodeView(codeBox);
      this.headEl = el('div', { class: 'panel-head' });
      this.body = el('div', { class: 'panel-body' });
      const panel = el('section', { class: 'panel px-frame', 'aria-label': '操作面板' }, this.headEl, this.body);
      this.stageWrap = el('section', { class: 'stage-wrap px-frame', 'aria-label': '主場景' }, this.stage, this.meter);
      this.root.replaceChildren(status, comms, this.stageWrap, codeBox, panel);
      this.updateFare();
    }

    starsNow() { return this.quiz ? this.quizScore : Score.starsFor(this.wrong, this.hintUsed); }

    updateFare() {
      if (this.quiz) {
        this.fareEl.replaceChildren(`答對 ${this.quizScore} / ${this.lv.tasks.length}`);
        return;
      }
      const s = this.starsNow();
      const stars = [0, 1, 2].map(i => {
        const img = TSD.sprite('icon_star', 'star-ic' + (i < s ? '' : ' off'));
        return img;
      });
      this.fareEl.replaceChildren(el('span', { class: 'stars' }, stars), `本程 ${Score.money(s * Score.STAR_VALUE)}`);
    }

    /** 對白框；mood：normal / happy / angry / shocked */
    say(who, text, mood, onTap) {
      this.face.replaceChildren(TSD.sprite(TSD.portrait(who, mood || 'normal'), 'face'));
      this.whoEl.textContent = who;
      this.bubble.className = 'speech' + (mood === 'angry' ? ' bad' : mood === 'happy' ? ' good' : mood === 'hint' ? ' hint' : '');
      this.bubble.innerHTML = '<span class="say">' + rich(text) + '</span>' + (onTap ? '<span class="more" aria-hidden="true">▼</span>' : '');
      this.bubble.onclick = onTap || null;
      this.bubble.classList.toggle('tappable', !!onTap);
    }

    playDialogue(lines, done) {
      let i = 0;
      const next = () => {
        if (i >= lines.length) { this.bubble.onclick = null; done(); return; }
        const L = lines[i++];
        this.say(L.who, L.text, L.mood, next);
        this.setPanel(null, el('button', { class: 'pxbtn primary', type: 'button', onclick: next }, '繼續 ▸'));
      };
      next();
    }

    /** 操作面板：head 為標題列（可為 null），其餘為內容 */
    setPanel(head, ...body) {
      this.headEl.replaceChildren(...(head ? [head] : []));
      this.headEl.hidden = !head;
      this.body.replaceChildren(...body.filter(Boolean));
    }

    taskHead(t, extra) {
      const hint = !this.quiz && t.hint ? el('button', {
        class: 'pxbtn hint', type: 'button',
        onclick: () => {
          if (!this.hintUsed) { this.hintUsed = true; this.updateFare(); }
          this.say('發哥', '師傅提你：' + t.hint, 'hint');
        },
      }, '師傅提你') : null;
      return el('div', { class: 'qbar' },
        el('div', { class: 'qtext' },
          el('span', { class: 'qno' }, `${t.id} · ${this.taskIdx + 1}/${this.lv.tasks.length}`),
          el('p', { class: 'prompt', html: rich(t.prompt) })),
        el('div', { class: 'qbtns' }, extra || null, hint));
    }

    renderScene(view, opts) {
      const v = view || { state: this.it.snapshot(), ret: this.ret };
      TSD.scenes[this.ch.view.type].render(this.stage, this.meter, this.ch.view, v,
        Object.assign({ output: this.output, moves: this.ch.view.moveLine ? this.moves : undefined }, opts || {}));
    }

    /** 排列、捉錯題不用主場景，騰出位置給程式區 */
    showStage(on) { this.stageWrap.hidden = !on; }

    /** 試行某個（錯誤）版本：在新模擬器上執行並開啟逐行視窗（不計分） */
    async tryVariant(code, demo, title) {
      const it = Sims.create(this.ch.sim, demo.setup);
      const d = it.run(code, 'variant');
      if (!d.ok) { this.say('發哥', '呢個版本連程式結構都唔啱：' + TSD.errorText(d.error), 'shocked'); return; }
      const pre = it.snapshot();
      const r = it.run(demo.run, 'run', { trace: true, stepLimit: demo.stepLimit || 400 });
      await new TSD.Stepper(this, r, pre, { scored: false, run: demo.run, code, expand: 'last', maxSteps: demo.maxSteps, title }).open();
    }

    showCode(o) {
      this.code.show(Object.assign({ src: Sims.PROGRAMS[this.ch.sim] }, o));
      this.code.mark(null);
    }

    /* ---------- 評分 ---------- */
    countWrong(t, text) {
      this.wrong++; this.updateFare();
      TSD.record({ type: 'error', level: this.lv.id, question: t.id, choice: text });
    }
    penalty(text) {
      this.wrong++; this.updateFare();
      TSD.record({ type: 'error', level: this.lv.id, question: (this.curTask ? this.curTask.id : '') + ' 逐行', choice: text });
    }

    nextTask() {
      this.taskIdx++;
      if (this.taskIdx >= this.lv.tasks.length) { this.finish(); return; }
      const t = this.lv.tasks[this.taskIdx];
      this.curTask = t;
      if (t.setup !== undefined) this.resetState(t.setup);
      this.applyVariant(t);
      this.renderScene();
      this.showStage(true);
      const run = () => {
        const fn = TSD.tasks[t.type];
        if (!fn) { this.setPanel(null, el('p', { class: 'prompt' }, `（題型「${t.type}」會在第 3 步加入）`)); return; }
        fn(this, t);
      };
      if (t.dialogue) this.playDialogue(t.dialogue, run); else run();
    }

    /** 答對後的說明及「下一題」 */
    doneBox(t) {
      return el('div', { class: 'explain' },
        t.explain ? el('div', { html: rich(t.explain) }) : null,
        el('button', { class: 'pxbtn primary', type: 'button', onclick: () => this.nextTask() },
          this.taskIdx + 1 >= this.lv.tasks.length ? '收工 ▸' : '下一題 ▸'));
    }

    /** 逐行執行（計分） */
    async stepThrough(t) {
      const pre = this.it.snapshot();
      const r = this.it.run(t.run, 'run', { trace: true, stepLimit: t.stepLimit || 20000 });
      const st = new TSD.Stepper(this, r, pre, {
        scored: !this.quiz, run: t.run, output: this.output, focus: t.focus || this.lv.focus,
        code: t.variant, maxSteps: t.maxSteps, moves: this.moves,
        title: '逐行執行：' + t.run.split('\n')[0] + (t.run.includes('\n') ? ' …' : ''),
      });
      await st.open();
      this.moves = this.countMoves(r.trace, this.moves);
      this.output = this.output.concat(r.output);
      this.ret = r.result !== undefined && r.result !== null ? fmt(r.result) : undefined;
      this.renderScene();
    }

    /** 在複本上逐行執行（不計分、不改變關卡狀態） */
    async replay(t) {
      const c = this.it.clone();
      const pre = c.snapshot();
      const r = c.run(t.run, 'run', { trace: true, stepLimit: t.stepLimit || 20000 });
      await new TSD.Stepper(this, r, pre, { scored: false, run: t.run, focus: t.focus || this.lv.focus, code: t.variant,
        maxSteps: t.maxSteps, moves: this.moves, title: '睇返執行過程（不計分）' }).open();
    }

    /** 移位版隊列：數一數移動了多少架車（執行 moveLine 的次數） */
    countMoves(trace, base) {
      const ml = this.ch.view.moveLine;
      if (!ml || !trace) return base || 0;
      const src = Sims.PROGRAMS[this.ch.sim].split('\n');
      return (base || 0) + trace.filter(s => s.loc.src === 'prog' && (src[s.loc.line - 1] || '').trim() === ml).length;
    }

    /** 試行一段獨立的程式（不是函式），例如第四章插站的幾句；不計分 */
    async tryRun(setup, run, title, stepLimit) {
      const it = Sims.create(this.ch.sim, setup);
      const pre = it.snapshot();
      const r = it.run(run, 'run', { trace: true, stepLimit: stepLimit || 400 });
      await new TSD.Stepper(this, r, pre, { scored: false, run, code: run, codeSrcId: 'run', expand: 'last', title }).open();
    }

    /* ---------- 收工結算 ---------- */
    finish() {
      const secs = Math.round((Date.now() - this.t0) / 1000);
      let p, gained, line;
      if (this.quiz) {
        p = Store.recordQuiz(this.ch.chapter, this.quizScore);
        gained = this.quizScore * Score.STAR_VALUE;
        line = `答對 ${this.quizScore} / ${this.lv.tasks.length} 題`;
        TSD.record({ type: 'quiz', chapter: this.ch.chapter, score: this.quizScore, total: this.lv.tasks.length, seconds: secs });
      } else {
        const stars = this.starsNow();
        p = Store.recordLevel(this.lv.id, stars);
        gained = stars * Score.STAR_VALUE;
        line = `答錯 ${this.wrong} 次 · ${this.hintUsed ? '用了提示' : '冇用提示'} · ${secs} 秒`;
        TSD.record({ type: 'level', level: this.lv.id, stars, wrong: this.wrong, hint: this.hintUsed, seconds: secs });
      }
      const after = Score.revenue(p);
      const s = this.starsNow();
      const comment = this.quiz ? '收工！' : s === 3 ? '好嘢！一次過全中，有師傅風範！' : s === 2 ? '唔錯，仲有少少要執吓。' : '慢慢嚟，再揸多次就熟㗎喇。';
      this.say('發哥', comment, s >= 2 ? 'happy' : 'normal');
      this.renderScene();
      this.code.mark(null);
      this.setPanel(null, el('p', { class: 'prompt' }, '收工結算中……'));

      const next = this.app.nextAfter(this);
      const close = () => { card.remove(); document.body.classList.remove('locked'); };
      const card = el('div', { class: 'modal' }, el('div', { class: 'result-card px-frame', role: 'dialog', 'aria-label': '收工結算' },
        el('h2', null, this.quiz ? '收工小測完成' : `${this.lv.id} ${this.lv.title} 完成`),
        this.quiz ? null : el('div', { class: 'big-stars' }, [0, 1, 2].map(i => TSD.sprite('icon_star', 'star-big' + (i < s ? '' : ' off')))),
        el('p', { class: 'gain' }, TSD.sprite('icon_coin', 'coin'), `本程車資 +${Score.money(gained)}`),
        el('p', { class: 'rev' }, `營收 ${Score.money(this.revenueBefore)} → `, el('b', null, Score.money(after)),
          after - this.revenueBefore < gained ? el('small', null, '（只計每關最佳成績）') : null),
        el('p', { class: 'small' }, line),
        el('div', { class: 'row-btns' },
          el('button', { class: 'pxbtn', type: 'button', onclick: () => { close(); this.start(); } }, this.quiz ? '再做一次' : '再玩一次'),
          next
            ? el('button', { class: 'pxbtn primary', type: 'button', onclick: () => { close(); next.go(); } }, next.label)
            : el('button', { class: 'pxbtn primary', type: 'button', onclick: () => { close(); this.app.showChapter(this.ch); } }, '返回更份 ▸'))));
      document.body.append(card);
      document.body.classList.add('locked');
    }
  }

  TSD.Level = Level;
  TSD.tasks = TSD.tasks || {};
})();
