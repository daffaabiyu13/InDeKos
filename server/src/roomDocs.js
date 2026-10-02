// ─────────────────────────────────────────────────────────────
// Dokumentasi kamar:
//  • Foto pengesahan — kondisi kamar saat penghuni mulai menempati
//    (diambil saat pendaftaran di-ACC, tampil di profil penghuni).
//  • Log perbaikan — riwayat perbaikan per kamar: status, biaya,
//    tukang/vendor, foto sebelum/sesudah. Bisa menandai kamar
//    "Perbaikan" selama dikerjakan dan mencatat biaya ke Pengeluaran.
// ─────────────────────────────────────────────────────────────
import db, { tx, logActivity } from './db.js';
import { saveImages, deleteImage } from './uploads.js';
import { todayISO, nowStamp, parseRp, fmtRp } from './util.js';

const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const userName = (u) => u?.name || u?.username || '';

export const MAX_HANDOVER = 12; // per penghuni
const MAX_REPAIR_PHOTOS = 6; // per sisi (sebelum / sesudah)
export const REPAIR_CATEGORIES = ['Listrik', 'Air & Pipa', 'AC / Kipas', 'Furnitur', 'Bangunan & Cat', 'Pintu & Kunci', 'Kebersihan & Hama', 'Lainnya'];
export const REPAIR_STATUS = ['dilaporkan', 'dikerjakan', 'selesai'];

// ═════════════ FOTO PENGESAHAN ═════════════
export function handoverPhotos(residentId) {
  return db.prepare('SELECT * FROM handover_photos WHERE residentId = ? ORDER BY takenAt, id').all(Number(residentId));
}

// photos: [{ data: dataUrl, caption }]
export function addHandoverPhotos(residentId, photos, { date, user } = {}) {
  const r = db.prepare('SELECT id, name, room FROM residents WHERE id = ?').get(Number(residentId));
  if (!r) throw bad('Penghuni tidak ditemukan.', 404);
  const list = Array.isArray(photos) ? photos : [];
  if (!list.length) throw bad('Pilih minimal satu foto kamar.');
  const have = db.prepare('SELECT COUNT(*) AS n FROM handover_photos WHERE residentId = ?').get(r.id).n;
  if (have + list.length > MAX_HANDOVER) throw bad(`Maksimal ${MAX_HANDOVER} foto pengesahan per penghuni (sudah ada ${have}).`);
  const saved = saveImages(list, 'kamar', MAX_HANDOVER);
  const takenAt = ISO.test(date || '') ? date : todayISO();
  const ins = db.prepare(`INSERT INTO handover_photos(residentId,residentName,room,file,caption,takenAt,createdBy,createdAt)
    VALUES(?,?,?,?,?,?,?,?)`);
  tx(() => { for (const p of saved) ins.run(r.id, r.name, r.room, p.file, p.caption, takenAt, userName(user), nowStamp()); });
  logActivity('jade', `${saved.length} foto pengesahan kamar ${r.room} untuk <strong>${r.name}</strong> ditambahkan`);
  return handoverPhotos(r.id);
}

export function deleteHandoverPhoto(id) {
  const p = db.prepare('SELECT * FROM handover_photos WHERE id = ?').get(Number(id));
  if (!p) throw bad('Foto tidak ditemukan.', 404);
  db.prepare('DELETE FROM handover_photos WHERE id = ?').run(p.id);
  deleteImage(p.file);
  return { ok: true, residentId: p.residentId };
}

