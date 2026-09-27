// Verifies WhatsApp (Wablas-style) + Google Calendar flows against local mocks.
// Run via `npm test` (test/run.mjs starts the server with the mock endpoints).
import http from 'node:http';

const API = `http://localhost:${process.argv[2]}/api`;
const MOCK = Number(process.argv[3]);
let pass = 0; let fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, x); } };

// ── Mock server: Wablas + Google OAuth/Calendar ──
const wa = []; const events = new Map(); let seq = 0; let tokenCalls = 0;
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/api/send-message') {
      wa.push({ auth: req.headers.authorization, ...JSON.parse(body) });
      return json(200, { status: true, message: 'sent' });
    }
    if (req.url === '/token') {
      tokenCalls++;
      const p = new URLSearchParams(body);
      if (p.get('grant_type') === 'authorization_code') return json(200, { access_token: 'AT1', expires_in: 3600, refresh_token: 'RT1' });
      return json(200, { access_token: 'AT2', expires_in: 3600 });
    }
    if (req.url === '/revoke' || req.url.startsWith('/revoke?')) return json(200, {});
    const m = req.url.match(/^\/calendars\/([^/]+)\/events(?:\/([^/?]+))?/);
    if (m) {
      if (req.headers.authorization !== 'Bearer AT1' && req.headers.authorization !== 'Bearer AT2') return json(401, { error: { message: 'bad token' } });
      if (req.method === 'POST') { const id = `ev${++seq}`; events.set(id, JSON.parse(body)); return json(200, { id }); }
      if (req.method === 'PATCH') { events.set(m[2], JSON.parse(body)); return json(200, { id: m[2] }); }
      if (req.method === 'DELETE') { events.delete(m[2]); res.writeHead(204); return res.end(); }
    }
    json(404, { error: { message: 'not found' } });
  });
}).listen(MOCK);

async function call(method, path, body, token) {
  const res = await fetch(API + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* redirect */ }
  return { status: res.status, data, location: res.headers.get('location') };
}

const P = (await call('POST', '/auth/login', { username: 'pemilik', password: 'pemilik123' })).data.token;

console.log('— WhatsApp gateway');
let r = await call('PUT', '/settings', { waProvider: 'wablas', waBaseUrl: `http://localhost:${MOCK}`, waToken: 'SECRET-TOKEN', reminderEnabled: true, reminderDaysBefore: 3, invoiceAutoSend: true }, P);
ok(r.status === 200 && r.data.waTokenSet === true && !('waToken' in r.data), 'token stored, never returned');
r = await call('PUT', '/settings', { waToken: '' }, P);
ok(r.data.waTokenSet === true, 'empty token on save keeps existing secret');
r = await call('POST', '/notifications/test', { target: '08123456789' }, P);
ok(r.status === 200 && wa.at(-1)?.phone === '628123456789' && wa.at(-1)?.auth === 'SECRET-TOKEN', 'test message via gateway (62-normalized, auth header)');
// Invoice jatuh tempo H+2 → wajib dapat reminder H-3.
// Tanggal "hari ini" server dipatok lewat APP_TODAY oleh test/run.mjs.
const today = process.env.APP_TODAY || new Date().toISOString().slice(0, 10);
const inTwo = new Date(Date.parse(`${today}T00:00:00Z`) + 2 * 86400000).toISOString().slice(0, 10);
const resList = (await call('GET', '/residents', null, P)).data;
const target = resList.find((x) => x.room === '102');
const before = wa.length; // sebelum POST: pembuatan charge memicu auto-send di latar belakang
await call('POST', '/charges', { residentId: target.id, kind: 'denda', name: 'Denda uji H-3', amount: 25000, recurring: false, startDate: inTwo }, P);
// Dua pemicu bersamaan (mis. scheduler + aksi admin) tidak boleh kirim ganda.
const [r1, r2] = await Promise.all([call('POST', '/notifications/run', null, P), call('POST', '/notifications/run', null, P)]);
r = r1;
ok(JSON.stringify(r1.data) === JSON.stringify(r2.data), 'concurrent runs share one job (single-flight)');
const invoiceMsgs = wa.slice(before).filter((m) => m.message.includes('Berikut tagihan'));
const reminderMsgs = wa.slice(before).filter((m) => m.message.includes('pengingat'));
ok(r.data.invoices.sent > 0 && invoiceMsgs.length === r.data.invoices.sent, `auto-send invoices (${r.data.invoices.sent})`);
ok(reminderMsgs.length === r.data.reminders.sent && reminderMsgs.some((m) => m.phone === '6281234567890' && m.message.includes('dalam *2 hari*')), `H-3 reminder sent for invoice due in 2 days (${r.data.reminders.sent})`);
const perInvoice = {};
for (const m of wa.slice(before)) { const k = m.message.match(/INV-\d{6}-\d{4}/)?.[0] + (m.message.includes('pengingat') ? 'R' : 'I'); perInvoice[k] = (perInvoice[k] || 0) + 1; }
ok(Object.values(perInvoice).every((n) => n === 1), 'every invoice/reminder delivered exactly once');
ok(invoiceMsgs.every((m) => /\/invoice\/[A-Za-z0-9_-]{16}/.test(m.message)), 'messages contain public invoice link');
ok(!reminderMsgs.some((m) => m.message.includes('Maya')), 'deferred resident (Maya) gets no reminder');
const again = wa.length;
await call('POST', '/notifications/run', null, P);
ok(wa.length === again, 'no duplicate sends on second run');
r = await call('GET', '/notifications', null, P);
ok(r.data.ready && r.data.log.length >= 2, `delivery log recorded (${r.data.log.length})`);

