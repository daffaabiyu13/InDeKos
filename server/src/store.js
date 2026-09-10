// ─────────────────────────────────────────────────────────────
// InDeKos — persistence layer (SQLite via built-in node:sqlite)
//
// Replaces the previous in-memory store. Mutable entities
// (settings, residents, applications, payments, expenses,
// violations, mantan, activities) are persisted to a SQLite file
// so data survives server restarts. Read-only analytics mocks
// (revenues, transactions, etc.) still live in data.js.
// ─────────────────────────────────────────────────────────────
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as seed from './data.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// DB_PATH can be ':memory:' (tests) or a custom file path.
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/indekos.db');
if (DB_PATH !== ':memory:') {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS residents (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL,
    room   TEXT NOT NULL,
    masuk  TEXT,
    status TEXT DEFAULT 'lunas',
    job    TEXT,
    wa     TEXT,
    uni    TEXT
  );
  CREATE TABLE IF NOT EXISTS applications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    tempatLahir TEXT, tglLahir TEXT, alamat TEXT, nik TEXT,
    wa          TEXT NOT NULL,
    job         TEXT, uni TEXT, wali TEXT, waliStatus TEXT, waWali TEXT,
    sumber      TEXT, masuk TEXT,
    status      TEXT DEFAULT 'pending',
    reason      TEXT DEFAULT '',
    room        TEXT DEFAULT '',
    createdAt   TEXT
  );
  CREATE TABLE IF NOT EXISTS payments (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT, room TEXT, period TEXT, amount TEXT,
    method TEXT, date TEXT, status TEXT
  );
  CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT, description TEXT, cat TEXT, amount TEXT
  );
  CREATE TABLE IF NOT EXISTS violations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT, room TEXT, description TEXT, date TEXT, sp TEXT,
    sent        INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS mantan (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT, room TEXT, masuk TEXT, keluar TEXT, lama TEXT, alasan TEXT,
    star   INTEGER
  );
  CREATE TABLE IF NOT EXISTS activities (
    id  INTEGER PRIMARY KEY AUTOINCREMENT,
    c   TEXT, t TEXT, ts TEXT
  );
`);

// Lightweight migrations: add columns introduced after initial release.
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
ensureColumn('payments', 'note', "note TEXT DEFAULT ''");
ensureColumn('payments', 'confirmedAt', "confirmedAt TEXT DEFAULT ''");

// node:sqlite's DatabaseSync has no .transaction() helper (unlike
// better-sqlite3), so wrap units of work in BEGIN/COMMIT manually.
function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// ── Seeding (only when a table is empty) ──
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

function seedAll() {
  if (count('settings') === 0) {
    const ins = db.prepare('INSERT INTO settings(key, value) VALUES(?, ?)');
    for (const [k, v] of Object.entries(seed.settings)) ins.run(k, JSON.stringify(v));
  }
  if (count('residents') === 0) {
    const ins = db.prepare('INSERT INTO residents(name,room,masuk,status,job,wa,uni) VALUES(?,?,?,?,?,?,?)');
    for (const r of seed.residents) ins.run(r.name, r.room, r.masuk, r.status, r.job, r.wa, r.uni);
  }
  if (count('applications') === 0) {
    const ins = db.prepare(`INSERT INTO applications
      (name,tempatLahir,tglLahir,alamat,nik,wa,job,uni,wali,waliStatus,waWali,sumber,masuk,status,createdAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const a of seed.applications) {
      ins.run(a.name, a.tempatLahir, a.tglLahir, a.alamat, a.nik, a.wa, a.job, a.uni,
        a.wali, a.waliStatus, a.waWali, a.sumber, a.masuk, a.status, a.createdAt);
    }
  }
  if (count('payments') === 0) {
    const ins = db.prepare('INSERT INTO payments(name,room,period,amount,method,date,status) VALUES(?,?,?,?,?,?,?)');
    for (const p of seed.payments) ins.run(p.name, p.room, p.period, p.amount, p.method, p.date, p.status);
  }
  if (count('expenses') === 0) {
    const ins = db.prepare('INSERT INTO expenses(date,description,cat,amount) VALUES(?,?,?,?)');
    for (const e of seed.expenses) ins.run(e.date, e.desc, e.cat, e.amount);
  }
  if (count('violations') === 0) {
    const ins = db.prepare('INSERT INTO violations(name,room,description,date,sp,sent) VALUES(?,?,?,?,?,?)');
    for (const v of seed.violations) ins.run(v.name, v.room, v.desc, v.date, v.sp, v.sent ? 1 : 0);
  }
  if (count('mantan') === 0) {
    const ins = db.prepare('INSERT INTO mantan(name,room,masuk,keluar,lama,alasan,star) VALUES(?,?,?,?,?,?,?)');
    for (const m of seed.mantan) ins.run(m.name, m.room, m.masuk, m.keluar, m.lama, m.alasan, m.star);
  }
  if (count('activities') === 0) {
    const ins = db.prepare('INSERT INTO activities(c,t,ts) VALUES(?,?,?)');
    for (const a of seed.activities) ins.run(a.c, a.t, a.ts);
  }
}
seedAll();

