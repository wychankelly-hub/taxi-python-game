/* app.js — 首頁、更份（章節）、解鎖及啟動
 * 解鎖：章內關卡依次解鎖；六關完成後開放收工小測；完成小測後開放下一更。
 * 老師測試：網址最後加 #unlock 解鎖全部，#lock 回復（第 6 步改為老師控制台解鎖）。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const el = TSD.el, rich = TSD.rich;
  const { Score, Store, Sims } = window;

  const SHIFTS = [
    { chapter: 1, title: '車尾箱', topic: '堆疊 Stack' },
    { chapter: 2, title: '的士站', topic: '隊列 Queue' },
    { chapter: 3, title: '的士站改革', topic: '環形隊列 Circular Queue' },
    { chapter: 4, title: '順路經…', topic: '鏈表 Linked List' },
  ];

  // 解鎖全部：老師在控制台解鎖（tsd:unlockServer），或網址 #unlock（老師測試用）
  const unlockAll = () => { try { return localStorage.getItem('tsd:unlockAll') === '1' || localStorage.getItem('tsd:unlockServer') === '1'; } catch (e) { return false; } };
  const setUnlock = on => { try { localStorage.setItem('tsd:unlockAll', on ? '1' : '0'); } catch (e) { /* 照玩 */ } };

  function starRow(n, cls) {
    return el('span', { class: 'stars' }, [0, 1, 2].map(i => TSD.sprite('icon_star', (cls || 'star-ic') + (i < n ? '' : ' off'))));
  }

  class App {
    constructor(root, chapters) { this.root = root; this.chapters = chapters; }

    chapter(n) { return this.chapters.find(c => c.chapter === n); }
    quizLevel(ch) { return Object.assign({ id: '小測' + ch.chapter, title: '收工小測', kind: '小測', focus: ch.quiz.focus }, ch.quiz); }

    levelOpen(ch, i) {
      if (unlockAll() || i === 0) return true;
      return (Store.load().stars[ch.levels[i - 1].id] || 0) > 0;
    }
    quizOpen(ch) {
      const p = Store.load();
      return unlockAll() || ch.levels.every(l => (p.stars[l.id] || 0) > 0);
    }
    chapterOpen(n) {
      if (n === 1 || unlockAll()) return true;
      const p = Store.load();
      return (p.quiz[n - 1] !== undefined) && !!this.chapter(n);
    }

    /** 收工結算的「下一關」 */
    nextAfter(level) {
      const ch = level.ch;
      if (level.quiz) return null;
      const i = ch.levels.findIndex(l => l.id === level.lv.id);
      if (i + 1 < ch.levels.length) return { label: '下一關 ▸', go: () => this.play(ch, ch.levels[i + 1]) };
      return { label: '收工小測 ▸', go: () => this.playQuiz(ch) };
    }

    statusBar(title, back) {
      return el('header', { class: 'status home' },
        back ? el('button', { type: 'button', class: 'back', 'aria-label': '返回', onclick: back }, '‹') : null,
        el('b', { class: 'shift' }, title),
        el('span', { class: 'revenue' }, TSD.sprite('icon_coin', 'coin'), `營收 ${Score.money(Score.revenue(Store.load()))}`));
    }

    /* ---------- 首頁 ---------- */
    showHome() {
      window.scrollTo(0, 0);
      const nick = TSD.getNick();
      const hero = el('section', { class: 'hero px-frame' },
        el('div', { class: 'hero-bg', style: TSD.asset('bg_home') ? { backgroundImage: `url("${TSD.asset('bg_home')}")` } : {} }),
        el('div', { class: 'hero-sign' }, el('span', { class: 'roof' }, 'TAXI'), el('b', null, '的士佬日記')),
        el('p', { class: 'hero-sub' }, '選修 C：堆疊、隊列、環形隊列、鏈表'));
      this.screen = 'home';
      const prof = TSD.Sync && TSD.Sync.enabled() ? TSD.Sync.profile() : null;
      const named = prof && prof.inRoster && prof.name && !prof.expired;
      const face = el('div', { class: 'portrait' }, TSD.sprite(TSD.portrait('發哥', 'happy'), 'face'));
      const comms = el('section', { class: 'comms' },
        el('div', { class: 'face-wrap' }, face, el('span', { class: 'who' }, '發哥')),
        el('div', { class: 'speech' }, named ? `你好，${prof.name}！${nick ? '今晚開工喇！' : '揀個花名先，我教你揸的士！'}`
          : nick ? `${nick}，今晚開工喇！揀一更啦。` : '新嚟嘅？揀個花名先，我教你揸的士！'));
      const chips = el('div', { class: 'chips' }, TSD.NICKS.map(n => el('button', {
        type: 'button', class: 'chip' + (n === nick ? ' on' : ''), 'aria-pressed': n === nick ? 'true' : 'false',
        onclick: () => { TSD.setNick(n); this.showHome(); },
      }, n)));
      const p = Store.load();
      const shifts = el('div', { class: 'list' }, SHIFTS.map(s => {
        const ch = this.chapter(s.chapter);
        const open = !!ch && this.chapterOpen(s.chapter) && !!nick;
        const meta = !ch ? '即將推出' : !this.chapterOpen(s.chapter) ? '🔒' : Score.money(Score.chapterRevenue(p, s.chapter));
        return el('button', { type: 'button', class: 'item', disabled: !open, onclick: () => this.showChapter(ch) },
          el('span', { class: 'num' }, TSD.CN[s.chapter - 1]),
          el('span', { class: 'name' }, el('b', null, `第${TSD.CN[s.chapter - 1]}更　${s.title}`), el('small', null, s.topic)),
          el('span', { class: 'meta' }, meta));
      }), (() => {
        const open = !!nick && (unlockAll() || p.quiz[4] !== undefined);
        let n = 0;
        try { n = +(localStorage.getItem('tsd:examAttempts') || 0); } catch (e) { n = 0; }
        return el('button', { type: 'button', class: 'item examitem', disabled: !open, onclick: () => new TSD.ExamUI(this).start(n) },
          el('span', { class: 'num' }, '考'),
          el('span', { class: 'name' }, el('b', null, '考試模式'), el('small', null, open ? `5 題・20 分・限時 ${window.Exam.TIME_LIMIT_MIN} 分鐘` : '完成第四更收工小測後解鎖')),
          el('span', { class: 'meta' }, open ? (n ? `已考 ${n} 次` : '未考') : '🔒'));
      })());
      this.root.replaceChildren(
        this.statusBar('的士佬日記'),
        hero, comms, this.loginCard(),
        el('section', { class: 'card px-frame' }, el('h2', null, nick ? `花名：${nick}（可以轉）` : '揀一個花名'), chips),
        el('section', { class: 'card px-frame' }, el('h2', null, '今個星期的更份'),
          nick ? null : el('p', { class: 'need' }, '↑ 先揀花名，先可以開工。'), shifts));
    }

    /* ---------- Google 登入（第 6 步） ---------- */
    loginCard() {
      const S = TSD.Sync;
      if (!S || !S.enabled()) return null;
      const prof = S.profile();
      const card = el('section', { class: 'card px-frame login-card' });
      if (S.status) card.append(el('p', { class: 'small' }, S.status));
      if (prof && prof.inRoster && S.session()) {
        const n = S.pending();
        card.append(
          el('h2', null, prof.cls && prof.cls !== '未分班' ? `${prof.name}（${prof.cls} ${prof.no} 號）` : prof.name),
          el('p', { class: 'small' }, `已登入 ${prof.email}　·　${n ? `待傳送 ${n} 筆成績（有網絡時自動傳送）` : '成績已全部傳送'}`),
          el('div', { class: 'row-btns' },
            prof.teacher ? el('a', { class: 'pxbtn', href: 'teacher.html' }, '老師控制台 ▸') : null,
            el('button', { type: 'button', class: 'pxbtn', onclick: () => S.logout() }, '登出')));
        return card;
      }
      if (prof && prof.teacher && S.session()) {
        card.append(el('h2', null, '老師帳戶'), el('p', { class: 'small' }, prof.email),
          el('div', { class: 'row-btns' }, el('a', { class: 'pxbtn primary', href: 'teacher.html' }, '老師控制台 ▸'), el('button', { type: 'button', class: 'pxbtn', onclick: () => S.logout() }, '登出')));
        return card;
      }
      if (prof && prof.inRoster === false) {
        card.append(el('h2', null, '未有你的資料，請聯絡老師'),
          el('p', { class: 'small' }, `${prof.email} 不在學生名單內。你可以照玩，但成績不會記錄。`),
          el('button', { type: 'button', class: 'pxbtn', onclick: () => S.logout() }, '轉用另一個帳戶'));
        return card;
      }
      const btn = el('div', { class: 'gis-btn' });
      card.append(
        el('h2', null, prof && prof.expired ? '登入已過期，請再登入' : '用學校 Google 帳戶登入'),
        el('p', { class: 'small' }, '登入後成績會傳給老師；唔登入都可以玩，但不記錄成績。'),
        btn);
      S.renderButton(btn);
      return card;
    }

    /* ---------- 更份（章節） ---------- */
    showChapter(ch) {
      this.screen = 'chapter';
      window.scrollTo(0, 0);
      document.body.classList.remove('locked');
      const p = Store.load();
      const items = ch.levels.map((l, i) => {
        const st = p.stars[l.id] || 0;
        const open = this.levelOpen(ch, i);
        return el('button', { type: 'button', class: 'item', disabled: !open, onclick: () => this.play(ch, l) },
          el('span', { class: 'num mono' }, l.id),
          el('span', { class: 'name' }, el('b', null, l.title), el('small', null, l.kind)),
          el('span', { class: 'meta' }, open ? [starRow(st), el('small', null, st ? Score.money(st * Score.STAR_VALUE) : '未做')] : '🔒'));
      });
      const q = p.quiz[ch.chapter];
      const qOpen = this.quizOpen(ch);
      items.push(el('button', { type: 'button', class: 'item quizitem', disabled: !qOpen, onclick: () => this.playQuiz(ch) },
        el('span', { class: 'num' }, '測'),
        el('span', { class: 'name' }, el('b', null, '收工小測'), el('small', null, '3 題・不設提示・每答對一題 $10')),
        el('span', { class: 'meta' }, qOpen ? (q !== undefined ? `${q} / ${ch.quiz.tasks.length}` : '未做') : '🔒')));
      const face = el('div', { class: 'portrait' }, TSD.sprite(TSD.portrait('發哥', 'normal'), 'face'));
      this.root.replaceChildren(
        this.statusBar(TSD.shiftName(ch), () => this.showHome()),
        el('section', { class: 'comms' },
          el('div', { class: 'face-wrap' }, face, el('span', { class: 'who' }, '發哥')),
          el('div', { class: 'speech' }, ch.intro)),
        el('div', { class: 'row-btns' },
          el('button', { type: 'button', class: 'pxbtn', onclick: () => this.showReview(ch) }, '重溫'),
          el('span', { class: 'chap-rev' }, '本更營收 ', el('b', null, Score.money(Score.chapterRevenue(p, ch.chapter))))),
        el('div', { class: 'list' }, items),
        ...(unlockAll() ? [el('p', { class: 'small' }, '老師測試模式：已解鎖全部（網址加 #lock 可回復）')] : []));
    }

    play(ch, lv) { this.screen = 'level'; window.scrollTo(0, 0); new TSD.Level(this, ch, lv).start(); }
    playQuiz(ch) { window.scrollTo(0, 0); new TSD.Level(this, ch, this.quizLevel(ch), { quiz: true }).start(); }

    /* ---------- 重溫 ---------- */
    showReview(ch) {
      const close = () => { sheet.remove(); document.body.classList.remove('locked'); };
      const codeBox = el('div', { class: 'code open' });
      const cv = new TSD.CodeView(codeBox);
      cv.show({ src: Sims.PROGRAMS[ch.sim] });
      cv.setExpanded(true);
      cv.toggle.hidden = true;
      const sheet = el('div', { class: 'modal' }, el('div', { class: 'mpanel', role: 'dialog', 'aria-label': '重溫' },
        el('div', { class: 'mhead' }, el('b', null, `重溫：${ch.topic}`)),
        el('ul', { class: 'review' }, ch.review.map(x => el('li', { html: rich(x) }))),
        el('p', { class: 'small' }, '本更程式：'),
        codeBox,
        el('button', { class: 'pxbtn primary', type: 'button', onclick: close }, '返回')));
      document.body.append(sheet);
      document.body.classList.add('locked');
    }
  }

  async function boot() {
    const root = document.getElementById('app');
    const chapters = [];
    for (const n of [1, 2, 3, 4]) {
      let ch = window.TSD_DATA && window.TSD_DATA['ch' + n];
      if (!ch && !window.TSD_DATA) {
        try { ch = await (await fetch(`levels/ch${n}.json`)).json(); } catch (e) { ch = null; }
      }
      if (ch) chapters.push(ch);
    }
    if (!chapters.length) { root.textContent = '載入關卡失敗，請用網址開啟遊戲。'; return; }
    const hash = () => {
      if (location.hash === '#unlock') setUnlock(true);
      if (location.hash === '#lock') setUnlock(false);
    };
    hash();
    const app = new App(root, chapters);
    TSD.app = app;
    if (TSD.Sync) TSD.Sync.onChange(() => { if (app.screen === 'home' && document.querySelector('.hero')) app.showHome(); });
    window.addEventListener('hashchange', () => { hash(); app.showHome(); });
    app.showHome();
  }
  boot();
})();
