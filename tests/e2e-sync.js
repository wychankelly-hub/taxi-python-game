// 端對端測試（需要 Playwright）：node tests/e2e-sync.js —— 本機伺服器 + 模擬 Google 環境執行 Code.gs + 假 Google 登入按鈕
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { chromium, devices } = require('playwright');
const ROOT = path.join(__dirname, '..', 'public');
const CLIENT_ID = 'test-client.apps.googleusercontent.com';

function makeEnv(tokens, props) {
  const sheets = {};
  const sheetObj = name => {
    const data = [];
    return {
      name, data, getLastRow: () => data.length, setFrozenRows() {},
      getRange: (r, c, nr, nc) => ({
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((data[r - 1 + i] || [])[c - 1 + j] ?? ''))),
        setValues: vals => vals.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((v, j) => { data[r - 1 + i][c - 1 + j] = v; }); }),
        setFormulas(v) { this.setValues(v); }, clearContent() {},
      }),
    };
  };
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = sheetObj(n)) };
  const env = {
    sheets,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => ({ createMenu: () => ({ addItem() { return this; }, addToUi() {} }) }) },
    UrlFetchApp: { fetch: url => { const p = tokens[decodeURIComponent(url.split('id_token=')[1])]; return { getResponseCode: () => (p ? 200 : 400), getContentText: () => JSON.stringify(p || {}) }; } },
    Utilities: {
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v, 'utf8').digest()).map(b => (b > 127 ? b - 256 : b)),
      base64EncodeWebSafe: x => (typeof x === 'string' ? Buffer.from(x, 'utf8') : Buffer.from(x.map(b => (b + 256) % 256))).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64DecodeWebSafe: s => Array.from(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
      newBlob: bytes => ({ getDataAsString: () => Buffer.from(bytes.map(b => (b + 256) % 256)).toString('utf8') }),
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType() { return this; }, getContent: () => s }) },
  };
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), env);
  return env;
}
const exp = String(Math.floor(Date.now() / 1000) + 3600);
const tok = e => ({ aud: CLIENT_ID, iss: 'accounts.google.com', email: e, email_verified: true, exp, name: e.startsWith('who') ? '何同學' : undefined });
const env = makeEnv({ s1: tok('s1001@school.example'), t1: tok('teacher@school.example'), x9: tok('who@school.example') }, { CLIENT_ID, SESSION_SECRET: 'k'.repeat(48) });
env.setupSheets();
env.sheets['學生名單'].data.push(['s1001@school.example', '中五', 1, '陳大文'], ['s1002@school.example', '中五', 2, '李小明']);
env.sheets['設定'].data[1] = ['老師', 'teacher@school.example', '', ''];

