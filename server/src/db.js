// ─────────────────────────────────────────────────────────────
// InDeKos — SQLite connection & schema (v2)
// node:sqlite (bawaan Node ≥ 22.5), tanpa dependensi native.
//
// Upgrade dari skema v1: file lama otomatis di-backup ke
// `indekos.db.bak-v1` lalu database v2 dibuat & diisi seed.
// ─────────────────────────────────────────────────────────────
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as seed from './data.js';
import { hashPassword, nowStamp, todayISO, addMonths } from './util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_VERSION = 2;
export const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, '../data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'indekos.db');

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function open() {
  const d = new DatabaseSync(DB_PATH);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return d;
}

function currentVersion(d) {
  const hasMeta = d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='meta'").get();
  if (!hasMeta) {
    const anyTable = d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").get();
    return anyTable ? 1 : 0; // 0 = database baru/kosong
  }
  const row = d.prepare("SELECT value FROM meta WHERE key='schema_version'").get();
  return row ? Number(row.value) : 1;
}

let db = open();
const found = currentVersion(db);
if (found !== 0 && found < SCHEMA_VERSION && DB_PATH !== ':memory:') {
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  db.close();
  const backup = `${DB_PATH}.bak-v${found}`;
  fs.renameSync(DB_PATH, backup);
  for (const ext of ['-wal', '-shm']) fs.rmSync(DB_PATH + ext, { force: true });
  console.log(`[db] Skema v${found} di-backup ke ${path.basename(backup)} — membuat skema v${SCHEMA_VERSION}.`);
  db = open();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('pemilik','admin')),
    passwordHash TEXT NOT NULL,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS room_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0,
    facilities TEXT NOT NULL DEFAULT '[]',
    description TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    floor INTEGER DEFAULT 1,
    typeId INTEGER REFERENCES room_types(id) ON DELETE SET NULL,
    maintenance INTEGER NOT NULL DEFAULT 0,
    note TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS residents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    room TEXT NOT NULL,
    masuk TEXT NOT NULL,              -- ISO
    dueDay INTEGER NOT NULL,          -- tanggal jatuh tempo tiap bulan
    rent INTEGER,                     -- NULL = ikut harga tipe kamar
    dailyRateEnabled INTEGER NOT NULL DEFAULT 0,
    dailyRate INTEGER,                -- NULL = ikut default
    deferUntil TEXT DEFAULT '',       -- penangguhan s/d tanggal (ISO)
    reminderEnabled INTEGER NOT NULL DEFAULT 1,
    job TEXT, wa TEXT, uni TEXT, nik TEXT, alamat TEXT,
    emergencyName TEXT, emergencyRel TEXT, emergencyWa TEXT,
    emergency2Name TEXT, emergency2Rel TEXT, emergency2Wa TEXT,
    ktpPhoto TEXT DEFAULT '', selfiePhoto TEXT DEFAULT '', faceScore REAL,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tempatLahir TEXT, tglLahir TEXT, alamat TEXT, nik TEXT,
    wa TEXT NOT NULL,
    job TEXT, uni TEXT,
    wali TEXT, waliStatus TEXT, waWali TEXT,
    emergency2Name TEXT, emergency2Rel TEXT, emergency2Wa TEXT,
    ktpPhoto TEXT DEFAULT '', selfiePhoto TEXT DEFAULT '',
    faceScore REAL, faceMatch INTEGER,
    roomTypeId INTEGER,
    sumber TEXT, masuk TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reason TEXT DEFAULT '', room TEXT DEFAULT '',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS promos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    payMonths INTEGER NOT NULL,
    freeMonths INTEGER NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    startDate TEXT, endDate TEXT,
    description TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    residentId INTEGER NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('charge','denda')),
    name TEXT NOT NULL,
    amount INTEGER NOT NULL,
    recurring INTEGER NOT NULL DEFAULT 0,
    billDay INTEGER NOT NULL,
    startDate TEXT NOT NULL,
    endDate TEXT DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    publicId TEXT NOT NULL UNIQUE,
    residentId INTEGER REFERENCES residents(id) ON DELETE SET NULL,
    name TEXT, room TEXT, wa TEXT,
    kind TEXT NOT NULL CHECK (kind IN ('sewa','charge','denda')),
    description TEXT DEFAULT '',
    periodStart TEXT NOT NULL,
    periodEnd TEXT NOT NULL,
    issueDate TEXT NOT NULL,
    dueDate TEXT NOT NULL,
    amount INTEGER NOT NULL,
    uniqueCode INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','menunggu','paid','void')),
    method TEXT DEFAULT '', paidAt TEXT DEFAULT '',
    note TEXT DEFAULT '', confirmedAt TEXT DEFAULT '',
    promoId INTEGER, chargeId INTEGER,
    sentAt TEXT DEFAULT '', remindedAt TEXT DEFAULT '',
    gcalEventId TEXT DEFAULT '', gcalStatus TEXT DEFAULT '',
    createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_invoices_resident ON invoices(residentId, kind, periodStart);
  CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, dueDate);

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    cat TEXT NOT NULL DEFAULT 'Lainnya',
    amount INTEGER NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    merchant TEXT DEFAULT '',
    receiptPhoto TEXT DEFAULT '',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS violation_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    severity TEXT NOT NULL DEFAULT 'ringan',
    defaultSp TEXT NOT NULL DEFAULT 'SP1'
  );

  CREATE TABLE IF NOT EXISTS violations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    residentId INTEGER,
    name TEXT, room TEXT,
    categoryId INTEGER REFERENCES violation_categories(id) ON DELETE SET NULL,
    description TEXT DEFAULT '',
    date TEXT NOT NULL,
    sp TEXT NOT NULL DEFAULT 'SP1',
    sent INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mantan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, room TEXT, masuk TEXT, keluar TEXT,
    alasan TEXT, star INTEGER, feedback TEXT DEFAULT '',
    createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS exit_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    residentId INTEGER,
    name TEXT NOT NULL, room TEXT NOT NULL, wa TEXT,
    exitDate TEXT NOT NULL,
    reason TEXT DEFAULT '', rating INTEGER DEFAULT 5, feedback TEXT DEFAULT '',
    refundBank TEXT DEFAULT '', refundAccount TEXT DEFAULT '', refundName TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    adminNote TEXT DEFAULT '',
    createdAt TEXT, processedAt TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS room_transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    residentId INTEGER, name TEXT NOT NULL, wa TEXT DEFAULT '',
    fromRoom TEXT NOT NULL, toRoom TEXT DEFAULT '', toTypeId INTEGER, toTypeName TEXT DEFAULT '',
    moveDate TEXT NOT NULL, reason TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', -- pending | approved (dijadwalkan) | done | rejected | cancelled
    source TEXT DEFAULT 'penghuni', keepCustomRent INTEGER DEFAULT 0, prorate INTEGER DEFAULT 1, notify INTEGER DEFAULT 1,
    adminNote TEXT DEFAULT '', processedBy TEXT DEFAULT '', result TEXT DEFAULT '',
    createdAt TEXT, processedAt TEXT DEFAULT '', executedAt TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS room_type_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roomNumber TEXT NOT NULL,
    fromTypeId INTEGER, fromName TEXT, fromPrice INTEGER,
    toTypeId INTEGER, toName TEXT, toPrice INTEGER,
    direction TEXT, effective TEXT, invoicesUpdated INTEGER DEFAULT 0,
    residentId INTEGER, residentName TEXT DEFAULT '',
    note TEXT DEFAULT '', userName TEXT DEFAULT '', createdAt TEXT
  );

  -- Foto pengesahan kondisi kamar saat penghuni mulai menempati (bukti serah terima).
  CREATE TABLE IF NOT EXISTS handover_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    residentId INTEGER NOT NULL, residentName TEXT DEFAULT '', room TEXT NOT NULL,
    file TEXT NOT NULL, caption TEXT DEFAULT '', takenAt TEXT NOT NULL,
    createdBy TEXT DEFAULT '', createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_handover_resident ON handover_photos(residentId);

  -- Log / riwayat perbaikan kamar.
  CREATE TABLE IF NOT EXISTS room_repairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room TEXT NOT NULL, date TEXT NOT NULL, title TEXT NOT NULL, category TEXT DEFAULT 'Lainnya',
    description TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'dilaporkan', -- dilaporkan | dikerjakan | selesai
    cost INTEGER NOT NULL DEFAULT 0, vendor TEXT DEFAULT '', doneDate TEXT DEFAULT '',
    photosBefore TEXT DEFAULT '[]', photosAfter TEXT DEFAULT '[]',
    blockRoom INTEGER DEFAULT 0, recordExpense INTEGER DEFAULT 0, expenseId INTEGER,
    residentId INTEGER, residentName TEXT DEFAULT '',
    createdBy TEXT DEFAULT '', createdAt TEXT, updatedAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_repairs_room ON room_repairs(room, date);

  CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    c TEXT, t TEXT, createdAt TEXT
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceId INTEGER, kind TEXT, target TEXT,
    status TEXT, response TEXT, createdAt TEXT
  );
