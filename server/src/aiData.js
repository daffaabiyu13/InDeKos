// ─────────────────────────────────────────────────────────────
// AI InDeKos — analitik dari data nyata.
// • snapshot()      : fakta kos (kamar, penghuni, tagihan, keuangan…)
// • insightsFor()   : insight + saran pertanyaan per menu
// • localAnswer()   : jawaban tanpa API key (mesin aturan)
// • contextFor()    : data ringkas untuk dikirim ke Claude
// Teks memakai "markdown ringan": **tebal**, baris "- " = poin.
// ─────────────────────────────────────────────────────────────
import db from './db.js';
import { getSettings } from './settings.js';
import * as repo from './repo.js';
import * as billing from './billing.js';
import { gatewayReady } from './notify.js';
import { isValidQris } from './qris.js';
import {
  todayISO, addDays, daysBetween, monthsBetween, parseISO, shiftMonth, fmtDate, fmtRp, verifyPassword, fmtStay,
} from './util.js';

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const monthKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const monthLabel = (key) => { const [y, m] = key.split('-').map(Number); return `${BULAN[m - 1]} ${y}`; };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const sum = (arr, f = (x) => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const plural = (n, word) => `${n} ${word}`;
const lower = (s) => String(s || '').toLowerCase();

export const SCOPES = {
  dashboard: 'Dashboard',
  penghuni: 'Penghuni',
  resident: 'Detail Penghuni',
  kamar: 'Kamar',
  pembayaran: 'Pembayaran',
  keuangan: 'Keuangan',
  pengeluaran: 'Pengeluaran',
  pendaftaran: 'Pendaftaran',
  keluar: 'Pengajuan Keluar',
  pelanggaran: 'Pelanggaran',
  mantan: 'Mantan Penghuni',
  pengaturan: 'Pengaturan',
  akun: 'Akun',
  ai: 'AI Analisa',
};

// ═════════════ SNAPSHOT ═════════════
function lastMonthKeys(n, today) {
  const { y, m } = parseISO(today);
  return Array.from({ length: n }, (_, i) => { const t = shiftMonth(y, m, i - (n - 1)); return monthKey(t.y, t.m); });
}

// Riwayat bayar sewa per penghuni: tepat waktu vs terlambat.
function payStatsByResident() {
  const rows = db.prepare(`SELECT residentId, dueDate, paidAt FROM invoices
    WHERE kind = 'sewa' AND status = 'paid' AND residentId IS NOT NULL`).all();
  const out = {};
  for (const r of rows) {
    const s = (out[r.residentId] ||= { paid: 0, late: 0, lateDays: 0 });
    s.paid++;
    const late = r.paidAt ? daysBetween(r.dueDate, String(r.paidAt).slice(0, 10)) : 0;
    if (late > 0) { s.late++; s.lateDays += late; }
  }
  for (const s of Object.values(out)) {
    s.lateRate = s.paid ? s.late / s.paid : 0;
    s.avgLateDays = s.late ? Math.round(s.lateDays / s.late) : 0;
  }
  return out;
}

function riskOf(r, ctx) {
  const { today, stats, violations, exits } = ctx;
  const st = stats[r.id] || { paid: 0, late: 0, lateRate: 0, avgLateDays: 0 };
  const since90 = addDays(today, -90);
  const v90 = violations.filter((v) => v.residentId === r.id && v.date >= since90).length;
  const exit = exits.find((e) => e.residentId === r.id);
  let score = 0; const why = [];
  if (r.payStatus === 'tunggak') { score += 40; why.push(`menunggak ${plural(r.overdueCount, 'tagihan')} (${fmtRp(r.outstanding)})`); }
  if (st.paid >= 2 && st.lateRate >= 0.3) { score += Math.round(30 * st.lateRate); why.push(`${pct(st.late, st.paid)}% pembayaran terlambat`); }
  if (v90) { score += Math.min(30, v90 * 12); why.push(`${plural(v90, 'pelanggaran')} dalam 90 hari`); }
  if (exit) { score += 25; why.push(`mengajukan keluar ${fmtDate(exit.exitDate)}`); }
  if (r.payStatus === 'ditangguhkan') { score += 10; why.push(`pembayaran ditangguhkan s/d ${fmtDate(r.deferUntil)}`); }
  const level = score >= 50 ? 'Tinggi' : score >= 20 ? 'Sedang' : 'Rendah';
  if (!why.length) why.push(st.paid ? 'pembayaran lancar, tanpa catatan' : 'belum ada riwayat bayar');
  return { score: Math.min(100, score), level, why };
}

export function snapshot(today = todayISO()) {
  const s = getSettings();
  const rooms = repo.listRooms();
  const residents = repo.listResidents();
  const stats = payStatsByResident();
  const violations = db.prepare(`SELECT v.*, c.name AS categoryName, c.severity FROM violations v
    LEFT JOIN violation_categories c ON c.id = v.categoryId ORDER BY v.date DESC`).all();
  const exits = db.prepare("SELECT * FROM exit_requests WHERE status = 'pending' ORDER BY exitDate").all();
  const applications = repo.listApplications('pending');
  const mantan = db.prepare('SELECT * FROM mantan ORDER BY keluar DESC').all();
  const expenses = db.prepare('SELECT id, date, description, cat, amount, source, merchant FROM expenses ORDER BY date DESC').all();
  const promos = db.prepare('SELECT * FROM promos').all();
  const types = repo.listRoomTypes();
  const openInvoices = db.prepare(`SELECT i.*, r.deferUntil FROM invoices i LEFT JOIN residents r ON r.id = i.residentId
    WHERE i.status IN ('unpaid','menunggu') ORDER BY i.dueDate`).all().map((i) => billing.decorateInvoice(i, today));
  const months = lastMonthKeys(6, today);
  const incomeBy = Object.fromEntries(months.map((k) => [k, db.prepare(
    "SELECT COALESCE(SUM(amount),0) AS t FROM invoices WHERE status = 'paid' AND substr(paidAt,1,7) = ?",
  ).get(k).t]));
  const expenseBy = Object.fromEntries(months.map((k) => [k, sum(expenses.filter((e) => e.date.startsWith(k)), (e) => e.amount)]));

  const ctx = { today, stats, violations, exits };
  const residentsX = residents.map((r) => ({
    ...r,
    tenureMonths: monthsBetween(r.masuk, today),
    pay: stats[r.id] || { paid: 0, late: 0, lateRate: 0, avgLateDays: 0 },
    risk: riskOf(r, ctx),
  }));

  return {
    today, s, rooms, residents: residentsX, stats, violations, exits, applications, mantan, expenses, promos, types,
    openInvoices, months, incomeBy, expenseBy,
    thisMonth: months[months.length - 1],
    prevMonth: months[months.length - 2],
  };
}

// ═════════════ HITUNGAN BERSAMA ═════════════
const overdueOf = (S) => S.openInvoices.filter((i) => i.state === 'terlambat');
const dueSoonOf = (S, days = 7) => S.openInvoices.filter((i) => i.status === 'unpaid' && i.dueDate >= S.today && i.dueDate <= addDays(S.today, days));
const occupancyOf = (S) => {
  const oc = S.rooms.filter((r) => r.status === 'oc').length;
  const av = S.rooms.filter((r) => r.status === 'av');
  const mn = S.rooms.filter((r) => r.status === 'mn');
  return { oc, av, mn, total: S.rooms.length, pct: pct(oc, S.rooms.length) };
};
const vacantSince = (S, number) => {
  const last = S.mantan.find((m) => m.room === number && m.keluar);
  return last ? daysBetween(last.keluar, S.today) : null;
};
// Rencana tinggal yang berakhir dalam `days` hari (atau sudah lewat tapi masih tinggal).
const stayEndingOf = (S, days = 30) => S.residents
  .filter((r) => r.stayEnd && r.stayDaysLeft <= days && !S.exits.some((e) => e.residentId === r.id))
  .sort((a, b) => a.stayDaysLeft - b.stayDaysLeft);
const stayWhen = (r) => (r.stayDaysLeft < 0 ? `lewat ${-r.stayDaysLeft} hari` : r.stayDaysLeft === 0 ? 'hari ini' : `${r.stayDaysLeft} hari lagi`);
const byRisk = (S) => [...S.residents].sort((a, b) => b.risk.score - a.risk.score || b.outstanding - a.outstanding);
const lateRanking = (S) => S.residents
  .filter((r) => r.pay.late > 0 || r.payStatus === 'tunggak')
  .sort((a, b) => (b.pay.late + b.overdueCount) - (a.pay.late + a.overdueCount) || b.outstanding - a.outstanding);

function trendText(values) {
  const v = values.filter((x) => x > 0);
  if (v.length < 2) return 'belum cukup data';
  const first = v.slice(0, Math.ceil(v.length / 2));
  const last = v.slice(Math.floor(v.length / 2));
  const change = pct(sum(last) / last.length - sum(first) / first.length, sum(first) / first.length);
  if (change > 5) return `naik ±${change}%`;
  if (change < -5) return `turun ±${Math.abs(change)}%`;
  return 'relatif stabil';
}

// Perkiraan pemasukan bulan depan: sewa terjadwal dari penghuni aktif.
function forecastNextMonth(S) {
  const leaving = new Set(S.exits.map((e) => e.residentId));
  const rent = sum(S.residents.filter((r) => !leaving.has(r.id)), (r) => r.rentAmount);
  const charges = db.prepare('SELECT COALESCE(SUM(amount),0) AS t FROM charges WHERE active = 1 AND recurring = 1').get().t;
  return { rent, charges, total: rent + charges, leaving: leaving.size };
}

function applicationCheck(a, S) {
  const issues = []; let score = 100;
  const need = (cond, msg, w) => { if (!cond) { issues.push(msg); score -= w; } };
  need(a.ktpPhoto, 'foto KTP belum ada', 20);
  need(a.selfiePhoto, 'foto selfie belum ada', 15);
  need(/^\d{16}$/.test(String(a.nik || '')), 'NIK bukan 16 digit', 15);
  need(a.wali && a.waWali, 'kontak darurat 1 belum lengkap', 10);
  need(a.emergency2Name && a.emergency2Wa, 'kontak darurat 2 belum lengkap', 5);
  if (a.faceScore === null || a.faceScore === undefined) { issues.push('verifikasi wajah belum dilakukan'); score -= 15; }
  else if (a.faceMatch === false || a.faceScore < 0.5) { issues.push(`wajah selfie kurang cocok dengan KTP (${Math.round(a.faceScore * 100)}%)`); score -= 30; }
  const type = S.types.find((t) => t.id === a.roomTypeId);
  const free = S.rooms.filter((r) => r.status === 'av' && (!type || r.typeId === type.id));
  const anyFree = S.rooms.filter((r) => r.status === 'av');
  const waitDays = a.createdAt ? daysBetween(String(a.createdAt).slice(0, 10), S.today) : 0;
  return {
    score: Math.max(0, score), issues, type, waitDays,
    suggestRooms: (free.length ? free : anyFree).slice(0, 3).map((r) => r.number),
    typeFull: Boolean(type && !free.length),
  };
}

function reasonGroups(list) {
  const groups = [
    ['Lulus/selesai studi', /lulus|wisuda|selesai kuliah|skripsi/],
    ['Pindah kota/kerja', /pindah|mutasi|kerja|kantor/],
    ['Harga/biaya', /mahal|harga|biaya|murah/],
    ['Fasilitas/kenyamanan', /fasilitas|rusak|bising|berisik|nyaman|kotor|air|listrik|wifi|wi-fi/],
    ['Keluarga/pribadi', /keluarga|nikah|menikah|orang tua|pribadi|pulang/],
  ];
  const out = {};
  for (const x of list) {
    const t = lower(x);
    const g = groups.find(([, re]) => re.test(t))?.[0] || 'Lainnya';
    out[g] = (out[g] || 0) + 1;
  }
  return Object.entries(out).sort((a, b) => b[1] - a[1]);
}

// ═════════════ INSIGHT PER MENU ═════════════
// Insight: { tone: ok|warn|err|info, ico, title, text, to? }
const I = (tone, ico, title, text, to) => ({ tone, ico, title, text, ...(to ? { to } : {}) });

const builders = {
  dashboard(S) {
    const occ = occupancyOf(S);
    const inc = S.incomeBy[S.thisMonth]; const prev = S.incomeBy[S.prevMonth];
    const overdue = overdueOf(S); const soon = dueSoonOf(S);
    const waiting = S.openInvoices.filter((i) => i.status === 'menunggu');
    const out = [];
    const tasks = [];
    if (waiting.length) tasks.push(`**${waiting.length}** pembayaran menunggu konfirmasi`);
    if (S.applications.length) tasks.push(`**${S.applications.length}** pendaftar baru`);
    if (S.exits.length) tasks.push(`**${S.exits.length}** pengajuan keluar`);
    if (overdue.length) tasks.push(`**${overdue.length}** tagihan terlambat`);
    out.push(tasks.length
      ? I('warn', '🗂️', 'Prioritas hari ini', tasks.join(' · '), waiting.length ? '/pembayaran' : S.applications.length ? '/pendaftaran' : '/pembayaran')
      : I('ok', '✅', 'Semua beres', 'Tidak ada konfirmasi, pendaftar, atau tunggakan yang perlu ditindaklanjuti.'));
    out.push(I(occ.pct >= 85 ? 'ok' : occ.pct >= 60 ? 'info' : 'warn', '🏠', `Hunian ${occ.pct}%`,
      `${occ.oc} dari ${occ.total} kamar terisi${occ.av.length ? `, **${occ.av.length} kosong** (${occ.av.slice(0, 5).map((r) => r.number).join(', ')})` : ''}${occ.mn.length ? `, ${occ.mn.length} perbaikan` : ''}.`, '/kamar'));
    // Bulan berjalan belum selesai → bandingkan sebagai capaian terhadap total bulan lalu.
    const reach = prev ? pct(inc, prev) : null;
    out.push(I(reach === null || reach >= 100 ? 'ok' : 'info', '💰', `Pemasukan ${monthLabel(S.thisMonth)}: ${fmtRp(inc)}`,
      reach === null ? 'Belum ada pembanding bulan lalu.' : `Hingga ${fmtDate(S.today)} sudah **${reach}%** dari total ${monthLabel(S.prevMonth)} (${fmtRp(prev)}).`, '/keuangan'));
    if (soon.length) out.push(I('info', '📅', `${plural(soon.length, 'tagihan')} jatuh tempo 7 hari ke depan`, `Total ${fmtRp(sum(soon, (i) => i.amount))}. ${!gatewayReady(S.s) ? 'Gateway WhatsApp belum diatur — reminder otomatis belum bisa terkirim.' : S.s.reminderEnabled ? 'Reminder WhatsApp otomatis aktif.' : 'Reminder WhatsApp **mati** — nyalakan di Pengaturan.'}`, '/pembayaran'));
    const ending = stayEndingOf(S, 14);
    if (ending.length) out.push(I('warn', '📆', `Rencana tinggal ${plural(ending.length, 'penghuni')} selesai ≤ 14 hari`, ending.slice(0, 3).map((r) => `**${r.name}** (${r.room}) s/d ${fmtDate(r.stayEnd)}`).join(', '), `/penghuni/${ending[0].id}`));
    const top = byRisk(S).filter((r) => r.risk.level !== 'Rendah').slice(0, 2);
    if (top.length) out.push(I('err', '⚠️', 'Perlu perhatian', top.map((r) => `**${r.name}** (${r.room}): ${r.risk.why.join(', ')}`).join('\n'), `/penghuni/${top[0].id}`));
    return out;
  },

  penghuni(S) {
    const out = [];
    const risky = byRisk(S).filter((r) => r.risk.level !== 'Rendah');
    out.push(risky.length
      ? I('err', '⚠️', `${plural(risky.length, 'penghuni')} berisiko`, risky.slice(0, 4).map((r) => `- **${r.name}** (${r.room}) — ${r.risk.level}: ${r.risk.why[0]}`).join('\n'), `/penghuni/${risky[0].id}`)
      : I('ok', '✅', 'Tidak ada penghuni berisiko', 'Semua penghuni lancar membayar dan tanpa pelanggaran baru.'));
    const ending = stayEndingOf(S);
    if (ending.length) out.push(I('warn', '📆', `${plural(ending.length, 'penghuni')}: rencana tinggal segera berakhir`, `${ending.slice(0, 4).map((r) => `- **${r.name}** (${r.room}) — ${fmtStay(r.stayMonths)}, s/d ${fmtDate(r.stayEnd)} (${stayWhen(r)})`).join('\n')}\nTanyakan apakah akan memperpanjang atau keluar.`, `/penghuni/${ending[0].id}`));
    const loyal = S.residents.filter((r) => r.tenureMonths >= 12 && r.payStatus === 'lunas');
    if (loyal.length) out.push(I('ok', '🌟', `${plural(loyal.length, 'penghuni')} setia ≥ 1 tahun`, `${loyal.slice(0, 4).map((r) => `**${r.name}**`).join(', ')}${loyal.length > 4 ? ', …' : ''}. Pertimbangkan apresiasi atau tawarkan promo perpanjangan.`));
    const missingOf = (r) => [!r.emergencyWa && 'kontak darurat', !r.ktpPhoto && 'foto KTP', !r.selfiePhoto && 'selfie'].filter(Boolean);
    const incomplete = S.residents.filter((r) => missingOf(r).length);
    if (incomplete.length) out.push(I('warn', '📝', `Data belum lengkap: ${plural(incomplete.length, 'penghuni')}`, `${incomplete.slice(0, 4).map((r) => `- ${r.name} (${r.room}): ${missingOf(r).join(', ')}`).join('\n')}${incomplete.length > 4 ? `\n- dan ${incomplete.length - 4} lainnya` : ''}`, `/penghuni/${incomplete[0].id}`));
    const avgTenure = S.residents.length ? (sum(S.residents, (r) => r.tenureMonths) / S.residents.length).toFixed(1) : 0;
    const mhs = S.residents.filter((r) => lower(r.job).includes('mahasis')).length;
    const planned = S.residents.filter((r) => r.stayMonths);
    const avgPlan = planned.length ? sum(planned, (r) => r.stayMonths) / planned.length : 0;
    out.push(I('info', '👥', 'Profil penghuni', `Rata-rata lama tinggal **${String(avgTenure).replace('.', ',')} bulan**${planned.length ? `, rata-rata rencana tinggal **${fmtStay(Math.round(avgPlan))}** (${planned.length} penghuni mengisi)` : ''}. ${pct(mhs, S.residents.length)}% mahasiswa, ${100 - pct(mhs, S.residents.length)}% pekerja/lainnya.`));
    return out;
  },

  resident(S, id) {
    const r = S.residents.find((x) => x.id === Number(id));
    if (!r) return [I('info', 'ℹ️', 'Penghuni tidak ditemukan', 'Data penghuni ini sudah tidak aktif.')];
    const out = [];
    const tone = r.risk.level === 'Tinggi' ? 'err' : r.risk.level === 'Sedang' ? 'warn' : 'ok';
    out.push(I(tone, tone === 'ok' ? '✅' : '⚠️', `Risiko ${r.risk.level} (${r.risk.score}/100)`, r.risk.why.map((w) => `- ${w}`).join('\n')));
    out.push(I(r.pay.lateRate >= 0.3 ? 'warn' : 'ok', '💳', 'Riwayat pembayaran', r.pay.paid
      ? `${r.pay.paid} kali bayar sewa, **${pct(r.pay.paid - r.pay.late, r.pay.paid)}% tepat waktu**${r.pay.late ? `, terlambat rata-rata ${r.pay.avgLateDays} hari` : ''}.`
      : 'Belum ada riwayat pembayaran sewa.'));
    const v = S.violations.filter((x) => x.residentId === r.id);
    if (v.length) out.push(I('warn', '🚨', `${plural(v.length, 'pelanggaran')} tercatat`, v.slice(0, 3).map((x) => `- ${fmtDate(x.date)} · ${x.categoryName || 'Lainnya'} (${x.sp})`).join('\n')));
    if (r.stayMonths) {
      const tone2 = r.stayDaysLeft < 0 ? 'warn' : r.stayDaysLeft <= 30 ? 'warn' : 'info';
      out.push(I(tone2, '📆', `Rencana tinggal ${fmtStay(r.stayMonths)}`, `${r.stayStart !== r.masuk ? `Dihitung mulai ${fmtDate(r.stayStart)} (masuk ${fmtDate(r.masuk)})` : `Masuk ${fmtDate(r.masuk)}`} → rencana selesai **${fmtDate(r.stayEnd)}** (${stayWhen(r)}). Sudah tinggal ${r.tenureMonths} bulan.`));
    } else {
      out.push(I('info', '📆', 'Rencana tinggal belum diisi', 'Isi di tab **Pengaturan Penagihan** agar AI bisa mengingatkan saat masa tinggal hampir selesai.'));
    }
    let action;
    if (r.payStatus === 'tunggak') action = `Kirim pengingat tunggakan ${fmtRp(r.outstanding)}. Klik **Tanya AI** untuk dibuatkan draf pesan WhatsApp.`;
    else if (S.exits.some((e) => e.residentId === r.id)) action = 'Penghuni mengajukan keluar — pastikan tagihan lunas dan cek kondisi kamar sebelum disetujui.';
    else if (r.stayEnd && r.stayDaysLeft <= 30) action = `Rencana tinggal ${r.stayDaysLeft < 0 ? 'sudah lewat' : 'hampir selesai'} — tanyakan apakah ${r.name.split(' ')[0]} akan memperpanjang. Bila ya, perbarui rencana tinggalnya; bila tidak, arahkan ke form keluar.`;
    else if (r.tenureMonths >= 6 && S.promos.some((p) => billing.promoIsOpen(p, S.today))) action = 'Penghuni lancar & sudah lama tinggal — cocok ditawari promo yang sedang aktif.';
    else action = `Tagihan berikutnya ${r.nextDue ? fmtDate(r.nextDue) : '—'} (${fmtRp(r.rentAmount)}). Tidak ada tindakan mendesak.`;
    out.push(I('info', '💡', 'Saran tindakan', action));
    return out;
  },

  kamar(S) {
    const occ = occupancyOf(S); const out = [];
    if (occ.av.length) {
      const lost = sum(occ.av, (r) => r.typePrice);
      out.push(I('warn', '🔴', `${plural(occ.av.length, 'kamar')} kosong`, `${occ.av.map((r) => { const d = vacantSince(S, r.number); return `**${r.number}**${d !== null ? ` (${d} hari)` : ''}`; }).join(', ')}. Potensi pendapatan hilang **${fmtRp(lost)}/bulan**.`));
    } else out.push(I('ok', '🟢', 'Semua kamar terisi', 'Hunian penuh — pertimbangkan daftar tunggu calon penghuni.'));
    for (const t of S.types) {
      const list = S.rooms.filter((r) => r.typeId === t.id);
      if (!list.length) continue;
      const oc = list.filter((r) => r.status === 'oc').length;
      const p = pct(oc, list.length);
      if (p === 100 && list.length >= 2) out.push(I('ok', '📈', `Tipe ${t.name} penuh`, `${oc}/${list.length} terisi. Permintaan tinggi — harga ${fmtRp(t.price)} bisa dievaluasi naik saat kontrak baru.`));
      else if (p < 60) out.push(I('warn', '📉', `Tipe ${t.name} sepi (${p}%)`, `${oc}/${list.length} terisi. Coba promo khusus tipe ini atau tinjau harga ${fmtRp(t.price)}.`));
    }
    if (occ.mn.length) out.push(I('warn', '🛠️', `${plural(occ.mn.length, 'kamar')} dalam perbaikan`, `${occ.mn.map((r) => r.number).join(', ')}. Selesaikan agar bisa disewakan kembali.`));
    const leaving = S.exits.map((e) => e.room);
    if (leaving.length) out.push(I('info', '🚪', 'Akan kosong', `Kamar ${leaving.join(', ')} akan kosong (pengajuan keluar). Mulai promosikan dari sekarang.`, '/pengajuan-keluar'));
    const ending = stayEndingOf(S, 45);
    if (ending.length) out.push(I('info', '📆', 'Berpotensi kosong (rencana tinggal selesai)', `${ending.slice(0, 5).map((r) => `Kamar **${r.room}** — ${r.name}, s/d ${fmtDate(r.stayEnd)}`).join('\n')}\nKonfirmasi perpanjangan agar kamar bisa segera dipromosikan bila kosong.`));
    return out;
  },

  pembayaran(S) {
    const out = []; const overdue = overdueOf(S);
    const waiting = S.openInvoices.filter((i) => i.status === 'menunggu');
    if (waiting.length) out.push(I('warn', '⏳', `${plural(waiting.length, 'pembayaran')} menunggu verifikasi`, `Total ${fmtRp(sum(waiting, (i) => i.total))}. Cocokkan dengan mutasi QRIS/rekening lalu konfirmasi.`));
    if (overdue.length) {
      const prio = [...overdue].sort((a, b) => b.amount * (b.daysLate + 1) - a.amount * (a.daysLate + 1));
      out.push(I('err', '🎯', 'Prioritas penagihan', prio.slice(0, 4).map((i) => `- **${i.name}** (${i.room}) ${fmtRp(i.amount)}, telat ${i.daysLate} hari`).join('\n')));
    } else out.push(I('ok', '✅', 'Tidak ada tagihan terlambat', 'Semua tagihan yang jatuh tempo sudah dibayar.'));
    const dueThis = db.prepare("SELECT status, amount FROM invoices WHERE status != 'void' AND substr(dueDate,1,7) = ? AND dueDate <= ?").all(S.thisMonth, S.today);
    if (dueThis.length) {
      const paid = dueThis.filter((i) => i.status === 'paid');
      out.push(I(pct(paid.length, dueThis.length) >= 90 ? 'ok' : 'info', '📊', `Tingkat penagihan ${monthLabel(S.thisMonth)}: ${pct(paid.length, dueThis.length)}%`, `${paid.length} dari ${dueThis.length} tagihan yang sudah jatuh tempo telah lunas (${fmtRp(sum(paid, (i) => i.amount))}).`));
    }
    const soon = dueSoonOf(S);
    if (soon.length) out.push(I('info', '📅', `${plural(soon.length, 'tagihan')} jatuh tempo 7 hari`, soon.slice(0, 5).map((i) => `${i.name} (${fmtDate(i.dueDate)})`).join(', ')));
    const deferred = S.residents.filter((r) => r.payStatus === 'ditangguhkan');
    if (deferred.length) out.push(I('info', '🕒', 'Penangguhan aktif', deferred.map((r) => `${r.name} s/d ${fmtDate(r.deferUntil)}`).join(', ')));
    return out;
  },

  keuangan(S) {
    const out = [];
    const inc = S.incomeBy[S.thisMonth]; const exp = S.expenseBy[S.thisMonth];
    const incomes = S.months.map((k) => S.incomeBy[k]);
    out.push(I(inc - exp >= 0 ? 'ok' : 'err', '💹', `Laba ${monthLabel(S.thisMonth)}: ${fmtRp(inc - exp)}`, `Pemasukan ${fmtRp(inc)} − pengeluaran ${fmtRp(exp)}. Rasio biaya **${pct(exp, inc)}%** dari pemasukan.`));
    out.push(I('info', '📈', `Tren pemasukan 6 bulan: ${trendText(incomes)}`, S.months.map((k) => `${monthLabel(k).split(' ')[0]} ${String(Math.round(S.incomeBy[k] / 100000) / 10).replace('.', ',')} jt`).join(' · ')));
    const f = forecastNextMonth(S);
    out.push(I('info', '🔮', `Perkiraan pemasukan bulan depan: ${fmtRp(f.total)}`, `Dari sewa ${plural(S.residents.length - f.leaving, 'penghuni')} (${fmtRp(f.rent)})${f.charges ? ` + charge rutin ${fmtRp(f.charges)}` : ''}${f.leaving ? `; ${f.leaving} penghuni akan keluar sudah dikurangi` : ''}.`));
    const withData = S.months.filter((k) => S.incomeBy[k] > 0);
    if (withData.length >= 2) {
      const best = withData.reduce((a, k) => (S.incomeBy[k] - S.expenseBy[k] > S.incomeBy[a] - S.expenseBy[a] ? k : a));
      out.push(I('ok', '🏆', `Bulan terbaik: ${monthLabel(best)}`, `Laba ${fmtRp(S.incomeBy[best] - S.expenseBy[best])}.`));
    }
    const arrears = sum(overdueOf(S), (i) => i.amount);
    if (arrears) out.push(I('warn', '🧾', `Piutang tertunggak ${fmtRp(arrears)}`, 'Menagih tunggakan ini langsung menaikkan kas bulan ini.', '/pembayaran'));
    return out;
  },

  pengeluaran(S) {
    const out = [];
    const cur = S.expenses.filter((e) => e.date.startsWith(S.thisMonth));
    const prev = S.expenses.filter((e) => e.date.startsWith(S.prevMonth));
    const tc = sum(cur, (e) => e.amount); const tp = sum(prev, (e) => e.amount);
    out.push(I(tp && tc > tp * 1.2 ? 'warn' : 'info', '🧾', `Pengeluaran ${monthLabel(S.thisMonth)}: ${fmtRp(tc)}`,
      tp ? `${tc >= tp ? 'Naik' : 'Turun'} ${Math.abs(pct(tc - tp, tp))}% dari ${monthLabel(S.prevMonth)} (${fmtRp(tp)}).` : 'Belum ada data bulan lalu.'));
    const cats = {};
    for (const e of cur) cats[e.cat] = (cats[e.cat] || 0) + e.amount;
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    if (top.length) out.push(I('info', '📊', `Kategori terbesar: ${top[0][0]}`, top.slice(0, 4).map(([c, a]) => `${c} ${fmtRp(a)} (${pct(a, tc)}%)`).join(' · ')));
    // Lonjakan: kategori bulan ini > 1,5× rata-rata 3 bulan sebelumnya.
    const prev3 = S.months.slice(-4, -1);
    for (const [c, a] of top) {
      const avg = sum(prev3, (k) => sum(S.expenses.filter((e) => e.cat === c && e.date.startsWith(k)), (e) => e.amount)) / 3;
      if (avg > 0 && a > avg * 1.5) out.push(I('warn', '⚡', `Lonjakan biaya ${c}`, `${fmtRp(a)} bulan ini vs rata-rata ${fmtRp(avg)} (3 bulan). Cek apakah ada pemborosan atau perbaikan besar.`));
    }
    const seen = new Map(); const dup = [];
    for (const e of S.expenses.slice(0, 200)) {
      const k = `${e.date}|${e.amount}|${lower(e.cat)}`;
      if (seen.has(k)) dup.push([seen.get(k), e]); else seen.set(k, e);
    }
    if (dup.length) out.push(I('warn', '👯', `${plural(dup.length, 'kemungkinan data ganda')}`, dup.slice(0, 3).map(([a, b]) => `"${a.description}" & "${b.description}" — ${fmtDate(a.date)}, ${fmtRp(a.amount)}`).join('\n')));
    const scanned = cur.filter((e) => e.source === 'scan').length;
    if (cur.length) out.push(I('info', '📷', 'Tips pencatatan', `${scanned} dari ${cur.length} pengeluaran bulan ini dicatat lewat scan struk. Scan struk menyimpan bukti foto & mengurangi salah ketik.`));
    return out;
  },

  pendaftaran(S) {
    if (!S.applications.length) return [I('ok', '📭', 'Tidak ada pendaftar menunggu', 'Bagikan link form pendaftaran untuk menjaring calon penghuni.')];
    const out = [];
    for (const a of S.applications.slice(0, 5)) {
      const c = applicationCheck(a, S);
      const tone = c.score >= 80 ? 'ok' : c.score >= 55 ? 'warn' : 'err';
      out.push(I(tone, tone === 'ok' ? '🟢' : tone === 'warn' ? '🟡' : '🔴', `${a.name} — kelengkapan ${c.score}%`,
        `${c.issues.length ? c.issues.map((x) => `- ${x}`).join('\n') : '- data & verifikasi wajah lengkap'}\n- rencana tinggal: **${fmtStay(a.stayMonths)}**\n- saran kamar: **${c.suggestRooms.join(', ') || 'tidak ada yang kosong'}**${c.typeFull ? ` (tipe ${c.type.name} penuh)` : ''}${c.waitDays >= 3 ? `\n- sudah menunggu **${c.waitDays} hari** — segera diproses` : ''}`));
    }
    return out;
  },

  keluar(S) {
    if (!S.exits.length) return [I('ok', '🚪', 'Tidak ada pengajuan keluar', 'Belum ada penghuni yang mengajukan keluar.')];
    const out = [];
    for (const e of S.exits) {
      const r = S.residents.find((x) => x.id === e.residentId);
      const days = daysBetween(S.today, e.exitDate);
      out.push(I(r?.outstanding ? 'err' : 'info', r?.outstanding ? '🧾' : '🚪', `${e.name} (${e.room}) — ${days >= 0 ? `${days} hari lagi` : `lewat ${-days} hari`}`,
        `${r?.outstanding ? `Masih menunggak **${fmtRp(r.outstanding)}** — tagih sebelum menyetujui.` : 'Tagihan sudah bersih.'} Kamar kosong mulai ${fmtDate(e.exitDate)}${r ? `, potensi hilang ${fmtRp(r.rentAmount)}/bulan` : ''}.`));
    }
    const reasons = reasonGroups(S.exits.map((e) => e.reason));
    out.push(I('info', '💬', 'Alasan keluar', `${reasons.map(([g, n]) => `${g} (${n})`).join(', ')}. Rata-rata rating ${(sum(S.exits, (e) => e.rating || 0) / S.exits.length).toFixed(1).replace('.', ',')}/5.`));
    return out;
  },

  pelanggaran(S) {
    const out = [];
    const since90 = addDays(S.today, -90);
    const recent = S.violations.filter((v) => v.date >= since90);
    if (!S.violations.length) return [I('ok', '🕊️', 'Tidak ada pelanggaran', 'Belum ada pelanggaran tercatat dalam masa retensi.')];
    const cats = {};
    for (const v of recent) cats[v.categoryName || 'Lainnya'] = (cats[v.categoryName || 'Lainnya'] || 0) + 1;
    const top = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    out.push(I('info', '📊', `${plural(recent.length, 'pelanggaran')} dalam 90 hari`, top.length ? `Terbanyak: ${top.slice(0, 3).map(([c, n]) => `**${c}** (${n})`).join(', ')}.` : 'Tidak ada pelanggaran baru dalam 90 hari.'));
    const byRes = {};
    for (const v of recent) (byRes[v.residentId] ||= []).push(v);
    const repeat = Object.values(byRes).filter((l) => l.length >= 2);
    for (const l of repeat.slice(0, 3)) {
      const next = ['SP1', 'SP2', 'SP3'][Math.min(2, l.length)] || 'SP3';
      out.push(I('err', '🔁', `${l[0].name} (${l[0].room}) mengulang ${l.length}×`, `Pelanggaran terakhir ${fmtDate(l[0].date)}. Pertimbangkan naik ke **${next}**.`, l[0].residentId ? `/penghuni/${l[0].residentId}` : undefined));
    }
    const unsent = S.violations.filter((v) => !v.sent);
    if (unsent.length) out.push(I('warn', '📨', `${plural(unsent.length, 'SP')} belum dikirim`, `${unsent.slice(0, 4).map((v) => `${v.name} (${v.sp})`).join(', ')}. Kirim agar tercatat resmi.`));
    if (top[0]) out.push(I('info', '💡', 'Saran pencegahan', `Karena **${top[0][0]}** paling sering terjadi, ingatkan aturan terkait di grup penghuni.`));
    return out;
  },

  mantan(S) {
    if (!S.mantan.length) return [I('info', '📁', 'Belum ada mantan penghuni', 'Data akan muncul setelah ada penghuni yang keluar.')];
    const out = [];
    const tenure = S.mantan.filter((m) => m.masuk && m.keluar).map((m) => monthsBetween(m.masuk, m.keluar));
    const avgT = tenure.length ? (sum(tenure) / tenure.length).toFixed(1) : '-';
    const rated = S.mantan.filter((m) => m.star);
    out.push(I('info', '⏱️', `Rata-rata lama tinggal ${String(avgT).replace('.', ',')} bulan`, `Dari ${plural(S.mantan.length, 'mantan penghuni')}. Rating rata-rata **${rated.length ? (sum(rated, (m) => m.star) / rated.length).toFixed(1).replace('.', ',') : '-'}/5**.`));
    const reasons = reasonGroups(S.mantan.map((m) => m.alasan));
    out.push(I(reasons[0]?.[0] === 'Harga/biaya' || reasons[0]?.[0] === 'Fasilitas/kenyamanan' ? 'warn' : 'info', '💬', `Alasan utama: ${reasons[0][0]}`, reasons.map(([g, n]) => `${g} (${n})`).join(' · ')));
    const low = S.mantan.filter((m) => m.star && m.star <= 3);
    if (low.length) out.push(I('warn', '👎', `${plural(low.length, 'ulasan')} rating rendah`, low.slice(0, 3).map((m) => `${m.name}: "${m.feedback || m.alasan}"`).join('\n')));
    const fans = S.mantan.filter((m) => m.star >= 5).slice(0, 4);
    if (fans.length) out.push(I('ok', '🤝', 'Kandidat referensi', `${fans.map((m) => m.name).join(', ')} memberi rating 5 — minta testimoni atau rekomendasi calon penghuni.`));
    return out;
  },

  pengaturan(S) {
    const s = S.s; const out = [];
    const waOk = gatewayReady(s);
    if ((s.reminderEnabled || s.invoiceAutoSend) && !waOk) out.push(I('err', '📵', 'WhatsApp belum terhubung', 'Reminder/invoice otomatis aktif tetapi gateway WhatsApp belum diatur — pesan tidak akan terkirim.'));
    else if (waOk && !s.reminderEnabled) out.push(I('warn', '🔕', 'Reminder H-3 mati', 'Gateway sudah siap. Menyalakan reminder biasanya menurunkan keterlambatan bayar.'));
    else if (waOk) out.push(I('ok', '📲', 'WhatsApp siap', `Reminder H-${s.reminderDaysBefore} ${s.reminderEnabled ? 'aktif' : 'mati'}, invoice otomatis ${s.invoiceAutoSend ? 'aktif' : 'mati'}.`));
    if (s.paymentMode === 'qris_static' && !isValidQris(s.qrisString)) out.push(I('err', '🔳', 'QRIS tidak valid', 'Mode QRIS aktif tetapi kode QRIS kosong/rusak — penghuni tidak bisa membayar lewat QR.'));
    if (/localhost|127\.0\.0\.1/.test(String(s.publicUrl || ''))) out.push(I('warn', '🔗', 'URL publik masih localhost', 'Link invoice di pesan WhatsApp tidak bisa dibuka penghuni. Ganti dengan domain asli.'));
    const expired = S.promos.filter((p) => p.active && p.endDate && p.endDate < S.today);
    if (expired.length) out.push(I('info', '🎁', 'Promo kedaluwarsa masih aktif', `${expired.map((p) => p.name).join(', ')} — sudah lewat tanggal berakhir, bisa dimatikan.`));
    if (!s.gcalRefreshToken) out.push(I('info', '📆', 'Google Calendar belum terhubung', 'Hubungkan agar jatuh tempo tiap kamar muncul di kalender Anda.'));
    const aiKey = Boolean(s.aiApiKey || process.env.ANTHROPIC_API_KEY);
    out.push(I(aiKey ? 'ok' : 'info', '🤖', aiKey ? 'AI Claude aktif' : 'AI mode lokal', aiKey ? 'Pertanyaan bebas dijawab oleh Claude memakai data kos Anda.' : 'Insight dihitung dari data Anda. Isi API key Claude di bagian **AI Asisten** agar bisa tanya jawab bebas.'));
    if (!out.some((x) => x.tone === 'err' || x.tone === 'warn')) out.unshift(I('ok', '✅', 'Konfigurasi sehat', 'Tidak ditemukan pengaturan yang bermasalah.'));
    return out;
  },

  akun(S, _id, viewer) {
    // Admin hanya melihat akunnya sendiri (jangan bocorkan status password pemilik).
    const all = db.prepare('SELECT id, username, role, passwordHash FROM users').all();
    const users = viewer?.role === 'pemilik' ? all : all.filter((u) => u.id === viewer?.id);
    const out = [];
    const defaults = { pemilik: 'pemilik123', admin: 'admin123' };
    const weak = users.filter((u) => defaults[u.username] && verifyPassword(defaults[u.username], u.passwordHash));
    if (weak.length) out.push(I('err', '🔓', 'Password bawaan masih dipakai', `${viewer?.role === 'pemilik' ? `Akun ${weak.map((u) => `**${u.username}**`).join(', ')}` : 'Akun Anda'} masih memakai password awal. Segera ganti di menu Akun.`));
    else out.push(I('ok', '🔐', 'Password sudah diganti', 'Tidak ada akun yang memakai password bawaan.'));
    if (viewer?.role !== 'pemilik') {
      out.push(I('info', '👤', 'Akun admin', 'Pengaturan kos & daftar akun hanya bisa diubah pemilik. Ganti password Anda secara berkala.'));
      return out;
    }
    const owners = users.filter((u) => u.role === 'pemilik').length;
    out.push(I(owners > 2 ? 'warn' : 'info', '👤', `${plural(users.length, 'akun')} (${owners} pemilik, ${users.length - owners} admin)`, owners > 2 ? 'Banyak akun pemilik — batasi akses penuh hanya untuk yang perlu.' : 'Gunakan peran admin untuk staf; pengaturan & akun hanya bisa diubah pemilik.'));
    return out;
  },
};
builders.ai = builders.dashboard;

// Saran pertanyaan per menu (juga dipahami oleh mesin lokal).
const SUGGEST = {
  dashboard: ['Ringkas kondisi kos hari ini', 'Siapa yang perlu ditagih?', 'Prediksi pemasukan bulan depan'],
  penghuni: ['Siapa yang paling sering terlambat bayar?', 'Penghuni mana yang berisiko keluar?', 'Rencana tinggal siapa yang segera berakhir?', 'Rata-rata lama tinggal penghuni?'],
  resident: ['Buatkan draf pesan WhatsApp untuk penghuni ini', 'Bagaimana riwayat bayarnya?', 'Apa saran tindakan untuk penghuni ini?'],
  kamar: ['Kamar mana yang kosong?', 'Kamar mana yang berpotensi kosong?', 'Tipe kamar mana yang paling laku?', 'Berapa potensi pendapatan yang hilang?'],
  pembayaran: ['Siapa yang perlu ditagih?', 'Tagihan jatuh tempo minggu ini?', 'Buatkan pesan pengingat tunggakan'],
  keuangan: ['Bagaimana tren pemasukan?', 'Prediksi pemasukan bulan depan', 'Berapa laba bulan ini?'],
  pengeluaran: ['Kategori pengeluaran terbesar?', 'Ada pengeluaran yang tidak wajar?', 'Bandingkan dengan bulan lalu'],
  pendaftaran: ['Pendaftar mana yang paling siap diterima?', 'Kamar apa yang cocok untuk pendaftar?', 'Data apa yang kurang?'],
  keluar: ['Siapa yang masih punya tunggakan sebelum keluar?', 'Kamar mana yang akan kosong?', 'Apa alasan penghuni keluar?'],
  pelanggaran: ['Siapa yang sering melanggar?', 'Pelanggaran apa yang paling sering?', 'Siapa yang perlu naik SP?'],
  mantan: ['Kenapa penghuni keluar?', 'Rata-rata lama tinggal mantan penghuni?', 'Siapa yang bisa dimintai testimoni?'],
  pengaturan: ['Ada pengaturan yang bermasalah?', 'Apa yang sebaiknya diaktifkan?'],
  akun: ['Apakah akun sudah aman?'],
  ai: ['Ringkas kondisi kos hari ini', 'Siapa yang paling sering terlambat bayar?', 'Bagaimana tren hunian?', 'Prediksi pemasukan bulan depan'],
};

export function normalizeScope(scope) {
  return Object.hasOwn(SCOPES, scope) ? scope : 'ai';
}

export function insightsFor(scope, id, S = snapshot(), viewer = null) {
  const sc = normalizeScope(scope);
  return {
    scope: sc,
    title: SCOPES[sc],
    insights: builders[sc](S, id, viewer).slice(0, 6),
    suggestions: SUGGEST[sc],
    preds: sc === 'ai' || sc === 'penghuni'
      ? byRisk(S).slice(0, 5).map((r) => ({ id: r.id, room: r.room, name: r.name, risk: r.risk.level, score: r.risk.score, desc: r.risk.why.join(', ') }))
      : undefined,
  };
}

// ═════════════ MESIN JAWAB LOKAL ═════════════
function waDraft(S, r) {
  const kos = S.s.namaKos || 'Kos';
  if (r.payStatus === 'tunggak') {
    return `Halo ${r.name.split(' ')[0]}, kami dari ${kos} ingin mengingatkan bahwa masih ada tagihan kamar ${r.room} yang belum dibayar sebesar ${fmtRp(r.outstanding)} (${plural(r.overdueCount, 'tagihan')}). Mohon dapat diselesaikan secepatnya ya. Jika sudah membayar, abaikan pesan ini. Terima kasih 🙏`;
  }
  return `Halo ${r.name.split(' ')[0]}, terima kasih sudah tertib membayar di ${kos}. Sekadar info, tagihan kamar ${r.room} berikutnya jatuh tempo ${fmtDate(r.nextDue)} sebesar ${fmtRp(r.rentAmount)}. Semoga betah ya! 😊`;
}

const INTENTS = [
  { k: /draf|draft|pesan|\bwa\b|whatsapp/, run(S, sc, id) {
    const r = sc === 'resident' ? S.residents.find((x) => x.id === Number(id)) : null;
    if (r) return `Draf pesan WhatsApp untuk **${r.name}**:\n\n${waDraft(S, r)}`;
    const list = overdueOf(S);
    if (!list.length) return 'Tidak ada penghuni yang menunggak, jadi belum perlu pesan pengingat.';
    return `Contoh pesan pengingat tunggakan (sesuaikan nama & nominal):\n\n${waDraft(S, S.residents.find((x) => x.id === list[0].residentId) || { ...list[0], name: list[0].name, payStatus: 'tunggak', outstanding: list[0].amount, overdueCount: 1 })}\n\nTip: aktifkan reminder otomatis di Pengaturan agar pesan dikirim sendiri.`;
  } },
  { k: /rencana tinggal|rencana|kontrak|berakhir|perpanjang|habis masa|berpotensi kosong|akan kosong/, run(S) {
    const list = stayEndingOf(S, 60);
    const exits = S.exits;
    if (!list.length && !exits.length) {
      const planned = S.residents.filter((r) => r.stayMonths).length;
      return `Tidak ada rencana tinggal yang berakhir dalam 60 hari ke depan. ${planned} dari ${S.residents.length} penghuni sudah mengisi rencana tinggal.`;
    }
    return `Rencana tinggal yang berakhir dalam 60 hari:\n${list.map((r) => `- **${r.name}** (kamar ${r.room}) — rencana ${fmtStay(r.stayMonths)}, s/d ${fmtDate(r.stayEnd)} (${stayWhen(r)})`).join('\n') || '- tidak ada'}${exits.length ? `\n\nSudah mengajukan keluar: ${exits.map((e) => `${e.name} (kamar ${e.room}, ${fmtDate(e.exitDate)})`).join(', ')}` : ''}\n\nSaran: konfirmasi perpanjangan lebih awal; kamar yang tidak diperpanjang bisa langsung dipromosikan.`;
  } },
  { k: /telat|terlambat|lambat|sering.*bayar/, run(S) {
    const list = lateRanking(S);
    if (!list.length) return 'Tidak ada penghuni yang tercatat terlambat bayar. 👍';
    return `Penghuni yang paling sering terlambat / menunggak:\n${list.slice(0, 5).map((r) => `- **${r.name}** (${r.room}): ${[
      r.pay.late ? `${r.pay.late}× terlambat dari ${r.pay.paid} pembayaran (rata-rata ${r.pay.avgLateDays} hari)` : '',
      r.overdueCount ? `kini menunggak ${plural(r.overdueCount, 'tagihan')} (${fmtRp(r.outstanding)})` : '',
    ].filter(Boolean).join(', ')}`).join('\n')}`;
  } },
  { k: /jatuh tempo|minggu ini|7 hari/, run(S) {
    const list = dueSoonOf(S);
    if (!list.length) return 'Tidak ada tagihan yang jatuh tempo dalam 7 hari ke depan.';
    return `Jatuh tempo 7 hari ke depan (${fmtRp(sum(list, (i) => i.amount))}):\n${list.map((i) => `- ${fmtDate(i.dueDate)} · **${i.name}** (${i.room}) ${fmtRp(i.amount)}`).join('\n')}`;
  } },
  { k: /tagih|tunggak|piutang|belum bayar|nunggak/, run(S) {
    const list = [...overdueOf(S)].sort((a, b) => b.amount * (b.daysLate + 1) - a.amount * (a.daysLate + 1));
    if (!list.length) return 'Tidak ada tagihan terlambat saat ini. Semua lunas atau belum jatuh tempo.';
    return `Ada **${plural(list.length, 'tagihan')} terlambat** (total ${fmtRp(sum(list, (i) => i.amount))}). Urutan prioritas:\n${list.slice(0, 6).map((i) => `- **${i.name}** (${i.room}) ${fmtRp(i.amount)} — telat ${i.daysLate} hari`).join('\n')}`;
  } },
  { k: /risiko|berisiko|prediksi.*keluar|akan keluar|churn/, run(S) {
    const list = byRisk(S).slice(0, 5);
    return `Penghuni dengan risiko tertinggi (menunggak, sering telat, pelanggaran, atau mengajukan keluar):\n${list.map((r) => `- **${r.name}** (${r.room}) — ${r.risk.level} ${r.risk.score}/100: ${r.risk.why.join(', ')}`).join('\n')}`;
  } },
  { k: /prediksi|perkiraan|forecast|bulan depan/, run(S) {
    const f = forecastNextMonth(S);
    return `Perkiraan pemasukan bulan depan **${fmtRp(f.total)}**:\n- Sewa ${plural(S.residents.length - f.leaving, 'penghuni')}: ${fmtRp(f.rent)}\n- Charge rutin: ${fmtRp(f.charges)}${f.leaving ? `\n- ${f.leaving} penghuni akan keluar (sudah dikurangi)` : ''}\n\nAngka ini mengasumsikan semua membayar tepat waktu.`;
  } },
  { k: /kosong|tersedia|vacant|potensi/, run(S) {
    const occ = occupancyOf(S);
    if (!occ.av.length) return 'Semua kamar terisi. 🎉';
    return `Ada **${plural(occ.av.length, 'kamar')} kosong** — potensi hilang ${fmtRp(sum(occ.av, (r) => r.typePrice))}/bulan:\n${occ.av.map((r) => { const d = vacantSince(S, r.number); return `- Kamar **${r.number}** (${r.typeName || '-'}, ${fmtRp(r.typePrice)})${d !== null ? ` — kosong ${d} hari` : ''}`; }).join('\n')}`;
  } },
  { k: /tipe|laku|harga kamar/, run(S) {
    return `Keterisian per tipe kamar:\n${S.types.map((t) => { const l = S.rooms.filter((r) => r.typeId === t.id); const oc = l.filter((r) => r.status === 'oc').length; return `- **${t.name}** (${fmtRp(t.price)}): ${oc}/${l.length} terisi (${pct(oc, l.length)}%)`; }).join('\n')}`;
  } },
  { k: /hunian|okupansi|occupancy|terisi/, run(S) {
    const occ = occupancyOf(S);
    const moved = S.mantan.filter((m) => m.keluar >= addDays(S.today, -180)).length;
    const joined = S.residents.filter((r) => r.masuk >= addDays(S.today, -180)).length;
    return `Hunian saat ini **${occ.pct}%** (${occ.oc}/${occ.total} kamar). Dalam 6 bulan terakhir ${plural(joined, 'penghuni')} masuk dan ${moved} keluar${joined >= moved ? ' — tren hunian stabil/naik.' : ' — tren hunian menurun, perlu promosi.'}`;
  } },
  { k: /pengeluaran|biaya|beban|boros|tidak wajar|kategori/, run(S) { return builders.pengeluaran(S).map((x) => `**${x.title}**\n${x.text}`).join('\n\n'); } },
  { k: /laba|untung|profit|rugi/, run(S) {
    const inc = S.incomeBy[S.thisMonth]; const exp = S.expenseBy[S.thisMonth];
    return `Laba ${monthLabel(S.thisMonth)}: **${fmtRp(inc - exp)}** (pemasukan ${fmtRp(inc)} − pengeluaran ${fmtRp(exp)}).\n\n6 bulan terakhir:\n${S.months.map((k) => `- ${monthLabel(k)}: ${fmtRp(S.incomeBy[k] - S.expenseBy[k])}`).join('\n')}`;
  } },
  { k: /pendapatan|pemasukan|omzet|income|tren|keuangan/, run(S) {
    return `Pemasukan 6 bulan terakhir (${trendText(S.months.map((k) => S.incomeBy[k]))}):\n${S.months.map((k) => `- ${monthLabel(k)}: ${fmtRp(S.incomeBy[k])}`).join('\n')}`;
  } },
  { k: /lama tinggal|durasi|berapa lama/, run(S, sc) {
    const avgA = S.residents.length ? sum(S.residents, (r) => r.tenureMonths) / S.residents.length : 0;
    const t = S.mantan.filter((m) => m.masuk && m.keluar).map((m) => monthsBetween(m.masuk, m.keluar));
    const avgM = t.length ? sum(t) / t.length : 0;
    const fmt = (n) => n.toFixed(1).replace('.', ',');
    return sc === 'mantan'
      ? `Mantan penghuni rata-rata tinggal **${fmt(avgM)} bulan** (penghuni aktif saat ini ${fmt(avgA)} bulan).`
      : `Rata-rata lama tinggal penghuni aktif **${fmt(avgA)} bulan**; mantan penghuni ${fmt(avgM)} bulan. Terlama: ${[...S.residents].sort((a, b) => b.tenureMonths - a.tenureMonths).slice(0, 3).map((r) => `${r.name} (${r.tenureMonths} bln)`).join(', ')}.`;
  } },
  { k: /pelanggar|sp\b|sp1|sp2|sp3|melanggar|naik sp/, run(S) { return builders.pelanggaran(S).map((x) => `**${x.title}**\n${x.text}`).join('\n\n'); } },
  { k: /pendaftar|calon|daftar|diterima|kurang/, run(S, sc) {
    if (sc !== 'pendaftaran' && !S.applications.length) return 'Tidak ada pendaftar yang menunggu verifikasi.';
    return builders.pendaftaran(S).map((x) => `**${x.title}**\n${x.text}`).join('\n\n');
  } },
  { k: /alasan|kenapa.*keluar|mengapa.*keluar|testimoni/, run(S, sc) {
    return (sc === 'keluar' ? builders.keluar(S) : builders.mantan(S)).map((x) => `**${x.title}**\n${x.text}`).join('\n\n');
  } },
  { k: /keluar/, run(S) { return builders.keluar(S).map((x) => `**${x.title}**\n${x.text}`).join('\n\n'); } },
  { k: /promo/, run(S) {
    const open = S.promos.filter((p) => billing.promoIsOpen(p, S.today));
    if (!open.length) return 'Tidak ada promo yang sedang aktif. Promo bisa dibuat di menu Pembayaran → Promo.';
    // Utamakan penghuni lancar yang rencana tinggalnya cukup panjang untuk paket promo.
    const need = Math.max(...open.map((p) => p.payMonths + p.freeMonths));
    const cand = S.residents.filter((r) => r.payStatus === 'lunas' && (r.tenureMonths >= 3 || (r.stayMonths || 0) >= need))
      .sort((a, b) => (b.stayMonths || 0) - (a.stayMonths || 0)).slice(0, 5);
    return `Promo aktif: ${open.map((p) => `**${p.name}** (bayar ${p.payMonths} gratis ${p.freeMonths})`).join(', ')}.\nKandidat yang cocok ditawari: ${cand.map((r) => `${r.name} (${r.room})`).join(', ') || '—'}.`;
  } },
  { k: /aman|keamanan|password|akun/, run(S, sc, id, viewer) { return builders.akun(S, id, viewer).map((x) => `**${x.title}**\n${x.text}`).join('\n\n'); } },
  { k: /pengaturan|setting|konfigurasi|diaktifkan|bermasalah/, run(S) { return builders.pengaturan(S).map((x) => `**${x.title}**\n${x.text}`).join('\n\n'); } },
  { k: /riwayat|saran|tindakan|profil/, run(S, sc, id) {
    if (sc === 'resident') return builders.resident(S, id).map((x) => `**${x.title}**\n${x.text}`).join('\n\n');
    return null;
  } },
  { k: /ringkas|rangkum|kondisi|summary|hari ini|gimana|bagaimana/, run(S, sc, id, viewer) {
    return builders[sc](S, id, viewer).map((x) => `**${x.title}**\n${x.text}`).join('\n\n');
  } },
];

export function localAnswer(scope, id, message, S = snapshot(), viewer = null) {
  const sc = normalizeScope(scope);
  const q = lower(message);
  const summary = (sco) => builders[sco](S, id, viewer).map((x) => `**${x.title}**\n${x.text}`).join('\n\n');
  // Di menu Pengajuan Keluar, "tunggakan/kosong/alasan" merujuk ke pengaju keluar.
  if (sc === 'keluar' && /keluar|kosong|tunggak|alasan/.test(q)) return summary('keluar');
  for (const it of INTENTS) {
    if (it.k.test(q)) {
      const out = it.run(S, sc, id, viewer);
      if (out) return out;
    }
  }
  return `Berikut analisa menu **${SCOPES[sc]}**:\n\n${summary(sc)}\n\n(Mode lokal hanya memahami pertanyaan umum.) Coba juga:\n${SUGGEST[sc].map((x) => `- ${x}`).join('\n')}\n\nUntuk tanya jawab bebas, pemilik bisa mengisi API key Claude di **Pengaturan → AI Asisten**.`;
}

// ═════════════ KONTEKS UNTUK CLAUDE ═════════════
// Data ringkas (tanpa NIK, alamat, foto, atau nomor WA) — cukup untuk analisa.
export function contextFor(scope, id, S = snapshot(), viewer = null) {
  const sc = normalizeScope(scope);
  const occ = occupancyOf(S);
  const base = {
    kos: { nama: S.s.namaKos, tipe: S.s.kosType, hariIni: S.today },
    ringkasan: {
      kamar: { total: occ.total, terisi: occ.oc, kosong: occ.av.map((r) => r.number), perbaikan: occ.mn.map((r) => r.number), hunianPersen: occ.pct },
      pemasukanPerBulan: S.incomeBy,
      pengeluaranPerBulan: S.expenseBy,
      tagihanTerlambat: overdueOf(S).map((i) => ({ nama: i.name, kamar: i.room, jenis: i.kind, nominal: i.amount, jatuhTempo: i.dueDate, telatHari: i.daysLate })),
      menungguKonfirmasi: S.openInvoices.filter((i) => i.status === 'menunggu').length,
      pendaftarMenunggu: S.applications.length,
      pengajuanKeluar: S.exits.map((e) => ({ nama: e.name, kamar: e.room, tanggal: e.exitDate, alasan: e.reason })),
      promoAktif: S.promos.filter((p) => billing.promoIsOpen(p, S.today)).map((p) => ({ nama: p.name, bayar: p.payMonths, gratis: p.freeMonths, sampai: p.endDate })),
    },
    tipeKamar: S.types.map((t) => ({ nama: t.name, harga: t.price, fasilitas: t.facilities, jumlahKamar: t.roomCount })),
    penghuni: S.residents.slice(0, 300).map((r) => ({
      id: r.id, nama: r.name, kamar: r.room, tipe: r.roomType, pekerjaan: r.job || '', kampus: r.uni || '',
      masuk: r.masuk, lamaBulan: r.tenureMonths, sewa: r.rentAmount, jatuhTempoTgl: r.dueDay,
      statusBayar: r.payStatus, tunggakan: r.outstanding, jatuhTempoBerikut: r.nextDue,
      rencanaTinggalBulan: r.stayMonths || null, rencanaMulai: r.stayStart || null, rencanaSelesai: r.stayEnd || null,
      riwayatBayar: { total: r.pay.paid, terlambat: r.pay.late, rataTelatHari: r.pay.avgLateDays },
      risiko: `${r.risk.level} (${r.risk.score}): ${r.risk.why.join('; ')}`,
    })),
  };
  const extra = {};
  if (['pengeluaran', 'keuangan', 'ai', 'dashboard'].includes(sc)) {
    extra.pengeluaranTerbaru = S.expenses.slice(0, 120).map((e) => ({ tgl: e.date, ket: e.description, kategori: e.cat, nominal: e.amount, sumber: e.source }));
  }
  if (['pelanggaran', 'penghuni', 'resident', 'ai', 'dashboard'].includes(sc)) {
    extra.pelanggaran = S.violations.slice(0, 150).map((v) => ({ tgl: v.date, nama: v.name, kamar: v.room, kategori: v.categoryName, sp: v.sp, ket: v.description, terkirim: Boolean(v.sent) }));
  }
  if (['mantan', 'keluar', 'kamar', 'ai'].includes(sc)) {
    extra.mantan = S.mantan.slice(0, 150).map((m) => ({ nama: m.name, kamar: m.room, masuk: m.masuk, keluar: m.keluar, alasan: m.alasan, rating: m.star, ulasan: m.feedback }));
  }
  if (sc === 'pendaftaran') {
    extra.pendaftar = S.applications.map((a) => {
      const c = applicationCheck(a, S);
      return { nama: a.name, pekerjaan: a.job, kampus: a.uni, tipeDiminta: c.type?.name || '-', rencanaMasuk: a.masuk, rencanaTinggalBulan: a.stayMonths || null, sumber: a.sumber, skorKelengkapan: c.score, catatan: c.issues, saranKamar: c.suggestRooms, menungguHari: c.waitDays };
    });
  }
  if (sc === 'kamar') {
    extra.kamar = S.rooms.map((r) => ({ nomor: r.number, lantai: r.floor, tipe: r.typeName, harga: r.typePrice, status: { oc: 'terisi', av: 'kosong', mn: 'perbaikan' }[r.status], penghuni: r.resident?.name || null, kosongHari: r.status === 'av' ? vacantSince(S, r.number) : null }));
  }
  if (sc === 'resident') {
    const r = S.residents.find((x) => x.id === Number(id));
    if (r) {
      extra.penghuniDipilih = {
        id: r.id, nama: r.name, kamar: r.room,
        tagihan: db.prepare("SELECT number, kind, description, dueDate, amount, status, paidAt FROM invoices WHERE residentId = ? AND status != 'void' ORDER BY dueDate DESC LIMIT 24").all(r.id),
        charge: db.prepare('SELECT kind, name, amount, recurring, active FROM charges WHERE residentId = ?').all(r.id),
      };
    }
  }
  if (sc === 'pengaturan') {
    extra.pengaturan = builders.pengaturan(S).map((x) => `${x.title}: ${x.text}`);
  }
  extra.insightMenuIni = builders[sc](S, id, viewer).map((x) => `${x.title}: ${x.text}`);
  return { menu: SCOPES[sc], ...base, ...extra };
}
