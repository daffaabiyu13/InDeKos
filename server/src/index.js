// ─────────────────────────────────────────────────────────────
// InDeKos API server (Express) — v2
// Publik (tanpa login): form pendaftaran, form keluar, cek tagihan,
// halaman invoice & konfirmasi bayar, webhook, callback Google.
// Selain itu wajib login; aksi sensitif khusus peran 'pemilik'.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

import db, { logActivity } from './db.js';
import { getSettings, getMaskedSettings, getPublicInfo, updateSettings } from './settings.js';
import { authRouter, requireAuth, requireRole, allowQueryToken, signToken, verifyToken } from './auth.js';
import * as billing from './billing.js';
import * as repo from './repo.js';
import * as notify from './notify.js';
import * as gcal from './gcal.js';
import * as googleAuth from './googleAuth.js';
import { saveImage, sendImage } from './uploads.js';
import { generateDynamicQris, isValidQris } from './qris.js';
import * as ai from './ai.js';
import { insightsFor } from './aiData.js';
import { todayISO, nowStamp, fmtDate, parseRp, addDays, waNumber, parseStayMonths } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 'loopback');
app.use(cors());
app.use(express.json({ limit: '15mb' })); // foto KTP + selfie (sudah dikompres di browser)

// Async-safe handler: errors → JSON { error } with err.status (default 500).
const h = (fn) => (req, res) => {
  Promise.resolve()
    .then(() => fn(req, res))
    .catch((err) => {
      const status = err.status || 500;
      if (!err.status) console.error(err); // hanya error tak terduga
      if (!res.headersSent) res.status(status).json({ error: err.status ? err.message : 'Terjadi kesalahan pada server.' });
    });
};
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const pemilik = requireRole('pemilik');

// Jalankan pekerjaan notifikasi/sync tanpa menahan respons.
function kickJobs() {
  notify.runAutoSend().catch((e) => console.error('[notify]', e.message));
  gcal.syncInvoices().catch((e) => console.error('[gcal]', e.message));
}

// ═════════════ PUBLIC ═════════════
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'indekos-api', db: 'sqlite', schema: 2, ts: nowStamp() }));
app.use('/api', authRouter);

app.get('/api/public/info', (_req, res) => {
  res.json({ ...getPublicInfo(), roomTypes: repo.listRoomTypes().map(({ id, name, price, facilities, description }) => ({ id, name, price, facilities, description })) });
});

// Formulir pendaftaran calon penghuni.
app.post('/api/public/applications', h((req, res) => {
  const b = req.body || {};
  const need = { name: 'Nama', wa: 'No. WhatsApp', wali: 'Nama kontak darurat 1', waWali: 'No. WA kontak darurat 1', emergency2Name: 'Nama kontak darurat 2', emergency2Wa: 'No. WA kontak darurat 2' };
  for (const [k, label] of Object.entries(need)) if (!String(b[k] || '').trim()) throw bad(`${label} wajib diisi.`);
  if (!b.ktpPhoto || !b.selfiePhoto) throw bad('Foto KTP dan foto selfie wajib diunggah.');
  const ktp = saveImage(b.ktpPhoto, 'ktp');
  const selfie = saveImage(b.selfiePhoto, 'selfie');
  // null/'' = verifikasi tidak berjalan (mis. wajah tak terdeteksi) — jangan diubah jadi skor 0.
  const hasScore = b.faceScore !== null && b.faceScore !== undefined && b.faceScore !== '' && Number.isFinite(Number(b.faceScore));
  const score = hasScore ? Math.max(0, Math.min(1, Number(b.faceScore))) : null;
  const info = db.prepare(`INSERT INTO applications
    (name,tempatLahir,tglLahir,alamat,nik,wa,job,uni,wali,waliStatus,waWali,emergency2Name,emergency2Rel,emergency2Wa,
     ktpPhoto,selfiePhoto,faceScore,faceMatch,roomTypeId,sumber,masuk,stayMonths,status,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`).run(
    String(b.name).trim(), b.tempatLahir || '', b.tglLahir || '', b.alamat || '', String(b.nik || '').replace(/\D/g, ''),
    b.wa, b.job || 'Lainnya', b.uni || '', b.wali, b.waliStatus || '', b.waWali,
    b.emergency2Name, b.emergency2Rel || '', b.emergency2Wa, ktp, selfie,
    score, score === null || b.faceMatch === undefined || b.faceMatch === null ? null : (b.faceMatch ? 1 : 0),
    b.roomTypeId ? Number(b.roomTypeId) : null, b.sumber || '', b.masuk || '', parseStayMonths(b.stayMonths), nowStamp(),
  );
  logActivity('jade', `Pendaftaran baru dari <strong>${String(b.name).trim()}</strong> menunggu verifikasi`);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
}));

