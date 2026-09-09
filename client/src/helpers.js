// Shared presentation helpers.

// Deterministic avatar color from a name, using the palette accents.
const palette = ['#7B9669', '#6C8480', '#5E8C5A', '#8AA97D', '#5E7154', '#A0B394', '#6F8C88'];

export function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h += c.charCodeAt(0);
  return palette[h % palette.length];
}

export function initials(name = '') {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

// Maps the data-layer color keys to CSS variables.
export function toVar(key) {
  const map = {
    jade: 'var(--jade)',
    pebble: 'var(--pebble)',
    ok: 'var(--ok)',
    warn: 'var(--warn)',
    err: 'var(--err)',
    forest: 'var(--forest)',
  };
  return map[key] || key;
}

export function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// ── Actions ──

// Normalize an Indonesian phone number to the wa.me international format.
export function waNumber(raw = '') {
  let d = String(raw).replace(/\D/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (!d.startsWith('62') && d) d = `62${d}`;
  return d;
}

// Open a WhatsApp chat. If `number` is empty, WhatsApp lets the user pick a contact.
export function openWhatsApp(number, text = '') {
  const n = waNumber(number);
  const params = text ? `?text=${encodeURIComponent(text)}` : '';
  const url = n ? `https://wa.me/${n}${params}` : `https://wa.me/${params}`;
  window.open(url, '_blank', 'noopener');
}

// Trigger a client-side CSV download from an array of row objects.
export function downloadCSV(filename, rows) {
  if (!rows || rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(',')),
  ].join('\n');
  // Prepend BOM so Excel reads UTF-8 (Rp, accents) correctly.
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Open a printable payment receipt in a new window.
export function printReceipt(payment, kosName = 'InDeKos') {
  const w = window.open('', '_blank', 'width=420,height=600');
  if (!w) return;
  w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8">
    <title>Struk ${payment.name}</title>
    <style>
      body{font-family:system-ui,sans-serif;color:#2B3327;padding:28px;max-width:360px;margin:0 auto}
      h1{font-size:18px;margin:0 0 2px;color:#7B9669}
      .sub{font-size:12px;color:#5F6B58;margin-bottom:18px}
      .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #E1E5DC;font-size:13px}
      .row span:first-child{color:#5F6B58}
      .total{margin-top:14px;padding-top:12px;border-top:2px solid #404E3B;display:flex;justify-content:space-between;font-weight:800;font-size:15px}
      .ok{margin-top:16px;text-align:center;background:#E8F1E4;color:#5E8C5A;font-weight:700;padding:8px;border-radius:8px;font-size:13px}
      .ft{margin-top:20px;text-align:center;font-size:11px;color:#97A08E}
    </style></head><body>
    <h1>${kosName}</h1>
    <div class="sub">Struk Pembayaran Sewa</div>
    <div class="row"><span>Penghuni</span><span>${payment.name}</span></div>
    <div class="row"><span>Kamar</span><span>${payment.room}</span></div>
    <div class="row"><span>Periode</span><span>${payment.period}</span></div>
    <div class="row"><span>Metode</span><span>${payment.method}</span></div>
    <div class="row"><span>Tanggal Bayar</span><span>${payment.date}</span></div>
    <div class="total"><span>Total</span><span>${payment.amount}</span></div>
    <div class="ok">✓ LUNAS</div>
    <div class="ft">Dicetak ${new Date().toLocaleString('id-ID')}</div>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
