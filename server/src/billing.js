// ─────────────────────────────────────────────────────────────
// Billing engine
//
// • Setiap penghuni punya `dueDay` sendiri (default = tanggal masuk),
//   jadi tiap kamar jatuh tempo di tanggal berbeda.
// • Periode sewa: [tgl jatuh tempo, sehari sebelum jatuh tempo berikutnya].
//   Invoice terbit `invoiceLeadDays` hari sebelum jatuh tempo.
// • Rate harian (opsional per penghuni): hari "celah" antara tanggal
//   masuk dan jatuh tempo pertama ditagih pro-rata, begitu juga saat
//   keluar di tengah periode — sehingga tidak ada hari yang tak tertagih.
//   Bila nonaktif, hari celah tidak ditagih.
// • Invoice dibuat per periode dan TETAP ada walau penghuni menunggak
//   (mis. Mei & Juni = 2 invoice). `deferUntil` hanya menandai
//   penangguhan (tidak dianggap terlambat & reminder ditahan).
// • Promo: satu invoice gabungan (bayar N bln) yang menutup N+gratis
//   periode; setelah itu generator otomatis kembali ke tagihan normal.
// • Charge/denda: invoice terpisah, sekali atau bulanan, di tanggal
//   tagih yang bisa berbeda per kamar.
// ─────────────────────────────────────────────────────────────
import db, { tx, logActivity, getMeta, setMeta } from './db.js';
import { getSettings } from './settings.js';
import {
  todayISO, nowStamp, parseISO, clampDate, shiftMonth, addDays, daysBetween,
  monthsBetween, fmtDate, fmtRp, randomId,
} from './util.js';
import * as seed from './data.js';

const MAX_PERIODS = 600; // pengaman loop

// ── Lookups ──
export function roomTypeOf(roomNumber) {
  return db.prepare(`SELECT t.* FROM rooms r LEFT JOIN room_types t ON t.id = r.typeId WHERE r.number = ?`)
    .get(String(roomNumber)) || null;
}

export function rentOf(r) {
  if (r.rent) return r.rent;
  return roomTypeOf(r.room)?.price ?? 0;
}

export function dailyRateOf(r, s = getSettings()) {
  if (r.dailyRate) return r.dailyRate;
  if (s.dailyRateDefault) return Number(s.dailyRateDefault);
  return Math.round(rentOf(r) / 30);
}

// ── Periods ──
function firstFullStart(masuk, dueDay) {
  const { y, m } = parseISO(masuk);
  const cand = clampDate(y, m, dueDay);
  if (cand >= masuk) return cand;
  const n = shiftMonth(y, m, 1);
  return clampDate(n.y, n.m, dueDay);
}

function nextStart(start, dueDay) {
  const { y, m } = parseISO(start);
  const n = shiftMonth(y, m, 1);
  return clampDate(n.y, n.m, dueDay);
}

// All rent periods whose invoice should already exist (issueDate ≤ today).
export function rentPeriods(r, today = todayISO(), s = getSettings()) {
  const lead = Number(s.invoiceLeadDays ?? 7);
  const out = [];
  const first = firstFullStart(r.masuk, r.dueDay);

  if (r.masuk < first && r.dailyRateEnabled) {
    const days = daysBetween(r.masuk, first);
    const issue = addDays(r.masuk, -lead);
    if (issue <= today) {
      out.push({ start: r.masuk, end: addDays(first, -1), due: r.masuk, issue, partial: true, days });
    }
  }

  let start = first;
  for (let i = 0; i < MAX_PERIODS; i++) {
    const issue = addDays(start, -lead);
    if (issue > today) break;
    const nxt = nextStart(start, r.dueDay);
    out.push({ start, end: addDays(nxt, -1), due: start, issue, partial: false });
    start = nxt;
  }
  return out;
}

function coveringSewa(residentId, date) {
  return db.prepare(`SELECT * FROM invoices WHERE residentId = ? AND kind = 'sewa' AND status != 'void'
    AND periodStart <= ? AND periodEnd >= ? ORDER BY id LIMIT 1`).get(residentId, date, date);
}

