// ─────────────────────────────────────────────────────────────
// Authentication & roles
// Peran: 'pemilik' (akses penuh: pengaturan, harga, akun, integrasi)
//        'admin'   (operasional harian).
// Token = base64url(payload).base64url(HMAC-SHA256) — tanpa dependensi.
// ─────────────────────────────────────────────────────────────
import crypto from 'node:crypto';
import express from 'express';
import db, { getMeta, setMeta } from './db.js';
import { hashPassword, verifyPassword, nowStamp } from './util.js';

const TOKEN_TTL_MS = 1000 * 60 * 60 * 12; // 12 jam

function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  let s = getMeta('auth_secret');
  if (!s) {
    s = crypto.randomBytes(32).toString('hex');
    setMeta('auth_secret', s);
  }
  return s;
}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', secret()).update(data).digest('base64url');

export function signToken(payload, ttlMs = TOKEN_TTL_MS) {
  const body = b64(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }));
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  const [body, mac] = String(token || '').split('.');
  if (!body || !mac) return null;
  const expected = sign(body);
  if (expected.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(mac))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

const publicUser = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

// Accepts `Authorization: Bearer <token>`. `?token=` is accepted only when
// `allowQuery` is set (for <img src> of protected uploads).
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  let token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token && req.allowQueryToken) token = String(req.query.token || '');
  const payload = verifyToken(token);
  if (!payload || payload.typ !== 'session') return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  if (!user) return res.status(401).json({ error: 'Akun tidak ditemukan.' });
  req.user = publicUser(user);
  next();
}

export const allowQueryToken = (req, _res, next) => { req.allowQueryToken = true; next(); };

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki akses untuk tindakan ini.' });
    }
    next();
  };
}

// ── Login rate limit (per IP + username) ──
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

function tooMany(key) {
  const now = Date.now();
  const a = (attempts.get(key) || []).filter((t) => now - t < WINDOW_MS);
  attempts.set(key, a);
  return a.length >= MAX_ATTEMPTS;
}

// ── Routes ──
export const authRouter = express.Router();

authRouter.post('/auth/login', (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const key = `${req.ip}:${username}`;
  if (tooMany(key)) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    attempts.get(key).push(Date.now());
    return res.status(401).json({ error: 'Username atau password salah.' });
  }
  attempts.delete(key);
  res.json({ token: signToken({ typ: 'session', sub: user.id, role: user.role }), user: publicUser(user) });
});

authRouter.get('/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

authRouter.post('/auth/password', requireAuth, (req, res) => {
  const { current = '', next = '' } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(current, user.passwordHash)) return res.status(400).json({ error: 'Password saat ini salah.' });
  if (String(next).length < 8) return res.status(400).json({ error: 'Password baru minimal 8 karakter.' });
  db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(next), user.id);
  res.json({ ok: true });
});

// User management — pemilik only.
authRouter.get('/users', requireAuth, requireRole('pemilik'), (_req, res) => {
  res.json(db.prepare('SELECT id, username, name, role, createdAt FROM users ORDER BY id').all());
});

authRouter.post('/users', requireAuth, requireRole('pemilik'), (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const { name = '', role = 'admin', password = '' } = req.body || {};
  if (!/^[a-z0-9_.]{3,32}$/.test(username)) return res.status(400).json({ error: 'Username 3–32 karakter (huruf kecil, angka, _ .).' });
  if (!['pemilik', 'admin'].includes(role)) return res.status(400).json({ error: 'Peran tidak valid.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) return res.status(409).json({ error: 'Username sudah dipakai.' });
  const info = db.prepare('INSERT INTO users(username,name,role,passwordHash,createdAt) VALUES(?,?,?,?,?)')
    .run(username, name || username, role, hashPassword(password), nowStamp());
  res.status(201).json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid)));
});

const pemilikCount = () => db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'pemilik'").get().n;

authRouter.put('/users/:id', requireAuth, requireRole('pemilik'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const { name, role, password } = req.body || {};
  if (role && !['pemilik', 'admin'].includes(role)) return res.status(400).json({ error: 'Peran tidak valid.' });
  if (role === 'admin' && u.role === 'pemilik' && pemilikCount() <= 1) {
    return res.status(400).json({ error: 'Harus ada minimal satu akun pemilik.' });
  }
  if (password && String(password).length < 8) return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  db.prepare('UPDATE users SET name = ?, role = ? WHERE id = ?').run(name ?? u.name, role ?? u.role, u.id);
  if (password) db.prepare('UPDATE users SET passwordHash = ? WHERE id = ?').run(hashPassword(password), u.id);
  res.json(publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id)));
});

authRouter.delete('/users/:id', requireAuth, requireRole('pemilik'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  if (u.id === req.user.id) return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
  if (u.role === 'pemilik' && pemilikCount() <= 1) return res.status(400).json({ error: 'Harus ada minimal satu akun pemilik.' });
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  res.json({ ok: true });
});
