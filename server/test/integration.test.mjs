// Verifies WhatsApp (Wablas-style) + Google Calendar flows against local mocks.
// Run via `npm test` (test/run.mjs starts the server with the mock endpoints).
import http from 'node:http';

const API = `http://localhost:${process.argv[2]}/api`;
const MOCK = Number(process.argv[3]);
let pass = 0; let fail = 0;
const ok = (c, m, x = '') => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.log('  ✗', m, x); } };

// ── Mock server: Wablas + Google OAuth/Calendar ──
const wa = []; const fonnte = []; const events = new Map(); let seq = 0; let tokenCalls = 0;
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.url === '/api/send-message') {
      wa.push({ auth: req.headers.authorization, ...JSON.parse(body) });
      return json(200, { status: true, message: 'sent' });
    }
    if (req.url === '/fonnte/send') {
      const p = new URLSearchParams(body);
      fonnte.push({ auth: req.headers.authorization, type: req.headers['content-type'], target: p.get('target'), message: p.get('message') });
      if (req.headers.authorization !== 'FONNTE-OK') return json(200, { status: false, reason: 'invalid token' });
      return json(200, { detail: 'success! message in queue', id: ['1'], process: 'pending', status: true, target: [p.get('target')] });
    }
    if (req.url === '/token') {
      tokenCalls++;
      const p = new URLSearchParams(body);
      // Kode "id:<sub>:<email>:<verified>" = login Google (tanpa refresh token).
      if (p.get('grant_type') === 'authorization_code' && String(p.get('code')).startsWith('id:')) return json(200, { access_token: `ID|${p.get('code')}`, expires_in: 3600 });
      if (p.get('grant_type') === 'authorization_code') return json(200, { access_token: 'AT1', expires_in: 3600, refresh_token: 'RT1' });
      return json(200, { access_token: 'AT2', expires_in: 3600 });
    }
    if (req.url === '/userinfo') {
      const t = String(req.headers.authorization || '');
      if (!t.startsWith('Bearer ID|id:')) return json(401, { error: 'invalid_token' });
      const [, sub, email, verified] = t.slice('Bearer ID|'.length).split(':');
      return json(200, { sub, email, email_verified: verified === 'true', name: `User ${sub}` });
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
const A = (await call('POST', '/auth/login', { username: 'admin', password: 'admin123' })).data.token;

console.log('— Fonnte');
let f = await call('PUT', '/settings', { waProvider: 'fonnte', waToken: 'FONNTE-OK', reminderEnabled: false, invoiceAutoSend: false }, P);
f = await call('POST', '/notifications/test', { target: '0812-3456-789' }, P);
ok(f.status === 200 && fonnte.at(-1)?.auth === 'FONNTE-OK' && fonnte.at(-1)?.target === '628123456789' && /Tes notifikasi/.test(fonnte.at(-1)?.message), 'Fonnte: token di header Authorization, target 62…, pesan terkirim');
ok(/x-www-form-urlencoded/.test(fonnte.at(-1)?.type) && /message in queue/.test(f.data.response) && f.data.provider === 'fonnte', 'Fonnte: form-urlencoded & respons gateway ditampilkan');
await call('PUT', '/settings', { waToken: 'SALAH' }, P);
f = await call('POST', '/notifications/test', { target: '08123456789' }, P);
ok(f.status === 502 && /invalid token/.test(f.data.error), 'Fonnte: token salah → alasan dari Fonnte ditampilkan', f.data?.error);
f = await call('GET', '/notifications', null, P);
ok(f.data.log.some((n) => n.kind === 'tes' && n.status === 'gagal') && f.data.log.some((n) => n.kind === 'tes' && n.status === 'terkirim'), 'tes kirim tercatat di log notifikasi');

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

console.log('— Bukti pelunasan via WhatsApp');
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const waitMsg = async (pred, ms = 5000) => { for (let t = 0; t < ms; t += 100) { const m = wa.find(pred); if (m) return m; await sleep(100); } return null; };
const lunasMsgs = () => wa.filter((m) => m.message.includes('pembayaran Anda sudah kami terima'));
r = await call('POST', '/notifications/run', null, P);
ok(r.data.receipts.sent === 0 && lunasMsgs().length === 0, 'invoice yang lunas sebelum fitur ada tidak dikirimi bukti');
const openInv = (await call('GET', '/invoices?state=open', null, P)).data.filter((i) => i.wa && i.status === 'unpaid');
const payInv = openInv[0];
r = await call('POST', `/invoices/${payInv.id}/pay`, { method: 'Transfer' }, A);
ok(r.status === 200 && r.data.status === 'paid' && r.data.receipt === 'queued', 'admin tandai lunas → bukti dijadwalkan', r.data?.receipt);
const receipt = await waitMsg((m) => m.message.includes('pembayaran Anda sudah kami terima') && m.message.includes(payInv.number));
ok(receipt && receipt.phone.startsWith('62') && /LUNAS/.test(receipt.message) && /Transfer/.test(receipt.message) && /\/invoice\/[A-Za-z0-9_-]{16}/.test(receipt.message),
  'bukti pelunasan langsung terkirim (nomor invoice, LUNAS, metode, link kwitansi)', receipt?.message);
await call('POST', `/invoices/${payInv.id}/pay`, { method: 'Transfer' }, A);
await call('POST', '/notifications/run', null, P);
await sleep(300);
ok(lunasMsgs().filter((m) => m.message.includes(payInv.number)).length === 1, 'bukti tidak terkirim dua kali');
r = await call('GET', '/notifications', null, P);
ok(r.data.log.some((n) => n.kind === 'lunas' && n.status === 'terkirim' && n.number === payInv.number), 'tercatat di log notifikasi (jenis lunas)');
// Konfirmasi dari halaman publik → admin verifikasi → bukti terkirim.
const rcInv2 = openInv[1];
await call('POST', `/public/invoice/${rcInv2.publicId}/confirm`, { method: 'QRIS' });
await sleep(200);
ok(!lunasMsgs().some((m) => m.message.includes(rcInv2.number)), 'klaim "sudah bayar" belum memicu bukti (menunggu verifikasi)');
await call('POST', `/invoices/${rcInv2.id}/pay`, { method: 'QRIS' }, A);
ok(Boolean(await waitMsg((m) => m.message.includes('pembayaran Anda sudah kami terima') && m.message.includes(rcInv2.number))), 'setelah admin verifikasi QRIS → bukti terkirim');
await call('PUT', '/settings', { receiptAutoSend: false }, P);
const rcInv3 = openInv[2];
r = await call('POST', `/invoices/${rcInv3.id}/pay`, {}, A);
await sleep(400);
ok(r.data.receipt === 'off' && !lunasMsgs().some((m) => m.message.includes(rcInv3.number)), 'fitur dimatikan → tidak ada bukti otomatis');
r = await call('POST', `/invoices/${rcInv3.id}/send`, { kind: 'lunas' }, A);
ok(r.status === 200 && lunasMsgs().some((m) => m.message.includes(rcInv3.number)), 'kirim bukti manual tetap bisa');
r = await call('POST', `/invoices/${openInv[3].id}/send`, { kind: 'lunas' }, A);
ok(r.status === 400, 'bukti manual ditolak untuk invoice belum lunas');
await call('PUT', '/settings', { receiptAutoSend: true }, P);

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

console.log('— Login dengan Google');
const q = (url) => new URL(url).searchParams;
const PUB = (await call('GET', '/settings', null, P)).data.publicUrl.replace(/\/+$/, '');
const NONCE = 'nonce-browser-A-123456';
r = await call('GET', '/auth/google/status');
ok(r.data.enabled === true, 'status: login Google aktif (client id terpasang)');
r = await call('GET', '/auth/google/url?nonce=pendek');
ok(r.status === 400, 'nonce tidak valid ditolak');
const loginState = async (nonce = NONCE) => {
  const u = (await call('GET', `/auth/google/url?nonce=${nonce}`)).data.url;
  return { url: u, state: q(u).get('state') };
};
let g = await loginState();
ok(q(g.url).get('scope') === 'openid email profile' && q(g.url).get('prompt') === 'select_account' && !q(g.url).get('access_type'), 'URL login: hanya scope identitas, tanpa akses offline');
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-x:orang@gmail.com:true')}`);
ok(r.status === 302 && r.location.startsWith(`${PUB}/login?google=error`) && /belum%20terdaftar/.test(r.location), 'akun Google tak terdaftar ditolak');
const users = (await call('GET', '/users', null, P)).data;
const adminU = users.find((u) => u.username === 'admin');
const pemU = users.find((u) => u.username === 'pemilik');
r = await call('PUT', `/users/${adminU.id}`, { email: 'Admin.Kos@Gmail.com' }, P);
ok(r.status === 200 && r.data.email === 'admin.kos@gmail.com' && r.data.googleLinked === false, 'pemilik mengisi email Google admin (disimpan huruf kecil)');
r = await call('PUT', `/users/${pemU.id}`, { email: 'admin.kos@gmail.com' }, P);
ok(r.status === 409, 'email yang sama tidak bisa dipakai dua akun');
r = await call('PUT', `/users/${pemU.id}`, { email: 'bukan-email' }, P);
ok(r.status === 400, 'format email divalidasi');
g = await loginState();
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-admin:admin.kos@gmail.com:false')}`);
ok(r.location.includes('google=error'), 'email Google belum terverifikasi tidak dicocokkan');
g = await loginState();
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-admin:admin.kos@gmail.com:true')}`);
let gcode = q(r.location).get('gcode');
ok(r.location.startsWith(`${PUB}/login?gcode=`) && gcode, 'admin terdaftar → kembali ke /login dengan kode sekali pakai');
r = await call('POST', '/auth/google/exchange', { code: gcode, nonce: 'nonce-browser-LAIN-99999' });
ok(r.status === 401, 'kode tidak bisa ditukar dari browser lain (nonce beda)');
r = await call('POST', '/auth/google/exchange', { code: gcode, nonce: NONCE });
ok(r.status === 401, 'kode hangus setelah percobaan pertama');
g = await loginState();
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-admin:email-baru@gmail.com:true')}`);
gcode = q(r.location).get('gcode');
r = await call('POST', '/auth/google/exchange', { code: gcode, nonce: NONCE });
const AG = r.data?.token;
ok(r.status === 200 && r.data.user.role === 'admin', 'login admin via Google → token sesi (dicocokkan lewat ID Google yang sudah tertaut)');
r = await call('GET', '/auth/me', null, AG);
ok(r.data.user.username === 'admin' && r.data.user.googleLinked === true, 'token Google bekerja, akun tertaut');
r = await call('POST', '/auth/google/exchange', { code: gcode, nonce: NONCE });
ok(r.status === 401, 'kode sekali pakai tidak bisa dipakai ulang');
ok((await call('GET', '/gcal/status', null, P)).data.connected === false, 'admin login tidak menyambungkan kalender');

await call('PUT', `/users/${pemU.id}`, { email: 'pemilik.kos@gmail.com' }, P);
g = await loginState();
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-pem:pemilik.kos@gmail.com:true')}`);
const consent = r.location;
ok(consent.startsWith('https://accounts.google.com/') && q(consent).get('scope').includes('calendar.events') && q(consent).get('login_hint') === 'pemilik.kos@gmail.com' && q(consent).get('access_type') === 'offline',
  'pemilik + kalender belum terhubung → langsung ke izin Google Calendar');
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(q(consent).get('state'))}&code=cal-code`);
ok(r.location.startsWith(`${PUB}/login?gcode=`) && r.location.includes('gcal=ok'), 'izin kalender → kembali ke login dengan status gcal=ok');
ok((await call('GET', '/gcal/status', null, P)).data.connected === true, 'kalender kos otomatis terhubung');
r = await call('POST', '/auth/google/exchange', { code: q(r.location).get('gcode'), nonce: NONCE });
ok(r.status === 200 && r.data.user.role === 'pemilik', 'pemilik masuk setelah kalender tersambung');
g = await loginState();
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-pem:pemilik.kos@gmail.com:true')}`);
ok(r.location.startsWith(`${PUB}/login?gcode=`), 'login pemilik berikutnya tidak meminta izin kalender lagi');
await call('POST', '/gcal/disconnect', null, P);
g = await loginState();
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(g.state)}&code=${encodeURIComponent('id:sub-pem:pemilik.kos@gmail.com:true')}`);
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(q(r.location).get('state'))}&error=access_denied`);
ok(r.location.includes('gcal=skip') && (await call('POST', '/auth/google/exchange', { code: q(r.location).get('gcode'), nonce: NONCE })).status === 200,
  'izin kalender ditolak → tetap bisa masuk');