// ── Invoice creation ──
// Nomor mengikuti bulan jatuh tempo (sewa Sep = INV-202609-…), bukan bulan terbit.
function nextNumber(dueDate) {
  const prefix = `INV-${dueDate.slice(0, 4)}${dueDate.slice(5, 7)}-`;
  const n = db.prepare('SELECT COUNT(*) AS n FROM invoices WHERE number LIKE ?').get(`${prefix}%`).n;
  return `${prefix}${String(n + 1).padStart(4, '0')}`;
}

// Kode unik 1–999 agar total bayar (nominal + kode) tidak bentrok dengan
// invoice lain yang belum lunas → memudahkan pencocokan transfer/QRIS.
function pickUniqueCode(amount) {
  const taken = new Set(
    db.prepare("SELECT amount + uniqueCode AS t FROM invoices WHERE status IN ('unpaid','menunggu')").all().map((x) => x.t),
  );
  for (let i = 0; i < 200; i++) {
    const code = 1 + Math.floor(Math.random() * 999);
    if (!taken.has(amount + code)) return code;
  }
  return 0;
}

export function createInvoice(data) {
  const issueDate = data.issueDate || todayISO();
  const info = db.prepare(`INSERT INTO invoices
    (number, publicId, residentId, name, room, wa, kind, description, periodStart, periodEnd,
     issueDate, dueDate, amount, uniqueCode, status, promoId, chargeId, createdAt)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'unpaid',?,?,?)`).run(
    nextNumber(data.dueDate), randomId(12), data.residentId ?? null, data.name, data.room, data.wa || '',
    data.kind, data.description || '', data.periodStart, data.periodEnd, issueDate, data.dueDate,
    Math.round(data.amount), pickUniqueCode(Math.round(data.amount)),
    data.promoId ?? null, data.chargeId ?? null, nowStamp(),
  );
  return getInvoice(info.lastInsertRowid);
}

export function getInvoice(id) {
  return db.prepare('SELECT * FROM invoices WHERE id = ?').get(Number(id)) || null;
}

export function getInvoiceByPublicId(publicId) {
  return db.prepare('SELECT * FROM invoices WHERE publicId = ?').get(String(publicId)) || null;
}

// ── Generation ──
function generateRentFor(r, today, s) {
  let created = 0;
  const rent = rentOf(r);
  for (const p of rentPeriods(r, today, s)) {
    if (coveringSewa(r.id, p.start)) continue;
    const amount = p.partial ? p.days * dailyRateOf(r, s) : rent;
    if (amount <= 0) continue;
    createInvoice({
      residentId: r.id, name: r.name, room: r.room, wa: r.wa, kind: 'sewa',
      description: p.partial
        ? `Sewa pro-rata ${p.days} hari × ${fmtRp(dailyRateOf(r, s))} (${fmtDate(p.start)} – ${fmtDate(p.end)})`
        : `Sewa kamar ${r.room} · ${fmtDate(p.start)} – ${fmtDate(p.end)}`,
      periodStart: p.start, periodEnd: p.end, issueDate: p.issue, dueDate: p.due, amount,
    });
    created++;
  }
  return created;
}

