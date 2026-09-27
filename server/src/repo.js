// Query/command helpers used by the routes. Business rules for money
// live in billing.js; this module assembles view models.
import db, { tx, logActivity } from './db.js';
import { getSettings } from './settings.js';
import * as billing from './billing.js';
import { todayISO, nowStamp, parseISO, shiftMonth } from './util.js';

const parseFacilities = (f) => { try { return JSON.parse(f || '[]'); } catch { return []; } };

// ── Room types ──
export function listRoomTypes() {
  return db.prepare(`SELECT t.*, (SELECT COUNT(*) FROM rooms r WHERE r.typeId = t.id) AS roomCount
    FROM room_types t ORDER BY t.price`).all().map((t) => ({ ...t, facilities: parseFacilities(t.facilities) }));
}

// ── Rooms ──
export function listRooms() {
  const residents = db.prepare('SELECT * FROM residents').all();
  const byRoom = Object.fromEntries(residents.map((r) => [r.room, r]));
  return db.prepare(`SELECT r.*, t.name AS typeName, t.price AS typePrice, t.facilities AS typeFacilities
      FROM rooms r LEFT JOIN room_types t ON t.id = r.typeId
      ORDER BY CAST(r.number AS INTEGER), r.number`).all()
    .map((room) => {
      const res = byRoom[room.number] || null;
      return {
        ...room,
        maintenance: Boolean(room.maintenance),
        facilities: parseFacilities(room.typeFacilities),
        // perbaikan diprioritaskan agar kamar tak bisa ditempati saat diperbaiki
        status: room.maintenance ? 'mn' : res ? 'oc' : 'av',
        resident: res ? { id: res.id, name: res.name, wa: res.wa, masuk: res.masuk, job: res.job, uni: res.uni, dueDay: res.dueDay, ...billing.residentSummary(res) } : null,
      };
    });
}

export function roomStatus(number) {
  return listRooms().find((r) => r.number === String(number)) || null;
}

// ── Residents ──
export function listResidents({ q = '', filter = 'all' } = {}) {
  const needle = String(q).toLowerCase();
  return db.prepare('SELECT * FROM residents ORDER BY CAST(room AS INTEGER)').all()
    .filter((r) => !needle || r.name.toLowerCase().includes(needle) || r.room.includes(needle))
    .map((r) => ({ ...r, ...billing.residentSummary(r) }))
    .filter((r) => {
      if (filter === 'lunas') return r.payStatus === 'lunas';
      if (filter === 'tunggak') return r.payStatus === 'tunggak' || r.payStatus === 'ditangguhkan';
      if (filter === 'mhs') return (r.job || '').toLowerCase().includes('mahasis');
      return true;
    });
}

export function residentDetail(id) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(id));
  if (!r) return null;
  const today = todayISO();
  return {
    ...r,
    ...billing.residentSummary(r, today),
    invoices: db.prepare('SELECT * FROM invoices WHERE residentId = ? ORDER BY dueDate DESC, id DESC').all(r.id)
      .map((i) => billing.decorateInvoice(i, today)),
    charges: db.prepare('SELECT * FROM charges WHERE residentId = ? ORDER BY active DESC, id DESC').all(r.id),
    violations: db.prepare(`SELECT v.*, c.name AS categoryName FROM violations v
      LEFT JOIN violation_categories c ON c.id = v.categoryId WHERE v.residentId = ? ORDER BY v.date DESC`).all(r.id),
  };
}

const RESIDENT_FIELDS = ['name', 'room', 'masuk', 'dueDay', 'rent', 'dailyRateEnabled', 'dailyRate', 'deferUntil',
  'reminderEnabled', 'job', 'wa', 'uni', 'nik', 'alamat', 'emergencyName', 'emergencyRel', 'emergencyWa',
  'emergency2Name', 'emergency2Rel', 'emergency2Wa', 'ktpPhoto', 'selfiePhoto', 'faceScore'];

function normalizeResident(b, s = getSettings()) {
  const masuk = b.masuk || todayISO();
  return {
    ...b,
    room: String(b.room || '').trim(),
    masuk,
    dueDay: Math.min(31, Math.max(1, Number(b.dueDay) || parseISO(masuk).d)),
    rent: b.rent ? Number(b.rent) : null,
    dailyRateEnabled: b.dailyRateEnabled === undefined ? (s.dailyRateEnabledDefault ? 1 : 0) : (b.dailyRateEnabled ? 1 : 0),
    dailyRate: b.dailyRate ? Number(b.dailyRate) : null,
    reminderEnabled: b.reminderEnabled === undefined ? 1 : (b.reminderEnabled ? 1 : 0),
    deferUntil: b.deferUntil || '',
  };
}