// ── Settings ──
export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const { key, value } of rows) {
    try { out[key] = JSON.parse(value); } catch { out[key] = value; }
  }
  return out;
}

export function updateSettings(patch = {}) {
  const up = db.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
  );
  tx(() => {
    for (const [k, v] of Object.entries(patch)) up.run(k, JSON.stringify(v));
  });
  return getSettings();
}

// ── Residents ──
export function listResidents({ q = '', filter = 'all' } = {}) {
  let rows = db.prepare('SELECT * FROM residents ORDER BY id ASC').all();
  const needle = String(q).toLowerCase();
  if (needle) rows = rows.filter((r) => r.name.toLowerCase().includes(needle) || r.room.includes(needle));
  if (filter === 'lunas') rows = rows.filter((r) => r.status === 'lunas');
  else if (filter === 'tunggak') rows = rows.filter((r) => r.status === 'tunggak');
  else if (filter === 'mhs') rows = rows.filter((r) => (r.job || '').toLowerCase().includes('mahasis'));
  return rows;
}

export function getResident(id) {
  return db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(id));
}

export function addResident(data) {
  const room = String(data.room).replace(/\D/g, '') || String(data.room);
  const info = db.prepare(
    'INSERT INTO residents(name,room,masuk,status,job,wa,uni) VALUES(?,?,?,?,?,?,?)',
  ).run(
    data.name, room,
    data.masuk || new Date().toLocaleDateString('id-ID'),
    data.status || 'lunas', data.job || 'Lainnya', data.wa || '', data.uni || '',
  );
  return getResident(info.lastInsertRowid);
}

export function updateResident(id, patch = {}) {
  const cur = getResident(id);
  if (!cur) return null;
  const next = { ...cur, ...patch };
  db.prepare('UPDATE residents SET name=?,room=?,masuk=?,status=?,job=?,wa=?,uni=? WHERE id=?')
    .run(next.name, next.room, next.masuk, next.status, next.job, next.wa, next.uni, Number(id));
  return getResident(id);
}

export function deleteResident(id) {
  const info = db.prepare('DELETE FROM residents WHERE id = ?').run(Number(id));
  return info.changes > 0;
}

export function checkoutResident(id, body = {}) {
  const r = getResident(id);
  if (!r) return null;
  const record = {
    name: r.name, room: r.room, masuk: r.masuk,
    keluar: body.keluar || new Date().toLocaleDateString('id-ID'),
    lama: body.lama || '—', alasan: body.alasan || 'Keluar', star: body.star || 5,
  };
  tx(() => {
    db.prepare('INSERT INTO mantan(name,room,masuk,keluar,lama,alasan,star) VALUES(?,?,?,?,?,?,?)')
      .run(record.name, record.room, record.masuk, record.keluar, record.lama, record.alasan, record.star);
    db.prepare('DELETE FROM residents WHERE id = ?').run(Number(id));
  });
  return record;
}

// ── Applications ──
export function listApplications(status) {
  return status
    ? db.prepare('SELECT * FROM applications WHERE status = ? ORDER BY id ASC').all(status)
    : db.prepare('SELECT * FROM applications ORDER BY id ASC').all();
}

export function getApplication(id) {
  return db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(id));
}

