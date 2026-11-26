/* CoreOT R8 bridge: connects the app (js/app.js) to the FastAPI server.
 *
 * The app keeps its data in plain objects (UI.wo, ALM, UI.chk, ...). This file
 *   1. fills those objects from the server before the first render,
 *   2. every 1.5 s compares them with what the server last confirmed and sends the changes,
 *   3. applies live pushes (readings, alarms, other people's changes) from the WebSocket,
 *   4. stores files on the server instead of in the browser.
 * Nothing in app.js needs to change; if a request is refused the server's copy is reloaded.
 */
(function () {
  'use strict';
  const R8 = window.__R8, BOOT = window.__R8_BOOT, ME = BOOT.user;
  const KEY = 'coreot-r8n', REGK = 'coreot-r8n-register', TOKEN = 'coreot-token';
  const SYNC_MS = 1500;
  let LI = BOOT.liveIndex;               // reading id -> path of its value in DATA
  const FILES = new Map((BOOT.files || []).map(f => [f.id, f]));

  /* ------------------------------------------------------------ server calls */
  const netEl = document.createElement('div');
  netEl.className = 'r8-net'; netEl.setAttribute('role', 'status');
  netEl.innerHTML = '<i></i><span>Plant server not reachable. Changes will be sent when it is back.</span>';
  document.body.appendChild(netEl);
  let online = true;
  function net(ok) { if (ok === online) return; online = ok; netEl.classList.toggle('show', !ok); }

  async function api(method, path, body, raw) {
    const init = { method, headers: { Authorization: 'Bearer ' + R8.token, 'X-Client-Id': R8.clientId } };
    if (body instanceof FormData) init.body = body;
    else if (body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body); }
    let r;
    try { r = await fetch(path, init); } catch (e) { net(false); e.offline = true; throw e; }
    net(true);
    if (r.status === 401) { signOut(false); throw new Error('Signed out'); }
    if (!r.ok) {
      let d = ''; try { d = (await r.json()).detail; } catch (e) { /* not JSON */ }
      const err = new Error(typeof d === 'string' && d ? d : 'Server error ' + r.status); err.status = r.status; throw err;
    }
    return raw ? r : r.json();
  }
  const say = t => { try { toast(t); } catch (e) { console.warn(t); } };

  /* ------------------------------------------------------------ fill the app from the server */
  const seen = new WeakMap();     // object -> JSON last confirmed by the server
  const sending = new WeakSet();  // objects with a request in flight
  const almState = new Map();     // alarm id -> state last confirmed
  let regSnap = new Map();        // registration id -> JSON
  const shared = {};              // shared setting -> JSON
  const woJSON = w => JSON.stringify([w.t, w.pri, w.st, w.who, w.due, w.spares, w.type]);
  const noCid = o => { const x = Object.assign({}, o); delete x.cid; return x; };
  const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  const SHARED = {
    limits: [() => S.klim, v => { S.klim = v; }],
    tags: [() => S.ktag, v => { S.ktag = v; }],
    units: [() => S.ku, v => { S.ku = v; }],
    permits: [() => UI.ptwSign, v => { UI.ptwSign = v; }],
    nameplates: [() => UI.np, v => { UI.np = v; }],
    identity: [() => UI.ident, v => { UI.ident = v; }],
    decisions: [() => UI.done, v => { UI.done = v; }],
    rca: [() => UI.rca, v => { UI.rca = v; }],
    schedules: [() => UI.sched, v => { UI.sched = v; }],
    documents: [docsOut, v => { UI.udocs = (v || []).map(docIn); }],
  };
  function docIn(d) { return Object.assign({}, d, { blob: d.fileId ? { __file: d.fileId } : null }); }
  function docsOut() {
    return (UI.udocs || []).filter(d => d.fileId).map(d => { const x = Object.assign({}, d); delete x.blob; return x; });
  }

  function apply(B) {
    UI.wo = B.workOrders; UI.wo._x = 1;   // _x: the app's own generator is not needed
    UI.wo.forEach(w => seen.set(w, woJSON(w)));

    ALM = B.alarms;
    almState.clear(); ALM.forEach(a => almState.set(a.id, a.st));

    UI.trail.length = 0;
    B.audit.forEach(e => { UI.trail.push(e); seen.set(e, '1'); });

    UI.chk = B.records.checklist; UI.chk.forEach(c => seen.set(c, '1'));

    Object.keys(UI.entries).forEach(k => { UI.entries[k] = []; });
    (B.records.entry || []).forEach(e => { const m = e.m; delete e.m; (UI.entries[m] = UI.entries[m] || []).push(e); seen.set(e, JSON.stringify(e)); });

    UI.logbook = (B.records.logbook || []).map(r => { r.row.__cid = r.cid; seen.set(r.row, JSON.stringify(r.row)); return r.row; });

    const regs = (B.records.register || []).map(noCid);
    lsSet(REGK, JSON.stringify(regs));
    regSnap = new Map(regs.map(r => [r.id, JSON.stringify(r)]));

    for (const [k, [, set]] of Object.entries(SHARED)) { set(B.state[k]); shared[k] = JSON.stringify(SHARED[k][0]() ?? null); }
    (B.files || []).forEach(f => FILES.set(f.id, f));
    CACHE = {}; Object.keys(CX).forEach(k => delete CX[k]);
  }

  async function resync(why) {
    try {
      const B = await api('GET', '/api/bootstrap');
      Object.assign(DATA, B.catalog); LI = B.liveIndex;
      apply(B);
      if (why) say(why);
      rerender();
    } catch (e) { console.warn('resync failed', e); }
  }

  function rerender() {
    try {
      renderRail();
      const busy = UI.panel || document.getElementById('modal').classList.contains('show') ||
        (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
      if (!busy) { const v = document.getElementById('view'), st = v.scrollTop; renderView(); v.scrollTop = st; }
    } catch (e) { console.warn(e); }
  }

  /* ------------------------------------------------------------ local storage: settings and registrations */
  const lsSetRaw = Storage.prototype.setItem;
  const lsSet = (k, v) => { try { lsSetRaw.call(localStorage, k, v); } catch (e) { /* full or blocked */ } };
  let prefsTimer = null;
  Storage.prototype.setItem = function (k, v) {
    lsSetRaw.call(this, k, v);
    if (this !== localStorage) return;
    if (k === KEY) { clearTimeout(prefsTimer); prefsTimer = setTimeout(() => sendPrefs(v), 800); }
  };
  async function sendPrefs(v) {
    try { const o = JSON.parse(v); await api('PUT', '/api/prefs', o); } catch (e) { if (!e.offline) console.warn(e); }
  }

  /* ------------------------------------------------------------ files on the server */
  const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  window.fput = fput = async function (id, v) {
    const blob = await (await fetch(v.data)).blob();
    const fd = new FormData();
    fd.append('file', new File([blob], v.name || 'file', { type: v.type || blob.type }));
    fd.append('id', id);
    fd.append('meta', JSON.stringify({ size: v.size }));
    const out = await api('POST', '/api/files', fd);
    FILES.set(out.id, out);
  };
  window.fget = fget = async function (id) {
    try {
      const blob = await (await api('GET', '/api/files/' + encodeURIComponent(id), undefined, true)).blob();
      const f = FILES.get(id) || {};
      return { name: f.name || id, type: blob.type || f.type, size: blob.size, data: await toDataURL(blob) };
    } catch (e) { return undefined; }
  };
  window.fdel = fdel = async function (id) {
    try { await api('DELETE', '/api/files/' + encodeURIComponent(id)); FILES.delete(id); } catch (e) { /* already gone */ }
  };
  const dlFile0 = dlFile;
  window.dlFile = dlFile = async function (name, data) {
    if (data && data.__file) {
      try { data = await (await api('GET', '/api/files/' + encodeURIComponent(data.__file), undefined, true)).blob(); }
      catch (e) { say('Could not get the file: ' + e.message); return; }
    }
    return dlFile0(name, data);
  };

  /* ------------------------------------------------------------ "+ Add" forms are stored */
  // The Lite edition only showed "fields captured". With a server we keep them: the app's own
  // storing version writes the record (files go through fput above), the sync loop sends it.
  if (typeof __saveAddStore === 'function') {
    const saveAddLite = saveAdd;
    saveAdd = async function () {
      const c = ADDCTX;
      if (!c || c.type === 'doc' || c.type === 'docE') return saveAddLite();
      const fm = FORMS[c.type];
      const req = fm.f.filter(x => x.req && !/file/.test(x.t)).find(x => { const el = document.getElementById('af-' + x.k); return el && !el.value.trim(); });
      if (req) { say('Fill ' + req.l.toLowerCase()); return; }
      await __saveAddStore();
      trail('Added (form)', fm.t.replace(/^Add |^Upload /, ''));
      sync();
    };
    coRecs = __coRecsStore;
    const regView0 = registerView;
    registerView = function () {
      let html = regView0().replace(/Uploaded files are kept for this session in the demo\.[^<]*/, 'Everything here is saved on the plant server.');
      const regs = (typeof regAll === 'function' ? regAll() : []).filter(r => r.type !== 'doc');
      if (!regs.length) return html;
      const rows = regs.map(r => {
        const fm = FORMS[r.type] || { t: r.type };
        const name = r.f.name || r.f.title || r.f.tag || r.f.id || fm.t;
        const link = r.f.asset || r.f.parent || r.f.machine || '-';
        return `<tr><td><b>${esc(name)}</b></td><td>${esc(fm.t.replace(/^Add |^Upload /, ''))}</td><td>${esc(mod(r.mod) ? mod(r.mod).s : r.mod || '-')}</td><td>${esc(link)}</td><td>${esc((r.at || '').slice(0, 10))}</td><td style="white-space:nowrap"><button class="btn sm ghost" onclick="regView('${r.id}')">View</button> <button class="btn sm ghost" onclick="regDel('${r.id}')">Remove</button></td></tr>`;
      }).join('');
      return html.replace(/<tbody>/, '<tbody>' + rows);
    };
  }
  const toast0 = toast;
  toast = function (t) {
    return toast0(String(t).replace(' (kept for this session in the demo)', '').replace(': fields captured (demo, not stored)', ' saved').replace('Report scheduled (demo)', 'Report scheduled'));
  };

  /* ------------------------------------------------------------ send changes */
  async function step(obj, fn) {   // one request per object at a time
    if (sending.has(obj)) return;
    sending.add(obj);
    try { await fn(); } finally { sending.delete(obj); }
  }
  function refused(e, what) {
    if (e.offline) return false;                // keep it; it is sent again when the server is back
    say((what ? what + ': ' : '') + e.message);
    resync();
    return true;
  }

  function syncWorkOrders(jobs) {
    if (!Array.isArray(UI.wo)) return;
    if (!UI.wo._x) UI.wo._x = 1;
    for (const w of UI.wo) {
      const was = seen.get(w);
      if (was === undefined) {
        jobs.push(step(w, async () => {
          try {
            const out = await api('POST', '/api/work-orders', w);
            if (out.id !== w.id) {           // the server chose another number
              const old = w.id; w.id = out.id;
              UI.trail.forEach(e => { if (e.obj && e.obj.startsWith(old + ' ')) e.obj = out.id + e.obj.slice(old.length); });
            }
            w.by = out.by; seen.set(w, woJSON(w));
          } catch (e) { if (refused(e, 'Work order not saved')) UI.wo.splice(UI.wo.indexOf(w), 1); }
        }));
      } else if (was !== woJSON(w)) {
        const now = woJSON(w);
        jobs.push(step(w, async () => {
          try { await api('PATCH', '/api/work-orders/' + encodeURIComponent(w.id), { t: w.t, pri: w.pri, st: w.st, who: w.who, due: w.due, spares: w.spares, type: w.type }); seen.set(w, now); }
          catch (e) { refused(e, 'Work order not changed'); }
        }));
      }
    }
  }

  function syncAlarms(jobs) {
    if (!Array.isArray(ALM)) return;
    const ids = ALM.filter(a => a.st === 'Acknowledged' && almState.get(a.id) === 'Active').map(a => a.id);
    if (!ids.length) return;
    ids.forEach(id => almState.set(id, 'Acknowledged'));
    jobs.push((async () => {
      try {
        const out = await api('POST', '/api/alarms/ack', { ids });
        out.forEach(x => { const a = ALM.find(y => y.id === x.id); if (a) Object.assign(a, x); almState.set(x.id, x.st); });
      } catch (e) {
        ids.forEach(id => almState.set(id, 'Active'));
        if (!refused(e, 'Not acknowledged')) return;
      }
    })());
  }

  function syncTrail(jobs) {
    for (const e of UI.trail) {
      if (seen.has(e)) continue;
      seen.set(e, '1');
      jobs.push((async () => {
        try { Object.assign(e, await api('POST', '/api/audit', { action: e.action, obj: e.obj, mod: e.mod })); }
        catch (err) { if (err.offline) seen.delete(e); }
      })());
    }
  }

  function syncRecords(jobs) {
    const put = (kind, obj, body) => {
      if (!obj.cid && !obj.__cid) { if (Array.isArray(obj)) obj.__cid = newId('l'); else obj.cid = newId(kind[0]); }
      if (!seen.has(obj) && obj.by === 'Plant Admin') obj.by = ME.name;
      const now = JSON.stringify(obj);
      if (seen.get(obj) === now) return;
      jobs.push(step(obj, async () => {
        try { await api('PUT', `/api/records/${kind}/${encodeURIComponent(obj.cid || obj.__cid)}`, body()); seen.set(obj, now); }
        catch (e) { refused(e, 'Not saved'); }
      }));
    };
    (UI.chk || []).forEach(c => put('checklist', c, () => noCid(c)));
    for (const [m, list] of Object.entries(UI.entries || {})) (list || []).forEach(e => put('entry', e, () => Object.assign(noCid(e), { m })));
    (UI.logbook || []).forEach(row => put('logbook', row, () => ({ row: Array.from(row) })));

    // registrations live in localStorage under REGK
    let regs = [];
    try { regs = JSON.parse(localStorage.getItem(REGK) || '[]'); } catch (e) { regs = []; }
    const ids = new Set();
    for (const r of regs) {
      ids.add(r.id);
      const now = JSON.stringify(r);
      if (regSnap.get(r.id) === now) continue;
      regSnap.set(r.id, now);
      jobs.push((async () => {
        try { await api('PUT', '/api/records/register/' + encodeURIComponent(r.id), r); }
        catch (e) { if (e.offline) regSnap.delete(r.id); else refused(e, 'Not saved'); }
      })());
    }
    for (const id of [...regSnap.keys()]) {
      if (ids.has(id)) continue;
      const was = regSnap.get(id); regSnap.delete(id);
      jobs.push((async () => {
        try { await api('DELETE', '/api/records/register/' + encodeURIComponent(id)); }
        catch (e) { if (e.offline) regSnap.set(id, was); else if (e.status !== 404) refused(e, 'Not removed'); }
      })());
    }
  }

  function syncShared(jobs) {
    // new uploaded documents: send the file first, then the list
    for (const d of UI.udocs || []) {
      if (d.fileId || !(d.blob instanceof Blob)) continue;
      jobs.push(step(d, async () => {
        const fd = new FormData();
        fd.append('file', d.blob, d.fname || 'document');
        fd.append('meta', JSON.stringify({ title: d.t, asset: d.asset }));
        try { const out = await api('POST', '/api/files', fd); FILES.set(out.id, out); d.fileId = out.id; }
        catch (e) { refused(e, 'Upload failed'); }
      }));
    }
    for (const [k, [get]] of Object.entries(SHARED)) {
      const now = JSON.stringify(get() ?? null);
      if (shared[k] === now) continue;
      const was = shared[k]; shared[k] = now;
      jobs.push((async () => {
        try {
          await api('PUT', '/api/state/' + k, JSON.parse(now) ?? (k === 'schedules' || k === 'documents' ? [] : {}));
        } catch (e) { if (e.offline) shared[k] = was; else refused(e, 'Not saved'); }
      })());
    }
  }

  let syncing = false;
  async function sync() {
    if (syncing) return;
    syncing = true;
    try {
      const jobs = [];
      syncWorkOrders(jobs); syncAlarms(jobs); syncTrail(jobs); syncRecords(jobs); syncShared(jobs);
      await Promise.allSettled(jobs);
    } catch (e) { console.warn('sync', e); } finally { syncing = false; }
  }
  setInterval(sync, SYNC_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync(); });
  window.__R8_SYNC = sync;   // tests call this to send changes at once

  /* ------------------------------------------------------------ live updates */
  function setPath(path, v) {
    let n = DATA;
    for (let i = 0; i < path.length - 1; i++) { n = n[path[i]]; if (n == null) return; }
    n[path[path.length - 1]] = v;
  }
  let lastLive = 0;
  const handlers = {
    readings(m) {
      for (const [id, v] of m.r) { const p = LI[id]; if (p) setPath(p, v); }
      CACHE = {}; Object.keys(CX).forEach(k => delete CX[k]);
      lastLive = Date.now();
    },
    alarm(m) {
      const x = m.alarm;
      const a = ALM.find(y => y.id === x.id);
      if (a) Object.assign(a, x); else {
        ALM.push(x);
        if (x.st === 'Active' && x.src === 'live') say(`${x.sev} alarm: ${x.a}, ${x.msg}`);
      }
      almState.set(x.id, x.st);
      try { renderRail(); } catch (e) { /* not drawn yet */ }
    },
    wo(m) {
      const x = m.wo, w = UI.wo.find(y => y.id === x.id);
      if (w) { Object.assign(w, x); seen.set(w, woJSON(w)); } else { UI.wo.unshift(x); seen.set(x, woJSON(x)); }
      rerender();
    },
    'wo-deleted'(m) { const i = UI.wo.findIndex(y => y.id === m.id); if (i >= 0) UI.wo.splice(i, 1); rerender(); },
    record(m) {
      const r = m.record;
      if (m.kind === 'register') {
        let regs = []; try { regs = JSON.parse(localStorage.getItem(REGK) || '[]'); } catch (e) { /* */ }
        const x = noCid(r), i = regs.findIndex(y => y.id === x.id);
        if (i >= 0) regs[i] = x; else regs.unshift(x);
        lsSet(REGK, JSON.stringify(regs)); regSnap.set(x.id, JSON.stringify(x));
      } else if (m.kind === 'checklist') {
        if (!UI.chk.some(c => c.cid === r.cid)) { UI.chk.unshift(r); seen.set(r, JSON.stringify(r)); }
      } else if (m.kind === 'entry') {
        const mm = r.m; delete r.m; const L = UI.entries[mm] = UI.entries[mm] || [];
        if (!L.some(e => e.cid === r.cid)) { L.unshift(r); seen.set(r, JSON.stringify(r)); }
      } else if (m.kind === 'logbook') {
        UI.logbook = UI.logbook || [];
        const i = UI.logbook.findIndex(x => x.__cid === r.cid);
        const row = r.row; row.__cid = r.cid;
        if (i >= 0) UI.logbook[i] = row; else UI.logbook.unshift(row);
        seen.set(row, JSON.stringify(row));
      }
      rerender();
    },
    'record-deleted'(m) {
      if (m.kind === 'register') {
        let regs = []; try { regs = JSON.parse(localStorage.getItem(REGK) || '[]'); } catch (e) { /* */ }
        lsSet(REGK, JSON.stringify(regs.filter(x => x.id !== m.cid))); regSnap.delete(m.cid);
        rerender();
      }
    },
    state(m) {
      const s = SHARED[m.key]; if (!s) return;
      s[1](m.value); shared[m.key] = JSON.stringify(s[0]() ?? null);
      if (['limits', 'tags', 'units'].includes(m.key)) { try { lsSet(KEY, JSON.stringify((({ page, ...k }) => k)(S))); } catch (e) { /* */ } }
      rerender();
    },
    audit(m) { if (!UI.trail.some(e => e.id === m.event.id)) { UI.trail.unshift(m.event); seen.set(m.event, '1'); } },
  };

  let ws = null, wsDown = false, pingTimer = null;
  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => {
      net(true);
      if (wsDown) { wsDown = false; resync(); }
      clearInterval(pingTimer); pingTimer = setInterval(() => { try { ws.send('ping'); } catch (e) { /* closed */ } }, 25000);
    };
    ws.onmessage = ev => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.origin && m.origin === R8.clientId) return;   // our own change, already shown
      const h = handlers[m.type]; if (h) { try { h(m); } catch (e) { console.warn('live', m.type, e); } }
    };
    ws.onclose = ev => {
      clearInterval(pingTimer);
      if (ev.code === 4401) { signOut(false); return; }
      wsDown = true; net(false);
      setTimeout(connect, 3000);
    };
  }

  /* ------------------------------------------------------------ sign out */
  let leaving = false;
  async function signOut(tellServer) {
    if (leaving) return; leaving = true;
    if (tellServer) { await sync(); try { await api('POST', '/api/auth/logout'); } catch (e) { /* offline */ } }
    try { localStorage.removeItem(TOKEN); } catch (e) { /* */ }
    location.replace('/login');
  }
  const out = document.getElementById('out');
  new MutationObserver(() => { if (out.classList.contains('show')) signOut(true); }).observe(out, { attributes: true, attributeFilter: ['class'] });

  /* ------------------------------------------------------------ start */
  apply(BOOT);
  S.plant = 'Nashik Plant';
  S.sub = S.sub || {};
  S.sub.dash = ME.role;     // the dashboard opens in the view for the person's role
  render();
  connect();
  const bootEl = document.getElementById('r8-boot'); if (bootEl) bootEl.classList.add('gone');
  window.__R8_STATUS = () => ({ online, live: lastLive, user: ME.username });
})();