export function createResident(body) {
  const data = normalizeResident(body);
  const room = roomStatus(data.room);
  if (!room) throw Object.assign(new Error(`Kamar ${data.room} tidak ada.`), { status: 400 });
  if (room.status !== 'av') throw Object.assign(new Error(`Kamar ${data.room} ${room.status === 'mn' ? 'sedang perbaikan' : 'sudah terisi'}.`), { status: 409 });
  const cols = RESIDENT_FIELDS.filter((f) => data[f] !== undefined);
  const info = db.prepare(`INSERT INTO residents(${cols.join(',')},createdAt) VALUES(${cols.map(() => '?').join(',')},?)`)
    .run(...cols.map((c) => data[c] ?? null), nowStamp());
  const id = info.lastInsertRowid;
  billing.generateForResident(id);
  logActivity('jade', `<strong>${data.name}</strong> terdaftar sebagai penghuni kamar ${data.room}`);
  return residentDetail(id);
}

export function updateResident(id, patch) {
  const cur = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(id));
  if (!cur) return null;
  if (patch.room && String(patch.room) !== cur.room) {
    const room = roomStatus(patch.room);
    if (!room || room.status !== 'av') throw Object.assign(new Error(`Kamar ${patch.room} tidak tersedia.`), { status: 409 });
  }
  const merged = normalizeResident({ ...cur, ...patch });
  const cols = RESIDENT_FIELDS.filter((f) => f in patch);
  if (cols.length) {
    db.prepare(`UPDATE residents SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
      .run(...cols.map((c) => merged[c] ?? null), cur.id);
  }
  // Pindah kamar → invoice yang belum lunas ikut kamar baru.
  if (patch.room && String(patch.room) !== cur.room) {
    db.prepare("UPDATE invoices SET room = ? WHERE residentId = ? AND status IN ('unpaid','menunggu')").run(String(patch.room), cur.id);
  }
  if (patch.wa) db.prepare("UPDATE invoices SET wa = ? WHERE residentId = ? AND status IN ('unpaid','menunggu')").run(patch.wa, cur.id);
  billing.generateForResident(cur.id);
  return residentDetail(cur.id);
}

// ── Applications ──
export function listApplications(status) {
  const rows = status
    ? db.prepare('SELECT * FROM applications WHERE status = ? ORDER BY id DESC').all(status)
    : db.prepare('SELECT * FROM applications ORDER BY id DESC').all();
  return rows.map((a) => ({ ...a, faceMatch: a.faceMatch === null ? null : Boolean(a.faceMatch) }));
}

export function approveApplication(id, { room, dueDay, rent }) {
  const a = db.prepare('SELECT * FROM applications WHERE id = ?').get(Number(id));
  if (!a) throw Object.assign(new Error('Pendaftaran tidak ditemukan.'), { status: 404 });
  if (a.status !== 'pending') throw Object.assign(new Error('Pendaftaran sudah diproses.'), { status: 400 });
  return tx(() => {
    const resident = createResident({
      name: a.name, room, masuk: a.masuk || todayISO(), dueDay, rent,
      job: a.job, wa: a.wa, uni: a.uni, nik: a.nik, alamat: a.alamat,
      emergencyName: a.wali, emergencyRel: a.waliStatus, emergencyWa: a.waWali,
      emergency2Name: a.emergency2Name, emergency2Rel: a.emergency2Rel, emergency2Wa: a.emergency2Wa,
      ktpPhoto: a.ktpPhoto, selfiePhoto: a.selfiePhoto, faceScore: a.faceScore,
    });
    db.prepare("UPDATE applications SET status = 'approved', room = ? WHERE id = ?").run(String(room), a.id);
    return resident;
  });
}

// ── Exit requests ──
export function listExitRequests(status) {
  const rows = status
    ? db.prepare('SELECT * FROM exit_requests WHERE status = ? ORDER BY exitDate').all(status)
    : db.prepare('SELECT * FROM exit_requests ORDER BY id DESC').all();
  return rows.map((e) => {
    const r = e.residentId ? db.prepare('SELECT * FROM residents WHERE id = ?').get(e.residentId) : null;
    return { ...e, outstanding: r ? billing.residentSummary(r).outstanding : 0, stillActive: Boolean(r) };
  });
}

export function approveExit(id, { exitDate, adminNote = '' } = {}) {
  const e = db.prepare('SELECT * FROM exit_requests WHERE id = ?').get(Number(id));
  if (!e) throw Object.assign(new Error('Pengajuan tidak ditemukan.'), { status: 404 });
  if (e.status !== 'pending') throw Object.assign(new Error('Pengajuan sudah diproses.'), { status: 400 });
  return tx(() => {
    const result = billing.checkoutResident(e.residentId, {
      exitDate: exitDate || e.exitDate, alasan: e.reason || 'Keluar', star: e.rating, feedback: e.feedback,
    });
    if (!result) throw Object.assign(new Error('Penghuni sudah tidak aktif.'), { status: 400 });
    db.prepare("UPDATE exit_requests SET status = 'approved', adminNote = ?, processedAt = ? WHERE id = ?")
      .run(adminNote, nowStamp(), e.id);
    return result;
  });
}

// ── Dashboard & finance (dihitung dari invoice & pengeluaran nyata) ──
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function lastMonths(n, today = todayISO()) {
  const { y, m } = parseISO(today);
  return Array.from({ length: n }, (_, i) => {
    const t = shiftMonth(y, m, i - (n - 1));
    return { key: `${t.y}-${String(t.m).padStart(2, '0')}`, label: BULAN[t.m - 1] };
  });
}

const paidInMonth = (key) => db.prepare(
  "SELECT COALESCE(SUM(amount),0) AS t FROM invoices WHERE status = 'paid' AND substr(paidAt,1,7) = ?",
).get(key).t;
const spentInMonth = (key) => db.prepare(
  'SELECT COALESCE(SUM(amount),0) AS t FROM expenses WHERE substr(date,1,7) = ?',
).get(key).t;

export function dashboard() {
  const today = todayISO();
  const rooms = listRooms();
  const residents = listResidents();
  const months = lastMonths(6, today);
  const thisMonth = months[months.length - 1].key;
  const prevMonth = months[months.length - 2].key;
  const overdue = db.prepare(`SELECT i.*, r.deferUntil FROM invoices i LEFT JOIN residents r ON r.id = i.residentId
    WHERE i.status = 'unpaid' AND i.dueDate < ? ORDER BY i.dueDate`).all(today)
    .map((i) => ({ ...billing.decorateInvoice(i, today) }));
  const count = (st) => rooms.filter((r) => r.status === st).length;
  return {
    stats: {
      activeResidents: residents.length,
      availableRooms: count('av'),
      occupiedRooms: count('oc'),
      maintenanceRooms: count('mn'),
      totalRooms: rooms.length,
      incomeThisMonth: paidInMonth(thisMonth),
      incomePrevMonth: paidInMonth(prevMonth),
      arrears: residents.filter((r) => r.payStatus === 'tunggak').length,
      pendingConfirm: db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE status = 'menunggu'").get().n,
      pendingApplications: db.prepare("SELECT COUNT(*) AS n FROM applications WHERE status = 'pending'").get().n,
      pendingExits: db.prepare("SELECT COUNT(*) AS n FROM exit_requests WHERE status = 'pending'").get().n,
    },
    revenues: months.map((mo) => ({ m: mo.label, key: mo.key, v: paidInMonth(mo.key) })),
    activities: db.prepare('SELECT c, t, createdAt FROM activities ORDER BY id DESC LIMIT 8').all(),
    overdue,
    occupancy: {
      terisi: count('oc'), tersedia: count('av'), perbaikan: count('mn'),
      pct: rooms.length ? Math.round((count('oc') / rooms.length) * 100) : 0,
    },
  };
}

export function finance() {
  const today = todayISO();
  const months = lastMonths(6, today);
  const thisMonth = months[months.length - 1].key;
  const year = today.slice(0, 4);
  const expCatsRaw = db.prepare(`SELECT cat AS name, SUM(amount) AS amt FROM expenses WHERE substr(date,1,7) = ?
    GROUP BY cat ORDER BY amt DESC`).all(thisMonth);
  const totalExp = expCatsRaw.reduce((a, c) => a + c.amt, 0);
  const palette = ['jade', 'warn', 'pebble', 'ok', 'err'];
  const paidRecent = db.prepare(`SELECT number, name, room, amount, paidAt AS d, kind FROM invoices WHERE status = 'paid'
    ORDER BY paidAt DESC, id DESC LIMIT 8`).all()
    .map((i) => ({ dir: 'in', n: `${i.kind === 'sewa' ? 'Sewa' : i.kind === 'denda' ? 'Denda' : 'Charge'} · ${i.name} (${i.room})`, d: i.d, a: i.amount }));
  const expRecent = db.prepare('SELECT description, date AS d, amount FROM expenses ORDER BY date DESC, id DESC LIMIT 8').all()
    .map((e) => ({ dir: 'out', n: e.description, d: e.d, a: e.amount }));
  const income = paidInMonth(thisMonth);
  const spent = spentInMonth(thisMonth);
  return {
    month: thisMonth,
    income, spent, profit: income - spent,
    ytd: db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM invoices WHERE status = 'paid' AND substr(paidAt,1,4) = ?").get(year).t,
    revenues: months.map((mo) => ({ m: mo.label, key: mo.key, v: paidInMonth(mo.key), e: spentInMonth(mo.key) })),
    transactions: [...paidRecent, ...expRecent].sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 10),
    expCats: expCatsRaw.map((c, i) => ({ ...c, pct: totalExp ? Math.round((c.amt / totalExp) * 100) : 0, col: palette[i % palette.length] })),
  };
}

// ── Violations: retensi (default 365 hari) ──
export function purgeOldViolations() {
  const days = Number(getSettings().violationRetentionDays || 365);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const info = db.prepare('DELETE FROM violations WHERE createdAt < ?').run(cutoff);
  return info.changes;
}