console.log('— Google Calendar');
r = await call('GET', '/gcal/auth-url', null, P);
ok(r.status === 200 && r.data.url.includes('access_type=offline') && r.data.url.includes('calendar.events'), 'auth URL (offline, calendar.events scope)');
const state = new URL(r.data.url).searchParams.get('state');
r = await call('GET', `/gcal/callback?code=abc&state=bogus`);
ok(r.status === 302 && r.location.includes('gcal=error'), 'forged state rejected');
r = await call('GET', `/gcal/callback?code=abc&state=${encodeURIComponent(state)}`);
ok(r.status === 302 && r.location.includes('gcal=ok'), 'OAuth callback stores refresh token');
r = await call('GET', '/settings', null, P);
ok(r.data.gcalRefreshTokenSet === true && !('gcalRefreshToken' in r.data), 'refresh token masked');
const [s1, s2, s3] = await Promise.all([1, 2, 3].map(() => call('POST', '/gcal/sync', null, P)));
r = s1;
const openCount = (await call('GET', '/invoices?state=open', null, P)).data.length;
ok(events.size === openCount && s2.data.created === s1.data.created && s3.data.created === s1.data.created,
  `3 concurrent syncs → exactly one event per open invoice (${events.size}/${openCount})`);
ok(r.data.errors.length === 0, 'no sync errors', JSON.stringify(r.data.errors));
const sample = [...events.values()][0];
ok(sample.start.date && sample.end.date && sample.summary.includes('Tagihan') && sample.colorId === '11', 'all-day red event on due date');
r = await call('POST', '/gcal/sync', null, P);
ok(r.data.created === 0 && r.data.updated === 0, 'second sync is idempotent');
const inv = (await call('GET', '/invoices?state=open', null, P)).data.find((i) => i.gcalEventId);
await call('POST', `/invoices/${inv.id}/pay`, { method: 'Tunai' }, P); // memicu sync latar belakang
await call('POST', '/gcal/sync', null, P);
ok(events.get(inv.gcalEventId).summary.startsWith('✅') && events.get(inv.gcalEventId).colorId === '10', 'paid → event turns green ✅');
const inv2 = (await call('GET', '/invoices?state=open', null, P)).data.find((i) => i.gcalEventId);
await call('POST', `/invoices/${inv2.id}/void`, null, P);
await call('POST', '/gcal/sync', null, P);
ok(!events.has(inv2.gcalEventId), 'voided → event deleted');
r = await call('POST', '/gcal/disconnect', null, P);
r = await call('GET', '/gcal/status', null, P);
ok(r.data.connected === false && r.data.syncedEvents === 0, 'disconnect clears token & event ids');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