export function addApplication(b) {
  const info = db.prepare(`INSERT INTO applications
    (name,tempatLahir,tglLahir,alamat,nik,wa,job,uni,wali,waliStatus,waWali,sumber,masuk,status,createdAt)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.name, b.tempatLahir || '', b.tglLahir || '', b.alamat || '', b.nik || '', b.wa,
    b.job || 'Lainnya', b.uni || '', b.wali || '', b.waliStatus || '', b.waWali || '',
    b.sumber || '', b.masuk || '', 'pending', new Date().toLocaleDateString('id-ID'),
  );
  return info.lastInsertRowid;
}

// Approve → create resident + initial bill + activity, all in one transaction.
export function approveApplication(app, room) {
  return tx(() => {
    const info = db.prepare('INSERT INTO residents(name,room,masuk,status,job,wa,uni) VALUES(?,?,?,?,?,?,?)')
      .run(app.name, room, app.masuk || new Date().toLocaleDateString('id-ID'), 'tunggak', app.job, app.wa, app.uni);
    db.prepare('INSERT INTO payments(name,room,period,amount,method,date,status) VALUES(?,?,?,?,?,?,?)')
      .run(app.name, room, 'Sep 2026', 'Rp 1.300.000', '—', '—', 'tunggak');
    db.prepare('INSERT INTO activities(c,t,ts) VALUES(?,?,?)')
      .run('jade', `<strong>${app.name}</strong> disetujui & ditempatkan di kamar ${room}`, 'Baru saja');
    db.prepare('UPDATE applications SET status=?, room=? WHERE id=?').run('approved', room, app.id);
    return getResident(info.lastInsertRowid);
  });
}

export function rejectApplication(id, reason = '') {
  db.prepare('UPDATE applications SET status=?, reason=? WHERE id=?').run('rejected', reason, Number(id));
}

// ── Payments ──
export function listPayments() {
  return db.prepare('SELECT * FROM payments ORDER BY id ASC').all();
}

export function markPaid(room, method = 'Tunai', date) {
  const p = db.prepare('SELECT * FROM payments WHERE room = ?').get(String(room));
  if (!p) return null;
  const paidDate = date || new Date().toLocaleDateString('id-ID');
  tx(() => {
    db.prepare('UPDATE payments SET status=?, method=?, date=? WHERE id=?')
      .run('lunas', method, paidDate, p.id);
    db.prepare('UPDATE residents SET status=? WHERE room=?').run('lunas', String(room));
  });
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id);
}

// Find an outstanding bill for a tenant (by room; name optional cross-check).
export function getBill(room, name) {
  const p = db.prepare('SELECT * FROM payments WHERE room = ?').get(String(room));
  if (!p) return null;
  if (name && p.name && p.name.toLowerCase() !== String(name).toLowerCase()) return null;
  return p;
}

// Tenant self-service confirmation → bill moves to 'menunggu' (awaiting admin verify).
export function confirmPayment(room, { note = '', method = 'QRIS' } = {}) {
  const p = db.prepare('SELECT * FROM payments WHERE room = ?').get(String(room));
  if (!p) return null;
  db.prepare('UPDATE payments SET status=?, method=?, note=?, confirmedAt=? WHERE id=?')
    .run('menunggu', method, note, new Date().toLocaleString('id-ID'), p.id);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id);
}

export function listPendingPayments() {
  return db.prepare("SELECT * FROM payments WHERE status = 'menunggu' ORDER BY id ASC").all();
}

// Admin rejects a claimed payment → back to arrears.
export function rejectConfirm(room) {
  const p = db.prepare('SELECT * FROM payments WHERE room = ?').get(String(room));
  if (!p) return null;
  db.prepare("UPDATE payments SET status='tunggak', method='—', note='' WHERE id=?").run(p.id);
  return db.prepare('SELECT * FROM payments WHERE id = ?').get(p.id);
}

// ── Expenses ── (map column `description` ↔ JS `desc`)
export function listExpenses() {
  return db.prepare('SELECT id, date, description AS desc, cat, amount FROM expenses ORDER BY id DESC').all();
}

export function addExpense(b) {
  const info = db.prepare('INSERT INTO expenses(date,description,cat,amount) VALUES(?,?,?,?)').run(
    b.date || new Date().toLocaleDateString('id-ID'), b.desc, b.cat || 'Lainnya', b.amount,
  );
  return db.prepare('SELECT id, date, description AS desc, cat, amount FROM expenses WHERE id = ?').get(info.lastInsertRowid);
}

// ── Violations ──
export function listViolations() {
  return db.prepare('SELECT id, name, room, description AS desc, date, sp, sent FROM violations ORDER BY id ASC')
    .all()
    .map((v) => ({ ...v, sent: !!v.sent }));
}

export function addViolation(b) {
  const info = db.prepare('INSERT INTO violations(name,room,description,date,sp,sent) VALUES(?,?,?,?,?,0)').run(
    b.name || '', b.room || '', b.desc || '', b.date || new Date().toLocaleDateString('id-ID'), b.sp || 'SP1',
  );
  const v = db.prepare('SELECT id, name, room, description AS desc, date, sp, sent FROM violations WHERE id = ?').get(info.lastInsertRowid);
  return { ...v, sent: !!v.sent };
}

export function sendViolation(name, date) {
  const v = db.prepare('SELECT * FROM violations WHERE name = ? AND date = ?').get(name, date);
  if (!v) return null;
  db.prepare('UPDATE violations SET sent = 1 WHERE id = ?').run(v.id);
  return { ...v, sent: true };
}

// ── Mantan ──
export function listMantan() {
  return db.prepare('SELECT * FROM mantan ORDER BY id ASC').all();
}

// ── Activities ──
export function listActivities(limit = 8) {
  return db.prepare('SELECT c, t, ts FROM activities ORDER BY id DESC LIMIT ?').all(limit);
}

// ── Rooms (derived from settings + residents) ──
export function buildRooms() {
  const s = getSettings();
  const total = Number(s.totalKamar) || 20;
  const start = Number(s.roomStart) || 101;
  const occupied = new Set(db.prepare('SELECT room FROM residents').all().map((r) => String(r.room)));
  return Array.from({ length: total }, (_, i) => {
    const n = start + i;
    const res = db.prepare('SELECT * FROM residents WHERE room = ?').get(String(n)) || null;
    return { n, status: occupied.has(String(n)) ? 'oc' : 'av', res };
  });
}

export default db;