function generateChargesFor(r, today, s) {
  const lead = Number(s.invoiceLeadDays ?? 7);
  let created = 0;
  const charges = db.prepare('SELECT * FROM charges WHERE residentId = ? AND active = 1').all(r.id);
  const exists = db.prepare('SELECT 1 FROM invoices WHERE chargeId = ? AND periodStart = ?');

  for (const c of charges) {
    const bills = [];
    if (!c.recurring) {
      bills.push({ start: c.startDate, end: c.startDate });
    } else {
      let { y, m } = parseISO(c.startDate);
      for (let i = 0; i < MAX_PERIODS; i++) {
        const bill = clampDate(y, m, c.billDay);
        const n = shiftMonth(y, m, 1);
        ({ y, m } = n);
        if (bill < c.startDate) continue;
        if (c.endDate && bill > c.endDate) break;
        if (addDays(bill, -lead) > today) break;
        bills.push({ start: bill, end: addDays(clampDate(n.y, n.m, c.billDay), -1) });
      }
    }
    for (const b of bills) {
      if (addDays(b.start, -lead) > today) continue;
      if (exists.get(c.id, b.start)) continue;
      createInvoice({
        residentId: r.id, name: r.name, room: r.room, wa: r.wa, kind: c.kind,
        description: c.recurring ? `${c.name} · ${fmtDate(b.start)}` : c.name,
        periodStart: b.start, periodEnd: b.end, issueDate: addDays(b.start, -lead),
        dueDate: b.start, amount: c.amount, chargeId: c.id,
      });
      created++;
    }
  }
  return created;
}

export function generateForResident(residentId, today = todayISO()) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(residentId));
  if (!r) return 0;
  const s = getSettings();
  return tx(() => generateRentFor(r, today, s) + generateChargesFor(r, today, s));
}

export function generateAll(today = todayISO()) {
  const s = getSettings();
  const residents = db.prepare('SELECT * FROM residents').all();
  return tx(() => residents.reduce((n, r) => n + generateRentFor(r, today, s) + generateChargesFor(r, today, s), 0));
}

// ── Status helpers ──
// Display state of one invoice.
export function invoiceState(inv, today = todayISO(), deferUntil = '') {
  if (inv.status === 'paid') return 'lunas';
  if (inv.status === 'void') return 'batal';
  if (inv.status === 'menunggu') return 'menunggu';
  if (inv.dueDate < today) return deferUntil && today <= deferUntil ? 'ditangguhkan' : 'terlambat';
  if (inv.dueDate === today) return 'jatuh_tempo';
  return 'belum_jatuh_tempo';
}

export function decorateInvoice(inv, today = todayISO()) {
  const r = inv.residentId ? db.prepare('SELECT deferUntil FROM residents WHERE id = ?').get(inv.residentId) : null;
  return {
    ...inv,
    total: inv.amount + inv.uniqueCode,
    state: invoiceState(inv, today, r?.deferUntil || ''),
    daysLate: inv.status === 'unpaid' && inv.dueDate < today ? daysBetween(inv.dueDate, today) : 0,
  };
}

// Pay status of a resident, derived from their open invoices.
export function residentSummary(r, today = todayISO()) {
  const open = db.prepare("SELECT * FROM invoices WHERE residentId = ? AND status IN ('unpaid','menunggu') ORDER BY dueDate")
    .all(r.id);
  const overdue = open.filter((i) => i.status === 'unpaid' && i.dueDate < today);
  let payStatus = 'lunas';
  if (overdue.length) payStatus = r.deferUntil && today <= r.deferUntil ? 'ditangguhkan' : 'tunggak';
  else if (open.some((i) => i.status === 'menunggu')) payStatus = 'menunggu';
  const next = db.prepare("SELECT dueDate FROM invoices WHERE residentId = ? AND kind = 'sewa' AND status = 'unpaid' AND dueDate >= ? ORDER BY dueDate LIMIT 1")
    .get(r.id, today);
  return {
    payStatus,
    outstanding: overdue.reduce((a, i) => a + i.amount, 0),
    openCount: open.length,
    overdueCount: overdue.length,
    nextDue: next?.dueDate || '',
    rentAmount: rentOf(r),
    dailyRateAmount: dailyRateOf(r),
    roomType: roomTypeOf(r.room)?.name || '',
  };
}

// ── Payment state changes ──
export function markPaid(id, { method = 'Tunai', paidAt } = {}) {
  const inv = getInvoice(id);
  if (!inv || inv.status === 'void') return null;
  db.prepare("UPDATE invoices SET status='paid', method=?, paidAt=? WHERE id=?")
    .run(method, paidAt || todayISO(), inv.id);
  logActivity('ok', `<strong>${inv.name}</strong> melunasi ${inv.number} (${fmtRp(inv.amount)}) via ${method}`);
  return getInvoice(inv.id);
}

