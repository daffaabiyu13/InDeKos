// ─────────────────────────────────────────────────────────────
// PDF invoice / kwitansi (A5) — dibuat di server dengan pdfkit.
// Belum lunas → "INVOICE" + jatuh tempo (+ QRIS bila mode QRIS aktif).
// Lunas       → "KWITANSI" + cap LUNAS, metode & tanggal bayar.
// ─────────────────────────────────────────────────────────────
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { getSettings } from './settings.js';
import { decorateInvoice } from './billing.js';
import { generateDynamicQris, isValidQris } from './qris.js';
import { fmtDate, fmtRp } from './util.js';

const C = { forest: '#404E3B', jade: '#7B9669', pebble: '#6C8480', ink: '#2B3327', muted: '#5F6B58', line: '#E1E5DC', soft: '#F3F5F0', ok: '#4E8A4A', err: '#C0574B', warn: '#C08A3E' };
const KIND = { sewa: 'Sewa kamar', charge: 'Charge', denda: 'Denda' };
const STATE = { lunas: 'LUNAS', terlambat: 'TERLAMBAT', jatuh_tempo: 'JATUH TEMPO HARI INI', belum_jatuh_tempo: 'BELUM DIBAYAR', menunggu: 'MENUNGGU VERIFIKASI', ditangguhkan: 'DITANGGUHKAN', batal: 'DIBATALKAN' };

export const pdfFileName = (inv) => `${inv.status === 'paid' ? 'Kwitansi' : 'Invoice'}-${inv.number}.pdf`;
export const invoiceUrl = (inv, s = getSettings()) => `${String(s.publicUrl || '').replace(/\/+$/, '')}/invoice/${inv.publicId}`;

