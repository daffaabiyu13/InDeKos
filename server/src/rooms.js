// ─────────────────────────────────────────────────────────────
// Tata kamar & upgrade/downgrade tipe kamar.
// • planLayout(): susunan kamar dari jumlah kamar, lantai & format nomor.
//   Pratinjau dulu (tambah / hapus / tidak bisa dihapus), lalu terapkan.
//   Kamar berpenghuni TIDAK PERNAH dihapus; kamar lama tidak diubah.
// • changeRoomType(): ganti tipe (upgrade/downgrade) + riwayat, opsi
//   perbarui invoice sewa yang belum dibayar & beri tahu penghuni via WA.
// ─────────────────────────────────────────────────────────────
import db, { tx, logActivity } from './db.js';
import { getSettings, updateSettings } from './settings.js';
import { todayISO, nowStamp, fmtRp, fmtDate } from './util.js';
import { sendWhatsApp, gatewayReady } from './notify.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const NUMBER_RE = /^[A-Za-z0-9-]{1,10}$/;

// ═════════════ SUSUNAN KAMAR ═════════════
// mode 'urut'   : prefix + nomor berurutan dari `start` (101,102,…); lantai dibagi rata.
// mode 'lantai' : prefix + lantai + urutan 2 digit (101…110, 201…210).
export function generateNumbers({ total, floors, mode = 'urut', prefix = '', start = 101 }) {
  const n = Math.max(0, Math.min(500, Math.round(Number(total) || 0)));
  const L = Math.max(1, Math.min(50, Math.round(Number(floors) || 1)));
  const perFloor = Math.ceil(n / L) || 1;
  const pre = String(prefix || '').trim();
  const out = [];
  for (let i = 0; i < n; i++) {
    const floor = Math.floor(i / perFloor) + 1;
    const number = mode === 'lantai'
      ? `${pre}${floor}${String((i % perFloor) + 1).padStart(2, '0')}`
      : `${pre}${Math.max(0, Math.round(Number(start) || 1)) + i}`;
    out.push({ number, floor });
  }
  return out;
}

function normalizeLayout(b = {}) {
  const layout = {
    total: Math.round(Number(b.total)),
    floors: Math.round(Number(b.floors)),
    mode: b.mode === 'lantai' ? 'lantai' : 'urut',
    prefix: String(b.prefix ?? '').trim(),
    start: Math.round(Number(b.start ?? 101)),
    typeId: b.typeId ? Number(b.typeId) : null,
    removeExtra: b.removeExtra !== false,
  };
  if (!Number.isFinite(layout.total) || layout.total < 1 || layout.total > 500) throw bad('Jumlah kamar harus 1–500.');
  if (!Number.isFinite(layout.floors) || layout.floors < 1 || layout.floors > 50) throw bad('Jumlah lantai harus 1–50.');
  if (layout.floors > layout.total) throw bad('Jumlah lantai tidak boleh melebihi jumlah kamar.');
  if (!/^[A-Za-z0-9-]{0,4}$/.test(layout.prefix)) throw bad('Prefiks maksimal 4 huruf/angka.');
  if (layout.mode === 'urut' && (!Number.isFinite(layout.start) || layout.start < 0 || layout.start > 99999)) throw bad('Nomor awal tidak valid.');
  if (layout.typeId && !db.prepare('SELECT 1 FROM room_types WHERE id = ?').get(layout.typeId)) throw bad('Tipe kamar default tidak ditemukan.');
  return layout;
}

