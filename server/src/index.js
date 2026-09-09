// ─────────────────────────────────────────────────────────────
// InDeKos API server (Express)
// ─────────────────────────────────────────────────────────────
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as db from './data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ── Health ──
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'indekos-api', ts: new Date().toISOString() });
});

// ── Settings ──
app.get('/api/settings', (_req, res) => res.json(db.settings));

app.put('/api/settings', (req, res) => {
  Object.assign(db.settings, req.body || {});
  res.json(db.settings);
});

// ── Residents (full CRUD) ──
app.get('/api/residents', (req, res) => {
  const { q = '', filter = 'all' } = req.query;
  const needle = String(q).toLowerCase();
  let list = db.residents.filter(
    (r) => r.name.toLowerCase().includes(needle) || r.room.includes(needle),
  );
  if (filter === 'lunas') list = list.filter((r) => r.status === 'lunas');
  else if (filter === 'tunggak') list = list.filter((r) => r.status === 'tunggak');
  else if (filter === 'mhs') list = list.filter((r) => r.job.toLowerCase().includes('mahasis'));
  res.json(list);
});

app.post('/api/residents', (req, res) => {
  const body = req.body || {};
  if (!body.name || !body.room) {
    return res.status(400).json({ error: 'Nama dan kamar wajib diisi.' });
  }
  const id = db.residents.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const resident = {
    id,
    name: body.name,
    room: String(body.room).replace(/\D/g, '') || String(body.room),
    masuk: body.masuk || new Date().toLocaleDateString('id-ID'),
    status: body.status || 'lunas',
    job: body.job || 'Lainnya',
    wa: body.wa || '',
    uni: body.uni || '',
  };
  db.residents.push(resident);
  res.status(201).json(resident);
});

