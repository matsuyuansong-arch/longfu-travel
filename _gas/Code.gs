/**
 * 龍福旅行社官網 文字編輯後台（GAS）
 *
 * 部署：網頁應用程式，以「擁有者」身分執行、任何人（免登入）可存取。
 * 官網（GitHub Pages）以 fetch 呼叫：
 *   GET  ?a=page&p=<頁面代號>   公開讀取某頁被改過的文字
 *   GET  ?a=all                 公開讀取全部頁面（給 _tools/bake.py 用）
 *   POST {"fn":"login","args":[...]}   其餘動作，寫入類一律先過 auth_()
 *
 * 身分：管理員（admin）可管帳號、看操作紀錄；編輯者（editor）只能改文字與自己的密碼。
 * 帳號存 Script Properties 的 ADMINS（密碼 SHA-256＋個別 salt），登入 token 存 CacheService。
 * 文字存一份試算表：store 工作表放 JSON，log 工作表放操作紀錄。
 * 帳號與登入機制沿用 ~/longfu-islandgames/gas/Code.gs。
 *
 * 第一次使用：在 Apps Script 編輯器執行 bootstrapOwner()，執行紀錄會印出 owner 的密碼。
 */

var SS_NAME = '龍福旅行社官網_文字編輯資料庫';
var PROP_SS = 'SPREADSHEET_ID';
var PROP_ADMINS = 'ADMINS';
var CHUNK = 40000;
var CACHE_TTL = 300;
var TOKEN_TTL = 21600;
var MAX_HTML = 5000;
var ROLES = { admin: '管理員', editor: '編輯者' };

// ───────── 入口 ─────────

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.a === 'page') return json_({ ok: true, data: getPage_(p.p) });
    if (p.a === 'all') return json_({ ok: true, data: getAll_() });
    return json_({ ok: true, data: { service: 'longfu-travel-cms' } });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

var API = {
  login: login, logout: logout, whoami: whoami, changePassword: changePassword,
  listAdmins: listAdmins, addAdmin: addAdmin, removeAdmin: removeAdmin,
  resetPassword: resetPassword, setRole: setRole, getLog: getLog, saveEdits: saveEdits
};