export function confirmByTenant(publicId, { method = 'QRIS', note = '' } = {}) {
  const inv = getInvoiceByPublicId(publicId);
  if (!inv || inv.status !== 'unpaid') return null;
  db.prepare("UPDATE invoices SET status='menunggu', method=?, note=?, confirmedAt=? WHERE id=?")
    .run(method, String(note).slice(0, 300), nowStamp(), inv.id);
  logActivity('warn', `<strong>${inv.name}</strong> melaporkan pembayaran ${inv.number} — menunggu verifikasi`);
  return getInvoice(inv.id);
}

export function rejectConfirmation(id) {
  const inv = getInvoice(id);
  if (!inv || inv.status !== 'menunggu') return null;
  db.prepare("UPDATE invoices SET status='unpaid', method='', note='', confirmedAt='' WHERE id=?").run(inv.id);
  return getInvoice(inv.id);
}

export function voidInvoice(id) {
  const inv = getInvoice(id);
  if (!inv || inv.status === 'paid') return null;
  db.prepare("UPDATE invoices SET status='void' WHERE id=?").run(inv.id);
  return getInvoice(inv.id);
}

// ── Promo ──
export function promoIsOpen(p, today = todayISO()) {
  if (!p || !p.active) return false;
  if (p.startDate && today < p.startDate) return false;
  if (p.endDate && today > p.endDate) return false;
  return true;
}

export function applyPromo(residentId, promoId, today = todayISO()) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(residentId));
  const p = db.prepare('SELECT * FROM promos WHERE id = ?').get(Number(promoId));
  if (!r) throw new Error('Penghuni tidak ditemukan.');
  if (!promoIsOpen(p, today)) throw new Error('Promo tidak aktif atau sudah berakhir.');

  // Mulai dari periode pertama yang belum lunas: lompati periode yang
  // sudah tertutup invoice lunas (termasuk invoice gabungan/promo lama).
  let start = firstFullStart(r.masuk, r.dueDay);
  for (let i = 0; i < MAX_PERIODS; i++) {
    const cov = coveringSewa(r.id, start);
    if (!cov || cov.status === 'unpaid') break;
    if (cov.status === 'menunggu') throw new Error('Ada pembayaran menunggu verifikasi pada periode ini.');
    start = firstFullStart(addDays(cov.periodEnd, 1), r.dueDay);
  }

  let end = start;
  for (let i = 0; i < p.payMonths + p.freeMonths; i++) end = nextStart(end, r.dueDay);
  end = addDays(end, -1);

  const amount = rentOf(r) * p.payMonths;
  return tx(() => {
    const inRange = db.prepare(`SELECT * FROM invoices WHERE residentId = ? AND kind = 'sewa' AND status != 'void'
      AND periodStart >= ? AND periodStart <= ?`).all(r.id, start, end);
    if (inRange.some((i) => i.status === 'menunggu' || i.status === 'paid')) {
      throw new Error('Rentang promo bertabrakan dengan invoice yang sudah dibayar/menunggu.');
    }
    for (const i of inRange) db.prepare("UPDATE invoices SET status='void' WHERE id=?").run(i.id);
    const inv = createInvoice({
      residentId: r.id, name: r.name, room: r.room, wa: r.wa, kind: 'sewa',
      description: `${p.name}: bayar ${p.payMonths} bln + gratis ${p.freeMonths} bln (${fmtDate(start)} – ${fmtDate(end)})`,
      periodStart: start, periodEnd: end, issueDate: today, dueDate: start < today ? today : start,
      amount, promoId: p.id,
    });
    logActivity('jade', `Promo <strong>${p.name}</strong> diterapkan untuk ${r.name} (kamar ${r.room})`);
    return inv;
  });
}

