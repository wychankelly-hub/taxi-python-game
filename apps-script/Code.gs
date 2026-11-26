/**
 * 《的士佬日記》成績記錄 — Google Apps Script 網絡應用程式
 *
 * 安裝方法見 docs/設定教學.md。指令碼屬性（專案設定 → 指令碼屬性）：
 *   CLIENT_ID        Google Cloud 的 OAuth 用戶端 ID（…apps.googleusercontent.com）
 *   SESSION_SECRET   一串隨機字（至少 32 個字元），用來簽署登入憑證；第一次執行 setupSheets 會自動產生
 *   ALLOWED_DOMAIN   （可選）只接受這個學校網域的帳戶，例如 school.edu.hk
 *
 * 安全：
 * - 遊戲傳來 Google ID 權杖，這裏向 Google 驗證（aud、iss、email_verified、到期時間），才取得電郵。
 * - 驗證後發出由 SESSION_SECRET 簽署的登入憑證（30 日），之後每次請求都要驗證簽署；不會相信遊戲傳來的電郵。
 * - 學生只可寫入及讀取自己的成績；老師名單（設定工作表）內的帳戶才可讀取全班資料及解鎖。
 * - 每筆紀錄有唯一編號，重複傳送不會重複寫入。
 */

var SHEETS = {
  roster:   { name: '學生名單', header: ['電郵', '班別', '班號', '姓名'] },
  levels:   { name: '關卡紀錄', header: ['時間', '班別', '班號', '姓名', '關卡', '星數', '答錯次數', '用了提示', '用時（秒）', '電郵', '紀錄編號'] },
  errors:   { name: '錯誤紀錄', header: ['時間', '班別', '班號', '關卡', '題目', '選了的錯誤選項', '電郵', '紀錄編號'] },
  exams:    { name: '考試成績', header: ['時間', '班別', '班號', '姓名', '第幾次', '題1 /3', '題2 /4', '題3 /3', '題4 /5', '題5 /5', '總分 /20', '電郵', '紀錄編號'] },
  overview: { name: '總覽', header: ['班別', '班號', '姓名', '完成關數 /24', '總星數 /72', '第一至四章小測 /3', '考試最高分 /20', '最後上線', '電郵'] },
  settings: { name: '設定', header: ['類別', '對象', '值', '備註'] },
};
var SESSION_DAYS = 30;
var MAX_BATCH = 300;
var LEVEL_RE = /^[1-4]-[1-6]$/;

/* ======================= 入口 ======================= */

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try { return json_(handle_(req)); }
  catch (err) { return json_({ ok: false, error: String(err && err.message || err) }); }
}

function doGet() {
  return json_({ ok: true, app: '的士佬日記', note: '請用 POST' });
}

function handle_(req) {
  switch (req && req.action) {
    case 'login': return login_(req.idToken);
    case 'sync': return sync_(auth_(req.session), req.records);
    case 'me': return me_(auth_(req.session));
    case 'teacher.data': return teacherData_(authTeacher_(req.session));
    case 'teacher.unlock': return teacherUnlock_(authTeacher_(req.session), req.target, req.on);
  }
  throw new Error('unknown_action');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ======================= 驗證 ======================= */

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }

/** 向 Google 驗證 ID 權杖，傳回電郵（小寫） */
function verifyIdToken_(idToken) {
  if (!idToken || typeof idToken !== 'string' || idToken.length > 4096) throw new Error('bad_token');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('bad_token');
  var p = JSON.parse(res.getContentText());
  var clientId = prop_('CLIENT_ID');
  if (!clientId || p.aud !== clientId) throw new Error('bad_token');
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') throw new Error('bad_token');
  if (!(p.email_verified === true || p.email_verified === 'true')) throw new Error('bad_token');
  if (!(Number(p.exp) * 1000 > Date.now())) throw new Error('bad_token');
  var domain = prop_('ALLOWED_DOMAIN');
  var email = String(p.email || '').toLowerCase();
  if (domain && email.split('@')[1] !== domain.toLowerCase()) throw new Error('wrong_domain');
  return email;
}

function b64_(bytesOrString) { return Utilities.base64EncodeWebSafe(bytesOrString).replace(/=+$/, ''); }

