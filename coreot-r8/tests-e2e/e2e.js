const { chromium } = require('playwright');
/* End-to-end check in a real browser.
 *   cd backend && COREOT_DATA_DIR=/tmp/coreot-e2e COREOT_EXCURSION_EVERY=20 ../.venv/bin/uvicorn app.main:app --port 8000
 *   cd tests-e2e && npm i playwright@1 && npx playwright install chromium && node e2e.js
 * BASE and PASSWORD can be set in the environment. Use a fresh data folder: it adds test records. */
const BASE = process.env.BASE || 'http://localhost:8000';
const PASSWORD = process.env.PASSWORD || 'CoreOT@2026';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = []; const ok = (name, cond, extra='') => { out.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
async function login(b, user) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await ctx.newPage(); p.errs = [];
  p.on('pageerror', e => p.errs.push('PAGEERR ' + e.message));
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()); });
  await p.goto(BASE + '/'); await p.waitForURL('**/login');
  await p.fill('#u', user); await p.fill('#p', PASSWORD); await p.click('#b');
  await p.waitForFunction(() => document.getElementById('r8-boot')?.classList.contains('gone'), null, { timeout: 20000 });
  return p;
}
const apiGet = (p, path) => p.evaluate(async path => (await fetch(path, { headers: { Authorization: 'Bearer ' + window.__R8.token } })).json(), path);
const syncNow = p => p.evaluate(() => window.__R8_SYNC());
(async () => {
  const b = await chromium.launch();
  const p = await login(b, 'admin');
  ok('admin signed in, name shown', (await p.textContent('.hdr .nm')) === 'Plant Admin');

  // live readings move
  const snap = () => p.evaluate(() => Object.values(window.__R8_BOOT.liveIndex).map(path => path.reduce((n, k) => n[k], DATA)));
  const v1 = await snap(); await sleep(4500); const v2 = await snap();
  const changed = v1.filter((v, i) => v !== v2[i]).length;
  ok('live readings update over WebSocket', changed > 20, `${changed} of ${v1.length} readings changed in 4.5 s`);

  // acknowledge an alarm by clicking
  await p.evaluate(() => go({ mod: 'apm', tab: 'alarms', page: null, apmCat: 'apm' }));
  await sleep(400);
  const btn = p.locator('button[onclick^="ack("]').first();
  const ackId = +(await btn.getAttribute('onclick')).match(/\d+/)[0];
  await btn.click(); await syncNow(p); await sleep(300);
  let alarms = await apiGet(p, '/api/alarms');
  const acked = alarms.find(a => a.id === ackId);
  ok('alarm acknowledged on the server', acked && acked.st === 'Acknowledged' && acked.by === 'Plant Admin', JSON.stringify(acked && [acked.id, acked.st, acked.by]));
  await p.screenshot({ path: 'alarms.png' });

  // create a work order through its dialog
  await p.evaluate(() => openWO('apm:apm:0'));
  await p.fill('#wo-t', 'E2E: check tank level transmitter');
  await p.click('#modal button[onclick^="saveWO"]');
  await syncNow(p); await sleep(300);
  let wos = await apiGet(p, '/api/work-orders');
  const wo = wos.find(w => w.t === 'E2E: check tank level transmitter');
  ok('work order created on the server', !!wo, wo && wo.id + ' ' + wo.st);
  await p.evaluate(id => woMove(id, 1), wo.id); await syncNow(p); await sleep(200);
  wos = await apiGet(p, '/api/work-orders');
  ok('work order status change saved', wos.find(w => w.id === wo.id).st === 'In progress');

  // change a limit
  await p.evaluate(() => setLim('apm:apm:1|Pressure', 'hi', '11'));
  await syncNow(p); await sleep(200);
  const st = await apiGet(p, '/api/state');
  ok('limit change saved for the plant', st.limits['apm:apm:1|Pressure'] && st.limits['apm:apm:1|Pressure'].hi === '11');

  // "+ Add asset" form with a photo
  await p.evaluate(() => openAdd('asset', { mod: 'apm' }));
  await p.fill('#af-name', 'E2E booster pump 3'); await p.fill('#af-tag', 'FS-BP-03');
  await p.setInputFiles('#af-photo', 'photo.png');
  await p.click('#modal form.af button[type=submit], #modal form.af button:not([type=button]):not([onclick])');
  await sleep(800); await syncNow(p); await sleep(300);
  const regs = await apiGet(p, '/api/records/register');
  const reg = regs.find(r => r.f && r.f.name === 'E2E booster pump 3');
  ok('asset form stored on the server', !!reg, reg && reg.id);
  const files = await apiGet(p, '/api/files');
  ok('asset photo stored on the server', reg && files.some(f => f.id === reg.files[0].id && f.name === 'photo.png'));

  // upload a document
  await p.evaluate(() => openAdd('docE', { mod: 'apm', asset: 'Main Fire Pump' }));
  const fields = await p.evaluate(() => [...document.querySelectorAll('#modal [id^=af-]')].map(e => e.id));
  if (fields.includes('af-title')) await p.fill('#af-title', 'E2E pump manual'); else await p.fill('#af-name', 'E2E pump manual');
  await p.setInputFiles('#af-file', 'manual.pdf');
  await p.click('#modal form.af button[type=submit], #modal form.af button:not([type=button]):not([onclick])');
  await sleep(300); await syncNow(p); await sleep(300); await syncNow(p); await sleep(300);
  const st2 = await apiGet(p, '/api/state');
  const doc = (st2.documents || []).find(d => d.t.includes('E2E pump manual'));
  ok('document uploaded and listed', !!(doc && doc.fileId), JSON.stringify(fields));

  // data entry
  const ek = await p.evaluate(() => { const m = Object.keys(ENTRY).find(k => k !== 'dash' && ENTRY[k].length); openEntry(m, ENTRY[m][0][0]); return m; });
  await p.click('#modal button[onclick^="saveEntry"]');
  await syncNow(p); await sleep(300);
  const ents = await apiGet(p, '/api/records/entry');
  ok('data entry stored', ents.length >= 1, ek + ' ' + JSON.stringify(ents[0]).slice(0, 120));

  // audit trail with real user
  await syncNow(p); await sleep(300);
  const aud = await apiGet(p, '/api/audit?limit=50');
  ok('audit trail has the actions', ['Acknowledged alarm', 'Created work order', 'Changed limit', 'Uploaded document'].every(a => aud.some(e => e.action === a && e.user === 'Plant Admin')), aud.slice(0, 8).map(e => e.action).join(', '));

  // reload: everything comes back from the server
  await p.reload(); await p.waitForFunction(() => document.getElementById('r8-boot')?.classList.contains('gone'));
  const after = await p.evaluate(({ ackId, woId }) => ({
    wo: (UI.wo.find(w => w.id === woId) || {}).st, alarm: (ALM.find(a => a.id === ackId) || {}).st,
    lim: (S.klim['apm:apm:1|Pressure'] || {}).hi, docs: UI.udocs.filter(d => d.fileId).length, regs: regAll().length,
  }), { ackId, woId: wo.id });
  ok('after reload: data is still there', after.wo === 'In progress' && after.alarm === 'Acknowledged' && after.lim === '11' && after.docs >= 1 && after.regs >= 1, JSON.stringify(after));

  // download the uploaded document from the register
  await p.evaluate(() => go({ page: 'settings' }));
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await p.evaluate(() => { const i = UI.udocs.findIndex(d => d.fileId); dlFile(UI.udocs[i].fname, UI.udocs[i].blob); });
  const d = await dl;
  ok('uploaded document downloads', d && d.suggestedFilename() === 'manual.pdf', d && d.suggestedFilename());

  // second person: operator sees the same plant, live, and cannot change limits
  const q = await login(b, 'skhan');
  const seesWo = await q.evaluate(id => UI.wo.some(w => w.id === id), wo.id);
  ok('operator sees the new work order', seesWo);
  ok('operator header shows their name', (await q.textContent('.hdr .nm')) === 'S. Khan');
  await q.evaluate(() => setLim('apm:apm:1|Pressure', 'hi', '9'));
  await syncNow(q); await sleep(800);
  const st3 = await apiGet(q, '/api/state');
  const qLim = await q.evaluate(() => (S.klim['apm:apm:1|Pressure'] || {}).hi);
  ok('operator limit change refused and undone', st3.limits['apm:apm:1|Pressure'].hi === '11' && qLim === '11', `server ${st3.limits['apm:apm:1|Pressure'].hi}, page ${qLim}`);
  // admin creates a WO; operator page receives it live
  await p.evaluate(() => { woList().unshift({ id: 'WO-1150', t: 'E2E live push', aid: 'apm:apm:2', asset: 'Hydrant System', cat: 'apm', mod: 'apm', type: 'Breakdown', pri: 'High', st: 'Assigned', who: 'S. Khan', due: '30 Nov', spares: '-' }); });
  await syncNow(p); await sleep(1200);
  ok('change pushed live to another person', await q.evaluate(() => UI.wo.some(w => w.t === 'E2E live push')));

  // a live alarm arrives (excursions every 20 s in this test server)
  const n0 = await q.evaluate(() => ALM.length);
  await q.waitForFunction(n0 => ALM.length > n0, n0, { timeout: 45000 }).catch(() => {});
  const n1 = await q.evaluate(() => ALM.length);
  ok('new live alarm pushed', n1 > n0, `${n0} -> ${n1}: ` + await q.evaluate(() => { const a = ALM[ALM.length - 1]; return a.a + ': ' + a.msg; }));

  // sign out
  await q.evaluate(() => document.getElementById('out').classList.add('show'));
  await q.waitForURL('**/login', { timeout: 8000 });
  ok('sign out goes back to sign in', q.url().endsWith('/login'));

  await p.evaluate(() => go({ mod: 'dash', tab: 'ov', page: null })); await sleep(500);
  await p.screenshot({ path: 'dash2.png' });
  console.log(out.join('\n'));
  process.exitCode = out.some(l => l.startsWith('FAIL')) ? 1 : 0;
  console.log('page errors:', JSON.stringify(p.errs.concat(q.errs)).slice(0, 1500));
  await b.close();
})();
