// ─────────────────────────────────────────────────────────────
// Shared helpers: dates (ISO YYYY-MM-DD, zona Asia/Jakarta),
// rupiah, and random ids. All money is stored as INTEGER rupiah.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';

export const TZ = process.env.APP_TZ || 'Asia/Jakarta';

// Today's date in the kos' timezone, as ISO (YYYY-MM-DD).
export function todayISO() {
  if (process.env.APP_TODAY) return process.env.APP_TODAY; // untuk testing
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

export function nowStamp() {
  return new Date().toISOString();
}

const pad = (n) => String(n).padStart(2, '0');

export function toISO(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d };
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
}

// Date in month (y,m) on `day`, clamped to the month's last day.
export function clampDate(y, m, day) {
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
}

export function addDays(iso, n) {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// Shift (y,m) by n months → { y, m }.
export function shiftMonth(y, m, n) {
  const idx = y * 12 + (m - 1) + n;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function daysBetween(a, b) {
  const pa = parseISO(a);
  const pb = parseISO(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

export function monthsBetween(a, b) {
  const pa = parseISO(a);
  const pb = parseISO(b);
  let months = (pb.y - pa.y) * 12 + (pb.m - pa.m);
  if (pb.d < pa.d) months -= 1;
  return Math.max(0, months);
}

// '01/03/2026' → '2026-03-01' (legacy seed format)
export function idToISO(s) {
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [d, m, y] = String(s).split('/').map(Number);
  if (!y) return '';
  return toISO(y, m, d);
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const BULAN_PANJANG = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

export function fmtDate(iso) {
  if (!iso) return '—';
  const { y, m, d } = parseISO(iso);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

export function fmtMonth(iso) {
  const { y, m } = parseISO(iso);
  return `${BULAN_PANJANG[m - 1]} ${y}`;
}

export function fmtRp(n) {
  return `Rp ${Math.round(Number(n) || 0).toLocaleString('id-ID')}`;
}

export function parseRp(s) {
  if (typeof s === 'number') return Math.round(s);
  return parseInt(String(s ?? '').replace(/\D/g, ''), 10) || 0;
}

// ── Passwords (scrypt, per-user salt) ──
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(password), salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

export function randomId(bytes = 12) {
  return crypto.randomBytes(bytes).toString('base64url');
}

// Normalize an Indonesian phone number to international digits (62…).
export function waNumber(raw = '') {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d && !d.startsWith('62')) d = `62${d}`;
  return d;
}