// ═════════════ LOG PERBAIKAN ═════════════
function parseList(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

function decorate(x) {
  if (!x) return null;
  return { ...x, photosBefore: parseList(x.photosBefore), photosAfter: parseList(x.photosAfter), blockRoom: Boolean(x.blockRoom), recordExpense: Boolean(x.recordExpense) };
}

export function getRepair(id) {
  return decorate(db.prepare('SELECT * FROM room_repairs WHERE id = ?').get(Number(id)));
}

export function listRepairs({ room, status } = {}) {
  const where = []; const args = [];
  if (room) { where.push('room = ?'); args.push(String(room)); }
  if (status === 'open') where.push("status != 'selesai'");
  else if (status === 'done') where.push("status = 'selesai'");
  return db.prepare(`SELECT * FROM room_repairs ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY CASE WHEN status = 'selesai' THEN 1 ELSE 0 END, date DESC, id DESC LIMIT 500`).all(...args).map(decorate);
}

export function repairSummary() {
  const year = todayISO().slice(0, 4);
  const open = db.prepare("SELECT COUNT(*) AS n FROM room_repairs WHERE status != 'selesai'").get().n;
  const yearCost = db.prepare("SELECT COALESCE(SUM(cost),0) AS t FROM room_repairs WHERE substr(COALESCE(NULLIF(doneDate,''), date),1,4) = ?").get(year).t;
  const yearCount = db.prepare('SELECT COUNT(*) AS n FROM room_repairs WHERE substr(date,1,4) = ?').get(year).n;
  return { open, yearCost, yearCount, year };
}

function clean(b, prev = {}) {
  const pick = (k, d) => (b[k] !== undefined ? b[k] : prev[k] !== undefined ? prev[k] : d);
  const title = String(pick('title', '')).trim().slice(0, 200);
  if (!title) throw bad('Masalah / pekerjaan perbaikan wajib diisi.');
  const date = String(pick('date', todayISO()));
  if (!ISO.test(date)) throw bad('Tanggal tidak valid.');
  const status = REPAIR_STATUS.includes(pick('status', 'dilaporkan')) ? pick('status', 'dilaporkan') : 'dilaporkan';
  let doneDate = String(pick('doneDate', '') || '');
  if (status === 'selesai' && !ISO.test(doneDate)) doneDate = todayISO();
  if (status !== 'selesai') doneDate = '';
  if (doneDate && doneDate < date) throw bad('Tanggal selesai tidak boleh sebelum tanggal lapor.');
  const cost = b.cost !== undefined ? parseRp(b.cost) : prev.cost || 0;
  if (cost < 0) throw bad('Biaya tidak valid.');
  const category = REPAIR_CATEGORIES.includes(pick('category', 'Lainnya')) ? pick('category', 'Lainnya') : 'Lainnya';
  return {
    title, date, status, doneDate, cost, category,
    description: String(pick('description', '')).trim().slice(0, 1000),
    vendor: String(pick('vendor', '')).trim().slice(0, 120),
    blockRoom: pick('blockRoom', false) ? 1 : 0,
    recordExpense: pick('recordExpense', false) ? 1 : 0,
  };
}

// Kamar ditandai "Perbaikan" selama ada perbaikan yang memblokir dan belum selesai.
function syncRoomBlock(room, { wasBlocking = false } = {}) {
  const open = db.prepare("SELECT 1 FROM room_repairs WHERE room = ? AND blockRoom = 1 AND status != 'selesai'").get(room);
  if (open) db.prepare('UPDATE rooms SET maintenance = 1 WHERE number = ?').run(room);
  else if (wasBlocking) db.prepare('UPDATE rooms SET maintenance = 0 WHERE number = ?').run(room);
}

// Biaya → Pengeluaran (kategori Perawatan), tetap sinkron saat log diubah.
function syncExpense(rep) {
  const want = rep.recordExpense && rep.cost > 0;
  const exists = rep.expenseId && db.prepare('SELECT id FROM expenses WHERE id = ?').get(rep.expenseId);
  const desc = `Perbaikan kamar ${rep.room}: ${rep.title}`.slice(0, 200);
  const date = rep.doneDate || rep.date;
  if (want && exists) {
    db.prepare('UPDATE expenses SET date = ?, description = ?, amount = ?, merchant = ? WHERE id = ?').run(date, desc, rep.cost, rep.vendor || '', rep.expenseId);
    return rep.expenseId;
  }
  if (want) {
    const info = db.prepare(`INSERT INTO expenses(date,description,cat,amount,source,merchant,receiptPhoto,createdAt)
      VALUES(?,?,'Perawatan',?,'perbaikan',?,'',?)`).run(date, desc, rep.cost, rep.vendor || '', nowStamp());
    return Number(info.lastInsertRowid);
  }
  if (exists) db.prepare('DELETE FROM expenses WHERE id = ?').run(rep.expenseId);
  return null;
}

export function createRepair(b = {}, user = null) {
  const room = db.prepare('SELECT number FROM rooms WHERE number = ?').get(String(b.room || '').trim());
  if (!room) throw bad('Kamar tidak ditemukan.', 404);
  const d = clean(b);
  const res = db.prepare('SELECT id, name FROM residents WHERE room = ?').get(room.number);
  const before = saveImages(b.photosBefore, 'perbaikan', MAX_REPAIR_PHOTOS).map((p) => p.file);
  let after = [];
  try { after = saveImages(b.photosAfter, 'perbaikan', MAX_REPAIR_PHOTOS).map((p) => p.file); } catch (e) { before.forEach(deleteImage); throw e; }
  const now = nowStamp();
  const id = tx(() => {
    const info = db.prepare(`INSERT INTO room_repairs(room,date,title,category,description,status,cost,vendor,doneDate,photosBefore,photosAfter,
      blockRoom,recordExpense,residentId,residentName,createdBy,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      room.number, d.date, d.title, d.category, d.description, d.status, d.cost, d.vendor, d.doneDate, JSON.stringify(before), JSON.stringify(after),
      d.blockRoom, d.recordExpense, res?.id ?? null, res?.name || '', userName(user), now, now);
    const rid = Number(info.lastInsertRowid);
    const expenseId = syncExpense({ ...d, room: room.number, expenseId: null });
    db.prepare('UPDATE room_repairs SET expenseId = ? WHERE id = ?').run(expenseId, rid);
    syncRoomBlock(room.number);
    return rid;
  });
  logActivity(d.status === 'selesai' ? 'jade' : 'warn', `Perbaikan kamar <strong>${room.number}</strong>: ${d.title}${d.cost ? ` (${fmtRp(d.cost)})` : ''}`);
  return getRepair(id);
}

export function updateRepair(id, b = {}) {
  const prev = getRepair(id);
  if (!prev) throw bad('Log perbaikan tidak ditemukan.', 404);
  const d = clean(b, prev);
  const remove = new Set(Array.isArray(b.removePhotos) ? b.removePhotos.map(String) : []);
  let before = prev.photosBefore.filter((f) => !remove.has(f));
  let after = prev.photosAfter.filter((f) => !remove.has(f));
  if (before.length + (b.addPhotosBefore?.length || 0) > MAX_REPAIR_PHOTOS || after.length + (b.addPhotosAfter?.length || 0) > MAX_REPAIR_PHOTOS) {
    throw bad(`Maksimal ${MAX_REPAIR_PHOTOS} foto sebelum dan ${MAX_REPAIR_PHOTOS} foto sesudah.`);
  }
  const addB = saveImages(b.addPhotosBefore, 'perbaikan', MAX_REPAIR_PHOTOS).map((p) => p.file);
  let addA = [];
  try { addA = saveImages(b.addPhotosAfter, 'perbaikan', MAX_REPAIR_PHOTOS).map((p) => p.file); } catch (e) { addB.forEach(deleteImage); throw e; }
  before = [...before, ...addB];
  after = [...after, ...addA];
  tx(() => {
    const expenseId = syncExpense({ ...d, room: prev.room, expenseId: prev.expenseId });
    db.prepare(`UPDATE room_repairs SET date=?, title=?, category=?, description=?, status=?, cost=?, vendor=?, doneDate=?,
      photosBefore=?, photosAfter=?, blockRoom=?, recordExpense=?, expenseId=?, updatedAt=? WHERE id=?`).run(
      d.date, d.title, d.category, d.description, d.status, d.cost, d.vendor, d.doneDate,
      JSON.stringify(before), JSON.stringify(after), d.blockRoom, d.recordExpense, expenseId, nowStamp(), prev.id);
    syncRoomBlock(prev.room, { wasBlocking: prev.blockRoom });
  });
  for (const f of [...prev.photosBefore, ...prev.photosAfter]) if (remove.has(f)) deleteImage(f);
  if (prev.status !== 'selesai' && d.status === 'selesai') {
    logActivity('jade', `Perbaikan kamar <strong>${prev.room}</strong> selesai: ${d.title}${d.cost ? ` (${fmtRp(d.cost)})` : ''}`);
  }
  return getRepair(prev.id);
}

export function deleteRepair(id) {
  const prev = getRepair(id);
  if (!prev) throw bad('Log perbaikan tidak ditemukan.', 404);
  tx(() => {
    if (prev.expenseId) db.prepare('DELETE FROM expenses WHERE id = ?').run(prev.expenseId);
    db.prepare('DELETE FROM room_repairs WHERE id = ?').run(prev.id);
    syncRoomBlock(prev.room, { wasBlocking: prev.blockRoom });
  });
  for (const f of [...prev.photosBefore, ...prev.photosAfter]) deleteImage(f);
  return { ok: true };
}
