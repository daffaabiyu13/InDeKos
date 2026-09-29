// ─────────────────────────────────────────────────────────────
// Google Calendar sync (OAuth2 + Calendar API v3, tanpa SDK)
//
// Butuh env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//            GOOGLE_REDIRECT_URI (default http://localhost:4000/api/gcal/callback)
// Setiap invoice yang belum lunas → event sepanjang hari di tanggal
// jatuh tempo (merah). Saat lunas → judul ✅ & hijau. Saat batal → dihapus.
// Refresh token disimpan di settings (rahasia, tidak dikirim ke browser).
// ─────────────────────────────────────────────────────────────
import db from './db.js';
import { getSettings, setSetting } from './settings.js';
import { addDays, fmtDate, fmtRp, nowStamp } from './util.js';

// Endpoint dapat di-override via env (untuk pengujian/proxy).
const AUTH_URL = process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const REVOKE_URL = process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke';
const API = process.env.GOOGLE_CALENDAR_API || 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';

const clientId = () => process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET || '';
export const redirectUri = () =>
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${process.env.PORT || 4000}/api/gcal/callback`;

export const gcalConfigured = () => Boolean(clientId() && clientSecret());

export function gcalStatus() {
  const s = getSettings();
  const synced = db.prepare("SELECT COUNT(*) AS n FROM invoices WHERE gcalEventId != ''").get().n;
  return {
    configured: gcalConfigured(),
    connected: Boolean(s.gcalRefreshToken),
    connectedAt: s.gcalConnectedAt || '',
    calendarId: s.gcalCalendarId || 'primary',
    redirectUri: redirectUri(),
    syncedEvents: synced,
  };
}

const USERINFO_URL = process.env.GOOGLE_USERINFO_URL || 'https://openidconnect.googleapis.com/v1/userinfo';
export const LOGIN_SCOPE = 'openid email profile';

// URL persetujuan Google. Default: izin kalender (offline → dapat refresh token).
export function authUrl(state, { scope = SCOPE, offline = true, loginHint = '' } = {}) {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope,
    include_granted_scopes: 'true',
    state,
  });
  if (offline) {
    p.set('access_type', 'offline');
    p.set('prompt', 'consent'); // pastikan refresh_token dikirim
  } else {
    p.set('prompt', 'select_account');
  }
  if (loginHint) p.set('login_hint', loginHint);
  return `${AUTH_URL}?${p}`;
}

let cached = null; // { token, exp }

// Tukar authorization code → token (tanpa menyimpan apa pun).
export async function tokenFromCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: clientId(), client_secret: clientSecret(),
      redirect_uri: redirectUri(), grant_type: 'authorization_code',
    }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error_description || j.error || 'Gagal menukar kode OAuth.');
  return j;
}

// Profil akun Google dari access token (dipakai untuk login).
export async function userInfo(accessTokenValue) {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessTokenValue}` }, signal: AbortSignal.timeout(15000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.sub) throw new Error('Gagal membaca profil akun Google.');
  return { sub: String(j.sub), email: String(j.email || '').toLowerCase(), emailVerified: j.email_verified === true || j.email_verified === 'true', name: j.name || '' };
}

// Sambungkan kalender kos: simpan refresh token.
export async function exchangeCode(code) {
  const j = await tokenFromCode(code);
  if (!j.refresh_token) {
    throw new Error('Google tidak mengirim refresh token. Cabut akses InDeKos di akun Google Anda lalu hubungkan ulang.');
  }
  setSetting('gcalRefreshToken', j.refresh_token);
  setSetting('gcalConnectedAt', nowStamp());
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
}