function doPost(e) {
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var fn = API.hasOwnProperty(req.fn) ? API[req.fn] : null;
    if (!fn) throw new Error('未知的動作');
    return json_({ ok: true, data: fn.apply(null, Array.isArray(req.args) ? req.args : []) });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ───────── 公開讀取 ─────────

function pageId_(p) {
  p = String(p == null ? '' : p).trim();
  if (!/^[a-z0-9][a-z0-9\/-]{0,60}$/.test(p)) throw new Error('頁面代號不正確');
  return p;
}

function getPage_(p) {
  p = pageId_(p);
  var c = CacheService.getScriptCache();
  var hit = c.get('page:' + p);
  if (hit) return JSON.parse(hit);
  var pg = pages_().pages[p] || { v: 0, t: {} };
  var out = { v: pg.v || 0, t: {} };
  Object.keys(pg.t || {}).forEach(function (k) { out.t[k] = pg.t[k].h; });
  try { c.put('page:' + p, JSON.stringify(out), CACHE_TTL); } catch (e) { /* 快取失敗不影響正確性 */ }
  return out;
}

function getAll_() {
  var all = pages_().pages, out = {};
  Object.keys(all).forEach(function (p) {
    out[p] = {};
    Object.keys(all[p].t || {}).forEach(function (k) { out[p][k] = all[p].t[k].h; });
  });
  return out;
}

// ───────── 儲存層 ─────────

function ssOpen_(create) {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(PROP_SS);
  if (id) return SpreadsheetApp.openById(id);
  if (!create) return null;
  var ss = SpreadsheetApp.create(SS_NAME);
  ss.getSheets()[0].setName('store');
  ss.insertSheet('log').appendRow(['時間', '帳號', '姓名', '動作', '頁面', '段落', '修改前', '修改後']);
  props.setProperty(PROP_SS, ss.getId());
  return ss;
}

function storeSheet_(create) {
  var ss = ssOpen_(create);
  return ss ? ss.getSheetByName('store') : null;
}

function findRow_(sh, key) {
  var n = sh.getLastRow();
  if (!n) return 0;
  var keys = sh.getRange(1, 1, n, 1).getValues();
  for (var i = 0; i < n; i++) if (keys[i][0] === key) return i + 1;
  return 0;
}

function storeGet_(key) {
  var sh = storeSheet_(false);
  if (!sh) return null;
  var r = findRow_(sh, key);
  if (!r) return null;
  var row = sh.getRange(r, 1, 1, sh.getLastColumn()).getValues()[0];
  // 每段前面加 ~，避免開頭是 = 或數字時被試算表轉型
  return row.slice(2).map(function (c) { return String(c).slice(1); }).join('');
}

function storePut_(key, str) {
  var sh = storeSheet_(true);
  var row = [key, Date.now()];
  for (var i = 0; i < str.length; i += CHUNK) row.push('~' + str.substr(i, CHUNK));
  if (row.length === 2) row.push('~');
  if (sh.getMaxColumns() < row.length) sh.insertColumnsAfter(sh.getMaxColumns(), row.length - sh.getMaxColumns());
  var r = findRow_(sh, key) || sh.getLastRow() + 1;
  var width = Math.max(sh.getLastColumn(), row.length);
  if (r <= sh.getLastRow()) sh.getRange(r, 1, 1, width).clearContent();
  sh.getRange(r, 1, 1, row.length).setValues([row]);
}

function pages_() {
  var s = storeGet_('pages');
  return s ? JSON.parse(s) : { pages: {} };
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function log_(user, action, page, key, before, after) {
  try {
    ssOpen_(true).getSheetByName('log').appendRow([
      new Date(), user ? user.u : '', user ? user.name : '', action,
      page || '', key || '', cut_(before, 300), cut_(after, 300)
    ]);
  } catch (e) { /* 記錄失敗不擋主流程 */ }
}

function cut_(v, n) {
  // 開頭加 ' 避免 = + - @ 被試算表當公式
  var s = String(v == null ? '' : v).slice(0, n);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

// ───────── 文字編輯 ─────────

/**
 * 只留 b strong em i small br time span a 這幾種標籤；a 只留安全的 href。
 * 真正的防線在前端 cms.js 顯示前的白名單淨化，這裡是第二道。
 */
function clean_(html) {
  var s = String(html == null ? '' : html);
  if (s.length > MAX_HTML) throw new Error('單一段落最多 ' + MAX_HTML + ' 字');
  s = s.replace(/<(script|style|iframe|object|embed|svg|math|template)[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  return s.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, function (m, tag, attrs) {
    tag = tag.toLowerCase();
    var close = m.charAt(1) === '/';
    if (['b', 'strong', 'em', 'i', 'small', 'br', 'time', 'span'].indexOf(tag) >= 0) return close ? '</' + tag + '>' : '<' + tag + '>';
    if (tag === 'a') {
      if (close) return '</a>';
      var h = /href\s*=\s*"([^"]*)"/i.exec(attrs) || /href\s*=\s*'([^']*)'/i.exec(attrs);
      var href = h ? h[1].trim() : '';
      if (/^(https?:|tel:|mailto:|#|\/|\.\.?\/|[a-z0-9-]+\/)/i.test(href) && !/^javascript:/i.test(href)) {
        return '<a href="' + href.replace(/"/g, '&quot;') + '">';
      }
      return '<a>';
    }
    return '';
  });
}

/**
 * edits = { 段落代號: 新的 HTML 或 null（null＝還原成網頁原文） }
 * baseV = 編輯者載入時的頁面版本。若某段在那之後被別人改過，整批退回，避免蓋掉別人的修改。
 */
function saveEdits(token, page, edits, baseV) {
  var user = auth_(token);
  page = pageId_(page);
  if (!edits || typeof edits !== 'object') throw new Error('沒有要儲存的內容');
  var keys = Object.keys(edits);
  if (!keys.length) throw new Error('沒有要儲存的內容');
  if (keys.length > 200) throw new Error('一次最多儲存 200 段');
  keys.forEach(function (k) { if (!/^e\d{1,4}$/.test(k)) throw new Error('段落代號不正確：' + k); });

  return withLock_(function () {
    var all = pages_();
    var pg = all.pages[page] || (all.pages[page] = { v: 0, t: {} });
    var stale = keys.filter(function (k) { return pg.t[k] && pg.t[k].v > (+baseV || 0); });
    if (stale.length) {
      throw new Error('CONFLICT:有 ' + stale.length + ' 段在你開啟頁面後被別人改過（' +
        stale.map(function (k) { return pg.t[k].by; }).join('、') + '）。請先複製你的修改，重新整理後再改。');
    }
    pg.v = (pg.v || 0) + 1;
    keys.forEach(function (k) {
      var before = pg.t[k] ? pg.t[k].h : '（網頁原文）';
      if (edits[k] === null) {
        delete pg.t[k];
        log_(user, '還原原文', page, k, before, '（網頁原文）');
      } else {
        var h = clean_(edits[k]);
        pg.t[k] = { h: h, v: pg.v, at: Date.now(), by: user.name };
        log_(user, '修改文字', page, k, before, h);
      }
    });
    storePut_('pages', JSON.stringify(all));
    CacheService.getScriptCache().remove('page:' + page);
    var out = { v: pg.v, t: {} };
    Object.keys(pg.t).forEach(function (k) { out.t[k] = pg.t[k].h; });
    return out;
  });
}

// ───────── 帳號與登入 ─────────

function admins_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty(PROP_ADMINS) || '[]');
}

function saveAdmins_(list) {
  PropertiesService.getScriptProperties().setProperty(PROP_ADMINS, JSON.stringify(list));
}

function hash_(salt, pw) {
  var b = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  return b.map(function (x) { return ('0' + (x & 255).toString(16)).slice(-2); }).join('');
}

function normUser_(u) { return String(u || '').trim().toLowerCase(); }

function checkNewAccount_(u, name, pw) {
  if (!/^[a-z0-9_.-]{3,30}$/.test(u)) throw new Error('帳號限 3–30 字，只能用英文小寫、數字、底線、點、減號');
  if (!String(name || '').trim()) throw new Error('請填姓名');
  checkPassword_(pw);
}

function checkPassword_(pw) {
  if (String(pw || '').length < 8) throw new Error('密碼至少 8 個字元');
}

function role_(r) { return r === 'admin' ? 'admin' : 'editor'; }

function makeAccount_(u, name, role, pw) {
  var salt = Utilities.getUuid();
  return { u: u, name: String(name).trim().slice(0, 30), role: role_(role), salt: salt, hash: hash_(salt, pw), createdAt: Date.now(), lastLogin: 0 };
}

function isOwner_() {
  try {
    var a = Session.getActiveUser().getEmail();
    return !!a && a === Session.getEffectiveUser().getEmail();
  } catch (e) { return false; }
}

function auth_(token, needAdmin) {
  if (!token || typeof token !== 'string') throw new Error('AUTH:請先登入');
  var c = CacheService.getScriptCache();
  var s = c.get('tok:' + token);
  if (!s) throw new Error('AUTH:登入已逾時，請重新登入');
  var u = JSON.parse(s).u;
  var acc = admins_().filter(function (a) { return a.u === u; })[0];
  if (!acc) { c.remove('tok:' + token); throw new Error('AUTH:帳號已被移除'); }
  c.put('tok:' + token, s, TOKEN_TTL);
  var user = { u: acc.u, name: acc.name, role: acc.role };
  if (needAdmin && user.role !== 'admin') throw new Error('這個動作需要管理員權限');
  return user;
}

function publicUser_(a) { return { u: a.u, name: a.name, role: a.role }; }

/**
 * 第一次使用與救援：在 Apps Script 編輯器選這個函式按「執行」。
 * 建立或重設帳號 owner（管理員），新密碼印在執行紀錄。網頁呼叫不到（不在 API 清單）。
 */
function bootstrapOwner() {
  if (!isOwner_()) throw new Error('只有擁有者能執行');
  return withLock_(function () {
    var pw = Utilities.getUuid().replace(/-/g, '').slice(0, 12);
    var list = admins_().filter(function (a) { return a.u !== 'owner'; });
    var acc = makeAccount_('owner', '擁有者', 'admin', pw);
    list.push(acc);
    saveAdmins_(list);
    storeSheet_(true);
    log_(acc, '重設 owner 帳號');
    Logger.log('帳號 owner　密碼 ' + pw + '　登入後請立刻改密碼，並建立自己的管理員帳號');
    return 'owner / ' + pw;
  });
}

function login(u, pw) {
  u = normUser_(u);
  var c = CacheService.getScriptCache();
  var failKey = 'fail:' + u;
  var fails = +(c.get(failKey) || 0);
  if (fails >= 5) throw new Error('嘗試次數過多，請 10 分鐘後再試');
  var acc = admins_().filter(function (a) { return a.u === u; })[0];
  if (!acc || hash_(acc.salt, String(pw || '')) !== acc.hash) {
    c.put(failKey, String(fails + 1), 600);
    log_({ u: u, name: '' }, '登入失敗');
    throw new Error('帳號或密碼錯誤');
  }
  c.remove(failKey);
  var token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  c.put('tok:' + token, JSON.stringify({ u: u }), TOKEN_TTL);
  withLock_(function () {
    var l = admins_();
    l.forEach(function (a) { if (a.u === u) a.lastLogin = Date.now(); });
    saveAdmins_(l);
  });
  log_(acc, '登入');
  return { token: token, user: publicUser_(acc) };
}

function logout(token) {
  if (token && typeof token === 'string') CacheService.getScriptCache().remove('tok:' + token);
  return { ok: true };
}

function whoami(token) {
  return auth_(token);
}

function changePassword(token, oldPw, newPw) {
  var user = auth_(token);
  checkPassword_(newPw);
  return withLock_(function () {
    var list = admins_();
    var acc = list.filter(function (a) { return a.u === user.u; })[0];
    if (hash_(acc.salt, String(oldPw || '')) !== acc.hash) throw new Error('原密碼不正確');
    acc.salt = Utilities.getUuid();
    acc.hash = hash_(acc.salt, newPw);
    saveAdmins_(list);
    log_(user, '修改自己的密碼');
    return { ok: true };
  });
}

function listAdmins(token) {
  auth_(token, true);
  return admins_().map(function (a) { return { u: a.u, name: a.name, role: a.role, createdAt: a.createdAt, lastLogin: a.lastLogin }; });
}

function addAdmin(token, acc) {
  var user = auth_(token, true);
  acc = acc || {};
  var u = normUser_(acc.u);
  checkNewAccount_(u, acc.name, acc.password);
  return withLock_(function () {
    var list = admins_();
    if (list.some(function (a) { return a.u === u; })) throw new Error('帳號已存在');
    if (list.length >= 30) throw new Error('帳號數量已達上限（30）');
    var a = makeAccount_(u, acc.name, acc.role, acc.password);
    list.push(a);
    saveAdmins_(list);
    log_(user, '新增帳號', '', u, '', a.name + '（' + ROLES[a.role] + '）');
    return { ok: true };
  });
}

function removeAdmin(token, u) {
  var user = auth_(token, true);
  u = normUser_(u);
  if (u === user.u) throw new Error('不能移除自己的帳號');
  return withLock_(function () {
    var list = admins_();
    var rest = list.filter(function (a) { return a.u !== u; });
    if (rest.length === list.length) throw new Error('找不到這個帳號');
    if (!rest.some(function (a) { return a.role === 'admin'; })) throw new Error('至少要保留一位管理員');
    saveAdmins_(rest);
    log_(user, '移除帳號', '', u);
    return { ok: true };
  });
}

function setRole(token, u, role) {
  var user = auth_(token, true);
  u = normUser_(u);
  role = role_(role);
  if (u === user.u) throw new Error('不能改自己的身分');
  return withLock_(function () {
    var list = admins_();
    var acc = list.filter(function (a) { return a.u === u; })[0];
    if (!acc) throw new Error('找不到這個帳號');
    var before = acc.role;
    acc.role = role;
    if (!list.some(function (a) { return a.role === 'admin'; })) throw new Error('至少要保留一位管理員');
    saveAdmins_(list);
    log_(user, '變更身分', '', u, ROLES[before], ROLES[role]);
    return { ok: true };
  });
}

function resetPassword(token, u, pw) {
  var user = auth_(token, true);
  u = normUser_(u);
  checkPassword_(pw);
  return withLock_(function () {
    var list = admins_();
    var acc = list.filter(function (a) { return a.u === u; })[0];
    if (!acc) throw new Error('找不到這個帳號');
    acc.salt = Utilities.getUuid();
    acc.hash = hash_(acc.salt, pw);
    saveAdmins_(list);
    log_(user, '重設密碼', '', u);
    return { ok: true };
  });
}

function getLog(token) {
  auth_(token, true);
  var ss = ssOpen_(false);
  if (!ss) return [];
  var sh = ss.getSheetByName('log');
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var k = Math.min(n, 150);
  return sh.getRange(sh.getLastRow() - k + 1, 1, k, 8).getValues().reverse().map(function (r) {
    return { at: r[0] instanceof Date ? r[0].getTime() : 0, u: r[1], name: r[2], action: r[3], page: r[4], key: r[5], before: String(r[6]), after: String(r[7]) };
  });
}
