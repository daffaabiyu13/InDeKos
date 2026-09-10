// ─────────────────────────────────────────────────────────────
// InDeKos API server (Express)
// Persistence: SQLite (see store.js). Read-only analytics mocks
// (revenues, transactions, expCats, insights, preds, aiKnowledge)
// still come from data.js.
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';
import * as store from './store.js';
import { generateDynamicQris, isValidQris } from './qris.js';
import { revenues, transactions, expCats, insights, preds, aiKnowledge } from './data.js';

// ── Rupiah helpers ──
const parseRupiah = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
const formatRupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
// Nominal unik per kamar (ekor 3 digit) untuk memudahkan rekonsiliasi.
const uniqueAmount = (base, room) => base + (parseInt(String(room).replace(/\D/g, ''), 10) % 1000);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ── Health ──
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'indekos-api', db: 'sqlite', ts: new Date().toISOString() });
});

// ── Settings ──
app.get('/api/settings', (_req, res) => res.json(store.getSettings()));

app.put('/api/settings', (req, res) => {
  res.json(store.updateSettings(req.body || {}));
});

// ── Residents (full CRUD) ──
app.get('/api/residents', (req, res) => {
  const { q = '', filter = 'all' } = req.query;
  res.json(store.listResidents({ q, filter }));
});

app.post('/api/residents', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.room) {
    return res.status(400).json({ error: 'Nama dan kamar wajib diisi.' });
  }
  res.status(201).json(store.addResident(body));
});

app.put('/api/residents/:id', (req, res) => {
  const updated = store.updateResident(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Penghuni tidak ditemukan.' });
  res.json(updated);
});

// Check-out: move an active resident into the "mantan" (alumni) archive.
app.post('/api/residents/:id/checkout', (req, res) => {
  const record = store.checkoutResident(req.params.id, req.body || {});
  if (!record) return res.status(404).json({ error: 'Penghuni tidak ditemukan.' });
  res.json({ ok: true, mantan: record });
});

app.delete('/api/residents/:id', (req, res) => {
  if (!store.deleteResident(req.params.id)) return res.status(404).json({ error: 'Penghuni tidak ditemukan.' });
  res.json({ ok: true });
});

// ── Applications (pendaftaran) ──
// Public submit (from the prospective-tenant form).
app.post('/api/applications', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.wa) {
    return res.status(400).json({ error: 'Nama dan nomor WhatsApp wajib diisi.' });
  }
  const id = store.addApplication(b);
  res.status(201).json({ ok: true, id });
});

// Admin: list applications (optionally filter by status).
app.get('/api/applications', (req, res) => {
  res.json(store.listApplications(req.query.status));
});

// Admin: approve an application and assign a room → becomes an active resident.
app.post('/api/applications/:id/approve', (req, res) => {
  const a = store.getApplication(req.params.id);
  if (!a) return res.status(404).json({ error: 'Pendaftaran tidak ditemukan.' });
  if (a.status !== 'pending') return res.status(400).json({ error: 'Pendaftaran sudah diproses.' });

  const room = String(req.body?.room || '').replace(/\D/g, '');
  if (!room) return res.status(400).json({ error: 'Nomor kamar wajib dipilih.' });

  const target = store.buildRooms().find((r) => String(r.n) === room);
  if (!target) return res.status(400).json({ error: `Kamar ${room} tidak tersedia.` });
  if (target.status === 'oc') return res.status(409).json({ error: `Kamar ${room} sudah terisi.` });

  const resident = store.approveApplication(a, room);
  res.json({ ok: true, resident });
});

// Admin: reject an application.
app.post('/api/applications/:id/reject', (req, res) => {
  const a = store.getApplication(req.params.id);
  if (!a) return res.status(404).json({ error: 'Pendaftaran tidak ditemukan.' });
  store.rejectApplication(a.id, req.body?.reason || '');
  res.json({ ok: true });
});

// ── Rooms ──
app.get('/api/rooms', (_req, res) => res.json(store.buildRooms()));

// ── Payments ──
app.get('/api/payments', (_req, res) => res.json(store.listPayments()));

app.post('/api/payments/mark-paid', (req, res) => {
  const { room, method = 'Tunai', date } = req.body || {};
  const p = store.markPaid(room, method, date);
  if (!p) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
  res.json(p);
});

// ── Public payment (Jalur A: QRIS statis → dinamis + konfirmasi semi-otomatis) ──

// Tenant mencari tagihannya (tanpa login) dan menerima QRIS dinamis.
app.get('/api/payments/bill', async (req, res) => {
  const { name = '', room = '' } = req.query;
  if (!room) return res.status(400).json({ error: 'Nomor kamar wajib diisi.' });

  const bill = store.getBill(room, name);
  if (!bill) return res.status(404).json({ error: 'Tagihan tidak ditemukan. Periksa nama & nomor kamar.' });

  const s = store.getSettings();
  const base = parseRupiah(bill.amount);
  const amountValue = uniqueAmount(base, room);

  const out = {
    name: bill.name,
    room: bill.room,
    period: bill.period,
    status: bill.status, // lunas | tunggak | menunggu
    baseAmount: formatRupiah(base),
    amount: formatRupiah(amountValue),
    amountValue,
    paymentMode: s.paymentMode || 'manual',
    kosName: s.namaKos,
    qrImage: null,
  };

  // Bila admin sudah mengonfigurasi QRIS statis, buat QR dinamis ber-nominal.
  if (out.status !== 'lunas' && (s.paymentMode === 'qris_static') && isValidQris(s.qrisString)) {
    try {
      const payload = generateDynamicQris(s.qrisString, amountValue);
      out.qrImage = await QRCode.toDataURL(payload, { margin: 1, width: 320 });
    } catch {
      out.qrImage = null;
    }
  }
  res.json(out);
});

