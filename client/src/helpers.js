// Shared presentation & browser helpers.

// Deterministic avatar color from a name, using the palette accents.
const palette = ['#7B9669', '#6C8480', '#5E8C5A', '#8AA97D', '#5E7154', '#A0B394', '#6F8C88'];

export function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h += c.charCodeAt(0);
  return palette[h % palette.length];
}

export function initials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();
}

// Maps data-layer color keys to CSS variables.
export function toVar(key) {
  const map = { jade: 'var(--jade)', pebble: 'var(--pebble)', ok: 'var(--ok)', warn: 'var(--warn)', err: 'var(--err)', forest: 'var(--forest)' };
  return map[key] || key;
}

export const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

// ── Money & dates (server sends integer rupiah & ISO dates) ──
export const fmtRp = (n) => `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
export const fmtRpShort = (n) => {
  const v = Number(n) || 0;
  if (v >= 1e6) return `Rp ${(v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  if (v >= 1e3) return `Rp ${Math.round(v / 1e3)}rb`;
  return fmtRp(v);
};
export const parseRp = (s) => parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0;

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y) return iso;
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthsBetween(a, b) {
  if (!a || !b) return 0;
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  let m = (by - ay) * 12 + (bm - am);
  if (bd < ad) m -= 1;
  return Math.max(0, m);
}

// Rencana lama tinggal (bulan) → "6 bulan", "1 tahun", "1 tahun 6 bulan".
export function fmtStay(months) {
  if (!months) return 'Belum pasti';
  const y = Math.floor(months / 12); const m = months % 12;
  return [y ? `${y} tahun` : '', m ? `${m} bulan` : ''].filter(Boolean).join(' ');
}

// Tanggal ISO + n bulan (dijepit ke akhir bulan), sama dengan perhitungan server.
export function addMonthsISO(iso, n) {
  if (!iso || !n) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  const ty = Math.floor(idx / 12); const tm = (idx % 12) + 1;
  const dim = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, dim)).padStart(2, '0')}`;
}

export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'baru saja';
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} hari lalu`;
  return fmtDate(iso.slice(0, 10));
}

// ── Status labels ──
export const INVOICE_STATE = {
  lunas: { label: 'Lunas', cls: 'b-ok' },
  menunggu: { label: 'Menunggu verifikasi', cls: 'b-warn' },
  terlambat: { label: 'Terlambat', cls: 'b-err' },
  ditangguhkan: { label: 'Ditangguhkan', cls: 'b-pebble' },
  jatuh_tempo: { label: 'Jatuh tempo hari ini', cls: 'b-warn' },
  belum_jatuh_tempo: { label: 'Belum jatuh tempo', cls: 'b-neu' },
  batal: { label: 'Dibatalkan', cls: 'b-neu' },
};

export const PAY_STATUS = {
  lunas: { label: 'Lunas', cls: 'b-ok' },
  tunggak: { label: 'Menunggak', cls: 'b-err' },
  ditangguhkan: { label: 'Ditangguhkan', cls: 'b-pebble' },
  menunggu: { label: 'Menunggu verifikasi', cls: 'b-warn' },
};

export const KIND_LABEL = { sewa: 'Sewa', charge: 'Charge', denda: 'Denda' };

// ── WhatsApp (manual fallback) ──
export function waNumber(raw = '') {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d && !d.startsWith('62')) d = `62${d}`;
  return d;
}

export function openWhatsApp(number, text = '') {
  const n = waNumber(number);
  const params = text ? `?text=${encodeURIComponent(text)}` : '';
  window.open(n ? `https://wa.me/${n}${params}` : `https://wa.me/${params}`, '_blank', 'noopener');
}

// ── Files ──
export function downloadCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' }); // BOM → Excel UTF-8
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Resize + re-encode a user-picked image to a JPEG data URL so uploads
// stay small (KTP/selfie/struk). Also normalizes HEIC-ish camera output.
export function compressImage(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('File harus berupa gambar.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak bisa dibaca.')); };
    img.src = url;
  });
}

// Salin teks ke clipboard; fallback untuk http biasa (navigator.clipboard hanya ada di HTTPS/localhost).
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* coba cara lama */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}