let offline = false;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/exec')) {
    if (offline) { res.destroy(); return; }
    let body = ''; req.on('data', c => { body += c; });
    req.on('end', () => { const out = env.doPost({ postData: { contents: body } }).getContent(); res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out); });
    return;
  }
  let u = decodeURIComponent(req.url.split('?')[0]); if (u === '/') u = '/index.html';
  if (u === '/js/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end(`window.TSD_CONFIG = { googleClientId: '${CLIENT_ID}', appsScriptUrl: 'http://localhost:8790/exec' };`); return; }
  const f = path.join(ROOT, u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(8790);

// 假 Google 登入：按鈕按下即以指定權杖登入
const fakeGis = who => `window.google = { accounts: { id: {
  initialize(o) { window.__cb = o.callback; },
  renderButton(el) { const b = document.createElement('button'); b.textContent = '用 Google 帳戶登入（測試）'; b.className = 'fake-gis'; b.onclick = () => window.__cb({ credential: '${who}' }); el.append(b); },
  disableAutoSelect() {}, prompt() {} } } };`;

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], deviceScaleFactor: 1 });
  let who = 's1';
  await ctx.route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: fakeGis(who) }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const wait = ms => p.waitForTimeout(ms);
  await p.goto('http://localhost:8790/');
  await wait(300);
  await p.screenshot({ path: (process.env.SHOTS || '.') + '/a-login.png' });
  await p.click('.fake-gis'); await wait(800);
  console.log('greeting:', (await p.textContent('.comms .speech')).trim(), '|', (await p.textContent('.login-card')).replace(/\s+/g, ' '));
  await p.click('.chip >> text=車神');
  await p.screenshot({ path: (process.env.SHOTS || '.') + '/b-loggedin.png' });
  // 玩 1-1（答錯一次）
  await p.click('.item:has-text("車尾箱")'); await p.click('.item:has-text("1-1")');
  for (let i = 0; i < 5; i++) { const c = await p.$('.panel .pxbtn:has-text("繼續 ▸")'); if (!c) break; await c.click(); }
  await p.click('.bigbtn[data-id="put"]'); // 錯：未郁 top
  for (let k = 0; k < 3; k++) { await p.click('.bigbtn[data-id="top"]'); await p.click('.bigbtn[data-id="put"]'); await wait(1500); }
  await p.click('.explain .pxbtn'); await p.waitForSelector('.result-card'); await wait(2500);
  console.log('關卡紀錄:', JSON.stringify(env.sheets['關卡紀錄'].data.slice(1).map(r => r.slice(1, 9))));
  console.log('錯誤紀錄:', JSON.stringify(env.sheets['錯誤紀錄'].data.slice(1).map(r => r.slice(1, 6))));
  // 離線玩 1-2，之後恢復網絡補傳
  offline = true; await ctx.setOffline(true);
  await p.click('.result-card .pxbtn.primary'); await wait(200);
  for (let i = 0; i < 5; i++) { const c = await p.$('.panel .pxbtn:has-text("繼續 ▸")'); if (!c) break; await c.click(); }
  await p.click('.panel .opt >> text="紅"'); await wait(2000);
  const pend = await p.evaluate(() => JSON.parse(localStorage.getItem('tsd:outbox')).length);
  console.log('離線時待傳送:', pend, '| 錯誤紀錄行數:', env.sheets['錯誤紀錄'].data.length - 1);
  offline = false; await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online'))); await wait(1500);
  console.log('恢復網絡後待傳送:', await p.evaluate(() => JSON.parse(localStorage.getItem('tsd:outbox')).length), '| 錯誤紀錄行數:', env.sheets['錯誤紀錄'].data.length - 1);
  // 老師控制台
  who = 't1';
  const t = await ctx.newPage();
  t.on('pageerror', e => errs.push('teacher: ' + e.message));
  await t.setViewportSize({ width: 1000, height: 800 });
  await t.goto('http://localhost:8790/teacher.html'); await t.waitForTimeout(300);
  await t.click('.fake-gis'); await t.waitForSelector('table.grid', { timeout: 5000 });
  await t.screenshot({ path: (process.env.SHOTS || '.') + '/c-teacher.png' });
  console.log('控制台第一行:', (await t.textContent('table.grid tbody tr')).replace(/\s+/g, ' ').slice(0, 80));
  await t.click('.tab:has-text("最常錯的題目")');
  console.log('最常錯:', (await t.textContent('table.grid.errors tbody')).replace(/\s+/g, ' '));
  await t.screenshot({ path: (process.env.SHOTS || '.') + '/d-errors.png' });
  await t.click('.tab:has-text("解鎖")'); await t.click('button:has-text("為 中五 全班解鎖")'); await t.waitForTimeout(800);
  console.log('設定工作表:', JSON.stringify(env.sheets['設定'].data.slice(1)));
  await t.click('.tab:has-text("全班進度")'); await t.click('button.link >> nth=0'); await t.waitForTimeout(300);
  await t.screenshot({ path: (process.env.SHOTS || '.') + '/e-student.png' });
  // 學生重新開遊戲 → 解鎖
  await p.goto('http://localhost:8790/'); await wait(1500);
  await p.click('.item:has-text("車尾箱")');
  console.log('解鎖後 1-6 可玩:', await p.$eval('.item:has-text("1-6")', e => !e.disabled), '| 首頁考試可玩:', await p.evaluate(() => localStorage.getItem('tsd:unlockServer')));
  // 學生不可以用控制台
  const s2 = await ctx.newPage(); who = 's1';
  await s2.evaluate(() => {}).catch(() => {});
  await s2.goto('http://localhost:8790/teacher.html'); await s2.evaluate(() => localStorage.removeItem('tsd:teacherSession')); await s2.reload(); await s2.waitForTimeout(300);
  await s2.click('.fake-gis'); await s2.waitForTimeout(600);
  console.log('學生開控制台:', (await s2.textContent('.card')).replace(/\s+/g, ' ').slice(0, 90));
  // 不在名單
  who = 'x9';
  const s3 = await (await b.newContext({ ...devices['iPhone 13'] })).newPage();
  await s3.context().route('https://accounts.google.com/gsi/client', r => r.fulfill({ contentType: 'text/javascript', body: fakeGis('x9') }));
  await s3.goto('http://localhost:8790/'); await s3.waitForTimeout(300); await s3.click('.fake-gis'); await s3.waitForTimeout(600);
  console.log('不在名單（自動加入）:', (await s3.textContent('.login-card')).replace(/\s+/g, ' '));
  console.log('學生名單:', JSON.stringify(env.sheets['學生名單'].data.slice(1)));
  console.log('errors', errs);
  await b.close(); srv.close();
})().catch(e => { console.error('FAILED', e.message.split('\n')[0]); srv.close(); process.exit(1); });