console.log('— Tautkan akun Google (menu Akun)');
r = await call('POST', '/auth/google/unlink', null, AG);
r = await call('GET', '/auth/me', null, AG);
ok(r.data.user.googleLinked === false && r.data.user.email === '', 'lepas tautan Google');
r = await call('POST', '/auth/google/link', null, AG);
const linkState = q(r.data.url).get('state');
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(linkState)}&code=${encodeURIComponent('id:sub-pem:pemilik.kos@gmail.com:true')}`);
ok(r.location.startsWith(`${PUB}/akun?google=error`), 'akun Google milik pengguna lain tidak bisa ditautkan');
r = await call('POST', '/auth/google/link', null, AG);
r = await call('GET', `/gcal/callback?state=${encodeURIComponent(q(r.data.url).get('state'))}&code=${encodeURIComponent('id:sub-admin2:admin.baru@gmail.com:true')}`);
ok(r.location === `${PUB}/akun?google=linked`, 'tautkan akun Google baru');
r = await call('GET', '/auth/me', null, AG);
ok(r.data.user.email === 'admin.baru@gmail.com' && r.data.user.googleLinked, 'email & tautan tersimpan');
r = await call('POST', '/auth/google/link');
ok(r.status === 401, 'tautkan wajib login');
r = await call('POST', '/users', { username: 'staf.google', name: 'Staf', role: 'admin', email: 'staf@gmail.com' }, P);
ok(r.status === 201 && r.data.email === 'staf@gmail.com', 'akun baru khusus Google (tanpa password)');
r = await call('POST', '/users', { username: 'staf.dua', role: 'admin' }, P);
ok(r.status === 400, 'tanpa email & tanpa password ditolak');
r = await call('POST', '/auth/login', { username: 'staf.google', password: '' });
ok(r.status === 401, 'akun khusus Google tidak bisa login dengan password kosong');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