// Temukan penghuni aktif dari nama + kamar (untuk halaman publik).
function findResident(name, room) {
  const q = String(name || '').trim().toLowerCase();
  if (q.length < 3) throw bad('Masukkan nama minimal 3 huruf.');
  const r = db.prepare('SELECT * FROM residents WHERE room = ?').get(String(room || '').trim());
  if (!r || !r.name.toLowerCase().includes(q)) throw bad('Data penghuni tidak ditemukan. Periksa nama & nomor kamar.', 404);
  return r;
}

// Daftar tagihan terbuka milik penghuni (bisa lebih dari satu bila menunggak).
app.get('/api/public/bills', h((req, res) => {
  const r = findResident(req.query.name, req.query.room);
  const today = todayISO();
  const invoices = db.prepare(`SELECT * FROM invoices WHERE residentId = ? AND status IN ('unpaid','menunggu') ORDER BY dueDate`).all(r.id)
    .map((i) => billing.decorateInvoice(i, today))
    .map(({ publicId, number, kind, description, dueDate, amount, uniqueCode, total, state }) => ({ publicId, number, kind, description, dueDate, amount, uniqueCode, total, state }));
  res.json({ name: r.name, room: r.room, invoices });
}));

app.get('/api/public/invoice/:publicId', h(async (req, res) => {
  const inv = billing.getInvoiceByPublicId(req.params.publicId);
  if (!inv) throw bad('Invoice tidak ditemukan.', 404);
  const s = getSettings();
  const d = billing.decorateInvoice(inv);
  let qrImage = null;
  if (inv.status === 'unpaid' && s.paymentMode === 'qris_static' && isValidQris(s.qrisString)) {
    qrImage = await QRCode.toDataURL(generateDynamicQris(s.qrisString, d.total), { margin: 1, width: 320 });
  }
  const { number, name, room, kind, description, periodStart, periodEnd, issueDate, dueDate, amount, uniqueCode, total, status, state, method, paidAt, publicId } = d;
  res.json({
    number, name, room, kind, description, periodStart, periodEnd, issueDate, dueDate, amount, uniqueCode, total,
    status, state, method, paidAt, publicId, qrImage,
    kos: { namaKos: s.namaKos, alamat: s.alamat, wa: s.wa }, paymentMode: s.paymentMode,
  });
}));

app.post('/api/public/invoice/:publicId/confirm', h((req, res) => {
  const inv = billing.confirmByTenant(req.params.publicId, { method: req.body?.method, note: req.body?.note });
  if (!inv) throw bad('Invoice tidak ditemukan atau sudah diproses.', 404);
  kickJobs();
  res.json({ ok: true });
}));

// Formulir keluar penghuni.
app.post('/api/public/exit-requests', h((req, res) => {
  const b = req.body || {};
  const r = findResident(b.name, b.room);
  if (!b.exitDate || !/^\d{4}-\d{2}-\d{2}$/.test(b.exitDate)) throw bad('Tanggal keluar wajib diisi.');
  if (b.exitDate < todayISO()) throw bad('Tanggal keluar tidak boleh di masa lalu.');
  if (db.prepare("SELECT 1 FROM exit_requests WHERE residentId = ? AND status = 'pending'").get(r.id)) {
    throw bad('Anda sudah memiliki pengajuan keluar yang sedang diproses.', 409);
  }
  const info = db.prepare(`INSERT INTO exit_requests
    (residentId,name,room,wa,exitDate,reason,rating,feedback,refundBank,refundAccount,refundName,status,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending',?)`).run(
    r.id, r.name, r.room, b.wa || r.wa, b.exitDate, b.reason || '', Math.min(5, Math.max(1, Number(b.rating) || 5)),
    String(b.feedback || '').slice(0, 1000), b.refundBank || '', b.refundAccount || '', b.refundName || '', nowStamp(),
  );
  logActivity('warn', `<strong>${r.name}</strong> (kamar ${r.room}) mengajukan keluar pada ${fmtDate(b.exitDate)}`);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
}));

// Webhook Jalur B (Midtrans) — aktif bila Server Key diisi. Cocokkan via total (nominal + kode unik).
app.post('/api/payments/webhook', h((req, res) => {
  const s = getSettings();
  if (!s.midtransServerKey) throw bad('Midtrans belum dikonfigurasi.', 503);
  const { transaction_status: status, gross_amount: gross } = req.body || {};
  if (!['settlement', 'capture'].includes(status)) return res.json({ ok: true, ignored: status });
  const total = Math.round(Number(gross) || 0);
  const inv = db.prepare("SELECT * FROM invoices WHERE status IN ('unpaid','menunggu') AND amount + uniqueCode = ?").get(total);
  if (!inv) throw bad('Tagihan cocok tidak ditemukan.', 404);
  billing.markPaid(inv.id, { method: 'QRIS (Midtrans)' });
  kickJobs();
  res.json({ ok: true, invoice: inv.number });
}));

