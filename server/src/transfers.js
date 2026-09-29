// ─────────────────────────────────────────────────────────────
// Pindah kamar.
// Penghuni mengajukan (form publik /pindah) → admin menyetujui (atau
// admin langsung memindahkan dari detail penghuni) → pada tanggal pindah
// semuanya berubah otomatis:
//   • kamar penghuni pindah (kamar lama jadi kosong, kamar baru terisi)
//   • harga sewa ikut tipe kamar baru (harga khusus bisa dipertahankan)
//   • invoice sewa mendatang ikut kamar & harga baru
//   • selisih harga periode berjalan ditagih / dikurangi pro-rata
//   • penghuni diberi tahu via WhatsApp
// Kamar tujuan "dipesan" sejak disetujui sampai pindah.
// ─────────────────────────────────────────────────────────────
import db, { tx, logActivity } from './db.js';
import { getSettings } from './settings.js';
import * as billing from './billing.js';
import { sendWhatsApp, gatewayReady } from './notify.js';
import { todayISO, nowStamp, daysBetween, fmtDate, fmtRp } from './util.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const roomInfo = (number) => db.prepare(`SELECT r.number, r.floor, r.maintenance, r.typeId, t.name AS typeName, t.price AS typePrice, t.facilities
  FROM rooms r LEFT JOIN room_types t ON t.id = r.typeId WHERE r.number = ?`).get(String(number));
const parseFac = (f) => { try { return JSON.parse(f || '[]'); } catch { return []; } };

// Kamar yang sudah dipesan oleh pindah kamar yang disetujui (belum dijalankan).
export function reservedRooms() {
  const out = {};
  for (const t of db.prepare("SELECT toRoom, name, moveDate, residentId FROM room_transfers WHERE status = 'approved'").all()) {
    out[t.toRoom] = { name: t.name, moveDate: t.moveDate, residentId: t.residentId };
  }
  return out;
}

// Kamar kosong yang bisa dituju (tidak berpenghuni, tidak perbaikan, tidak dipesan).
export function availableRooms(exceptResidentId = null) {
  const occupied = new Set(db.prepare('SELECT room FROM residents').all().map((r) => r.room));
  const reserved = reservedRooms();
  return db.prepare(`SELECT r.number, r.floor, r.maintenance, t.id AS typeId, t.name AS typeName, t.price AS typePrice, t.facilities
    FROM rooms r LEFT JOIN room_types t ON t.id = r.typeId ORDER BY CAST(r.number AS INTEGER), r.number`).all()
    .filter((r) => !occupied.has(r.number) && !r.maintenance && (!reserved[r.number] || reserved[r.number].residentId === exceptResidentId))
    .map((r) => ({ number: r.number, floor: r.floor, typeId: r.typeId, typeName: r.typeName || '-', price: r.typePrice || 0, facilities: parseFac(r.facilities) }));
}

export function assertRoomFree(number, residentId = null) {
  const room = roomInfo(number);
  if (!room) throw bad(`Kamar ${number} tidak ada.`, 404);
  if (room.maintenance) throw bad(`Kamar ${number} sedang perbaikan.`, 409);
  const occ = db.prepare('SELECT id FROM residents WHERE room = ?').get(room.number);
  if (occ && occ.id !== residentId) throw bad(`Kamar ${number} sudah terisi.`, 409);
  const res = reservedRooms()[room.number];
  if (res && res.residentId !== residentId) throw bad(`Kamar ${number} sudah dipesan untuk ${res.name} (pindah ${fmtDate(res.moveDate)}).`, 409);
  return room;
}

// ═════════════ PENGAJUAN (PUBLIK) ═════════════
export function lookup(r) {
  const room = roomInfo(r.room);
  const pending = db.prepare("SELECT * FROM room_transfers WHERE residentId = ? AND status IN ('pending','approved') ORDER BY id DESC LIMIT 1").get(r.id);
  const current = billing.rentOf(r);
  return {
    name: r.name, room: r.room, typeName: room?.typeName || '-', rent: current, customRent: Boolean(r.rent),
    pending: pending ? { toRoom: pending.toRoom, toTypeName: pending.toTypeName, moveDate: pending.moveDate, status: pending.status } : null,
    rooms: availableRooms(r.id).map((x) => ({ ...x, diff: r.rent ? 0 : x.price - current })),
    types: db.prepare('SELECT id, name, price FROM room_types ORDER BY price').all(),
  };
}

export function request(r, b = {}, source = 'penghuni') {
  if (db.prepare("SELECT 1 FROM room_transfers WHERE residentId = ? AND status IN ('pending','approved')").get(r.id)) {
    throw bad('Sudah ada pengajuan pindah kamar yang sedang diproses.', 409);
  }
  const moveDate = String(b.moveDate || '');
  if (!ISO.test(moveDate)) throw bad('Tanggal pindah wajib diisi.');
  if (moveDate < todayISO()) throw bad('Tanggal pindah tidak boleh di masa lalu.');
  let toRoom = String(b.toRoom || '').trim();
  let toTypeId = b.toTypeId ? Number(b.toTypeId) : null;
  if (toRoom) {
    if (toRoom === r.room) throw bad('Kamar tujuan sama dengan kamar sekarang.');
    const room = assertRoomFree(toRoom, r.id);
    toTypeId = room.typeId;
  } else if (!toTypeId) {
    throw bad('Pilih kamar tujuan atau tipe kamar yang diinginkan.');
  }
  const type = toTypeId ? db.prepare('SELECT * FROM room_types WHERE id = ?').get(toTypeId) : null;
  if (toTypeId && !type) throw bad('Tipe kamar tidak ditemukan.');
  const info = db.prepare(`INSERT INTO room_transfers(residentId, name, wa, fromRoom, toRoom, toTypeId, toTypeName, moveDate, reason,
    status, source, createdAt) VALUES(?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`).run(
    r.id, r.name, String(b.wa || r.wa || ''), r.room, toRoom, toTypeId, type?.name || '', moveDate,
    String(b.reason || '').slice(0, 500), source, nowStamp(),
  );
  logActivity('jade', `<strong>${r.name}</strong> (kamar ${r.room}) mengajukan pindah ke ${toRoom ? `kamar ${toRoom}` : `tipe ${type.name}`} pada ${fmtDate(moveDate)}`);
  return getTransfer(info.lastInsertRowid);
}

// ═════════════ ADMIN ═════════════
export function getTransfer(id) {
  const t = db.prepare('SELECT * FROM room_transfers WHERE id = ?').get(Number(id));
  if (!t) return null;
  let result = null;
  try { result = t.result ? JSON.parse(t.result) : null; } catch { result = null; }
  return { ...t, result, keepCustomRent: Boolean(t.keepCustomRent), prorate: Boolean(t.prorate), notify: Boolean(t.notify) };
}

export function listTransfers(status) {
  const rows = status
    ? db.prepare('SELECT id FROM room_transfers WHERE status = ? ORDER BY moveDate, id').all(status)
    : db.prepare('SELECT id FROM room_transfers ORDER BY id DESC LIMIT 200').all();
  return rows.map((r) => {
    const t = getTransfer(r.id);
    const res = db.prepare('SELECT * FROM residents WHERE id = ?').get(t.residentId);
    const from = roomInfo(t.fromRoom); const to = t.toRoom ? roomInfo(t.toRoom) : null;
    const snap = t.status === 'done' && t.result;
    if (snap) {
      // Sudah dieksekusi: tampilkan harga & tipe saat pindah, bukan kondisi sekarang.
      return {
        ...t, stillActive: Boolean(res),
        fromTypeName: snap.fromTypeName || from?.typeName || '-', fromPrice: snap.oldPrice,
        customRent: snap.keepCustomRent ? snap.customRent : null,
        toTypeNameNow: snap.toTypeName || t.toTypeName || '-', toPrice: snap.newPrice,
      };
    }
    return {
      ...t,
      stillActive: Boolean(res),
      fromTypeName: from?.typeName || '-', fromPrice: res ? billing.rentOf(res) : from?.typePrice || 0,
      customRent: res?.rent || null,
      toTypeNameNow: to?.typeName || t.toTypeName || '-', toPrice: to?.typePrice ?? (t.toTypeId ? db.prepare('SELECT price FROM room_types WHERE id = ?').get(t.toTypeId)?.price : null),
    };
  });
}

// Hitung dampak pindah kamar (dipakai untuk pratinjau & eksekusi).
function computePlan(r, toRoom, moveDate, { keepCustomRent = false, prorate = true } = {}) {
  const room = roomInfo(toRoom);
  const oldPrice = billing.rentOf(r);
  const newPrice = keepCustomRent && r.rent ? r.rent : (room?.typePrice || 0);
  const current = db.prepare(`SELECT * FROM invoices WHERE residentId = ? AND kind = 'sewa' AND status != 'void'
    AND periodStart < ? AND periodEnd >= ? ORDER BY periodStart LIMIT 1`).get(r.id, moveDate, moveDate);
  const future = db.prepare(`SELECT id, number, periodStart, amount, promoId FROM invoices WHERE residentId = ? AND kind = 'sewa'
    AND status = 'unpaid' AND periodStart >= ? ORDER BY periodStart`).all(r.id, moveDate);
  let prorata = null;
  if (prorate && current && !current.promoId && newPrice !== oldPrice) {
    const periodDays = daysBetween(current.periodStart, current.periodEnd) + 1;
    const days = daysBetween(moveDate, current.periodEnd) + 1;
    const diff = Math.round(((newPrice - oldPrice) * days) / periodDays);
    prorata = {
      invoice: current.number, invoiceId: current.id, invoiceStatus: current.status, days, periodDays, diff,
      action: diff > 0 ? 'tagih' : current.status === 'unpaid' ? 'kurangi' : 'kembalikan',
    };
  }
  return {
    toRoom, fromTypeName: roomInfo(r.room)?.typeName || '-', toTypeName: room?.typeName || '-', oldPrice, newPrice, monthlyDiff: newPrice - oldPrice,
    keepCustomRent: Boolean(keepCustomRent && r.rent), customRent: r.rent || null,
    futureInvoices: future.filter((i) => !i.promoId && i.amount === oldPrice).map((i) => ({ id: i.id, number: i.number, periodStart: i.periodStart })),
    futureRoomOnly: future.length,
    prorata,
  };
}

function validateApproval(t, body) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(t.residentId);
  if (!r) throw bad('Penghuni sudah tidak aktif.', 409);
  const toRoom = String(body.toRoom || t.toRoom || '').trim();
  if (!toRoom) throw bad('Pilih kamar tujuan.');
  if (toRoom === r.room) throw bad('Kamar tujuan sama dengan kamar sekarang.');
  assertRoomFree(toRoom, r.id);
  const moveDate = String(body.moveDate || t.moveDate);
  if (!ISO.test(moveDate)) throw bad('Tanggal pindah tidak valid.');
  if (moveDate < todayISO()) throw bad('Tanggal pindah tidak boleh di masa lalu.');
  return { r, toRoom, moveDate };
}

export function preview(id, body = {}) {
  const t = getTransfer(id);
  if (!t) throw bad('Pengajuan tidak ditemukan.', 404);
  const { r, toRoom, moveDate } = validateApproval(t, body);
  return {
    ...computePlan(r, toRoom, moveDate, { keepCustomRent: body.keepCustomRent, prorate: body.prorate !== false }),
    moveDate, immediate: moveDate <= todayISO(), notifyReady: gatewayReady(),
  };
}

export async function approve(id, body = {}, user = null) {
  const t = getTransfer(id);
  if (!t) throw bad('Pengajuan tidak ditemukan.', 404);
  if (t.status !== 'pending') throw bad('Pengajuan sudah diproses.', 409);
  const { toRoom, moveDate } = validateApproval(t, body);
  const room = roomInfo(toRoom);
  db.prepare(`UPDATE room_transfers SET status = 'approved', toRoom = ?, toTypeId = ?, toTypeName = ?, moveDate = ?, keepCustomRent = ?,
    prorate = ?, notify = ?, adminNote = ?, processedBy = ?, processedAt = ? WHERE id = ?`).run(
    toRoom, room.typeId, room.typeName || '', moveDate, body.keepCustomRent ? 1 : 0, body.prorate === false ? 0 : 1,
    body.notify === false ? 0 : 1, String(body.note || '').slice(0, 500), user?.name || user?.username || '', nowStamp(), t.id,
  );
  logActivity('jade', `Pindah kamar <strong>${t.name}</strong> ${t.fromRoom} → ${toRoom} disetujui (${fmtDate(moveDate)})`);
  const s = getSettings();
  if (moveDate <= todayISO()) return { ...(await execute(t.id)), scheduled: false };
  // Dijadwalkan: kabari penghuni bahwa pengajuan disetujui.
  if (body.notify !== false && gatewayReady(s) && t.wa) {
    await sendWhatsApp(t.wa, [
      `Halo ${t.name}, pengajuan pindah kamar Anda *disetujui* ✅`,
      '',
      `🏠 Kamar ${t.fromRoom} → *Kamar ${toRoom}* (${room.typeName || '-'})`,
      `📅 Tanggal pindah: ${fmtDate(moveDate)}`,
      'Kamar tujuan sudah kami siapkan. Terima kasih 🙏',
    ].join('\n'), s);
  }
  return { ...getTransfer(t.id), scheduled: true };
}

export async function reject(id, reason = '') {
  const t = getTransfer(id);
  if (!t) throw bad('Pengajuan tidak ditemukan.', 404);
  if (!['pending', 'approved'].includes(t.status)) throw bad('Pengajuan sudah diproses.', 409);
  const status = t.status === 'approved' ? 'cancelled' : 'rejected';
  db.prepare('UPDATE room_transfers SET status = ?, adminNote = ?, processedAt = ? WHERE id = ?').run(status, String(reason || '').slice(0, 500), nowStamp(), t.id);
  logActivity('warn', `Pindah kamar <strong>${t.name}</strong> ${t.fromRoom} → ${t.toRoom || t.toTypeName} ${status === 'cancelled' ? 'dibatalkan' : 'ditolak'}`);
  const s = getSettings();
  if (gatewayReady(s) && t.wa) {
    await sendWhatsApp(t.wa, `Halo ${t.name}, mohon maaf pengajuan pindah kamar Anda ${status === 'cancelled' ? 'dibatalkan' : 'belum dapat kami setujui'}.${reason ? `\nAlasan: ${reason}` : ''}\nSilakan hubungi pengelola untuk info lebih lanjut. 🙏`, s);
  }
  return getTransfer(t.id);
}

// Admin memindahkan penghuni langsung (tanpa pengajuan dari penghuni).
export async function direct(residentId, body = {}, user = null) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(residentId));
  if (!r) throw bad('Penghuni tidak ditemukan.', 404);
  const t = request(r, { toRoom: body.toRoom, moveDate: body.moveDate, reason: body.note || 'Dipindahkan oleh pengelola' }, 'admin');
  return approve(t.id, body, user);
}

export function previewDirect(residentId, body = {}) {
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(Number(residentId));
  if (!r) throw bad('Penghuni tidak ditemukan.', 404);
  const t = { residentId: r.id, toRoom: body.toRoom, moveDate: body.moveDate };
  const { toRoom, moveDate } = validateApproval(t, body);
  return {
    ...computePlan(r, toRoom, moveDate, { keepCustomRent: body.keepCustomRent, prorate: body.prorate !== false }),
    moveDate, immediate: moveDate <= todayISO(), notifyReady: gatewayReady(),
  };
}

// ═════════════ EKSEKUSI ═════════════
export async function execute(id) {
  const t = getTransfer(id);
  if (!t || t.status !== 'approved') return t;
  const r = db.prepare('SELECT * FROM residents WHERE id = ?').get(t.residentId);
  if (!r) {
    db.prepare("UPDATE room_transfers SET status = 'cancelled', adminNote = 'Penghuni sudah keluar', processedAt = ? WHERE id = ?").run(nowStamp(), t.id);
    return getTransfer(t.id);
  }
  const plan = computePlan(r, t.toRoom, t.moveDate, { keepCustomRent: t.keepCustomRent, prorate: t.prorate });
  const s = getSettings();
  tx(() => {
    db.prepare('UPDATE residents SET room = ?, rent = ? WHERE id = ?').run(t.toRoom, plan.keepCustomRent ? r.rent : null, r.id);
    // Invoice sewa mendatang: pindah ke kamar baru; berharga penuh lama → harga baru.
    db.prepare(`UPDATE invoices SET room = ? WHERE residentId = ? AND kind = 'sewa' AND status = 'unpaid' AND periodStart >= ?`).run(t.toRoom, r.id, t.moveDate);
    for (const inv of plan.futureInvoices) db.prepare('UPDATE invoices SET amount = ? WHERE id = ?').run(plan.newPrice, inv.id);
    // Selisih harga periode berjalan (pro-rata).
    const p = plan.prorata;
    if (p && p.diff > 0) {
      const cur = billing.getInvoice(p.invoiceId);
      const inv = billing.createInvoice({
        residentId: r.id, name: r.name, room: t.toRoom, wa: r.wa, kind: 'charge',
        description: `Selisih pindah kamar ${t.fromRoom} → ${t.toRoom} (${p.days} dari ${p.periodDays} hari)`,
        periodStart: t.moveDate, periodEnd: cur.periodEnd, issueDate: todayISO(), dueDate: t.moveDate, amount: p.diff,
      });
      p.chargeInvoice = inv.number;
    } else if (p && p.diff < 0 && p.invoiceStatus === 'unpaid') {
      const cur = billing.getInvoice(p.invoiceId);
      db.prepare('UPDATE invoices SET amount = ?, note = ? WHERE id = ?').run(Math.max(0, cur.amount + p.diff),
        `Dikurangi ${fmtRp(-p.diff)} karena pindah ke kamar ${t.toRoom}`.slice(0, 300), cur.id);
    }
    db.prepare("UPDATE room_transfers SET status = 'done', executedAt = ?, result = ? WHERE id = ?").run(nowStamp(), JSON.stringify(plan), t.id);
    logActivity('jade', `<strong>${r.name}</strong> pindah kamar ${t.fromRoom} → ${t.toRoom} (${fmtRp(plan.oldPrice)} → ${fmtRp(plan.newPrice)}/bln)`);
  });

  if (t.notify && gatewayReady(s) && (t.wa || r.wa)) {
    const p = plan.prorata;
    const extra = !p ? '' : p.diff > 0 ? `Selisih ${p.days} hari periode ini: ${fmtRp(p.diff)} (invoice ${p.chargeInvoice}).`
      : p.action === 'kurangi' ? `Tagihan periode ini dikurangi ${fmtRp(-p.diff)}.`
        : `Kelebihan bayar periode ini ${fmtRp(-p.diff)} akan diselesaikan pengelola.`;
    await sendWhatsApp(t.wa || r.wa, [
      `Halo ${r.name}, pindah kamar Anda sudah tercatat ✅`,
      '',
      `🏠 Kamar ${t.fromRoom} → *Kamar ${t.toRoom}* (${plan.toTypeName})`,
      `📅 Mulai ${fmtDate(t.moveDate)}`,
      `💰 Sewa: *${fmtRp(plan.newPrice)}/bulan*${plan.monthlyDiff ? ` (sebelumnya ${fmtRp(plan.oldPrice)})` : ''}`,
      extra,
      '',
      `Terima kasih — ${s.namaKos} 🙏`,
    ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n'), s);
  }
  return getTransfer(t.id);
}

// Jalankan pindah kamar yang sudah disetujui & tanggalnya tiba (scheduler).
export async function runDue(today = todayISO()) {
  const due = db.prepare("SELECT id FROM room_transfers WHERE status = 'approved' AND moveDate <= ? ORDER BY moveDate, id").all(today);
  let done = 0;
  for (const d of due) {
    const r = await execute(d.id);
    if (r?.status === 'done') done++;
  }
  return { done };
}