// ── Checkout ──
export function checkoutResident(residentId, { exitDate, alasan = 'Keluar', star = 5, feedback = '' } = {}) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(residentId));
  if (!r) return null;
  const exit = exitDate || todayISO();
  const s = getSettings();

  return tx(() => {
    // Batalkan tagihan untuk periode setelah tanggal keluar.
    db.prepare(`UPDATE invoices SET status='void' WHERE residentId = ? AND status = 'unpaid' AND periodStart > ?`)
      .run(r.id, exit);

    // Periode yang memuat tanggal keluar → pro-rata bila rate harian aktif.
    const current = db.prepare(`SELECT * FROM invoices WHERE residentId = ? AND kind = 'sewa' AND status = 'unpaid'
      AND periodStart <= ? AND periodEnd >= ? AND promoId IS NULL`).get(r.id, exit, exit);
    if (current && r.dailyRateEnabled && current.periodEnd > exit) {
      const days = daysBetween(current.periodStart, exit) + 1;
      db.prepare("UPDATE invoices SET status='void' WHERE id=?").run(current.id);
      createInvoice({
        residentId: r.id, name: r.name, room: r.room, wa: r.wa, kind: 'sewa',
        description: `Sewa pro-rata ${days} hari sampai keluar (${fmtDate(current.periodStart)} – ${fmtDate(exit)})`,
        periodStart: current.periodStart, periodEnd: exit, issueDate: todayISO(), dueDate: exit,
        amount: days * dailyRateOf(r, s),
      });
    }

    db.prepare('UPDATE charges SET active = 0, endDate = ? WHERE residentId = ?').run(exit, r.id);
    db.prepare('INSERT INTO mantan(name,room,masuk,keluar,alasan,star,feedback,createdAt) VALUES(?,?,?,?,?,?,?,?)')
      .run(r.name, r.room, r.masuk, exit, alasan, Number(star) || 5, feedback, nowStamp());
    const outstanding = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM invoices WHERE residentId = ? AND status IN ('unpaid','menunggu')")
      .get(r.id).t;
    // Lepaskan relasi; invoice tetap tersimpan dengan snapshot nama/kamar.
    db.prepare('DELETE FROM residents WHERE id = ?').run(r.id);
    logActivity('pebble', `<strong>${r.name}</strong> keluar dari kamar ${r.room} (${fmtDate(exit)})`);
    return {
      name: r.name, room: r.room, keluar: exit,
      lamaBulan: monthsBetween(r.masuk, exit),
      outstanding,
    };
  });
}

// ── Seed history (sekali saja) ──
export function initBilling() {
  if (getMeta('billing_seeded')) return;
  tx(() => {
    // Charge contoh
    for (const c of seed.charges) {
      const r = db.prepare('SELECT id FROM residents WHERE room = ?').get(c.room);
      if (!r) continue;
      db.prepare(`INSERT INTO charges(residentId,kind,name,amount,recurring,billDay,startDate,active,createdAt)
        VALUES(?,?,?,?,?,?,?,1,?)`).run(r.id, c.kind, c.name, c.amount, c.recurring ? 1 : 0, c.billDay, c.startDate, nowStamp());
    }
    generateAll();

    // Tandai riwayat sebagai lunas sesuai seed.
    const today = todayISO();
    const methods = ['QRIS', 'Transfer', 'Tunai'];
    for (const sr of seed.residents) {
      const r = db.prepare('SELECT id FROM residents WHERE room = ?').get(sr.room);
      if (!r) continue;
      const limit = sr.paidThrough === 'all' ? addDays(today, -1) : sr.paidThrough;
      const invs = db.prepare(`SELECT * FROM invoices WHERE residentId = ? AND kind != 'denda'
        AND status = 'unpaid' AND dueDate <= ? AND periodStart <= ?`).all(r.id, limit, limit);
      invs.forEach((inv, i) => {
        db.prepare("UPDATE invoices SET status='paid', method=?, paidAt=? WHERE id=?")
          .run(methods[(inv.id + i) % 3], inv.dueDate, inv.id);
      });
    }
    setMeta('billing_seeded', nowStamp());
  });
}