// Tenant menyatakan sudah membayar → masuk antrian konfirmasi admin.
app.post('/api/payments/confirm', (req, res) => {
  const { room, method = 'QRIS', note = '' } = req.body || {};
  const p = store.confirmPayment(room, { method, note });
  if (!p) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
  res.json({ ok: true });
});

// Admin: daftar pembayaran menunggu konfirmasi.
app.get('/api/payments/pending', (_req, res) => res.json(store.listPendingPayments()));

// Admin: verifikasi → tercatat lunas.
app.post('/api/payments/verify', (req, res) => {
  const { room, method = 'QRIS' } = req.body || {};
  const p = store.markPaid(room, method);
  if (!p) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
  res.json(p);
});

// Admin: tolak klaim pembayaran → kembali menunggak.
app.post('/api/payments/reject-confirm', (req, res) => {
  const p = store.rejectConfirm(req.body?.room);
  if (!p) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
  res.json({ ok: true });
});

// Webhook untuk Jalur B (Midtrans). Aktif hanya bila Server Key sudah diisi.
// Mencocokkan pembayaran berdasarkan NOMINAL UNIK lalu menandai lunas otomatis.
// Catatan: verifikasi signature Midtrans ditambahkan saat integrasi penuh.
app.post('/api/payments/webhook', (req, res) => {
  const s = store.getSettings();
  if (!s.midtransServerKey) {
    return res.status(503).json({ error: 'Midtrans belum dikonfigurasi.' });
  }
  const body = req.body || {};
  const status = body.transaction_status;
  const gross = Math.round(Number(body.gross_amount) || 0);
  if (!['settlement', 'capture'].includes(status)) {
    return res.json({ ok: true, ignored: status });
  }
  const match = store.listPayments().find(
    (p) => p.status !== 'lunas' && uniqueAmount(parseRupiah(p.amount), p.room) === gross,
  );
  if (!match) return res.status(404).json({ error: 'Tagihan cocok tidak ditemukan.' });
  const paid = store.markPaid(match.room, 'QRIS (Midtrans)');
  res.json({ ok: true, room: paid.room });
});

// ── Expenses ──
app.get('/api/expenses', (_req, res) => res.json(store.listExpenses()));

app.post('/api/expenses', (req, res) => {
  const body = req.body || {};
  if (!body.desc || !body.amount) {
    return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi.' });
  }
  res.status(201).json(store.addExpense(body));
});

// ── Violations ──
app.get('/api/violations', (_req, res) => res.json(store.listViolations()));

app.post('/api/violations/send', (req, res) => {
  const { name, date } = req.body || {};
  const v = store.sendViolation(name, date);
  if (!v) return res.status(404).json({ error: 'Pelanggaran tidak ditemukan.' });
  res.json(v);
});

app.post('/api/violations', (req, res) => {
  res.status(201).json(store.addViolation(req.body || {}));
});

// ── Former residents ──
app.get('/api/mantan', (_req, res) => res.json(store.listMantan()));

// ── Finance / dashboard aggregates ──
app.get('/api/finance', (_req, res) => {
  res.json({ revenues, transactions, expCats });
});

app.get('/api/dashboard', (_req, res) => {
  const rooms = store.buildRooms();
  const occupied = rooms.filter((r) => r.status === 'oc').length;
  const available = rooms.filter((r) => r.status === 'av').length;
  const residents = store.listResidents();
  const tunggakan = residents
    .filter((r) => r.status === 'tunggak')
    .map((r) => ({ name: r.name, room: r.room, amount: 'Rp 1.300.000', due: '01/09/2026' }));
  res.json({
    stats: {
      activeResidents: residents.length,
      availableRooms: available,
      occupiedRooms: occupied,
      totalRooms: rooms.length,
      incomeLabel: 'Rp 18,5 Jt',
      arrears: tunggakan.length,
    },
    revenues,
    activities: store.listActivities(),
    tunggakan,
    occupancy: {
      terisi: occupied,
      tersedia: available,
      perbaikan: 0,
      pct: rooms.length ? Math.round((occupied / rooms.length) * 100) : 0,
    },
  });
});

// ── AI insight / chat (mock) ──
app.get('/api/ai/insights', (_req, res) => {
  res.json({ insights, preds });
});

app.post('/api/ai/chat', (req, res) => {
  const q = String(req.body?.message || '').toLowerCase();
  let reply = aiKnowledge.default;
  for (const [k, v] of Object.entries(aiKnowledge)) {
    if (k !== 'default' && q.includes(k)) { reply = v; break; }
  }
  res.json({ reply });
});

// ── Serve the built client (production) ──
// When client/dist exists, serve it and fall back to index.html so
// client-side routes (BrowserRouter) resolve on a full page load.
const distDir = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`InDeKos API listening on http://localhost:${PORT}`);
});