`);

// Kolom tambahan (aditif, aman untuk database lama).
function ensureColumn(table, col, def) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  }
}
ensureColumn('users', 'email', "TEXT NOT NULL DEFAULT ''"); // email Google untuk login
ensureColumn('users', 'googleSub', "TEXT NOT NULL DEFAULT ''"); // ID akun Google yang ditautkan
ensureColumn('applications', 'stayMonths', 'INTEGER'); // rencana lama tinggal (bulan), NULL = belum pasti
ensureColumn('residents', 'stayMonths', 'INTEGER');
ensureColumn('invoices', 'receiptSentAt', "TEXT NOT NULL DEFAULT ''"); // bukti pelunasan WA ('-' = tidak dikirim)
ensureColumn('residents', 'stayFrom', "TEXT NOT NULL DEFAULT ''"); // awal hitungan rencana ('' = tanggal masuk)
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email != '';
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_gsub ON users(googleSub) WHERE googleSub != '';
`);

// node:sqlite's DatabaseSync has no .transaction() helper, so wrap
// units of work in BEGIN/COMMIT manually. Nested calls reuse the outer tx.
let depth = 0;
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN');
  depth++;
  try {
    const result = fn();
    depth--;
    db.exec('COMMIT');
    return result;
  } catch (e) {
    depth--;
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getMeta(key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}
export function setMeta(key, value) {
  db.prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value')
    .run(key, String(value));
}

export function logActivity(c, t) {
  db.prepare('INSERT INTO activities(c,t,createdAt) VALUES(?,?,?)').run(c, t, nowStamp());
}

// ── Seed (hanya saat tabel kosong) ──
const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

function seedBase() {
  const now = nowStamp();
  tx(() => {
    // Isi kunci setting yang belum ada tanpa menimpa nilai yang sudah diubah user.
    const insSetting = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)');
    for (const [k, v] of Object.entries(seed.settings)) insSetting.run(k, JSON.stringify(v));

    if (count('users') === 0) {
      const pemilikPw = process.env.INIT_PEMILIK_PASSWORD || 'pemilik123';
      const adminPw = process.env.INIT_ADMIN_PASSWORD || 'admin123';
      const ins = db.prepare('INSERT INTO users(username,name,role,passwordHash,createdAt) VALUES(?,?,?,?,?)');
      ins.run('pemilik', 'Pemilik Kos', 'pemilik', hashPassword(pemilikPw), now);
      ins.run('admin', 'Admin Kos', 'admin', hashPassword(adminPw), now);
      console.log('[db] Akun awal dibuat: pemilik / admin. SEGERA ganti password di menu Akun.');
    }

    if (count('room_types') === 0) {
      const ins = db.prepare('INSERT INTO room_types(name,price,facilities,description) VALUES(?,?,?,?)');
      for (const t of seed.roomTypes) ins.run(t.name, t.price, JSON.stringify(t.facilities), t.description);
    }

    if (count('rooms') === 0) {
      const typeId = (name) => db.prepare('SELECT id FROM room_types WHERE name = ?').get(name)?.id ?? null;
      const ins = db.prepare('INSERT INTO rooms(number,floor,typeId,maintenance,note) VALUES(?,?,?,?,?)');
      for (const r of seed.rooms) ins.run(r.number, r.floor, typeId(r.type), r.maintenance ? 1 : 0, r.note);
    }

    if (count('residents') === 0) {
      const ins = db.prepare(`INSERT INTO residents
        (name,room,masuk,dueDay,dailyRateEnabled,deferUntil,job,wa,uni,stayMonths,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
      for (const r of seed.residents) {
        ins.run(r.name, r.room, r.masuk, Number(r.masuk.slice(8, 10)), r.dailyRateEnabled ? 1 : 0,
          r.deferUntil || '', r.job, r.wa, r.uni, r.stayMonths ?? null, now);
      }
    }

    if (count('applications') === 0) {
      const ins = db.prepare(`INSERT INTO applications
        (name,tempatLahir,tglLahir,alamat,nik,wa,job,uni,wali,waliStatus,waWali,
         emergency2Name,emergency2Rel,emergency2Wa,sumber,masuk,stayMonths,status,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending',?)`);
      for (const a of seed.applications) {
        ins.run(a.name, a.tempatLahir, a.tglLahir, a.alamat, a.nik, a.wa, a.job, a.uni, a.wali, a.waliStatus,
          a.waWali, a.emergency2Name, a.emergency2Rel, a.emergency2Wa, a.sumber, a.masuk, a.stayMonths ?? null, now);
      }
    }

    if (count('promos') === 0) {
      const ins = db.prepare('INSERT INTO promos(name,payMonths,freeMonths,active,startDate,endDate,description) VALUES(?,?,?,?,?,?,?)');
      for (const p of seed.promos) ins.run(p.name, p.payMonths, p.freeMonths, p.active ? 1 : 0, p.startDate, p.endDate, p.description);
    }

    if (count('violation_categories') === 0) {
      const ins = db.prepare('INSERT INTO violation_categories(name,severity,defaultSp) VALUES(?,?,?)');
      for (const c of seed.violationCategories) ins.run(c.name, c.severity, c.defaultSp);
    }

    if (count('violations') === 0) {
      const ins = db.prepare(`INSERT INTO violations(residentId,name,room,categoryId,description,date,sp,sent,createdAt)
        VALUES(?,?,?,?,?,?,?,?,?)`);
      for (const v of seed.violations) {
        const res = db.prepare('SELECT id, name FROM residents WHERE room = ?').get(v.room);
        const cat = db.prepare('SELECT id FROM violation_categories WHERE name = ?').get(v.category);
        ins.run(res?.id ?? null, res?.name ?? '', v.room, cat?.id ?? null, v.desc, v.date, v.sp, v.sent ? 1 : 0, `${v.date}T08:00:00.000Z`);
      }
    }

    if (count('mantan') === 0) {
      const ins = db.prepare('INSERT INTO mantan(name,room,masuk,keluar,alasan,star,createdAt) VALUES(?,?,?,?,?,?,?)');
      for (const m of seed.mantan) ins.run(m.name, m.room, m.masuk, m.keluar, m.alasan, m.star, now);
    }

    if (count('expenses') === 0) {
      const ins = db.prepare('INSERT INTO expenses(date,description,cat,amount,source,createdAt) VALUES(?,?,?,?,?,?)');
      for (const e of seed.expenses) ins.run(e.date, e.desc, e.cat, e.amount, 'manual', now);
    }

    if (count('activities') === 0) {
      const ins = db.prepare('INSERT INTO activities(c,t,createdAt) VALUES(?,?,?)');
      for (const a of seed.activities) ins.run(a.c, a.t, now);
    }

    setMeta('schema_version', SCHEMA_VERSION);
  });
}
seedBase();

// Migrasi satu kali: penghuni yang sudah ada tanpa rencana tinggal → 6 bulan,
// dihitung PER SIKLUS 6 BULAN SEJAK TANGGAL MASUK: dipakai siklus yang belum lewat
// (mis. masuk 1 Jan, hari ini 29 Sep → siklus 1 Jul–1 Jan). Tanggal selesai selalu
// jatuh di tanggal masuk dan tidak ada yang langsung "lewat".
// Penghuni baru tidak terpengaruh; rencana yang diisi sendiri tidak diubah.
const STAY_DEFAULT = 6;
function cycleStart(masuk, months, today) {
  let k = 1;
  while (addMonths(masuk, months * k) < today && k < 240) k++;
  return k === 1 ? '' : addMonths(masuk, months * (k - 1)); // '' = mulai tanggal masuk
}
function applyCycle(rows) {
  const today = todayISO();
  const upd = db.prepare('UPDATE residents SET stayMonths = ?, stayFrom = ? WHERE id = ?');
  tx(() => { for (const r of rows) upd.run(STAY_DEFAULT, cycleStart(r.masuk, STAY_DEFAULT, today), r.id); });
  return rows.length;
}
if (!getMeta('stay_default_6')) {
  const n = applyCycle(db.prepare('SELECT id, masuk FROM residents WHERE stayMonths IS NULL').all());
  setMeta('stay_default_6', nowStamp());
  setMeta('stay_default_6_cycle', nowStamp());
  if (n) console.log(`[db] Rencana tinggal ${n} penghuni lama diisi 6 bulan (per siklus sejak tanggal masuk).`);
} else if (!getMeta('stay_default_6_cycle')) {
  // Database yang sempat menjalankan versi sebelumnya (6 bln dari masuk / dari hari migrasi):
  // hitung ulang penghuni hasil migrasi itu dengan siklus sejak tanggal masuk.
  const ran = getMeta('stay_default_6');
  const d1 = String(ran).slice(0, 10);
  const d2 = String(getMeta('stay_default_6_from_today') || '').slice(0, 10);
  const n = applyCycle(db.prepare(`SELECT id, masuk FROM residents
    WHERE stayMonths = ? AND createdAt <= ? AND (stayFrom = '' OR stayFrom = ? OR stayFrom = ?)`).all(STAY_DEFAULT, ran, d1, d2));
  setMeta('stay_default_6_cycle', nowStamp());
  if (n) console.log(`[db] Rencana tinggal ${n} penghuni lama dihitung ulang per siklus 6 bulan sejak tanggal masuk.`);
}

// Invoice yang sudah lunas sebelum fitur "bukti pelunasan via WA" ada tidak dikirimi pesan.
if (!getMeta('receipt_backfill')) {
  db.prepare("UPDATE invoices SET receiptSentAt = '-' WHERE status = 'paid' AND receiptSentAt = ''").run();
  setMeta('receipt_backfill', nowStamp());
}

// Catatan perbaikan lama (satu kolom note di kamar) dipindah ke log perbaikan.
if (!getMeta('repairs_from_notes')) {
  const rows = db.prepare("SELECT number, maintenance, note FROM rooms WHERE TRIM(note) != ''").all();
  const ins = db.prepare(`INSERT INTO room_repairs(room,date,title,category,status,doneDate,blockRoom,createdBy,createdAt,updatedAt)
    VALUES(?,?,?,'Lainnya',?,?,?,'sistem',?,?)`);
  const today = todayISO(); const now = nowStamp();
  tx(() => {
    for (const r of rows) {
      ins.run(r.number, today, r.note.trim().slice(0, 200), r.maintenance ? 'dikerjakan' : 'selesai', r.maintenance ? '' : today, r.maintenance ? 1 : 0, now, now);
    }
  });
  setMeta('repairs_from_notes', now);
  if (rows.length) console.log(`[db] ${rows.length} catatan perbaikan kamar dipindah ke log perbaikan.`);
}

export default db;
