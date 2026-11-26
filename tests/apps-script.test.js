'use strict';
/* Apps Script 後端測試：在 Node 內模擬 Google 環境（試算表、UrlFetchApp、Utilities…）執行 apps-script/Code.gs。
 * 測試登入驗證、登入憑證簽署、寫入、防重複、權限（學生／老師）、解鎖、取回自己的成績。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { describe, check } = require('./lib.js');

const CLIENT_ID = 'test-client.apps.googleusercontent.com';

function makeEnv(tokens, props) {
  const sheets = {};
  const sheetObj = name => {
    const data = [];
    const sh = {
      name, data,
      getLastRow: () => data.length,
      setFrozenRows() {},
      getRange: (r, c, nr, nc) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((data[r - 1 + i] || [])[c - 1 + j] ?? ''))),
        setValues: vals => vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }),
        setFormulas(vals) { this.setValues(vals); },
        clearContent: () => { for (let i = 0; i < nr; i++) if (data[r - 1 + i]) for (let j = 0; j < nc; j++) data[r - 1 + i][c - 1 + j] = ''; },
      }),
    };
    return sh;
  };
  const ss = {
    getSheetByName: n => sheets[n] || null,
    insertSheet: n => (sheets[n] = sheetObj(n)),
  };
  const env = {
    sheets,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }) },
    UrlFetchApp: {
      fetch: url => {
        const t = decodeURIComponent(url.split('id_token=')[1]);
        const p = tokens[t];
        return { getResponseCode: () => (p ? 200 : 400), getContentText: () => JSON.stringify(p || { error: 'invalid_token' }) };
      },
    },
    Utilities: {
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: x => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map(b => (b + 256) % 256))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: s => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      getUuid: () => crypto.randomUUID(),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('utf8') }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
  };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), env);
  env.call = body => JSON.parse(env.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
  return env;
}

const future = Math.floor(Date.now() / 1000) + 3600;
const tok = (email, extra) => Object.assign({ aud: CLIENT_ID, iss: 'https://accounts.google.com', email, email_verified: 'true', exp: String(future) }, extra || {});
const TOKENS = {
  s1: tok('S1001@school.example'),
  s2: tok('s1002@school.example'),
  t1: tok('teacher@school.example'),
  stranger: tok('nobody@school.example'),
  wrongAud: tok('s1001@school.example', { aud: 'someone-else' }),
  unverified: tok('s1001@school.example', { email_verified: 'false' }),
  expired: tok('s1001@school.example', { exp: '1000' }),
  otherDomain: tok('kid@gmail.com'),
};

describe('Apps Script：建立工作表', () => {
  const env = makeEnv(TOKENS, { CLIENT_ID, SESSION_SECRET: 'x'.repeat(40) });
  env.setupSheets();
  check('建立六個工作表', Object.keys(env.sheets).sort(), ['學生名單', '關卡紀錄', '錯誤紀錄', '考試成績', '總覽', '設定'].sort());
  check('關卡紀錄標題', env.sheets['關卡紀錄'].data[0].slice(0, 9), ['時間', '班別', '班號', '姓名', '關卡', '星數', '答錯次數', '用了提示', '用時（秒）']);
  check('設定工作表有示範行', env.sheets['設定'].data.length, 3);
  // 再執行一次不會清除資料
  env.sheets['設定'].data.push(['老師', 'x@y', '', '']);
  env.setupSheets();
  check('再執行 setupSheets 不會清除資料', env.sheets['設定'].data.length, 4);
});

function seeded(props) {
  const env = makeEnv(TOKENS, Object.assign({ CLIENT_ID, SESSION_SECRET: 's'.repeat(40) }, props || {}));
  env.setupSheets();
  const r = env.sheets['學生名單'];
  r.data.push(['s1001@school.example', '中五', 1, '陳大文'], ['s1002@school.example', '中五', 2, '李小明']);
  env.sheets['設定'].data[1] = ['老師', 'Teacher@school.example', '', ''];
  return env;
}

describe('Apps Script：登入', () => {
  const env = seeded();
  const a = env.call({ action: 'login', idToken: 's1' });
  check('學生登入成功，取得登入憑證', [a.ok, a.inRoster, typeof a.session], [true, true, 'string']);
  check('由學生名單對應班別、班號、姓名（電郵大小寫不拘）', a.profile, { cls: '中五', no: 1, name: '陳大文' });
  check('學生不是老師', a.teacher, false);
  for (const bad of ['wrongAud', 'unverified', 'expired', 'nonexistent']) {
    check(`拒絕無效權杖：${bad}`, env.call({ action: 'login', idToken: bad }).error, 'bad_token');
  }
  const s = env.call({ action: 'login', idToken: 'stranger' });
  check('不在名單：可以玩但沒有登入憑證', [s.ok, s.inRoster, s.session], [true, false, undefined]);
  const t = env.call({ action: 'login', idToken: 't1' });
  check('老師登入（不在學生名單亦可）', [t.ok, t.teacher, typeof t.session], [true, true, 'string']);
  const d = seeded({ ALLOWED_DOMAIN: 'school.example' });
  check('限制學校網域：拒絕其他網域', d.call({ action: 'login', idToken: 'otherDomain' }).error, 'wrong_domain');
  const noSecret = makeEnv(TOKENS, { CLIENT_ID, SESSION_SECRET: 'short' });
  noSecret.sheets['學生名單'] = undefined;
  noSecret.SpreadsheetApp.getActiveSpreadsheet().insertSheet('學生名單').data.push(['電郵', '班別', '班號', '姓名'], ['s1001@school.example', '中五', 1, '陳大文']);
  check('SESSION_SECRET 太短 → 拒絕（未設定好）', noSecret.call({ action: 'login', idToken: 's1' }).error, 'server_not_configured');
  const props = { CLIENT_ID };
  const auto = makeEnv(TOKENS, props);
  auto.setupSheets();
  check('setupSheets 自動產生 SESSION_SECRET（至少 32 字元）', (props.SESSION_SECRET || '').length >= 32, true);
});

describe('Apps Script：寫入成績及防重複', () => {
  const env = seeded();
  const sess = env.call({ action: 'login', idToken: 's1' }).session;
  const now = new Date().toISOString();
  const recs = [
    { id: 'lv1aaaa', type: 'level', time: now, level: '1-4', stars: 2, wrong: 1, hint: false, seconds: 185 },
    { id: 'er1aaaa', type: 'error', time: now, level: '1-4', question: 'Q1', choice: 'top == 5' },
    { id: 'qz1aaaa', type: 'quiz', time: now, chapter: 1, score: 2, total: 3, seconds: 60 },
    { id: 'ex1aaaa', type: 'exam', time: now, byQ: { Q1: 3, Q2: 2, Q3: 2, Q4: 3, Q5: 3 }, total: 13 },
    { id: 'ex2aaaa', type: 'exam', time: now, byQ: { Q1: 3, Q2: 4, Q3: 3, Q4: 5, Q5: 5 }, total: 20 },
    { id: 'bad', type: 'level', level: '1-4' },
    { id: 'weird01', type: 'hack', level: '1-4' },
  ];
  const r = env.call({ action: 'sync', session: sess, records: recs });
  check('收到的紀錄編號（不合格的不收）', r.accepted, ['lv1aaaa', 'er1aaaa', 'qz1aaaa', 'ex1aaaa', 'ex2aaaa']);
  const lv = env.sheets['關卡紀錄'].data;
  check('關卡紀錄：班別、班號、姓名由名單對應', lv[1].slice(1, 9), ['中五', 1, '陳大文', '1-4', 2, 1, '否', 185]);
  check('收工小測寫成「小測1」', lv[2].slice(4, 6), ['小測1', 2]);
  check('錯誤紀錄', env.sheets['錯誤紀錄'].data[1].slice(1, 6), ['中五', 1, '1-4', 'Q1', 'top == 5']);
  const ex = env.sheets['考試成績'].data;
  check('考試成績：第幾次由伺服器計算；總分由各題相加', [ex[1][4], ex[1][10], ex[2][4], ex[2][10]], [1, 13, 2, 20]);
  const again = env.call({ action: 'sync', session: sess, records: recs.slice(0, 5) });
  check('重複傳送：全部確認收到', again.accepted.length, 5);
  check('重複傳送：不會重複寫入', [lv.length, env.sheets['錯誤紀錄'].data.length, ex.length], [3, 2, 3]);
  const big = env.call({ action: 'sync', session: sess, records: [{ id: 'lv2aaaa', type: 'level', time: now, level: '1-1', stars: 99, wrong: -5, seconds: 1e9 }] });
  check('數值超出範圍會被限制', [big.ok, lv[3][5], lv[3][6], lv[3][8]], [true, 3, 0, 86400]);
  const fake = env.call({ action: 'sync', session: 'abc.def', records: recs });
  check('偽造的登入憑證被拒絕', fake.error, 'bad_session');
  const parts = sess.split('.');
  const forged = Buffer.from(JSON.stringify({ e: 's1002@school.example', x: Date.now() + 1e9 })).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_') + '.' + parts[1];
  check('改了電郵的登入憑證被拒絕（不相信遊戲傳來的電郵）', env.call({ action: 'sync', session: forged, records: recs }).error, 'bad_session');
});

describe('Apps Script：權限、取回成績、解鎖', () => {
  const env = seeded();
  const s1 = env.call({ action: 'login', idToken: 's1' }).session;
  const s2 = env.call({ action: 'login', idToken: 's2' }).session;
  const t = env.call({ action: 'login', idToken: 't1' }).session;
  const now = new Date().toISOString();
  env.call({ action: 'sync', session: s1, records: [
    { id: 'aaaa0001', type: 'level', time: now, level: '1-1', stars: 1, wrong: 3, seconds: 10 },
    { id: 'aaaa0002', type: 'level', time: now, level: '1-1', stars: 3, wrong: 0, seconds: 10 },
    { id: 'aaaa0003', type: 'quiz', time: now, chapter: 1, score: 2, total: 3 }] });
  env.call({ action: 'sync', session: s2, records: [{ id: 'bbbb0001', type: 'level', time: now, level: '2-1', stars: 2, wrong: 1, seconds: 10 }] });
  const me1 = env.call({ action: 'me', session: s1 });
  check('學生取回自己的最佳成績', [me1.stars, me1.quiz], [{ '1-1': 3 }, { 1: 2 }]);
  check('學生讀不到其他同學的成績', env.call({ action: 'me', session: s2 }).stars, { '2-1': 2 });
  check('學生不可讀取全班資料', env.call({ action: 'teacher.data', session: s1 }).error, 'forbidden');
  check('學生不可解鎖', env.call({ action: 'teacher.unlock', session: s1, target: '中五', on: true }).error, 'forbidden');
  const d = env.call({ action: 'teacher.data', session: t });
  check('老師讀取全班資料', [d.ok, d.roster.length, d.levels.length], [true, 2, 4]);
  check('未解鎖', env.call({ action: 'login', idToken: 's1' }).unlocked, false);
  env.call({ action: 'teacher.unlock', session: t, target: '中五', on: true });
  check('老師為全班解鎖 → 學生登入時知道', [env.call({ action: 'login', idToken: 's1' }).unlocked, env.call({ action: 'me', session: s2 }).unlocked], [true, true]);
  env.call({ action: 'teacher.unlock', session: t, target: '中五', on: false });
  env.call({ action: 'teacher.unlock', session: t, target: 's1002@school.example', on: true });
  check('為個別學生解鎖', [env.call({ action: 'me', session: s1 }).unlocked, env.call({ action: 'me', session: s2 }).unlocked], [false, true]);
  check('設定工作表沒有重複的解鎖行', env.sheets['設定'].data.filter(r => r[0] === '解鎖' && r[1] === '中五').length, 1);
  check('不明動作', env.call({ action: 'drop_tables' }).error, 'unknown_action');
  check('損壞的請求', JSON.parse(env.doPost({ postData: { contents: '{oops' } }).getContent()).error, 'bad_request');
});

describe('Apps Script：總覽公式', () => {
  const env = seeded();
  env.updateOverview();
  const ov = env.sheets['總覽'].data;
  check('每位學生一行', ov.length, 3);
  check('公式引用學生名單', ov[1][2], "='學生名單'!D2");
  check('完成關數只計 1-1 至 4-6', ov[1][3].includes('^[1-4]-[1-6]$'), true);
});
