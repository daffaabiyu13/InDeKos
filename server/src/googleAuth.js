// ─────────────────────────────────────────────────────────────
// Login dengan Google (opsional, di samping username/password).
// • Hanya akun yang sudah terdaftar di InDeKos: dicocokkan lewat
//   ID Google yang ditautkan, atau email yang diisi pemilik di menu Akun.
// • Pemilik yang login pertama kali saat kalender kos belum terhubung
//   langsung diarahkan ke izin Google Calendar.
// • Browser menerima kode sekali pakai (bukan token) yang hanya bisa
//   ditukar dengan nonce milik browser yang memulai login.
// Callback memakai redirect URI yang sama dengan Google Calendar.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import db from './db.js';
import { getSettings } from './settings.js';
import { signToken, publicUser } from './auth.js';
import * as gcal from './gcal.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const codes = new Map(); // code → { userId, nonce, exp }

const clientBase = () => String(getSettings().publicUrl || '').replace(/\/+$/, '');
const fail = (msg) => Object.assign(new Error(msg), { status: 400 });
export const validNonce = (n) => /^[A-Za-z0-9_-]{16,128}$/.test(String(n || ''));

export function loginUrl(nonce) {
  if (!gcal.gcalConfigured()) throw Object.assign(new Error('Login Google belum diaktifkan di server.'), { status: 503 });
  if (!validNonce(nonce)) throw fail('Permintaan login tidak valid.');
  return gcal.authUrl(signToken({ typ: 'glogin', nonce }, CODE_TTL_MS), { scope: gcal.LOGIN_SCOPE, offline: false });
}

export function linkUrl(user) {
  if (!gcal.gcalConfigured()) throw Object.assign(new Error('Login Google belum diaktifkan di server.'), { status: 503 });
  return gcal.authUrl(signToken({ typ: 'glink', sub: user.id }, CODE_TTL_MS), { scope: gcal.LOGIN_SCOPE, offline: false });
}

async function googleProfile(code) {
  const tokens = await gcal.tokenFromCode(String(code || ''));
  return gcal.userInfo(tokens.access_token);
}

function findUser(profile) {
  const bySub = db.prepare('SELECT * FROM users WHERE googleSub = ?').get(profile.sub);
  if (bySub) return bySub;
  if (!profile.email || !profile.emailVerified) return null;
  const byEmail = db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email);
  if (byEmail && !byEmail.googleSub) {
    db.prepare('UPDATE users SET googleSub = ? WHERE id = ?').run(profile.sub, byEmail.id);
    return { ...byEmail, googleSub: profile.sub };
  }
  return byEmail && byEmail.googleSub === profile.sub ? byEmail : null;
}

// Callback login → URL tujuan (halaman login dengan kode, atau izin kalender).
export async function finishLogin(state, query) {
  const back = `${clientBase()}/login`;
  if (query.error) return `${back}?google=error&msg=${encodeURIComponent(query.error === 'access_denied' ? 'Login Google dibatalkan.' : String(query.error))}`;
  let profile;
  try { profile = await googleProfile(query.code); } catch (e) { return `${back}?google=error&msg=${encodeURIComponent(e.message)}`; }
  const user = findUser(profile);
  if (!user) {
    return `${back}?google=error&msg=${encodeURIComponent(`Akun Google ${profile.email || ''} belum terdaftar di InDeKos. Minta pemilik menambahkan email ini di menu Akun.`)}`;
  }
  const code = crypto.randomBytes(24).toString('base64url');
  codes.set(code, { userId: user.id, nonce: state.nonce, exp: Date.now() + CODE_TTL_MS });
  // Pemilik + kalender kos belum terhubung → langsung minta izin Google Calendar.
  if (user.role === 'pemilik' && !getSettings().gcalRefreshToken) {
    return gcal.authUrl(signToken({ typ: 'gcal', sub: user.id, gcode: code }, CODE_TTL_MS), { loginHint: profile.email });
  }
  return `${back}?gcode=${code}`;
}

// Tukar kode sekali pakai → token sesi.
export function exchangeLoginCode(code, nonce) {
  const entry = codes.get(String(code || ''));
  codes.delete(String(code || ''));
  for (const [k, v] of codes) if (v.exp < Date.now()) codes.delete(k); // bersihkan yang kedaluwarsa
  if (!entry || entry.exp < Date.now() || !validNonce(nonce) || entry.nonce !== nonce) {
    throw Object.assign(new Error('Sesi login Google tidak valid atau kedaluwarsa. Silakan coba lagi.'), { status: 401 });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(entry.userId);
  if (!user) throw Object.assign(new Error('Akun tidak ditemukan.'), { status: 401 });
  return { token: signToken({ typ: 'session', sub: user.id, role: user.role }), user: publicUser(user) };
}

// Tautkan akun Google ke akun yang sedang login (menu Akun).
export async function finishLink(state, query) {
  const back = `${clientBase()}/akun`;
  if (query.error) return `${back}?google=error&msg=${encodeURIComponent(query.error === 'access_denied' ? 'Dibatalkan.' : String(query.error))}`;
  try {
    const profile = await googleProfile(query.code);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(state.sub);
    if (!user) throw fail('Akun tidak ditemukan.');
    const other = db.prepare('SELECT username FROM users WHERE (googleSub = ? OR (email = ? AND email != \'\')) AND id != ?')
      .get(profile.sub, profile.email, user.id);
    if (other) throw fail(`Akun Google ini sudah ditautkan ke pengguna "${other.username}".`);
    db.prepare('UPDATE users SET googleSub = ?, email = ? WHERE id = ?').run(profile.sub, profile.emailVerified ? profile.email : '', user.id);
    return `${back}?google=linked`;
  } catch (e) {
    return `${back}?google=error&msg=${encodeURIComponent(e.message)}`;
  }
}

export function unlink(userId) {
  db.prepare("UPDATE users SET googleSub = '', email = '' WHERE id = ?").run(userId);
}