async function accessToken() {
  if (cached && cached.exp > Date.now()) return cached.token;
  const refresh = getSettings().gcalRefreshToken;
  if (!refresh) throw new Error('Google Calendar belum terhubung.');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refresh, client_id: clientId(), client_secret: clientSecret(), grant_type: 'refresh_token',
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    if (j.error === 'invalid_grant') {
      // Akses dicabut dari sisi Google → anggap terputus.
      setSetting('gcalRefreshToken', '');
      throw new Error('Akses Google Calendar dicabut. Silakan hubungkan ulang.');
    }
    throw new Error(j.error_description || j.error || 'Gagal memperbarui token Google.');
  }
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(j.error?.message || `Google Calendar HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return j;
}

function eventFor(inv, s) {
  const total = inv.amount + inv.uniqueCode;
  const paid = inv.status === 'paid';
  const link = `${String(s.publicUrl || '').replace(/\/+$/, '')}/invoice/${inv.publicId}`;
  return {
    summary: paid
      ? `✅ Lunas · Kamar ${inv.room} · ${inv.name}`
      : `${inv.status === 'menunggu' ? '⏳' : '💰'} Tagihan Kamar ${inv.room} · ${inv.name} · ${fmtRp(total)}`,
    description: [
      `${inv.number} — ${inv.description}`,
      `Total: ${fmtRp(total)}`,
      `Jatuh tempo: ${fmtDate(inv.dueDate)}`,
      paid ? `Dibayar: ${fmtDate(inv.paidAt)} (${inv.method})` : `Invoice: ${link}`,
    ].join('\n'),
    start: { date: inv.dueDate },
    end: { date: addDays(inv.dueDate, 1) }, // all-day: end eksklusif
    colorId: paid ? '10' : inv.status === 'menunggu' ? '5' : '11', // hijau / kuning / merah
    reminders: paid ? { useDefault: false, overrides: [] } : { useDefault: false, overrides: [{ method: 'popup', minutes: 3 * 24 * 60 }] },
  };
}

// Single-flight: sync yang tumpang-tindih (scheduler + aksi admin) akan
// berbagi satu proses agar event tidak dibuat ganda.
let running = null;
export function syncInvoices(limit = 100) {
  if (!running) running = doSync(limit).finally(() => { running = null; });
  return running;
}

// Sinkronkan perubahan invoice sejak sync terakhir (idempoten).
async function doSync(limit) {
  const s = getSettings();
  if (!gcalConfigured() || !s.gcalRefreshToken) return { skipped: true };
  const cal = encodeURIComponent(s.gcalCalendarId || 'primary');
  const rows = db.prepare(`SELECT * FROM invoices
    WHERE (gcalEventId = '' AND status IN ('unpaid','menunggu'))
       OR (gcalEventId != '' AND gcalStatus != status)
    ORDER BY dueDate LIMIT ?`).all(limit);

  let created = 0; let updated = 0; let removed = 0; const errors = [];
  const save = db.prepare('UPDATE invoices SET gcalEventId = ?, gcalStatus = ? WHERE id = ?');
  for (const inv of rows) {
    try {
      if (inv.status === 'void') {
        if (inv.gcalEventId) {
          await call('DELETE', `/calendars/${cal}/events/${encodeURIComponent(inv.gcalEventId)}`).catch((e) => {
            if (e.status !== 404 && e.status !== 410) throw e;
          });
          removed++;
        }
        save.run('', 'void', inv.id);
      } else if (!inv.gcalEventId) {
        const ev = await call('POST', `/calendars/${cal}/events`, eventFor(inv, s));
        save.run(ev.id, inv.status, inv.id);
        created++;
      } else {
        try {
          await call('PATCH', `/calendars/${cal}/events/${encodeURIComponent(inv.gcalEventId)}`, eventFor(inv, s));
          updated++;
        } catch (e) {
          if (e.status !== 404 && e.status !== 410) throw e;
          const ev = await call('POST', `/calendars/${cal}/events`, eventFor(inv, s)); // event terhapus manual → buat ulang
          save.run(ev.id, inv.status, inv.id);
          created++;
          continue;
        }
        save.run(inv.gcalEventId, inv.status, inv.id);
      }
    } catch (e) {
      errors.push(`${inv.number}: ${e.message}`);
      if (/dicabut|belum terhubung/.test(e.message)) break;
    }
  }
  return { created, updated, removed, errors };
}

export async function disconnect() {
  const token = getSettings().gcalRefreshToken;
  if (token) {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
  }
  setSetting('gcalRefreshToken', '');
  setSetting('gcalConnectedAt', '');
  cached = null;
  // Event lama milik akun sebelumnya — lupakan ID-nya agar sync ulang bersih.
  db.prepare("UPDATE invoices SET gcalEventId = '', gcalStatus = ''").run();
}
