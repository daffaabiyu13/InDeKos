// Parse OCR text from an Indonesian shop receipt into expense fields.
// Pure function (no DOM) so it can be unit-tested in Node.

const MONTHS = {
  jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, maret: 3, apr: 4, april: 4, mei: 5, may: 5,
  jun: 6, juni: 6, jul: 7, juli: 7, agu: 8, agt: 8, agustus: 8, aug: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, oktober: 10, nov: 11, november: 11, des: 12, dec: 12, desember: 12,
};

// "1.450.000" | "1,450,000" | "85.000,00" | "Rp85000" → 1450000 / 85000
export function parseAmount(raw) {
  let s = String(raw).replace(/rp\.?/gi, '').replace(/\s/g, '');
  if (/[.,]\d{3}[.,]\d{2}$/.test(s)) s = s.slice(0, -3); // buang sen: "85.000,00" → "85.000"
  const digits = s.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

const AMOUNT_RE = /(?:rp\.?\s*)?\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|(?:rp\.?\s*)\d{4,9}/gi;

function amountsIn(line) {
  return (line.match(AMOUNT_RE) || []).map(parseAmount).filter((n) => n >= 500 && n < 1e9);
}

const pad = (n) => String(n).padStart(2, '0');

export function parseDate(text) {
  let m = text.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = text.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const d = Number(m[1]); const mo = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`;
  }
  m = text.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  return '';
}

const TOTAL_KEYS = /(grand\s*total|total\s*bayar|total\s*belanja|total\s*tagihan|jumlah\s*bayar|total|jumlah|tagihan|amount\s*due)/i;
const NOT_TOTAL = /(sub\s*total|subtotal|kembali|kembalian|change|tunai|cash|diskon|disc|ppn|pajak|tax|bayar\s*tunai|debit)/i;

export function guessCategory(text) {
  const t = text.toLowerCase();
  if (/(pln|listrik\s*pra|token\s*listrik|pdam|air\s*minum|indihome|telkom|internet|wifi|biznet|first\s*media)/.test(t)) return 'Utilitas';
  if (/(sabun|pel|sapu|deterjen|pembersih|tisu|tissue|kantong\s*sampah|kebersihan|wipol|sunlight)/.test(t)) return 'Kebersihan';
  if (/(bangunan|semen|cat\s|kuas|paku|pipa|keran|kran|lampu|kabel|stop\s*kontak|servis|service|ac\b|teknisi|material)/.test(t)) return 'Perawatan';
  return 'Lainnya';
}

export function parseReceipt(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Total: baris berlabel TOTAL (bukan subtotal/kembalian), ambil nilai terbesarnya.
  let total = 0;
  for (const line of lines) {
    if (TOTAL_KEYS.test(line) && !NOT_TOTAL.test(line)) {
      const nums = amountsIn(line);
      if (nums.length) total = Math.max(total, ...nums);
    }
  }
  // Label total kadang ada di baris sendiri & angkanya di baris berikutnya.
  if (!total) {
    lines.forEach((line, i) => {
      if (TOTAL_KEYS.test(line) && !NOT_TOTAL.test(line) && lines[i + 1]) {
        const nums = amountsIn(lines[i + 1]);
        if (nums.length) total = Math.max(total, ...nums);
      }
    });
  }
  // Cadangan: nominal terbesar yang bukan kembalian/tunai.
  if (!total) {
    const all = lines.filter((l) => !NOT_TOTAL.test(l)).flatMap(amountsIn);
    if (all.length) total = Math.max(...all);
  }

  // Merchant: baris awal yang berisi huruf (bukan alamat/no telp/tanggal).
  const merchant = lines.slice(0, 5).find((l) => /[a-z]{3,}/i.test(l)
    && !/(jl\.?|jalan|telp|tel\.|phone|npwp|www\.|\d{2}[/-]\d{2}[/-]\d{2,4})/i.test(l)) || '';

  return {
    amount: total,
    date: parseDate(text),
    merchant: merchant.replace(/[^\w\s&.'-]/g, '').trim().slice(0, 60),
    cat: guessCategory(text),
  };
}
