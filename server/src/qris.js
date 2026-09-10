// ─────────────────────────────────────────────────────────────
// QRIS helper — mengubah QRIS STATIS (mis. GoPay Merchant) menjadi
// QRIS DINAMIS dengan nominal terkunci, mengikuti standar EMVCo.
//
// Ini bekerja untuk QRIS milik Anda sendiri (payload didapat dari
// men-decode gambar QR merchant). Uang tetap masuk ke akun yang
// sama karena identitas merchant di payload tidak diubah — hanya
// tag 01 (static→dynamic), tag 54 (nominal), dan tag 63 (CRC).
// ─────────────────────────────────────────────────────────────

// CRC16-CCITT (poly 0x1021, init 0xFFFF) — dipakai QRIS pada tag 63.
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Pecah string EMVCo TLV (tag[2] + length[2] + value) tingkat atas.
function parseTLV(s) {
  const out = [];
  let i = 0;
  while (i + 4 <= s.length) {
    const tag = s.slice(i, i + 2);
    const len = parseInt(s.slice(i + 2, i + 4), 10);
    if (Number.isNaN(len)) break;
    const val = s.slice(i + 4, i + 4 + len);
    out.push({ tag, val });
    i += 4 + len;
  }
  return out;
}

function serialize(list) {
  return list.map(({ tag, val }) => tag + String(val.length).padStart(2, '0') + val).join('');
}

// Validasi kasar bahwa string terlihat seperti payload QRIS.
export function isValidQris(payload) {
  if (!payload || typeof payload !== 'string') return false;
  const s = payload.trim();
  if (!s.startsWith('00')) return false;
  const list = parseTLV(s);
  return list.some((o) => o.tag === '00') && list.some((o) => o.tag === '63');
}

// Bangun QRIS dinamis dari payload statis + nominal (angka rupiah bulat).
export function generateDynamicQris(staticPayload, amount) {
  const s = String(staticPayload).trim();
  let list = parseTLV(s).filter((o) => o.tag !== '63'); // CRC dihitung ulang

  // 01 = Point of Initiation Method: 11 (statis) → 12 (dinamis)
  const poi = list.find((o) => o.tag === '01');
  if (poi) poi.val = '12';
  else list.splice(1, 0, { tag: '01', val: '12' });

  // 54 = Transaction Amount (nominal bulat, tanpa pemisah ribuan)
  list = list.filter((o) => o.tag !== '54');
  const amt = String(Math.round(Number(amount) || 0));
  // Sisipkan 54 sebelum 58 (Country Code) sesuai urutan EMVCo, atau
  // sebelum 59 (Merchant Name), atau di akhir bila tak ditemukan.
  let at = list.findIndex((o) => o.tag === '58');
  if (at < 0) at = list.findIndex((o) => o.tag === '59');
  if (at < 0) at = list.length;
  list.splice(at, 0, { tag: '54', val: amt });

  const body = `${serialize(list)}6304`;
  return body + crc16(body);
}