// Tebak susunan saat ini agar formulir langsung sesuai kondisi nyata.
export function currentLayout() {
  const rooms = db.prepare('SELECT number, floor FROM rooms ORDER BY CAST(number AS INTEGER), number').all();
  const total = rooms.length || 1;
  const floors = Math.max(1, ...rooms.map((r) => r.floor || 1));
  const s = getSettings();
  const saved = s.roomLayout || {};
  const nums = new Set(rooms.map((r) => r.number));
  const firstNum = rooms.map((r) => r.number).find((x) => /^\d+$/.test(x));
  const candidates = [
    { ...saved },
    { mode: 'urut', prefix: '', start: Number(firstNum) || 101 },
    { mode: 'lantai', prefix: '' },
  ];
  let best = { mode: 'urut', prefix: '', start: 101 }; let bestScore = -1;
  for (const c of candidates) {
    if (!c.mode) continue;
    const gen = generateNumbers({ total, floors, ...c });
    const score = gen.filter((g) => nums.has(g.number)).length;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  const typeCounts = db.prepare('SELECT typeId, COUNT(*) AS n FROM rooms GROUP BY typeId ORDER BY n DESC').all();
  return {
    total: rooms.length, floors, mode: best.mode, prefix: best.prefix || '', start: best.start ?? 101,
    typeId: saved.typeId || typeCounts[0]?.typeId || null,
    matches: bestScore === rooms.length,
  };
}

export function planLayout(body, { apply = false } = {}) {
  const layout = normalizeLayout(body);
  const target = generateNumbers(layout);
  const invalid = target.find((t) => !NUMBER_RE.test(t.number));
  if (invalid) throw bad(`Nomor kamar "${invalid.number}" tidak valid.`);
  const existing = db.prepare('SELECT number, floor FROM rooms').all();
  const has = new Set(existing.map((r) => r.number));
  const want = new Set(target.map((t) => t.number));
  // Kamar berpenghuni atau sudah dipesan untuk pindah kamar tidak boleh dihapus.
  const occupied = new Set([
    ...db.prepare('SELECT room FROM residents').all().map((r) => r.room),
    ...db.prepare("SELECT toRoom FROM room_transfers WHERE status = 'approved'").all().map((r) => r.toRoom),
  ]);
  const add = target.filter((t) => !has.has(t.number));
  const extra = existing.filter((r) => !want.has(r.number)).map((r) => r.number);
  const remove = layout.removeExtra ? extra.filter((n) => !occupied.has(n)) : [];
  const blocked = layout.removeExtra ? extra.filter((n) => occupied.has(n)) : [];
  const kept = layout.removeExtra ? [] : extra;
  const plan = {
    layout,
    add, remove, blocked, kept,
    resultTotal: existing.length + add.length - remove.length,
  };
  if (!apply) return plan;

  tx(() => {
    const ins = db.prepare('INSERT INTO rooms(number,floor,typeId,maintenance,note) VALUES(?,?,?,0,?)');
    for (const r of add) ins.run(r.number, r.floor, layout.typeId, '');
    const del = db.prepare('DELETE FROM rooms WHERE number = ?');
    for (const n of remove) del.run(n);
    const { removeExtra, ...saved } = layout;
    updateSettings({ roomLayout: saved, lantai: layout.floors });
  });
  if (add.length || remove.length) {
    logActivity('jade', `Susunan kamar diperbarui: ${add.length ? `+${add.length} kamar` : ''}${add.length && remove.length ? ', ' : ''}${remove.length ? `−${remove.length} kamar` : ''} (total ${plan.resultTotal})`);
  }
  return { ...plan, applied: true };
}

// ═════════════ UPGRADE / DOWNGRADE TIPE ═════════════
export function roomTypeHistory(number) {
  return db.prepare('SELECT * FROM room_type_changes WHERE roomNumber = ? ORDER BY id DESC').all(String(number));
}

// Pratinjau/terapkan perubahan tipe untuk satu atau beberapa kamar.
export async function changeRoomType({ numbers, typeId, effective = 'next', updateInvoices = true, notify = false, note = '' }, user, { apply = false } = {}) {
  const list = [...new Set((Array.isArray(numbers) ? numbers : [numbers]).map((n) => String(n || '').trim()).filter(Boolean))];
  if (!list.length) throw bad('Pilih minimal satu kamar.');
  const to = db.prepare('SELECT * FROM room_types WHERE id = ?').get(Number(typeId));
  if (!to) throw bad('Tipe kamar tujuan tidak ditemukan.');
  if (!['now', 'next'].includes(effective)) throw bad('Pilihan berlaku tidak valid.');
  const today = todayISO();

  const items = list.map((number) => {
    const room = db.prepare(`SELECT r.*, t.name AS typeName, t.price AS typePrice FROM rooms r
      LEFT JOIN room_types t ON t.id = r.typeId WHERE r.number = ?`).get(number);
    if (!room) throw bad(`Kamar ${number} tidak ditemukan.`, 404);
    const res = db.prepare('SELECT * FROM residents WHERE room = ?').get(number);
    const fromPrice = room.typePrice ?? 0;
    const same = room.typeId === to.id;
    // Invoice sewa belum dibayar berharga penuh lama → bisa ikut harga baru.
    let invoices = [];
    if (res && !res.rent && !same) {
      invoices = db.prepare(`SELECT id, number, periodStart, periodEnd, amount FROM invoices
        WHERE residentId = ? AND kind = 'sewa' AND status = 'unpaid' AND promoId IS NULL AND amount = ?
          AND ${effective === 'now' ? 'periodEnd >= ?' : 'periodStart > ?'} ORDER BY periodStart`).all(res.id, fromPrice, today);
    }
    return {
      number, floor: room.floor, same,
      from: { id: room.typeId, name: room.typeName || 'Tanpa tipe', price: fromPrice },
      to: { id: to.id, name: to.name, price: to.price },
      direction: to.price > fromPrice ? 'upgrade' : to.price < fromPrice ? 'downgrade' : 'setara',
      resident: res ? { id: res.id, name: res.name, wa: res.wa, customRent: res.rent || null } : null,
      invoices: updateInvoices ? invoices : [],
    };
  });

  const summary = {
    to: { id: to.id, name: to.name, price: to.price },
    effective, updateInvoices, notify,
    items,
    changed: items.filter((i) => !i.same).length,
    unchanged: items.filter((i) => i.same).map((i) => i.number),
    customRent: items.filter((i) => !i.same && i.resident?.customRent).map((i) => ({ number: i.number, name: i.resident.name, rent: i.resident.customRent })),
    invoiceCount: items.reduce((a, i) => a + i.invoices.length, 0),
    notifyReady: gatewayReady(),
  };
  if (!apply) return summary;

  const s = getSettings();
  const actor = user?.name || user?.username || '';
  tx(() => {
    for (const it of items) {
      if (it.same) continue;
      db.prepare('UPDATE rooms SET typeId = ? WHERE number = ?').run(to.id, it.number);
      for (const inv of it.invoices) db.prepare('UPDATE invoices SET amount = ? WHERE id = ?').run(to.price, inv.id);
      db.prepare(`INSERT INTO room_type_changes(roomNumber, fromTypeId, fromName, fromPrice, toTypeId, toName, toPrice, direction,
        effective, invoicesUpdated, residentId, residentName, note, userName, createdAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        it.number, it.from.id, it.from.name, it.from.price, to.id, to.name, to.price, it.direction,
        effective, it.invoices.length, it.resident?.id ?? null, it.resident?.name || '', String(note || '').slice(0, 300), actor, nowStamp(),
      );
      logActivity(it.direction === 'downgrade' ? 'warn' : 'jade',
        `Kamar <strong>${it.number}</strong> ${it.direction}: ${it.from.name} → ${to.name} (${fmtRp(it.from.price)} → ${fmtRp(to.price)})`);
    }
  });

  // Beri tahu penghuni (setelah data tersimpan; gagal kirim tidak membatalkan perubahan).
  const notified = [];
  if (notify && gatewayReady(s)) {
    for (const it of items) {
      if (it.same || !it.resident?.wa) continue;
      const nextInv = db.prepare(`SELECT periodStart FROM invoices WHERE residentId = ? AND kind = 'sewa' AND periodStart > ?
        ORDER BY periodStart LIMIT 1`).get(it.resident.id, today);
      const rent = it.resident.customRent || to.price;
      const when = effective === 'now' ? 'mulai periode berjalan' : `mulai periode berikutnya${nextInv ? ` (${fmtDate(nextInv.periodStart)})` : ''}`;
      const msg = [
        `Halo ${it.resident.name}, info dari *${s.namaKos}* 🏠`,
        '',
        `Kamar ${it.number} kini bertipe *${to.name}*${it.direction === 'setara' ? '' : ` (${it.direction})`}.`,
        it.resident.customRent ? `Sewa Anda tetap ${fmtRp(rent)}/bulan (harga khusus).` : `Sewa menjadi *${fmtRp(rent)}/bulan* ${when}.`,
        note ? `Catatan: ${String(note).slice(0, 300)}` : '',
        '',
        'Terima kasih 🙏',
      ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
      const r = await sendWhatsApp(it.resident.wa, msg, s);
      notified.push({ number: it.number, ok: r.ok, error: r.error || '' });
    }
  }
  return { ...summary, applied: true, notified };
}