app.put('/api/residents/:id', (req, res) => {
  const r = db.residents.find((x) => x.id === Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Penghuni tidak ditemukan.' });
  Object.assign(r, req.body || {});
  res.json(r);
});

// Check-out: move an active resident into the "mantan" (alumni) archive.
app.post('/api/residents/:id/checkout', (req, res) => {
  const idx = db.residents.findIndex((x) => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Penghuni tidak ditemukan.' });
  const [r] = db.residents.splice(idx, 1);
  const record = {
    name: r.name,
    room: r.room,
    masuk: r.masuk,
    keluar: req.body?.keluar || new Date().toLocaleDateString('id-ID'),
    lama: req.body?.lama || '—',
    alasan: req.body?.alasan || 'Keluar',
    star: req.body?.star || 5,
  };
  db.mantan.unshift(record);
  res.json({ ok: true, mantan: record });
});

app.delete('/api/residents/:id', (req, res) => {
  const idx = db.residents.findIndex((x) => x.id === Number(req.params.id));
  if (idx === -1) return res.status(404).json({ error: 'Penghuni tidak ditemukan.' });
  db.residents.splice(idx, 1);
  res.json({ ok: true });
});

// ── Applications (pendaftaran) ──
// Public submit (from the prospective-tenant form).
app.post('/api/applications', (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.wa) {
    return res.status(400).json({ error: 'Nama dan nomor WhatsApp wajib diisi.' });
  }
  const id = db.applications.reduce((m, a) => Math.max(m, a.id), 0) + 1;
  const app_ = {
    id,
    name: b.name,
    tempatLahir: b.tempatLahir || '',
    tglLahir: b.tglLahir || '',
    alamat: b.alamat || '',
    nik: b.nik || '',
    wa: b.wa,
    job: b.job || 'Lainnya',
    uni: b.uni || '',
    wali: b.wali || '',
    waliStatus: b.waliStatus || '',
    waWali: b.waWali || '',
    sumber: b.sumber || '',
    masuk: b.masuk || '',
    status: 'pending',
    createdAt: new Date().toLocaleDateString('id-ID'),
  };
  db.applications.push(app_);
  res.status(201).json({ ok: true, id });
});

// Admin: list applications (optionally filter by status).
app.get('/api/applications', (req, res) => {
  const { status } = req.query;
  const list = status ? db.applications.filter((a) => a.status === status) : db.applications;
  res.json(list);
});

// Admin: approve an application and assign a room → becomes an active resident.
app.post('/api/applications/:id/approve', (req, res) => {
  const a = db.applications.find((x) => x.id === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Pendaftaran tidak ditemukan.' });
  if (a.status !== 'pending') return res.status(400).json({ error: 'Pendaftaran sudah diproses.' });

  const room = String(req.body?.room || '').replace(/\D/g, '');
  if (!room) return res.status(400).json({ error: 'Nomor kamar wajib dipilih.' });

  const rooms = db.buildRooms();
  const target = rooms.find((r) => String(r.n) === room);
  if (!target) return res.status(400).json({ error: `Kamar ${room} tidak tersedia.` });
  if (target.status === 'oc') return res.status(409).json({ error: `Kamar ${room} sudah terisi.` });

  const id = db.residents.reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const resident = {
    id,
    name: a.name,
    room,
    masuk: a.masuk || new Date().toLocaleDateString('id-ID'),
    status: 'tunggak', // penghuni baru belum membayar sewa pertama
    job: a.job,
    wa: a.wa,
    uni: a.uni,
  };
  db.residents.push(resident);

  // Buat tagihan awal & catat aktivitas.
  db.payments.push({
    name: a.name, room, period: 'Sep 2026', amount: 'Rp 1.300.000',
    method: '—', date: '—', status: 'tunggak',
  });
  db.activities.unshift({
    c: 'jade',
    t: `<strong>${a.name}</strong> disetujui & ditempatkan di kamar ${room}`,
    ts: 'Baru saja',
  });

  a.status = 'approved';
  a.room = room;
  res.json({ ok: true, resident });
});

// Admin: reject an application.
app.post('/api/applications/:id/reject', (req, res) => {
  const a = db.applications.find((x) => x.id === Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Pendaftaran tidak ditemukan.' });
  a.status = 'rejected';
  a.reason = req.body?.reason || '';
  res.json({ ok: true });
});

// ── Rooms ──
app.get('/api/rooms', (_req, res) => res.json(db.buildRooms()));

// ── Payments ──
app.get('/api/payments', (_req, res) => res.json(db.payments));

app.post('/api/payments/mark-paid', (req, res) => {
  const { room, method = 'Tunai', date } = req.body || {};
  const p = db.payments.find((x) => x.room === String(room));
  if (!p) return res.status(404).json({ error: 'Tagihan tidak ditemukan.' });
  p.status = 'lunas';
  p.method = method;
  p.date = date || new Date().toLocaleDateString('id-ID');
  const r = db.residents.find((x) => x.room === String(room));
  if (r) r.status = 'lunas';
  res.json(p);
});

// ── Expenses ──
app.get('/api/expenses', (_req, res) => res.json(db.expenses));

app.post('/api/expenses', (req, res) => {
  const body = req.body || {};
  if (!body.desc || !body.amount) {
    return res.status(400).json({ error: 'Keterangan dan jumlah wajib diisi.' });
  }
  const expense = {
    date: body.date || new Date().toLocaleDateString('id-ID'),
    desc: body.desc,
    cat: body.cat || 'Lainnya',
    amount: body.amount,
  };
  db.expenses.unshift(expense);
  res.status(201).json(expense);
});

// ── Violations ──
app.get('/api/violations', (_req, res) => res.json(db.violations));

app.post('/api/violations/send', (req, res) => {
  const { name, date } = req.body || {};
  const v = db.violations.find((x) => x.name === name && x.date === date);
  if (!v) return res.status(404).json({ error: 'Pelanggaran tidak ditemukan.' });
  v.sent = true;
  res.json(v);
});

app.post('/api/violations', (req, res) => {
  const body = req.body || {};
  const v = {
    name: body.name || '',
    room: body.room || '',
    desc: body.desc || '',
    date: body.date || new Date().toLocaleDateString('id-ID'),
    sp: body.sp || 'SP1',
    sent: false,
  };
  db.violations.unshift(v);
  res.status(201).json(v);
});

// ── Former residents ──
app.get('/api/mantan', (_req, res) => res.json(db.mantan));

// ── Finance / dashboard aggregates ──
app.get('/api/finance', (_req, res) => {
  res.json({
    revenues: db.revenues,
    transactions: db.transactions,
    expCats: db.expCats,
  });
});

app.get('/api/dashboard', (_req, res) => {
  const rooms = db.buildRooms();
  const occupied = rooms.filter((r) => r.status === 'oc').length;
  const available = rooms.filter((r) => r.status === 'av').length;
  const tunggakan = db.residents
    .filter((r) => r.status === 'tunggak')
    .map((r) => ({ name: r.name, room: r.room, amount: 'Rp 1.300.000', due: '01/09/2026' }));
  res.json({
    stats: {
      activeResidents: db.residents.length,
      availableRooms: available,
      occupiedRooms: occupied,
      totalRooms: rooms.length,
      incomeLabel: 'Rp 18,5 Jt',
      arrears: tunggakan.length,
    },
    revenues: db.revenues,
    activities: db.activities,
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
  res.json({ insights: db.insights, preds: db.preds });
});

app.post('/api/ai/chat', (req, res) => {
  const q = String(req.body?.message || '').toLowerCase();
  let reply = db.aiKnowledge.default;
  for (const [k, v] of Object.entries(db.aiKnowledge)) {
    if (k !== 'default' && q.includes(k)) {
      reply = v;
      break;
    }
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