// OAuth callback Google — dipanggil browser setelah consent.
// ── Login dengan Google (publik) ──
app.get('/api/auth/google/status', (_req, res) => res.json({ enabled: gcal.gcalConfigured() }));
app.get('/api/auth/google/url', h((req, res) => res.json({ url: googleAuth.loginUrl(req.query.nonce) })));
app.post('/api/auth/google/exchange', h((req, res) => {
  res.json(googleAuth.exchangeLoginCode(req.body?.code, req.body?.nonce));
}));

// Satu redirect URI untuk semua alur Google: kalender (gcal), login (glogin), tautkan akun (glink).
app.get('/api/gcal/callback', h(async (req, res) => {
  const base = String(getSettings().publicUrl || '').replace(/\/+$/, '');
  const state = verifyToken(req.query.state);
  if (state?.typ === 'glogin') return res.redirect(await googleAuth.finishLogin(state, req.query));
  if (state?.typ === 'glink') return res.redirect(await googleAuth.finishLink(state, req.query));
  // Alur kalender. Bila datang dari login Google pemilik (state.gcode), kembali ke halaman login.
  const back = state?.gcode ? `${base}/login?gcode=${encodeURIComponent(state.gcode)}&` : `${base}/pengaturan?`;
  if (!state || state.typ !== 'gcal') return res.redirect(`${base}/pengaturan?gcal=error&msg=${encodeURIComponent('Sesi OAuth tidak valid.')}`);
  if (req.query.error) return res.redirect(`${back}gcal=${state.gcode ? 'skip' : 'error'}&msg=${encodeURIComponent(String(req.query.error))}`);
  try {
    await gcal.exchangeCode(String(req.query.code || ''));
    gcal.syncInvoices().catch(() => {});
    res.redirect(`${back}gcal=ok`);
  } catch (e) {
    res.redirect(`${back}gcal=error&msg=${encodeURIComponent(e.message)}`);
  }
}));

// ═════════════ PROTECTED ═════════════
app.get('/api/files/:name', allowQueryToken, requireAuth, sendImage);
app.use('/api', requireAuth);

// ── Tautkan / lepas akun Google (untuk login) ──
app.post('/api/auth/google/link', h((req, res) => res.json({ url: googleAuth.linkUrl(req.user) })));
app.post('/api/auth/google/unlink', h((req, res) => { googleAuth.unlink(req.user.id); res.json({ ok: true }); }));

// ── Settings ──
app.get('/api/settings', (_req, res) => res.json(getMaskedSettings()));
app.put('/api/settings', pemilik, h((req, res) => {
  const b = { ...(req.body || {}) };
  if (b.qrisString && !isValidQris(b.qrisString)) throw bad('Payload QRIS tidak valid. Pastikan diawali 000201 dan diakhiri CRC (6304…).');
  delete b.gcalRefreshToken; // hanya lewat OAuth
  if (b.aiModel !== undefined) {
    b.aiModel = String(b.aiModel ?? '').trim() || ai.DEFAULT_MODEL; // kosong → model default
    if (!/^[a-z0-9][a-z0-9.@-]{2,63}$/.test(b.aiModel)) throw bad('Nama model AI tidak valid.');
  }
  res.json(updateSettings(b));
}));

// ── Dashboard & finance ──
app.get('/api/dashboard', h((_req, res) => res.json(repo.dashboard())));
app.get('/api/finance', h((_req, res) => res.json(repo.finance())));

