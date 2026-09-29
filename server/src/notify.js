// ─────────────────────────────────────────────────────────────
// WhatsApp notifications (gateway: Fonnte atau Wablas)
// • Kirim invoice otomatis saat terbit (on/off: invoiceAutoSend)
// • Reminder H-N sebelum jatuh tempo (on/off global: reminderEnabled,
//   dan per penghuni: residents.reminderEnabled)
// Setiap pengiriman dicatat di tabel `notifications`; invoice diberi
// cap sentAt/remindedAt agar tidak terkirim dua kali.
// ─────────────────────────────────────────────────────────────
import db from './db.js';
import { getSettings } from './settings.js';
import { todayISO, addDays, daysBetween, fmtDate, fmtRp, waNumber, nowStamp } from './util.js';

export function gatewayReady(s = getSettings()) {
  if (!s.waProvider || s.waProvider === 'none' || !s.waToken) return false;
  if (s.waProvider === 'wablas' && !s.waBaseUrl) return false;
  return true;
}

export async function sendWhatsApp(target, message, s = getSettings()) {
  const phone = waNumber(target);
  if (!phone) return { ok: false, error: 'Nomor WhatsApp kosong.' };
  if (!gatewayReady(s)) return { ok: false, error: 'Gateway WhatsApp belum dikonfigurasi.' };
  try {
    let res;
    if (s.waProvider === 'fonnte') {
      res = await fetch(process.env.FONNTE_API_URL || 'https://api.fonnte.com/send', { // env hanya untuk test
        method: 'POST',
        headers: { Authorization: s.waToken },
        body: new URLSearchParams({ target: phone, message, countryCode: '62' }),
        signal: AbortSignal.timeout(15000),
      });
    } else if (s.waProvider === 'wablas') {
      res = await fetch(`${String(s.waBaseUrl).replace(/\/+$/, '')}/api/send-message`, {
        method: 'POST',
        headers: { Authorization: s.waToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
        signal: AbortSignal.timeout(15000),
      });
    } else {
      return { ok: false, error: `Provider tidak dikenal: ${s.waProvider}` };
    }
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    // Fonnte & Wablas sama-sama mengembalikan { status: true|false, ... }
    const ok = res.ok && !(body && typeof body === 'object' && body.status === false);
    return {
      ok,
      response: (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 500),
      error: ok ? '' : (body?.reason || body?.message || `HTTP ${res.status}`),
    };
  } catch (e) {
    return { ok: false, error: e.name === 'TimeoutError' ? 'Gateway tidak merespons (timeout).' : e.message };
  }
}

export function log(invoiceId, kind, target, result) {
  db.prepare('INSERT INTO notifications(invoiceId,kind,target,status,response,createdAt) VALUES(?,?,?,?,?,?)')
    .run(invoiceId ?? null, kind, target, result.ok ? 'terkirim' : 'gagal', result.ok ? result.response || '' : result.error || '', nowStamp());
}

const invoiceLink = (inv, s) => `${String(s.publicUrl || '').replace(/\/+$/, '')}/invoice/${inv.publicId}`;

export function invoiceMessage(inv, s = getSettings()) {
  const total = inv.amount + inv.uniqueCode;
  return [
    `Halo ${inv.name} 👋`,
    `Berikut tagihan dari *${s.namaKos}*:`,
    '',
    `🧾 ${inv.number}`,
    `📌 ${inv.description}`,
    `💰 Total: *${fmtRp(total)}*${inv.uniqueCode ? ` (termasuk kode unik ${inv.uniqueCode})` : ''}`,
    `📅 Jatuh tempo: ${fmtDate(inv.dueDate)}`,
    '',
    `Lihat & bayar invoice: ${invoiceLink(inv, s)}`,
    'Terima kasih 🙏',
  ].join('\n');
}

export function reminderMessage(inv, s = getSettings(), today = todayISO()) {
  const d = daysBetween(today, inv.dueDate);
  const when = d <= 0 ? '*hari ini*' : `dalam *${d} hari* (${fmtDate(inv.dueDate)})`;
  return [
    `Halo ${inv.name}, pengingat dari *${s.namaKos}* 🔔`,
    '',
    `Tagihan ${inv.number} sebesar *${fmtRp(inv.amount + inv.uniqueCode)}* jatuh tempo ${when}.`,
    `📌 ${inv.description}`,
    '',
    `Bayar di sini: ${invoiceLink(inv, s)}`,
    'Abaikan pesan ini jika sudah membayar. Terima kasih 🙏',
  ].join('\n');
}

// Bukti pelunasan — dikirim saat invoice berstatus lunas.
export function receiptMessage(inv, s = getSettings()) {
  const total = inv.amount + inv.uniqueCode;
  const today = todayISO();
  const open = inv.residentId ? db.prepare(`SELECT dueDate, amount, uniqueCode FROM invoices
    WHERE residentId = ? AND status = 'unpaid' AND id != ? ORDER BY dueDate`).all(inv.residentId, inv.id) : [];
  const overdue = open.filter((i) => i.dueDate < today);
  const next = open.find((i) => i.dueDate >= today);
  const after = overdue.length
    ? `⚠️ Masih ada ${overdue.length} tagihan belum lunas (${fmtRp(overdue.reduce((a, i) => a + i.amount + i.uniqueCode, 0))}). Lihat semua tagihan: ${String(s.publicUrl || '').replace(/\/+$/, '')}/bayar`
    : next ? `Tagihan berikutnya: ${fmtRp(next.amount + next.uniqueCode)}, jatuh tempo ${fmtDate(next.dueDate)}.` : '';
  return [
    `Halo ${inv.name}, pembayaran Anda sudah kami terima ✅`,
    '',
    `🧾 ${inv.number} — *LUNAS*`,
    `📌 ${inv.description}`,
    `💰 Dibayar: *${fmtRp(total)}*${inv.method ? ` (${inv.method})` : ''}`,
    `📅 Tanggal bayar: ${fmtDate(String(inv.paidAt || today).slice(0, 10))}`,
    '',
    `Kwitansi: ${invoiceLink(inv, s)}`,
    after,
    `Terima kasih telah tinggal di *${s.namaKos}* 🙏`,
  ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n');
}

// Manual send from the admin panel. Falls back to a wa.me link when no
// gateway is configured so the admin can still send it by hand.
export async function sendInvoice(inv, { kind = 'invoice' } = {}) {
  const s = getSettings();
  const message = kind === 'reminder' ? reminderMessage(inv, s) : kind === 'lunas' ? receiptMessage(inv, s) : invoiceMessage(inv, s);
  if (!gatewayReady(s)) {
    return { ok: true, via: 'link', link: `https://wa.me/${waNumber(inv.wa)}?text=${encodeURIComponent(message)}` };
  }
  const result = await sendWhatsApp(inv.wa, message, s);
  log(inv.id, kind, inv.wa, result);
  if (result.ok) {
    db.prepare(`UPDATE invoices SET ${kind === 'reminder' ? 'remindedAt' : kind === 'lunas' ? 'receiptSentAt' : 'sentAt'} = ? WHERE id = ?`).run(nowStamp(), inv.id);
  }
  return { ...result, via: 'gateway' };
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// Single-flight: jika job yang sama sedang berjalan (dipicu scheduler,
// aksi admin, dsb.), pemanggil berikutnya menunggu hasil yang sama —
// mencegah pesan WhatsApp terkirim dua kali.
const inflight = {};
function singleFlight(key, fn) {
  if (!inflight[key]) inflight[key] = fn().finally(() => { inflight[key] = null; });
  return inflight[key];
}

export const runAutoSend = (limit) => singleFlight('autosend', () => doAutoSend(limit));
export const runReminders = (limit) => singleFlight('reminders', () => doReminders(limit));
export const runReceipts = (limit) => singleFlight('receipts', () => doReceipts(limit));

// Status pengiriman bukti untuk ditampilkan setelah admin menandai lunas.
export function receiptPlan(inv, s = getSettings()) {
  if (s.receiptAutoSend === false) return 'off';
  if (!gatewayReady(s)) return 'no-gateway';
  if (!inv?.wa) return 'no-wa';
  return 'queued';
}

// Kirim bukti pelunasan untuk invoice yang baru lunas (≤3 hari; gagal dicoba lagi di job berikutnya).
async function doReceipts(limit = 50) {
  const s = getSettings();
  if (s.receiptAutoSend === false || !gatewayReady(s)) return { sent: 0, skipped: true };
  const rows = db.prepare(`SELECT * FROM invoices WHERE status = 'paid' AND receiptSentAt = '' AND wa != ''
    AND substr(paidAt, 1, 10) >= ? ORDER BY paidAt, id LIMIT ?`).all(addDays(todayISO(), -3), limit);
  let sent = 0;
  for (const inv of rows) {
    const result = await sendWhatsApp(inv.wa, receiptMessage(inv, s), s);
    log(inv.id, 'lunas', inv.wa, result);
    if (result.ok) {
      db.prepare('UPDATE invoices SET receiptSentAt = ? WHERE id = ?').run(nowStamp(), inv.id);
      sent++;
    }
    if (rows.length > 1) await pause(1500);
  }
  return { sent };
}

// Kirim invoice yang baru terbit & belum pernah terkirim.
async function doAutoSend(limit = 50) {
  const s = getSettings();
  if (!s.invoiceAutoSend || !gatewayReady(s)) return { sent: 0, skipped: true };
  const rows = db.prepare(`SELECT * FROM invoices WHERE status = 'unpaid' AND sentAt = '' AND issueDate <= ?
    AND wa != '' ORDER BY issueDate LIMIT ?`).all(todayISO(), limit);
  let sent = 0;
  for (const inv of rows) {
    const result = await sendWhatsApp(inv.wa, invoiceMessage(inv, s), s);
    log(inv.id, 'invoice', inv.wa, result);
    if (result.ok) {
      db.prepare('UPDATE invoices SET sentAt = ? WHERE id = ?').run(nowStamp(), inv.id);
      sent++;
    }
    await pause(1500); // hindari rate-limit gateway
  }
  return { sent };
}

// Reminder H-N (default H-3) sebelum jatuh tempo.
async function doReminders(limit = 50) {
  const s = getSettings();
  if (!s.reminderEnabled || !gatewayReady(s)) return { sent: 0, skipped: true };
  const today = todayISO();
  const until = addDays(today, Number(s.reminderDaysBefore ?? 3));
  const rows = db.prepare(`SELECT i.* FROM invoices i JOIN residents r ON r.id = i.residentId
    WHERE i.status = 'unpaid' AND i.remindedAt = '' AND i.dueDate >= ? AND i.dueDate <= ?
      AND r.reminderEnabled = 1 AND (r.deferUntil = '' OR r.deferUntil < i.dueDate) AND i.wa != ''
    ORDER BY i.dueDate LIMIT ?`).all(today, until, limit);
  let sent = 0;
  for (const inv of rows) {
    const result = await sendWhatsApp(inv.wa, reminderMessage(inv, s, today), s);
    log(inv.id, 'reminder', inv.wa, result);
    if (result.ok) {
      db.prepare('UPDATE invoices SET remindedAt = ? WHERE id = ?').run(nowStamp(), inv.id);
      sent++;
    }
    await pause(1500);
  }
  return { sent };
}

export function recentNotifications(limit = 50) {
  return db.prepare(`SELECT n.*, i.number, i.name FROM notifications n LEFT JOIN invoices i ON i.id = n.invoiceId
    ORDER BY n.id DESC LIMIT ?`).all(limit);
}
