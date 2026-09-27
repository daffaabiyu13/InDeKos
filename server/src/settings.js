// Settings repository. Secret values (API tokens) never leave the
// server: reads replace them with `<key>Set: boolean`, and an empty
// string on write means "keep the current value" (null clears it).
import db, { tx } from './db.js';
import { SECRET_KEYS } from './data.js';

export function getSettings() {
  const out = {};
  for (const { key, value } of db.prepare('SELECT key, value FROM settings').all()) {
    try { out[key] = JSON.parse(value); } catch { out[key] = value; }
  }
  return out;
}

// Safe for any logged-in user: secrets masked.
export function getMaskedSettings() {
  const s = getSettings();
  for (const k of SECRET_KEYS) {
    s[`${k}Set`] = Boolean(s[k]);
    delete s[k];
  }
  return s;
}

// Safe for anonymous visitors (public forms).
export function getPublicInfo() {
  const s = getSettings();
  return {
    namaKos: s.namaKos,
    alamat: s.alamat,
    wa: s.wa,
    kosType: s.kosType,
    peraturan: s.peraturan,
    paymentMode: s.paymentMode,
  };
}

const up = () => db.prepare(
  'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
);

export function updateSettings(patch = {}) {
  const stmt = up();
  tx(() => {
    for (const [k, v] of Object.entries(patch)) {
      if (k.endsWith('Set')) continue; // masked flags are read-only
      if (SECRET_KEYS.includes(k)) {
        if (v === '' || v === undefined) continue; // keep existing secret
        stmt.run(k, JSON.stringify(v === null ? '' : v));
        continue;
      }
      stmt.run(k, JSON.stringify(v));
    }
  });
  return getMaskedSettings();
}

// Internal writes (e.g. storing the Google refresh token).
export function setSetting(key, value) {
  up().run(key, JSON.stringify(value));
}