// ── Room types (harga & fasilitas) ──
app.get('/api/room-types', (_req, res) => res.json(repo.listRoomTypes()));
function roomTypeBody(b) {
  const name = String(b.name || '').trim();
  const price = parseRp(b.price);
  if (!name) throw bad('Nama tipe kamar wajib diisi.');
  if (price <= 0) throw bad('Harga harus lebih dari 0.');
  const facilities = (Array.isArray(b.facilities) ? b.facilities : String(b.facilities || '').split(','))
    .map((f) => String(f).trim()).filter(Boolean);
  return { name, price, facilities: JSON.stringify(facilities), description: b.description || '' };
}
app.post('/api/room-types', pemilik, h((req, res) => {
  const t = roomTypeBody(req.body || {});
  const info = db.prepare('INSERT INTO room_types(name,price,facilities,description) VALUES(?,?,?,?)').run(t.name, t.price, t.facilities, t.description);
  res.status(201).json({ id: info.lastInsertRowid });
}));
app.put('/api/room-types/:id', pemilik, h((req, res) => {
  const t = roomTypeBody(req.body || {});
  const info = db.prepare('UPDATE room_types SET name=?, price=?, facilities=?, description=? WHERE id=?').run(t.name, t.price, t.facilities, t.description, Number(req.params.id));
  if (!info.changes) throw bad('Tipe kamar tidak ditemukan.', 404);
  res.json({ ok: true });
}));
app.delete('/api/room-types/:id', pemilik, h((req, res) => {
  const used = db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE typeId = ?').get(Number(req.params.id)).n;
  if (used) throw bad(`Tipe masih dipakai ${used} kamar. Pindahkan kamar ke tipe lain dulu.`, 409);
  db.prepare('DELETE FROM room_types WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
}));

// ── Rooms ──
app.get('/api/rooms', h((_req, res) => res.json(repo.listRooms())));
app.post('/api/rooms', pemilik, h((req, res) => {
  const number = String(req.body?.number || '').trim();
  if (!/^[A-Za-z0-9-]{1,10}$/.test(number)) throw bad('Nomor kamar tidak valid.');
  if (db.prepare('SELECT 1 FROM rooms WHERE number = ?').get(number)) throw bad('Nomor kamar sudah ada.', 409);
  db.prepare('INSERT INTO rooms(number,floor,typeId,maintenance,note) VALUES(?,?,?,0,?)')
    .run(number, Number(req.body.floor) || 1, req.body.typeId ? Number(req.body.typeId) : null, '');
  res.status(201).json({ ok: true });
}));
app.put('/api/rooms/:number', h((req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE number = ?').get(req.params.number);
  if (!room) throw bad('Kamar tidak ditemukan.', 404);
  const b = req.body || {};
  if ((b.typeId !== undefined || b.floor !== undefined) && req.user.role !== 'pemilik') throw bad('Hanya pemilik yang dapat mengubah tipe/lantai kamar.', 403);
  db.prepare('UPDATE rooms SET typeId = ?, floor = ?, maintenance = ?, note = ? WHERE id = ?').run(
    b.typeId !== undefined ? (b.typeId ? Number(b.typeId) : null) : room.typeId,
    b.floor !== undefined ? Number(b.floor) || 1 : room.floor,
    b.maintenance !== undefined ? (b.maintenance ? 1 : 0) : room.maintenance,
    b.note !== undefined ? String(b.note) : room.note,
    room.id,
  );
  res.json(repo.roomStatus(room.number));
}));
app.delete('/api/rooms/:number', pemilik, h((req, res) => {
  if (db.prepare('SELECT 1 FROM residents WHERE room = ?').get(req.params.number)) throw bad('Kamar masih berpenghuni.', 409);
  db.prepare('DELETE FROM rooms WHERE number = ?').run(req.params.number);
  res.json({ ok: true });
}));

// ── Residents ──
app.get('/api/residents', h((req, res) => res.json(repo.listResidents({ q: req.query.q, filter: req.query.filter }))));
app.get('/api/residents/:id', h((req, res) => {
  const d = repo.residentDetail(req.params.id);
  if (!d) throw bad('Penghuni tidak ditemukan.', 404);
  res.json(d);
}));
app.post('/api/residents', h((req, res) => {
  const b = req.body || {};
  if (!b.name || !b.room) throw bad('Nama dan kamar wajib diisi.');
  const created = repo.createResident({ ...b, ktpPhoto: saveImage(b.ktpPhoto, 'ktp'), selfiePhoto: saveImage(b.selfiePhoto, 'selfie') });
  kickJobs();
  res.status(201).json(created);
}));
app.put('/api/residents/:id', h((req, res) => {
  const b = { ...(req.body || {}) };
  if (b.rent !== undefined && req.user.role !== 'pemilik') throw bad('Hanya pemilik yang dapat mengubah harga sewa khusus.', 403);
  const updated = repo.updateResident(req.params.id, b);
  if (!updated) throw bad('Penghuni tidak ditemukan.', 404);
  kickJobs();
  res.json(updated);
}));
// Keluar langsung oleh admin (tanpa pengajuan dari penghuni).
app.post('/api/residents/:id/checkout', h((req, res) => {
  const b = req.body || {};
  const result = billing.checkoutResident(req.params.id, { exitDate: b.exitDate, alasan: b.alasan, star: b.star, feedback: b.feedback });
  if (!result) throw bad('Penghuni tidak ditemukan.', 404);
  kickJobs();
  res.json({ ok: true, ...result });
}));
app.post('/api/residents/:id/apply-promo', h((req, res) => {
  try {
    const inv = billing.applyPromo(req.params.id, req.body?.promoId);
    kickJobs();
    res.json(billing.decorateInvoice(inv));
  } catch (e) {
    throw bad(e.message);
  }
}));

// ── Applications ──
app.get('/api/applications', h((req, res) => res.json(repo.listApplications(req.query.status))));
app.post('/api/applications/:id/approve', h((req, res) => {
  const room = String(req.body?.room || '').trim();
  if (!room) throw bad('Nomor kamar wajib dipilih.');
  const resident = repo.approveApplication(req.params.id, {
    room, dueDay: req.body.dueDay, rent: req.user.role === 'pemilik' ? req.body.rent : undefined,
    stayMonths: req.body.stayMonths === undefined ? undefined : parseStayMonths(req.body.stayMonths),
  });
  kickJobs();
  res.json({ ok: true, resident });
}));
app.post('/api/applications/:id/reject', h((req, res) => {
  const info = db.prepare("UPDATE applications SET status = 'rejected', reason = ? WHERE id = ? AND status = 'pending'")
    .run(String(req.body?.reason || ''), Number(req.params.id));
  if (!info.changes) throw bad('Pendaftaran tidak ditemukan atau sudah diproses.', 404);
  res.json({ ok: true });
}));

// ── Exit requests ──
app.get('/api/exit-requests', h((req, res) => res.json(repo.listExitRequests(req.query.status))));
app.post('/api/exit-requests/:id/approve', h((req, res) => {
  const result = repo.approveExit(req.params.id, { exitDate: req.body?.exitDate, adminNote: req.body?.adminNote });
  kickJobs();
  res.json({ ok: true, ...result });
}));
app.post('/api/exit-requests/:id/reject', h((req, res) => {
  const info = db.prepare("UPDATE exit_requests SET status = 'rejected', adminNote = ?, processedAt = ? WHERE id = ? AND status = 'pending'")
    .run(String(req.body?.adminNote || ''), nowStamp(), Number(req.params.id));
  if (!info.changes) throw bad('Pengajuan tidak ditemukan atau sudah diproses.', 404);
  res.json({ ok: true });
}));

// ── Invoices ──
app.get('/api/invoices', h((req, res) => {
  const { state = 'all', kind = 'all', residentId, month } = req.query;
  const today = todayISO();
  let rows = db.prepare('SELECT * FROM invoices ORDER BY dueDate DESC, id DESC').all().map((i) => billing.decorateInvoice(i, today));
  if (residentId) rows = rows.filter((i) => i.residentId === Number(residentId));
  if (kind !== 'all') rows = rows.filter((i) => i.kind === kind);
  if (month) rows = rows.filter((i) => i.dueDate.startsWith(month));
  if (state === 'open') rows = rows.filter((i) => i.status === 'unpaid' || i.status === 'menunggu');
  else if (state !== 'all') rows = rows.filter((i) => i.state === state);
  res.json(rows);
}));
app.post('/api/invoices/generate', h((_req, res) => {
  const created = billing.generateAll();
  kickJobs();
  res.json({ created });
}));
app.post('/api/invoices/:id/pay', h((req, res) => {
  const inv = billing.markPaid(req.params.id, { method: req.body?.method || 'Tunai', paidAt: req.body?.paidAt });
  if (!inv) throw bad('Invoice tidak ditemukan atau sudah dibatalkan.', 404);
  kickJobs();
  res.json(billing.decorateInvoice(inv));
}));
app.post('/api/invoices/:id/reject', h((req, res) => {
  const inv = billing.rejectConfirmation(req.params.id);
  if (!inv) throw bad('Invoice tidak dalam status menunggu.', 400);
  res.json(billing.decorateInvoice(inv));
}));
app.post('/api/invoices/:id/void', h((req, res) => {
  const inv = billing.voidInvoice(req.params.id);
  if (!inv) throw bad('Invoice tidak ditemukan atau sudah lunas.', 400);
  kickJobs();
  res.json(billing.decorateInvoice(inv));
}));
app.post('/api/invoices/:id/send', h(async (req, res) => {
  const inv = billing.getInvoice(req.params.id);
  if (!inv) throw bad('Invoice tidak ditemukan.', 404);
  const result = await notify.sendInvoice(inv, { kind: req.body?.kind === 'reminder' ? 'reminder' : 'invoice' });
  if (!result.ok) throw bad(`Gagal mengirim: ${result.error}`, 502);
  res.json(result);
}));

// Kalender penagihan (per bulan).
app.get('/api/calendar', h((req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayISO().slice(0, 7);
  const today = todayISO();
  const rows = db.prepare("SELECT * FROM invoices WHERE status != 'void' AND substr(dueDate,1,7) = ? ORDER BY dueDate").all(month)
    .map((i) => billing.decorateInvoice(i, today));
  res.json({ month, invoices: rows, gcal: gcal.gcalStatus() });
}));

// ── Promos ──
app.get('/api/promos', h((_req, res) => {
  const today = todayISO();
  res.json(db.prepare('SELECT * FROM promos ORDER BY id DESC').all().map((p) => ({
    ...p, active: Boolean(p.active), open: billing.promoIsOpen(p, today),
    used: db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE promoId = ? AND status != 'void'").get(p.id).n,
  })));
}));
function promoBody(b) {
  const name = String(b.name || '').trim();
  const payMonths = Number(b.payMonths); const freeMonths = Number(b.freeMonths);
  if (!name) throw bad('Nama promo wajib diisi.');
  if (!(payMonths >= 1 && payMonths <= 24)) throw bad('Bulan bayar harus 1–24.');
  if (!(freeMonths >= 0 && freeMonths <= 12)) throw bad('Bulan gratis harus 0–12.');
  if (b.startDate && b.endDate && b.endDate < b.startDate) throw bad('Tanggal berakhir harus setelah tanggal mulai.');
  return [name, payMonths, freeMonths, b.active ? 1 : 0, b.startDate || '', b.endDate || '', b.description || ''];
}
app.post('/api/promos', pemilik, h((req, res) => {
  const info = db.prepare('INSERT INTO promos(name,payMonths,freeMonths,active,startDate,endDate,description) VALUES(?,?,?,?,?,?,?)').run(...promoBody(req.body || {}));
  res.status(201).json({ id: info.lastInsertRowid });
}));
app.put('/api/promos/:id', pemilik, h((req, res) => {
  const info = db.prepare('UPDATE promos SET name=?,payMonths=?,freeMonths=?,active=?,startDate=?,endDate=?,description=? WHERE id=?')
    .run(...promoBody(req.body || {}), Number(req.params.id));
  if (!info.changes) throw bad('Promo tidak ditemukan.', 404);
  res.json({ ok: true });
}));
app.delete('/api/promos/:id', pemilik, h((req, res) => {
  db.prepare('DELETE FROM promos WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
}));

// ── Charges & denda ──
app.get('/api/charges', h((req, res) => {
  const rows = req.query.residentId
    ? db.prepare('SELECT c.*, r.name AS residentName, r.room FROM charges c JOIN residents r ON r.id = c.residentId WHERE c.residentId = ? ORDER BY c.id DESC').all(Number(req.query.residentId))
    : db.prepare('SELECT c.*, r.name AS residentName, r.room FROM charges c JOIN residents r ON r.id = c.residentId ORDER BY c.active DESC, c.id DESC').all();
  res.json(rows.map((c) => ({ ...c, recurring: Boolean(c.recurring), active: Boolean(c.active) })));
}));
app.post('/api/charges', h((req, res) => {
  const b = req.body || {};
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(b.residentId));
  if (!r) throw bad('Penghuni tidak ditemukan.');
  const amount = parseRp(b.amount);
  if (!String(b.name || '').trim()) throw bad('Nama charge/denda wajib diisi.');
  if (amount <= 0) throw bad('Nominal harus lebih dari 0.');
  if (!['charge', 'denda'].includes(b.kind)) throw bad('Jenis harus charge atau denda.');
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(b.startDate || '') ? b.startDate : todayISO();
  const billDay = Math.min(31, Math.max(1, Number(b.billDay) || Number(startDate.slice(8, 10))));
  const info = db.prepare(`INSERT INTO charges(residentId,kind,name,amount,recurring,billDay,startDate,endDate,active,createdAt)
    VALUES(?,?,?,?,?,?,?,?,1,?)`).run(r.id, b.kind, String(b.name).trim(), amount, b.recurring ? 1 : 0, billDay, startDate, b.endDate || '', nowStamp());
  billing.generateForResident(r.id);
  logActivity('warn', `${b.kind === 'denda' ? 'Denda' : 'Charge'} <strong>${String(b.name).trim()}</strong> ditambahkan untuk ${r.name} (kamar ${r.room})`);
  kickJobs();
  res.status(201).json({ id: info.lastInsertRowid });
}));
app.put('/api/charges/:id', h((req, res) => {
  const c = db.prepare('SELECT * FROM charges WHERE id = ?').get(Number(req.params.id));
  if (!c) throw bad('Charge tidak ditemukan.', 404);
  const b = req.body || {};
  db.prepare('UPDATE charges SET active = ?, endDate = ?, amount = ?, billDay = ? WHERE id = ?').run(
    b.active !== undefined ? (b.active ? 1 : 0) : c.active,
    b.endDate !== undefined ? b.endDate : c.endDate,
    b.amount !== undefined ? parseRp(b.amount) : c.amount,
    b.billDay !== undefined ? Math.min(31, Math.max(1, Number(b.billDay))) : c.billDay,
    c.id,
  );
  if (b.active) billing.generateForResident(c.residentId);
  res.json({ ok: true });
}));

// ── Expenses (manual & scan struk) ──
app.get('/api/expenses', h((req, res) => {
  const month = req.query.month;
  const rows = month
    ? db.prepare('SELECT * FROM expenses WHERE substr(date,1,7) = ? ORDER BY date DESC, id DESC').all(month)
    : db.prepare('SELECT * FROM expenses ORDER BY date DESC, id DESC').all();
  res.json(rows);
}));
app.post('/api/expenses', h((req, res) => {
  const b = req.body || {};
  const amount = parseRp(b.amount);
  if (!String(b.description || '').trim()) throw bad('Keterangan wajib diisi.');
  if (amount <= 0) throw bad('Nominal harus lebih dari 0.');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : todayISO();
  const photo = saveImage(b.receiptPhoto, 'struk');
  const info = db.prepare('INSERT INTO expenses(date,description,cat,amount,source,merchant,receiptPhoto,createdAt) VALUES(?,?,?,?,?,?,?,?)')
    .run(date, String(b.description).trim(), b.cat || 'Lainnya', amount, b.source === 'scan' ? 'scan' : 'manual', b.merchant || '', photo, nowStamp());
  res.status(201).json(db.prepare('SELECT * FROM expenses WHERE id = ?').get(info.lastInsertRowid));
}));
app.delete('/api/expenses/:id', h((req, res) => {
  db.prepare('DELETE FROM expenses WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
}));

// ── Violations (kategori custom + retensi 1 tahun) ──
app.get('/api/violation-categories', h((_req, res) => {
  res.json(db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM violations v WHERE v.categoryId = c.id) AS used
    FROM violation_categories c ORDER BY c.name`).all());
}));
app.post('/api/violation-categories', h((req, res) => {
  const name = String(req.body?.name || '').trim();
  if (!name) throw bad('Nama kategori wajib diisi.');
  if (db.prepare('SELECT 1 FROM violation_categories WHERE name = ?').get(name)) throw bad('Kategori sudah ada.', 409);
  const severity = ['ringan', 'sedang', 'berat'].includes(req.body.severity) ? req.body.severity : 'ringan';
  const sp = ['SP1', 'SP2', 'SP3'].includes(req.body.defaultSp) ? req.body.defaultSp : 'SP1';
  const info = db.prepare('INSERT INTO violation_categories(name,severity,defaultSp) VALUES(?,?,?)').run(name, severity, sp);
  res.status(201).json({ id: info.lastInsertRowid });
}));
app.delete('/api/violation-categories/:id', h((req, res) => {
  db.prepare('DELETE FROM violation_categories WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
}));
app.get('/api/violations', h((_req, res) => {
  const s = getSettings();
  const days = Number(s.violationRetentionDays || 365);
  res.json(db.prepare(`SELECT v.*, c.name AS categoryName, c.severity FROM violations v
      LEFT JOIN violation_categories c ON c.id = v.categoryId ORDER BY v.date DESC, v.id DESC`).all()
    .map((v) => ({ ...v, sent: Boolean(v.sent), expiresOn: addDays(v.createdAt.slice(0, 10), days) })));
}));
app.post('/api/violations', h((req, res) => {
  const b = req.body || {};
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(b.residentId));
  if (!r) throw bad('Pilih penghuni.');
  const cat = b.categoryId ? db.prepare('SELECT * FROM violation_categories WHERE id = ?').get(Number(b.categoryId)) : null;
  if (!cat) throw bad('Pilih kategori pelanggaran.');
  const sp = ['SP1', 'SP2', 'SP3'].includes(b.sp) ? b.sp : cat.defaultSp;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : todayISO();
  const info = db.prepare(`INSERT INTO violations(residentId,name,room,categoryId,description,date,sp,sent,createdAt)
    VALUES(?,?,?,?,?,?,?,0,?)`).run(r.id, r.name, r.room, cat.id, String(b.description || '').slice(0, 500), date, sp, nowStamp());
  logActivity('warn', `Pelanggaran <strong>${cat.name}</strong> (${sp}) dicatat untuk ${r.name}`);
  res.status(201).json({ id: info.lastInsertRowid });
}));
app.post('/api/violations/:id/send', h(async (req, res) => {
  const v = db.prepare(`SELECT v.*, c.name AS categoryName, r.wa FROM violations v
    LEFT JOIN violation_categories c ON c.id = v.categoryId LEFT JOIN residents r ON r.id = v.residentId WHERE v.id = ?`).get(Number(req.params.id));
  if (!v) throw bad('Pelanggaran tidak ditemukan.', 404);
  const s = getSettings();
  const message = `Halo ${v.name}, ini Surat Peringatan *${v.sp}* dari ${s.namaKos}.\nPelanggaran: ${v.categoryName}${v.description ? ` — ${v.description}` : ''}\nTanggal: ${fmtDate(v.date)}\nMohon tidak mengulanginya. Terima kasih.`;
  let result = { ok: true, via: 'link', link: `https://wa.me/${waNumber(v.wa)}?text=${encodeURIComponent(message)}` };
  if (notify.gatewayReady(s)) {
    result = { ...(await notify.sendWhatsApp(v.wa, message, s)), via: 'gateway' };
    if (!result.ok) throw bad(`Gagal mengirim: ${result.error}`, 502);
  }
  db.prepare('UPDATE violations SET sent = 1 WHERE id = ?').run(v.id);
  res.json(result);
}));
app.delete('/api/violations/:id', h((req, res) => {
  db.prepare('DELETE FROM violations WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
}));

// ── Mantan ──
app.get('/api/mantan', h((_req, res) => res.json(db.prepare('SELECT * FROM mantan ORDER BY keluar DESC').all())));

// ── Notifikasi WhatsApp ──
app.get('/api/notifications', h((_req, res) => res.json({ ready: notify.gatewayReady(), log: notify.recentNotifications() })));
app.post('/api/notifications/test', pemilik, h(async (req, res) => {
  const s = getSettings();
  const target = req.body?.target || s.wa;
  const result = await notify.sendWhatsApp(target, `✅ Tes notifikasi InDeKos berhasil (${new Date().toLocaleString('id-ID')}).`);
  // Dicatat juga agar tampil di riwayat notifikasi (membantu diagnosa gateway).
  notify.log(null, 'tes', waNumber(target), result);
  if (!result.ok) throw bad(`Gagal: ${result.error}${result.response ? ` — respons ${s.waProvider}: ${result.response}` : ''}`, 502);
  res.json({ ...result, target: waNumber(target), provider: s.waProvider });
}));
app.post('/api/notifications/run', h(async (_req, res) => {
  const [auto, rem] = [await notify.runAutoSend(), await notify.runReminders()];
  res.json({ invoices: auto, reminders: rem });
}));

// ── Google Calendar ──
app.get('/api/gcal/status', (_req, res) => res.json(gcal.gcalStatus()));
app.get('/api/gcal/auth-url', pemilik, h((req, res) => {
  if (!gcal.gcalConfigured()) throw bad('Set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET di server terlebih dahulu.', 503);
  res.json({ url: gcal.authUrl(signToken({ typ: 'gcal', sub: req.user.id }, 10 * 60 * 1000)) });
}));
app.post('/api/gcal/sync', h(async (_req, res) => res.json(await gcal.syncInvoices(500))));
app.post('/api/gcal/disconnect', pemilik, h(async (_req, res) => {
  await gcal.disconnect();
  res.json({ ok: true });
}));

// ── AI Asisten (insight per menu + tanya jawab) ──
app.get('/api/ai/status', (_req, res) => res.json(ai.aiStatus()));
app.get('/api/ai/insights', h((req, res) => {
  if (!ai.aiConfig().enabled) throw bad('Fitur AI dimatikan di Pengaturan.', 403);
  res.json(insightsFor(String(req.query.scope || 'ai'), req.query.id, undefined, req.user));
}));
// Batas wajar per pengguna agar biaya API terkendali.
const aiHits = new Map();
function aiRateLimit(req, res, next) {
  const now = Date.now();
  const list = (aiHits.get(req.user.id) || []).filter((t) => now - t < 60_000);
  if (list.length >= 20) return res.status(429).json({ error: 'Terlalu banyak pertanyaan. Tunggu sebentar lalu coba lagi.' });
  list.push(now);
  aiHits.set(req.user.id, list);
  next();
}
app.post('/api/ai/chat', aiRateLimit, h(async (req, res) => {
  const b = req.body || {};
  res.json(await ai.chat({ scope: b.scope, id: b.id, message: b.message, history: b.history, viewer: req.user }));
}));
app.post('/api/ai/test', pemilik, h(async (_req, res) => res.json(await ai.testConnection())));

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));

// ── Serve the built client (production) ──
const distDir = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// ═════════════ SCHEDULER ═════════════
// Tiap 30 menit: terbitkan invoice, hapus pelanggaran > 1 tahun,
// kirim invoice/reminder WhatsApp, sinkron Google Calendar.
async function runJobs() {
  try {
    const created = billing.generateAll();
    const purged = repo.purgeOldViolations();
    const sent = await notify.runAutoSend();
    const reminded = await notify.runReminders();
    const synced = await gcal.syncInvoices();
    if (created || purged || sent.sent || reminded.sent || synced.created) {
      console.log(`[jobs] invoice baru ${created} · pelanggaran dihapus ${purged} · WA invoice ${sent.sent || 0} · reminder ${reminded.sent || 0} · gcal +${synced.created || 0}`);
    }
  } catch (e) {
    console.error('[jobs]', e.message);
  }
}

billing.initBilling();
app.listen(PORT, () => {
  console.log(`InDeKos API listening on http://localhost:${PORT}`);
  if (!process.env.DISABLE_SCHEDULER) {
    setTimeout(runJobs, 3000);
    setInterval(runJobs, 30 * 60 * 1000);
  }
});