export async function invoicePdf(raw, s = getSettings()) {
  const inv = decorateInvoice(raw);
  const paid = inv.status === 'paid';
  let qr = null;
  if (inv.status === 'unpaid' && s.paymentMode === 'qris_static' && isValidQris(s.qrisString)) {
    qr = await QRCode.toBuffer(generateDynamicQris(s.qrisString, inv.total), { margin: 1, width: 360 });
  }

  const doc = new PDFDocument({
    size: 'A5', margins: { top: 34, left: 34, right: 34, bottom: 8 }, // kaki halaman ditulis manual
    info: { Title: `${paid ? 'Kwitansi' : 'Invoice'} ${inv.number}`, Author: s.namaKos || 'InDeKos', Creator: 'InDeKos' },
  });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width; const M = 34; const inner = W - M * 2;

  // Kepala: nama kos
  doc.rect(0, 0, W, 86).fill(C.forest);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(17).text(s.namaKos || 'InDeKos', M, 24, { width: inner - 120 });
  doc.font('Helvetica').fontSize(8.5).fillColor('#DDE5D6')
    .text([s.alamat, s.wa ? `WA ${s.wa}` : ''].filter(Boolean).join('  ·  '), M, 48, { width: inner - 120 });
  doc.font('Helvetica-Bold').fontSize(15).fillColor('#FFFFFF').text(paid ? 'KWITANSI' : 'INVOICE', M, 26, { width: inner, align: 'right' });
  doc.font('Helvetica').fontSize(8.5).fillColor('#DDE5D6').text(inv.number, M, 46, { width: inner, align: 'right' });

  // Status
  let y = 104;
  const stateLabel = STATE[inv.state] || inv.state.toUpperCase();
  const stateColor = paid ? C.ok : inv.state === 'terlambat' ? C.err : inv.state === 'menunggu' ? C.warn : C.pebble;
  doc.roundedRect(M, y, doc.widthOfString(stateLabel, { font: 'Helvetica-Bold', size: 8 }) + 18, 18, 9).fill(stateColor);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(stateLabel, M + 9, y + 5.5);

  // Info tagihan
  y += 32;
  const label = (t, x, yy) => doc.font('Helvetica').fontSize(7.5).fillColor(C.muted).text(t.toUpperCase(), x, yy, { characterSpacing: 0.5 });
  const value = (t, x, yy, w) => doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text(t, x, yy, { width: w });
  const col = inner / 2;
  label('Ditagihkan kepada', M, y); value(`${inv.name || '-'}`, M, y + 11, col - 10);
  doc.font('Helvetica').fontSize(9).fillColor(C.muted).text(`Kamar ${inv.room || '-'}`, M, y + 25);
  label('Tanggal terbit', M + col, y); value(fmtDate(inv.issueDate), M + col, y + 11, col);
  label(paid ? 'Tanggal bayar' : 'Jatuh tempo', M + col, y + 30);
  value(paid ? fmtDate(String(inv.paidAt).slice(0, 10)) : fmtDate(inv.dueDate), M + col, y + 41, col);

  // Rincian
  y += 70;
  doc.rect(M, y, inner, 20).fill(C.soft);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(C.muted).text('KETERANGAN', M + 8, y + 6.5).text('JUMLAH', M, y + 6.5, { width: inner - 8, align: 'right' });
  y += 26;
  const row = (left, right, opts = {}) => {
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 9.5).fillColor(opts.color || C.ink);
    const h = doc.heightOfString(left, { width: inner - 120 });
    doc.text(left, M + 8, y, { width: inner - 120 });
    doc.text(right, M, y, { width: inner - 8, align: 'right' });
    y += Math.max(h, 12) + 8;
  };
  row(inv.description || KIND[inv.kind] || 'Tagihan', fmtRp(inv.amount));
  if (inv.uniqueCode) row('Kode unik pembayaran', fmtRp(inv.uniqueCode), { color: C.muted, size: 8.5 });
  doc.moveTo(M, y - 2).lineTo(W - M, y - 2).lineWidth(0.8).strokeColor(C.line).stroke();
  y += 6;
  row('TOTAL', fmtRp(inv.total), { bold: true, size: 12, color: paid ? C.ok : C.forest });

  // Pembayaran
  y += 6;
  if (paid) {
    label('Pembayaran', M, y);
    doc.font('Helvetica').fontSize(9.5).fillColor(C.ink).text(`${inv.method || 'Tunai'} · ${fmtDate(String(inv.paidAt).slice(0, 10))}`, M, y + 11);
    // Cap LUNAS
    doc.save();
    doc.rotate(-14, { origin: [W - M - 70, y + 20] });
    doc.roundedRect(W - M - 128, y - 2, 118, 42, 6).lineWidth(2.5).strokeColor(C.ok).stroke();
    doc.font('Helvetica-Bold').fontSize(24).fillColor(C.ok).text('LUNAS', W - M - 128, y + 7, { width: 118, align: 'center' });
    doc.restore();
    y += 56;
  } else if (qr) {
    doc.image(qr, M, y, { width: 104 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.ink).text('Bayar dengan QRIS', M + 118, y + 8);
    doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
      .text(`Pindai kode di samping dengan aplikasi bank / e-wallet. Nominal sudah termasuk kode unik (${fmtRp(inv.total)}).`, M + 118, y + 24, { width: inner - 118 });
    y += 114;
  } else {
    label('Cara bayar', M, y);
    doc.font('Helvetica').fontSize(9).fillColor(C.ink).text(`Bayar sebelum ${fmtDate(inv.dueDate)} sesuai total di atas, lalu konfirmasi lewat link di bawah.`, M, y + 11, { width: inner });
    y += 36;
  }

  // Kaki
  const link = invoiceUrl(inv, s);
  const fy = doc.page.height - 58;
  doc.moveTo(M, fy).lineTo(W - M, fy).lineWidth(0.8).strokeColor(C.line).stroke();
  doc.font('Helvetica').fontSize(8).fillColor(C.muted).text(paid ? 'Lihat kwitansi online:' : 'Lihat & bayar online:', M, fy + 9);
  doc.font('Helvetica').fontSize(8).fillColor(C.jade).text(link, M, fy + 20, { width: inner, link, underline: false, lineBreak: false });
  doc.font('Helvetica').fontSize(7).fillColor('#97A08E').text('Dokumen ini dibuat otomatis oleh InDeKos dan sah tanpa tanda tangan.', M, fy + 34, { width: inner, lineBreak: false });

  doc.end();
  return done;
}