function sign_(data) {
  var secret = prop_('SESSION_SECRET');
  if (secret.length < 32) throw new Error('server_not_configured');
  return b64_(Utilities.computeHmacSha256Signature(data, secret));
}

function makeSession_(email) {
  var body = b64_(JSON.stringify({ e: email, x: Date.now() + SESSION_DAYS * 86400000 }));
  return body + '.' + sign_(body);
}

/** 驗證登入憑證，傳回 { email, student, teacher } */
function auth_(session) {
  if (!session || typeof session !== 'string' || session.length > 2048) throw new Error('no_session');
  var parts = session.split('.');
  if (parts.length !== 2) throw new Error('bad_session');
  var good = sign_(parts[0]);
  if (!safeEqual_(good, parts[1])) throw new Error('bad_session');
  var payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0] + '==='.slice((parts[0].length + 3) % 4))).getDataAsString());
  if (!(payload.x > Date.now())) throw new Error('session_expired');
  var email = String(payload.e).toLowerCase();
  return { email: email, student: rosterLookup_(email), teacher: isTeacher_(email) };
}

function authTeacher_(session) {
  var u = auth_(session);
  if (!u.teacher) throw new Error('forbidden');
  return u;
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var d = 0;
  for (var i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ======================= 工作表工具 ======================= */

function sheet_(key) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var def = SHEETS[key];
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.header.length).setValues([def.header]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** 讀出全部資料（不含標題列），每列變成物件 */
function rows_(key) {
  var sh = sheet_(key);
  var n = sh.getLastRow() - 1;
  if (n <= 0) return [];
  var h = SHEETS[key].header;
  return sh.getRange(2, 1, n, h.length).getValues().map(function (r) {
    var o = {};
    h.forEach(function (k, i) { o[k] = r[i]; });
    return o;
  });
}

function rosterLookup_(email) {
  var list = rows_('roster');
  for (var i = 0; i < list.length; i++) {
    if (String(list[i]['電郵']).trim().toLowerCase() === email) {
      return { email: email, cls: String(list[i]['班別']), no: list[i]['班號'], name: String(list[i]['姓名']) };
    }
  }
  return null;
}

function settings_() { return rows_('settings'); }

function isTeacher_(email) {
  return settings_().some(function (r) { return r['類別'] === '老師' && String(r['對象']).trim().toLowerCase() === email; });
}

function isUnlocked_(student) {
  if (!student) return false;
  return settings_().some(function (r) {
    if (r['類別'] !== '解鎖' || r['值'] !== '是') return false;
    var t = String(r['對象']).trim();
    return t.toLowerCase() === student.email || t === student.cls;
  });
}

function str_(v, n) { return String(v === undefined || v === null ? '' : v).slice(0, n || 100); }
function int_(v, lo, hi) { v = Math.round(Number(v)); if (!isFinite(v)) v = 0; return Math.max(lo, Math.min(hi, v)); }
function time_(iso) {
  var t = new Date(iso);
  var now = Date.now();
  if (isNaN(t.getTime()) || t.getTime() > now + 300000 || t.getTime() < now - 365 * 86400000) t = new Date(now);
  return t;
}

/* ======================= 動作 ======================= */

function login_(idToken) {
  var email = verifyIdToken_(idToken);
  var student = rosterLookup_(email);
  var teacher = isTeacher_(email);
  if (!student && !teacher) return { ok: true, inRoster: false, email: email };
  return {
    ok: true, inRoster: !!student, teacher: teacher, email: email,
    session: makeSession_(email),
    profile: student ? { cls: student.cls, no: student.no, name: student.name } : null,
    unlocked: isUnlocked_(student),
  };
}

/** 寫入一批紀錄（離線補傳）；傳回已收到的編號（包括之前已寫入的） */
function sync_(user, records) {
  if (!user.student) throw new Error('not_in_roster');
  if (!Array.isArray(records)) throw new Error('bad_request');
  records = records.slice(0, MAX_BATCH);
  var s = user.student;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var seen = {};
    ['levels', 'errors', 'exams'].forEach(function (k) {
      rows_(k).forEach(function (r) { seen[r['紀錄編號']] = true; });
    });
    var add = { levels: [], errors: [], exams: [] };
    var accepted = [];
    var examCount = rows_('exams').filter(function (r) { return String(r['電郵']).toLowerCase() === s.email; }).length;
    records.forEach(function (r) {
      if (!r || typeof r.id !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(r.id)) return;
      if (seen[r.id]) { accepted.push(r.id); return; }
      var t = time_(r.time);
      if (r.type === 'level' && LEVEL_RE.test(r.level)) {
        add.levels.push([t, s.cls, s.no, s.name, r.level, int_(r.stars, 0, 3), int_(r.wrong, 0, 999), r.hint ? '是' : '否', int_(r.seconds, 0, 86400), s.email, r.id]);
      } else if (r.type === 'quiz') {
        add.levels.push([t, s.cls, s.no, s.name, '小測' + int_(r.chapter, 1, 4), int_(r.score, 0, 3), int_(r.total - r.score, 0, 3), '否', int_(r.seconds, 0, 86400), s.email, r.id]);
      } else if (r.type === 'error') {
        add.errors.push([t, s.cls, s.no, str_(r.level, 20), str_(r.question, 40), str_(r.choice, 100), s.email, r.id]);
      } else if (r.type === 'exam') {
        var q = r.byQ || {};
        examCount++;
        add.exams.push([t, s.cls, s.no, s.name, examCount, int_(q.Q1, 0, 3), int_(q.Q2, 0, 4), int_(q.Q3, 0, 3), int_(q.Q4, 0, 5), int_(q.Q5, 0, 5),
          int_(q.Q1, 0, 3) + int_(q.Q2, 0, 4) + int_(q.Q3, 0, 3) + int_(q.Q4, 0, 5) + int_(q.Q5, 0, 5), s.email, r.id]);
      } else {
        return; // 不明的紀錄：不寫入，亦不確認
      }
      seen[r.id] = true;
      accepted.push(r.id);
    });
    Object.keys(add).forEach(function (k) {
      if (!add[k].length) return;
      var sh = sheet_(k);
      sh.getRange(sh.getLastRow() + 1, 1, add[k].length, add[k][0].length).setValues(add[k]);
    });
    return { ok: true, accepted: accepted };
  } finally {
    lock.releaseLock();
  }
}

/** 學生取回自己的成績（換手機時還原進度）— 只會讀到自己的紀錄 */
function me_(user) {
  if (!user.student) throw new Error('not_in_roster');
  var email = user.student.email;
  var stars = {}, quiz = {};
  rows_('levels').forEach(function (r) {
    if (String(r['電郵']).toLowerCase() !== email) return;
    var lv = String(r['關卡']);
    var v = Number(r['星數']) || 0;
    var m = lv.match(/^小測([1-4])$/);
    if (m) quiz[m[1]] = Math.max(quiz[m[1]] || 0, v);
    else if (LEVEL_RE.test(lv)) stars[lv] = Math.max(stars[lv] || 0, v);
  });
  var exams = rows_('exams').filter(function (r) { return String(r['電郵']).toLowerCase() === email; });
  return {
    ok: true, stars: stars, quiz: quiz,
    examAttempts: exams.length,
    examBest: exams.reduce(function (b, r) { return Math.max(b, Number(r['總分 /20']) || 0); }, 0),
    unlocked: isUnlocked_(user.student),
  };
}

/** 老師：全班資料（控制台自行計算進度、最常錯的題目及篩選） */
function teacherData_(user) {
  function plain(list) {
    return list.map(function (r) {
      var o = {};
      Object.keys(r).forEach(function (k) { o[k] = r[k] instanceof Date ? r[k].toISOString() : r[k]; });
      return o;
    });
  }
  return {
    ok: true, teacher: user.email,
    roster: plain(rows_('roster')),
    levels: plain(rows_('levels')),
    errors: plain(rows_('errors')),
    exams: plain(rows_('exams')),
    unlocks: plain(settings_().filter(function (r) { return r['類別'] === '解鎖'; })),
  };
}

/** 老師：解鎖全部關卡及考試模式（target 為班別或學生電郵） */
function teacherUnlock_(user, target, on) {
  target = str_(target, 120).trim();
  if (!target) throw new Error('bad_request');
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet_('settings');
    var list = rows_('settings');
    for (var i = 0; i < list.length; i++) {
      if (list[i]['類別'] === '解鎖' && String(list[i]['對象']).trim().toLowerCase() === target.toLowerCase()) {
        sh.getRange(i + 2, 3, 1, 2).setValues([[on ? '是' : '否', user.email + ' ' + new Date().toISOString()]]);
        return { ok: true };
      }
    }
    sh.getRange(sh.getLastRow() + 1, 1, 1, 4).setValues([['解鎖', target, on ? '是' : '否', user.email + ' ' + new Date().toISOString()]]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ======================= 建立工作表及總覽公式 ======================= */

/** 試算表選單 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('的士佬日記')
    .addItem('建立／更新工作表', 'setupSheets')
    .addItem('更新總覽（學生名單有改動後執行）', 'updateOverview')
    .addToUi();
}

/** 建立五個工作表及設定工作表（已存在的不會清除資料） */
function setupSheets() {
  // 未有 SESSION_SECRET 就自動產生一個（隨機，只存在指令碼屬性內）
  var props = PropertiesService.getScriptProperties();
  if ((props.getProperty('SESSION_SECRET') || '').length < 32) props.setProperty('SESSION_SECRET', Utilities.getUuid() + Utilities.getUuid());
  Object.keys(SHEETS).forEach(function (k) { sheet_(k); });
  var st = sheet_('settings');
  if (st.getLastRow() < 2) {
    st.getRange(2, 1, 2, 4).setValues([
      ['老師', 'teacher@school.example', '', '把這行改為你的學校 Google 電郵；可以加多行'],
      ['解鎖', '中六', '否', '把「否」改為「是」即可為全班解鎖（亦可在老師控制台按鈕設定）'],
    ]);
  }
  updateOverview();
}

/** 總覽：每位學生一行，用公式由其他工作表自動計算 */
function updateOverview() {
  var ov = sheet_('overview');
  var roster = rows_('roster');
  var n = Math.max(ov.getLastRow() - 1, 0);
  if (n) ov.getRange(2, 1, n, SHEETS.overview.header.length).clearContent();
  if (!roster.length) return;
  var L = "'關卡紀錄'", E = "'錯誤紀錄'", X = "'考試成績'";
  var rows = roster.map(function (r, i) {
    var row = i + 2, R = i + 2, em = '$I' + row;
    var lvList = 'FILTER(' + L + '!$E:$E,' + L + '!$J:$J=' + em + ',REGEXMATCH(' + L + '!$E:$E&"","^[1-4]-[1-6]$"))';
    return [
      "='學生名單'!B" + R, "='學生名單'!C" + R, "='學生名單'!D" + R,
      '=IF(' + em + '="","",IFERROR(COUNTA(UNIQUE(' + lvList + ')),0))',
      '=IF(' + em + '="","",IFERROR(SUM(MAP(UNIQUE(' + lvList + '),LAMBDA(l,MAXIFS(' + L + '!$F:$F,' + L + '!$J:$J,' + em + ',' + L + '!$E:$E,l)))),0))',
      '=IF(' + em + '="","",JOIN("、",MAP({1,2,3,4},LAMBDA(c,IF(COUNTIFS(' + L + '!$J:$J,' + em + ',' + L + '!$E:$E,"小測"&c)=0,"—",MAXIFS(' + L + '!$F:$F,' + L + '!$J:$J,' + em + ',' + L + '!$E:$E,"小測"&c))))))',
      '=IF(' + em + '="","",IF(COUNTIF(' + X + '!$L:$L,' + em + ')=0,"—",MAXIFS(' + X + '!$K:$K,' + X + '!$L:$L,' + em + ')))',
      '=IF(' + em + '="","",IF(MAX(MAXIFS(' + L + '!$A:$A,' + L + '!$J:$J,' + em + '),MAXIFS(' + E + '!$A:$A,' + E + '!$G:$G,' + em + '),MAXIFS(' + X + '!$A:$A,' + X + '!$L:$L,' + em + '))=0,"—",TEXT(MAX(MAXIFS(' + L + '!$A:$A,' + L + '!$J:$J,' + em + '),MAXIFS(' + E + '!$A:$A,' + E + '!$G:$G,' + em + '),MAXIFS(' + X + '!$A:$A,' + X + '!$L:$L,' + em + ')),"yyyy-mm-dd")))',
      "=LOWER(TRIM('學生名單'!A" + R + '))',
    ];
  });
  ov.getRange(2, 1, rows.length, rows[0].length).setFormulas(rows);
}
