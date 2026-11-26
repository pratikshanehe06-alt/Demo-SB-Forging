/* CoreOT R8 start-up: sign-in check, load everything from the server, then start the app.
 *
 * The app (js/app.js) was written to keep its data in the browser. Before it runs we place the
 * server's copy where it looks for it, and js/bridge.js then keeps the two in step.
 */
(function () {
  'use strict';
  const TOKEN = 'coreot-token', KEY = 'coreot-r8n', REGK = 'coreot-r8n-register';
  const msg = t => { const m = document.getElementById('r8-boot-msg'); if (m) m.textContent = t; };
  let token = null;
  try { token = localStorage.getItem(TOKEN); } catch (e) { /* private window */ }
  if (!token) { location.replace('/login'); return; }

  const clientId = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)) ;
  window.__R8 = { token, clientId };

  function load(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src));
      document.body.appendChild(s);
    });
  }

  async function start() {
    let r;
    try {
      r = await fetch('/api/bootstrap', { headers: { Authorization: 'Bearer ' + token } });
    } catch (e) {
      msg('Cannot reach the plant server. Retrying…');
      setTimeout(start, 3000);
      return;
    }
    if (r.status === 401) { try { localStorage.removeItem(TOKEN); } catch (e) {} location.replace('/login'); return; }
    if (!r.ok) { msg('The server answered ' + r.status + '. Retrying…'); setTimeout(start, 4000); return; }
    const B = await r.json();
    window.__R8_BOOT = B;
    window.__R8_CATALOG = B.catalog;
    // The signed-in person, used wherever the prototype showed its fixed "Plant Admin"
    const TITLES = { cxo: 'CXO', mgr: 'Manager', sup: 'Supervisor', opr: 'Operator' };
    window.R8ME = () => B.user.name;
    window.R8ROLE = () => B.user.title || TITLES[B.user.role] || B.user.role;
    window.R8INI = () => B.user.name.split(/[\s.]+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
    window.R8MAIL = () => B.user.username + ' · ' + window.R8ROLE();

    // Personal settings plus the plant-wide limits, tags and units, where the app reads them
    const prefs = Object.assign({}, B.prefs || {}, {
      klim: B.state.limits || {}, ktag: B.state.tags || {}, ku: B.state.units || {},
      plant: 'Nashik Plant',
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
      localStorage.setItem(REGK, JSON.stringify((B.records.register || []).map(x => { const y = Object.assign({}, x); delete y.cid; return y; })));
    } catch (e) { msg('This browser blocks local storage; settings will not be kept.'); }

    await load('js/app.js');
    await load('js/bridge.js');
  }
  start().catch(e => { console.error(e); msg(String(e.message || e)); });
})();
