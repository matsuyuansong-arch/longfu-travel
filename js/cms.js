/*
 * 龍福旅行社官網 文字編輯（前端）
 *
 * 一般訪客：載入時向後台讀「這一頁被改過的文字」，換上去；後台沒設定或連不上就維持網頁原文。
 * 管理者：網址加 ?admin 或點頁尾「管理登入」→ 帳號密碼登入 → 頁面下方出現工具列。
 *   編輯者：開啟編輯、直接在頁面上改字、儲存、還原原文、改自己的密碼
 *   管理員：另外可以管理帳號（新增／移除／改身分／重設密碼）、看操作紀錄
 *
 * 可編輯的段落：HTML 上有 data-edit="e數字" 的元素（由 _tools/tag_editable.py 標記）。
 * 頁面代號：<body data-page="...">。
 */
(function () {
  'use strict';

  // 直接用瀏覽器開本機檔案（file://）時，資料夾連結不會自動開 index.html，這裡補上。正式網站不受影響
  if (location.protocol === 'file:') {
    Array.prototype.forEach.call(document.querySelectorAll('a[href]'), function (a) {
      var h = a.getAttribute('href');
      if (/^(?![a-z]+:|#|\/)(.*\/)?(#.*)?$/i.test(h)) {
        var i = h.indexOf('#');
        a.setAttribute('href', i < 0 ? h + 'index.html' : h.slice(0, i) + 'index.html' + h.slice(i));
      } else if (h === './' || h === '../' || /^(\.\.\/)+$/.test(h)) {
        a.setAttribute('href', h + 'index.html');
      }
    });
  }

  // ★ 後台網址：GAS 網頁應用程式的 /exec 網址。空白＝不啟用（網站照常顯示原文）
  var API = 'https://script.google.com/macros/s/AKfycbys4KmE0_TTtXnF3RZBcm4WskkuDUQ5ZFhd_a81u-5JwX0xoDBbUvh33y-fto9OGag3/exec';

  var page = document.body.getAttribute('data-page');
  if (!page) return;

  var els = {}, orig = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-edit]'), function (el) {
    var k = el.getAttribute('data-edit');
    els[k] = el;
    orig[k] = el.innerHTML;
  });

  var LS_KEY = 'cms:page:' + page;
  var state = { v: 0, t: {} };
  var editing = false, dirty = {}, lastFocus = null;

  // ───────── 顯示前淨化：只留少數行內標籤，其餘一律轉純文字 ─────────
  var ALLOWED = { B: 1, STRONG: 1, EM: 1, I: 1, SMALL: 1, BR: 1, TIME: 1, SPAN: 1, A: 1 };
  var DROP = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, SVG: 1, MATH: 1, TEMPLATE: 1 };
  var SAFE_HREF = /^(https?:|tel:|mailto:|#|\/|\.\.?\/|[a-z0-9-]+\/)/i;

  function sanitize(html) {
    var doc = new DOMParser().parseFromString('<div>' + String(html || '') + '</div>', 'text/html');
    var root = doc.body.firstChild;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (n) {
        if (n.nodeType === 3) return;
        if (n.nodeType !== 1 || DROP[n.tagName]) { node.removeChild(n); return; }
        walk(n);
        if (!ALLOWED[n.tagName]) {
          while (n.firstChild) node.insertBefore(n.firstChild, n);
          node.removeChild(n);
          return;
        }
        var href = n.tagName === 'A' ? (n.getAttribute('href') || '').trim() : '';
        Array.prototype.slice.call(n.attributes).forEach(function (a) { n.removeAttribute(a.name); });
        if (href && SAFE_HREF.test(href) && !/^javascript:/i.test(href)) n.setAttribute('href', href);
      });
    })(root);
    return root.innerHTML;
  }

  function apply(t) {
    Object.keys(els).forEach(function (k) {
      if (editing && dirty[k]) return;          // 編輯中未存的段落不覆蓋
      var want = t && t[k] != null ? sanitize(t[k]) : orig[k];
      if (els[k].innerHTML !== want) els[k].innerHTML = want;
    });
  }

  // ───────── 讀取（一般訪客） ─────────
  try {
    var cached = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (cached && cached.t) { state = cached; apply(state.t); }
  } catch (e) { /* 無痕模式等情況讀不到快取，略過 */ }

  function load() {
    if (!API) return Promise.resolve();
    return fetch(API + '?a=page&p=' + encodeURIComponent(page), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) return;
        state = res.data;
        apply(state.t);
        try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 略過 */ }
      })
      .catch(function () { /* 後台連不上就維持原文 */ });
  }
  load();

  // ───────── 管理者入口 ─────────
  var TOK = 'cms:tok', USR = 'cms:user';
  function ss(k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); }
    catch (e) { return null; }
  }
  var token = ss(TOK), user = null;
  try { user = JSON.parse(ss(USR) || 'null'); } catch (e) { user = null; }

  var legal = document.querySelector('.site-footer .legal');
  if (legal) {
    var entry = document.createElement('a');
    entry.href = '#';
    entry.className = 'cms-entry';
    entry.textContent = '管理登入';
    entry.addEventListener('click', function (e) { e.preventDefault(); openAdmin(); });
    legal.appendChild(document.createTextNode(' '));
    legal.appendChild(entry);
  }

  if (/[?&]admin\b/.test(location.search) || (token && user)) openAdmin();

  function call(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!API) return Promise.reject(new Error('後台網址尚未設定（js/cms.js 的 API）'));
    return fetch(API, { method: 'POST', body: JSON.stringify({ fn: fn, args: args }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) return res.data;
        var msg = String(res.error || '發生錯誤');
        if (msg.indexOf('AUTH:') === 0) { signOut(true); msg = msg.slice(5); }
        throw new Error(msg.replace(/^CONFLICT:/, ''));
      });
  }

  var cssLoaded = false;
  function loadCss() {
    if (cssLoaded) return;
    cssLoaded = true;
    var s = document.querySelector('script[src*="js/cms.js"]');
    var l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = s ? s.src.replace(/js\/cms\.js.*$/, 'css/cms.css?v=1') : 'css/cms.css';
    document.head.appendChild(l);
  }

  function openAdmin() {
    loadCss();
    if (token && user) { showBar(); call('whoami', token).then(function (u) { user = u; ss(USR, JSON.stringify(u)); showBar(); }).catch(function () {}); }
    else showLogin();
  }

  // ───────── 小工具 ─────────
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { el.addEventListener(ev, attrs.on[ev]); });
      else if (k === 'text') el.textContent = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  }

  function modal(title, body, onClose) {
    var wrap = h('div', { 'class': 'cms-modal', role: 'dialog', 'aria-modal': 'true' });
    var box = h('div', { 'class': 'cms-box' }, [
      h('div', { 'class': 'cms-box-head' }, [
        h('h2', { text: title }),
        h('button', { type: 'button', 'class': 'cms-x', 'aria-label': '關閉', on: { click: close } }, ['×'])
      ]),
      body
    ]);
    wrap.appendChild(box);
    wrap.addEventListener('click', function (e) { if (e.target === wrap) close(); });
    document.body.appendChild(wrap);
    function close() { wrap.remove(); if (onClose) onClose(); }
    return { close: close, el: wrap };
  }

  function toast(msg, bad) {
    var t = h('div', { 'class': 'cms-toast' + (bad ? ' bad' : ''), role: 'status', text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 6000 : 2600);
  }

  function field(label, input) { return h('label', { 'class': 'cms-field' }, [h('span', { text: label }), input]); }

  function busy(btn, p) {
    var txt = btn.textContent;
    btn.disabled = true; btn.textContent = '處理中…';
    return p.then(function (x) { btn.disabled = false; btn.textContent = txt; return x; },
                  function (e) { btn.disabled = false; btn.textContent = txt; throw e; });
  }

  var ROLE = { admin: '管理員', editor: '編輯者' };

  // ───────── 登入 ─────────
  function showLogin() {
    var u = h('input', { type: 'text', autocomplete: 'username', autocapitalize: 'off', required: 'required' });
    var p = h('input', { type: 'password', autocomplete: 'current-password', required: 'required' });
    var err = h('p', { 'class': 'cms-err' });
    var btn = h('button', { type: 'submit', 'class': 'cms-btn primary', text: '登入' });
    var form = h('form', { 'class': 'cms-form' }, [field('帳號', u), field('密碼', p), err, btn]);
    var m = modal('網站管理登入', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      busy(btn, call('login', u.value, p.value)).then(function (res) {
        token = res.token; user = res.user;
        ss(TOK, token); ss(USR, JSON.stringify(user));
        m.close();
        showBar();
        toast('歡迎，' + user.name + '（' + ROLE[user.role] + '）');
      }).catch(function (e2) { err.textContent = e2.message; });
    });
    setTimeout(function () { u.focus(); }, 50);
  }

  function signOut(silent) {
    if (token && !silent) call('logout', token).catch(function () {});
    token = null; user = null;
    ss(TOK, null); ss(USR, null);
    setEditing(false, true);
    var bar = document.getElementById('cms-bar');
    if (bar) bar.remove();
    document.body.classList.remove('cms-on');
    if (silent) { toast('登入已失效，請重新登入', true); showLogin(); }
  }

  // ───────── 工具列 ─────────
  var countEl;
  function showBar() {
    var old = document.getElementById('cms-bar');
    if (old) old.remove();
    countEl = h('span', { 'class': 'cms-count' });
    var editBtn = h('button', { type: 'button', 'class': 'cms-btn primary', id: 'cms-edit', on: { click: function () { setEditing(!editing); } } }, ['開始編輯']);
    var saveBtn = h('button', { type: 'button', 'class': 'cms-btn gold', id: 'cms-save', disabled: 'disabled', on: { click: save } }, ['儲存', countEl]);
    var revertBtn = h('button', { type: 'button', 'class': 'cms-btn', id: 'cms-revert', disabled: 'disabled', title: '把目前選取的段落換回網頁原文', on: { click: revert } }, ['還原原文']);
    var more = [
      h('button', { type: 'button', 'class': 'cms-btn ghost', on: { click: showPassword } }, ['改密碼'])
    ];
    if (user.role === 'admin') {
      more.unshift(h('button', { type: 'button', 'class': 'cms-btn ghost', on: { click: showLog } }, ['操作紀錄']));
      more.unshift(h('button', { type: 'button', 'class': 'cms-btn ghost', on: { click: showUsers } }, ['帳號管理']));
    }
    more.push(h('button', { type: 'button', 'class': 'cms-btn ghost', on: { click: function () { if (!confirmLeave()) return; signOut(false); toast('已登出'); } } }, ['登出']));
    var bar = h('div', { id: 'cms-bar', role: 'toolbar', 'aria-label': '網站編輯工具列' }, [
      h('span', { 'class': 'cms-who' }, [h('b', { text: user.name }), ' ' + ROLE[user.role]]),
      editBtn, saveBtn, revertBtn,
      h('span', { 'class': 'cms-sep' }),
      h('span', { 'class': 'cms-more' }, more)
    ]);
    document.body.appendChild(bar);
    document.body.classList.add('cms-on');
    refreshBar();
  }

  function refreshBar() {
    var n = Object.keys(dirty).length;
    var save = document.getElementById('cms-save');
    var edit = document.getElementById('cms-edit');
    var rev = document.getElementById('cms-revert');
    if (!save) return;
    countEl.textContent = n ? '（' + n + '）' : '';
    save.disabled = !n;
    rev.disabled = !editing || !lastFocus;
    edit.textContent = editing ? '結束編輯' : '開始編輯';
  }

  // ───────── 編輯 ─────────
  var BLOCK_ENTER = { H1: 1, H2: 1, H3: 1, H4: 1, LI: 1, DT: 1, DD: 1, TD: 1, TH: 1, SPAN: 1 };

  function onInput(e) {
    var k = e.currentTarget.getAttribute('data-edit');
    dirty[k] = true;
    e.currentTarget.classList.add('cms-dirty');
    refreshBar();
  }
  function onFocus(e) { lastFocus = e.currentTarget; refreshBar(); }
  function onKey(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!BLOCK_ENTER[e.currentTarget.tagName]) document.execCommand('insertLineBreak');
  }
  function onPaste(e) {
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  }
  function onClickLink(e) {
    if (!editing || !e.target.closest) return;
    var box = e.target.closest('[contenteditable="true"]');
    if (!box) return;
    // 編輯中點到段落裡的連結不跳頁；同時記住目前段落（視窗沒焦點時 focus 事件可能不觸發）
    if (e.target.closest('a')) e.preventDefault();
    if (lastFocus !== box) { lastFocus = box; refreshBar(); }
  }

  function setEditing(on, force) {
    if (!on && !force && Object.keys(dirty).length && !confirm('還有 ' + Object.keys(dirty).length + ' 段沒有儲存，結束編輯會放棄這些修改。確定？')) return;
    editing = !!on;
    Object.keys(els).forEach(function (k) {
      var el = els[k];
      if (editing) {
        el.setAttribute('contenteditable', 'true');
        el.classList.add('cms-editable');
        el.addEventListener('input', onInput);
        el.addEventListener('focus', onFocus);
        el.addEventListener('keydown', onKey);
        el.addEventListener('paste', onPaste);
      } else {
        el.removeAttribute('contenteditable');
        el.classList.remove('cms-editable', 'cms-dirty');
        el.removeEventListener('input', onInput);
        el.removeEventListener('focus', onFocus);
        el.removeEventListener('keydown', onKey);
        el.removeEventListener('paste', onPaste);
      }
    });
    if (!editing) { dirty = {}; lastFocus = null; apply(state.t); }
    document.body.classList.toggle('cms-editing', editing);
    refreshBar();
  }
  document.addEventListener('click', onClickLink, true);

  function revert() {
    if (!lastFocus) return;
    var k = lastFocus.getAttribute('data-edit');
    lastFocus.innerHTML = orig[k];
    dirty[k] = true;
    lastFocus.classList.add('cms-dirty');
    refreshBar();
    toast('這段已換回網頁原文，按「儲存」才會生效');
  }

  function save() {
    var keys = Object.keys(dirty);
    if (!keys.length) return;
    var edits = {};
    keys.forEach(function (k) {
      var html = sanitize(els[k].innerHTML).replace(/(<br>\s*)+$/, '').trim();
      edits[k] = html === sanitize(orig[k]).trim() ? null : html;
    });
    var btn = document.getElementById('cms-save');
    busy(btn, call('saveEdits', token, page, edits, state.v)).then(function (res) {
      state = res;
      try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 略過 */ }
      dirty = {};
      apply(state.t);
      Object.keys(els).forEach(function (k) { els[k].classList.remove('cms-dirty'); });
      refreshBar();
      toast('已儲存 ' + keys.length + ' 段，訪客重新整理後就會看到');
    }).catch(function (e) { toast(e.message, true); });
  }

  function confirmLeave() {
    return !Object.keys(dirty).length || confirm('還有沒儲存的修改，確定離開？');
  }
  window.addEventListener('beforeunload', function (e) {
    if (Object.keys(dirty).length) { e.preventDefault(); e.returnValue = ''; }
  });

  // ───────── 改密碼 ─────────
  function showPassword() {
    var o = h('input', { type: 'password', autocomplete: 'current-password' });
    var n1 = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8' });
    var n2 = h('input', { type: 'password', autocomplete: 'new-password', minlength: '8' });
    var err = h('p', { 'class': 'cms-err' });
    var btn = h('button', { type: 'submit', 'class': 'cms-btn primary', text: '更新密碼' });
    var form = h('form', { 'class': 'cms-form' }, [field('原密碼', o), field('新密碼（至少 8 字）', n1), field('再輸入一次', n2), err, btn]);
    var m = modal('修改我的密碼', form);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (n1.value !== n2.value) { err.textContent = '兩次輸入的新密碼不一樣'; return; }
      busy(btn, call('changePassword', token, o.value, n1.value)).then(function () { m.close(); toast('密碼已更新'); })
        .catch(function (e2) { err.textContent = e2.message; });
    });
  }

  // ───────── 帳號管理（管理員） ─────────
  function fmt(t) {
    if (!t) return '—';
    var d = new Date(t);
    return (d.getFullYear() - 1911) + '/' + (d.getMonth() + 1) + '/' + d.getDate() + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  }

  function showUsers() {
    var list = h('div', { 'class': 'cms-users', text: '讀取中…' });
    var nu = h('input', { type: 'text', autocapitalize: 'off', placeholder: '英文小寫、數字' });
    var nn = h('input', { type: 'text', placeholder: '例：王小明' });
    var nr = h('select', {}, [h('option', { value: 'editor', text: '編輯者：只能改文字' }), h('option', { value: 'admin', text: '管理員：可管帳號' })]);
    var np = h('input', { type: 'text', autocomplete: 'off', placeholder: '至少 8 字' });
    var err = h('p', { 'class': 'cms-err' });
    var add = h('button', { type: 'submit', 'class': 'cms-btn primary', text: '新增帳號' });
    var form = h('form', { 'class': 'cms-form cms-add' }, [
      h('h3', { text: '新增帳號' }), field('帳號', nu), field('姓名', nn), field('身分', nr), field('初始密碼', np), err, add,
      h('p', { 'class': 'cms-note', text: '初始密碼請當面或電話告訴對方，請對方登入後自己改密碼。' })
    ]);
    modal('帳號管理', h('div', {}, [list, form]));

    function render() {
      call('listAdmins', token).then(function (rows) {
        list.textContent = '';
        var tb = h('table', { 'class': 'cms-table' }, [
          h('thead', {}, [h('tr', {}, ['帳號', '姓名', '身分', '最後登入', ''].map(function (t) { return h('th', { text: t }); }))])
        ]);
        var body = h('tbody');
        rows.forEach(function (r) {
          var self = r.u === user.u;
          var role = h('select', { 'aria-label': r.u + ' 的身分' }, [
            h('option', { value: 'editor', text: '編輯者' }), h('option', { value: 'admin', text: '管理員' })
          ]);
          role.value = r.role;
          if (self) role.disabled = true;
          role.addEventListener('change', function () {
            call('setRole', token, r.u, role.value).then(function () { toast(r.name + ' 改為' + ROLE[role.value]); render(); })
              .catch(function (e) { toast(e.message, true); role.value = r.role; });
          });
          var acts = h('td', { 'class': 'cms-acts' });
          acts.appendChild(h('button', { type: 'button', 'class': 'cms-btn small', on: { click: function () {
            var pw = prompt('替 ' + r.name + '（' + r.u + '）設定新密碼，至少 8 字：');
            if (!pw) return;
            call('resetPassword', token, r.u, pw).then(function () { toast('已重設 ' + r.name + ' 的密碼'); }).catch(function (e) { toast(e.message, true); });
          } } }, ['重設密碼']));
          if (!self) acts.appendChild(h('button', { type: 'button', 'class': 'cms-btn small danger', on: { click: function () {
            if (!confirm('確定移除 ' + r.name + '（' + r.u + '）？移除後對方立刻無法登入。')) return;
            call('removeAdmin', token, r.u).then(function () { toast('已移除 ' + r.name); render(); }).catch(function (e) { toast(e.message, true); });
          } } }, ['移除']));
          body.appendChild(h('tr', {}, [
            h('td', { text: r.u + (self ? '（我）' : '') }), h('td', { text: r.name }), h('td', {}, [role]), h('td', { text: fmt(r.lastLogin) }), acts
          ]));
        });
        tb.appendChild(body);
        list.appendChild(h('div', { 'class': 'cms-scroll' }, [tb]));
      }).catch(function (e) { list.textContent = e.message; });
    }
    render();

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.textContent = '';
      busy(add, call('addAdmin', token, { u: nu.value, name: nn.value, role: nr.value, password: np.value })).then(function () {
        toast('已新增 ' + nn.value);
        nu.value = nn.value = np.value = '';
        nr.value = 'editor';
        render();
      }).catch(function (e2) { err.textContent = e2.message; });
    });
  }

  // ───────── 操作紀錄（管理員） ─────────
  function plain(html) {
    var d = document.createElement('div');
    d.innerHTML = sanitize(html);
    return d.textContent;
  }

  function showLog() {
    var box = h('div', { 'class': 'cms-log', text: '讀取中…' });
    modal('操作紀錄（最近 150 筆）', box);
    call('getLog', token).then(function (rows) {
      box.textContent = '';
      if (!rows.length) { box.textContent = '還沒有紀錄'; return; }
      var tb = h('table', { 'class': 'cms-table' }, [
        h('thead', {}, [h('tr', {}, ['時間', '人員', '動作', '頁面／段落', '修改前 → 修改後'].map(function (t) { return h('th', { text: t }); }))])
      ]);
      var body = h('tbody');
      rows.forEach(function (r) {
        var diff = r.before || r.after ? h('td', { 'class': 'cms-diff' }, [
          h('del', { text: plain(r.before) }), h('br'), h('ins', { text: plain(r.after) })
        ]) : h('td');
        body.appendChild(h('tr', {}, [
          h('td', { text: fmt(r.at) }), h('td', { text: (r.name || '') + (r.u ? '（' + r.u + '）' : '') }),
          h('td', { text: r.action }), h('td', { text: [r.page, r.key].filter(Boolean).join(' ／ ') }), diff
        ]));
      });
      tb.appendChild(body);
      box.appendChild(h('div', { 'class': 'cms-scroll' }, [tb]));
    }).catch(function (e) { box.textContent = e.message; });
  }
})();
