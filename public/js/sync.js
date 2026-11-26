/* sync.js — Google 登入及成績記錄（第 6 步）
 * 1. 「用 Google 登入」（Google Identity Services）→ 把 Google 發出的 ID 權杖交給 Apps Script 驗證。
 * 2. Apps Script 驗證後發出登入憑證（30 日）；之後開遊戲自動保持登入，不用再揀帳戶。
 * 3. 成績先存在手機（tsd:outbox，每筆有唯一編號）；有網絡時自動補傳，伺服器確認收到才刪除。
 * 4. 換手機登入時，取回自己的最佳成績；老師解鎖亦會同步。
 * 電郵不在學生名單：可以玩，但不記錄成績。
 */
(function () {
  'use strict';
  const TSD = window.TSD;
  const cfg = window.TSD_CONFIG || {};
  const K = { session: 'tsd:session', profile: 'tsd:profile' };
  const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const put = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 照玩 */ } };

  const Sync = {
    enabled: () => !!(cfg.googleClientId && cfg.appsScriptUrl),
    profile: () => get(K.profile),
    session: () => get(K.session),
    pending: () => { try { return JSON.parse(localStorage.getItem('tsd:outbox') || '[]').length; } catch (e) { return 0; } },
    listeners: [],
    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { /* 照玩 */ } }); },

    async call(action, body) {
      const res = await fetch(cfg.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // 避免 CORS 預檢
        body: JSON.stringify(Object.assign({ action }, body)),
      });
      const data = await res.json();
      if (!data.ok && ['bad_session', 'session_expired', 'no_session'].includes(data.error)) {
        put(K.session, null);
        const p = get(K.profile);
        if (p) { p.expired = true; put(K.profile, p); }
        this.emit();
      }
      return data;
    },

    /* ---------- Google 登入按鈕 ---------- */
    loadGis() {
      if (window.google && window.google.accounts) return Promise.resolve();
      if (this._gis) return this._gis;
      this._gis = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('gis'));
        document.head.append(s);
      });
      return this._gis;
    },
    async renderButton(container) {
      try { await this.loadGis(); } catch (e) { container.textContent = '未能載入 Google 登入（請檢查網絡）。'; return; }
      window.google.accounts.id.initialize({
        client_id: cfg.googleClientId,
        callback: r => this.login(r.credential),
        ux_mode: 'popup',
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.renderButton(container, { theme: 'filled_black', size: 'large', text: 'signin_with', shape: 'rectangular', locale: 'zh-HK', width: 260 });
    },

    async login(idToken) {
      this.status = '登入中……';
      this.emit();
      let r;
      try { r = await this.call('login', { idToken }); } catch (e) { this.status = '連線失敗，請稍後再試。'; this.emit(); return; }
      this.status = '';
      if (!r.ok) { this.status = r.error === 'wrong_domain' ? '請用學校的 Google 帳戶登入。' : '登入失敗，請再試。'; this.emit(); return; }
      if (!r.inRoster && !r.teacher) {
        put(K.profile, { email: r.email, inRoster: false });
        put(K.session, null);
        this.emit();
        return;
      }
      put(K.session, r.session);
      put(K.profile, Object.assign({ email: r.email, inRoster: r.inRoster, teacher: r.teacher }, r.profile || {}));
      try { localStorage.setItem('tsd:unlockServer', r.unlocked ? '1' : '0'); } catch (e) { /* 照玩 */ }
      await this.restore();
      await this.flush();
      this.emit();
    },

    logout() {
      put(K.session, null);
      put(K.profile, null);
      try { if (window.google && window.google.accounts) window.google.accounts.id.disableAutoSelect(); } catch (e) { /* 照玩 */ }
      this.emit();
    },

    /* ---------- 取回自己的成績（換手機） ---------- */
    async restore() {
      const s = this.session();
      if (!s || !(this.profile() || {}).inRoster) return;
      let r;
      try { r = await this.call('me', { session: s }); } catch (e) { return; }
      if (!r.ok) return;
      const p = window.Store.load();
      for (const [id, v] of Object.entries(r.stars || {})) p.stars[id] = Math.max(p.stars[id] || 0, v);
      for (const [c, v] of Object.entries(r.quiz || {})) p.quiz[c] = Math.max(p.quiz[c] === undefined ? -1 : p.quiz[c], v);
      window.Store.save(p);
      try {
        const n = +(localStorage.getItem('tsd:examAttempts') || 0);
        if (r.examAttempts > n) localStorage.setItem('tsd:examAttempts', String(r.examAttempts));
        localStorage.setItem('tsd:unlockServer', r.unlocked ? '1' : '0'); // 老師在控制台解鎖
      } catch (e) { /* 照玩 */ }
    },

    /* ---------- 補傳成績 ---------- */
    async flush() {
      if (this._busy || !navigator.onLine) return;
      const s = this.session();
      if (!s || !(this.profile() || {}).inRoster) return;
      let box;
      try { box = JSON.parse(localStorage.getItem('tsd:outbox') || '[]'); } catch (e) { return; }
      if (!box.length) return;
      this._busy = true;
      try {
        const batch = box.slice(0, 200);
        const r = await this.call('sync', { session: s, records: batch });
        if (r.ok) {
          const got = new Set(r.accepted);
          // 伺服器不接受的紀錄（例如格式不符）亦一併移走，以免一直重傳
          const sent = new Set(batch.map(x => x.id));
          const now = JSON.parse(localStorage.getItem('tsd:outbox') || '[]');
          localStorage.setItem('tsd:outbox', JSON.stringify(now.filter(x => !got.has(x.id) && !sent.has(x.id))));
          if (box.length > 200) setTimeout(() => this.flush(), 500);
        }
      } catch (e) { /* 沒有網絡：下次再傳 */ } finally {
        this._busy = false;
        this.emit();
      }
    },
    flushSoon() { clearTimeout(this._t); this._t = setTimeout(() => this.flush(), 1500); },
  };

  TSD.Sync = Sync;
  if (Sync.enabled()) {
    window.addEventListener('online', () => Sync.flush());
    setInterval(() => Sync.flush(), 60000);
    // 開遊戲時：補傳 + 同步解鎖狀態
    setTimeout(() => { Sync.restore().then(() => Sync.flush()); }, 800);
  }
})();
