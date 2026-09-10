// ─────────────────────────────────────────────────────────────
// InDeKos — seed data & static analytics
// The mutable entities below (settings, residents, applications,
// payments, expenses, violations, mantan, activities) are used by
// store.js only to SEED the SQLite database on first run.
// The analytics mocks (revenues, transactions, expCats, insights,
// preds, aiKnowledge) are read-only and served directly.
// ─────────────────────────────────────────────────────────────

export const settings = {
  namaKos: 'Kos Elliptica',
  alamat: 'Jl. Soekarno Hatta No. 12, Malang',
  wa: '08123456789',
  email: 'elliptica@gmail.com',
  kosType: 'putra',
  totalKamar: 20,
  lantai: 2,
  roomStart: 101,
  roomPrefix: '',
  priceStd: '1.300.000',
  pricePrem: '1.700.000',
  deposit: '500.000',
  dueDate: '15',
  jamMalam: '23:00',
  jamTamu: '21:00',
  pet: 'tidak',
  peraturan: `1. Dilarang membawa tamu menginap tanpa seizin pengelola.
2. Jaga kebersihan kamar dan area bersama.
3. Dilarang merokok di dalam kamar dan area tertutup.
4. Pembayaran sewa paling lambat tanggal 15 setiap bulan.
5. Kerusakan fasilitas akibat kelalaian ditanggung penghuni.
6. Konflik antar penghuni diselesaikan melalui pengelola.`,
};

// Pendaftaran (applications) submitted from the public form.
// status: 'pending' | 'approved' | 'rejected'
export const applications = [
  {
    id: 1, name: 'Yoga Pratomo', tempatLahir: 'Kediri', tglLahir: '12/05/2003',
    alamat: 'Jl. Melati No. 8, Kediri', nik: '3506121205030002', wa: '0857-1234-5678',
    job: 'Mahasiswa', uni: 'POLINEMA', wali: 'Sutrisno', waliStatus: 'Ayah', waWali: '0857-0000-1111',
    sumber: 'Instagram', masuk: '01/10/2026', status: 'pending', createdAt: '08/09/2026',
  },
  {
    id: 2, name: 'Kevin Aditya', tempatLahir: 'Surabaya', tglLahir: '03/11/2002',
    alamat: 'Jl. Kenanga No. 21, Surabaya', nik: '3578030311020003', wa: '0812-9999-8888',
    job: 'Karyawan/Pegawai', uni: '', wali: 'Rahmawati', waliStatus: 'Ibu', waWali: '0812-2222-3333',
    sumber: 'Rekomendasi teman/kenalan', masuk: '15/10/2026', status: 'pending', createdAt: '09/09/2026',
  },
];

export const residents = [
  { id: 1, name: 'Daffa Abiyu', room: '101', masuk: '01/03/2026', status: 'lunas', job: 'Mahasiswa', wa: '0899-2732-6323', uni: 'POLINEMA' },
  { id: 2, name: 'Rizki Pratama', room: '102', masuk: '15/02/2026', status: 'lunas', job: 'Mahasiswa', wa: '0812-3456-7890', uni: 'UB' },
  { id: 3, name: 'Budi Santoso', room: '103', masuk: '01/01/2026', status: 'tunggak', job: 'Karyawan', wa: '0857-1122-3344', uni: '' },
  { id: 4, name: 'Siti Rahayu', room: '105', masuk: '01/04/2026', status: 'lunas', job: 'Mahasiswi', wa: '0878-2233-4455', uni: 'POLINEMA' },
  { id: 5, name: 'Ahmad Fauzi', room: '106', masuk: '15/03/2026', status: 'lunas', job: 'Mahasiswa', wa: '0856-3344-5566', uni: 'UMM' },
  { id: 6, name: 'Dewi Kusuma', room: '108', masuk: '01/02/2026', status: 'tunggak', job: 'Karyawan', wa: '0813-5566-7788', uni: '' },
  { id: 7, name: 'Rian Hidayat', room: '109', masuk: '01/05/2026', status: 'lunas', job: 'Mahasiswa', wa: '0852-7788-9900', uni: 'UIN' },
  { id: 8, name: 'Fitri Handayani', room: '110', masuk: '01/01/2026', status: 'lunas', job: 'Mahasiswi', wa: '0857-9900-1122', uni: 'POLINEMA' },
  { id: 9, name: 'Hendra Wijaya', room: '111', masuk: '01/06/2026', status: 'lunas', job: 'Karyawan', wa: '0821-1122-3344', uni: '' },
  { id: 10, name: 'Nurul Aini', room: '113', masuk: '15/04/2026', status: 'lunas', job: 'Mahasiswi', wa: '0836-2233-4455', uni: 'UNISMA' },
  { id: 11, name: 'Bagas Eko', room: '114', masuk: '01/07/2026', status: 'lunas', job: 'Mahasiswa', wa: '0858-3344-5566', uni: 'UB' },
  { id: 12, name: 'Maya Sari', room: '115', masuk: '01/03/2026', status: 'tunggak', job: 'Karyawan', wa: '0812-4455-6677', uni: '' },
  { id: 13, name: 'Irfan Maulana', room: '117', masuk: '01/08/2026', status: 'lunas', job: 'Mahasiswa', wa: '0857-5566-7788', uni: 'ITN' },
  { id: 14, name: 'Putri Wulandari', room: '118', masuk: '15/07/2026', status: 'lunas', job: 'Mahasiswi', wa: '0821-6677-8899', uni: 'POLINEMA' },
  { id: 15, name: 'Gilang Ramadhan', room: '119', masuk: '01/09/2026', status: 'lunas', job: 'Mahasiswa', wa: '0836-7788-9900', uni: 'UMM' },
];

export const payments = [
  { name: 'Daffa Abiyu', room: '101', period: 'Sep 2026', amount: 'Rp 1.300.000', method: 'QRIS', date: '03/09/2026', status: 'lunas' },
  { name: 'Rizki Pratama', room: '102', period: 'Sep 2026', amount: 'Rp 1.300.000', method: 'Transfer', date: '01/09/2026', status: 'lunas' },
  { name: 'Budi Santoso', room: '103', period: 'Sep 2026', amount: 'Rp 1.300.000', method: '—', date: '—', status: 'tunggak' },
  { name: 'Siti Rahayu', room: '105', period: 'Sep 2026', amount: 'Rp 1.300.000', method: 'QRIS', date: '02/09/2026', status: 'lunas' },
  { name: 'Ahmad Fauzi', room: '106', period: 'Sep 2026', amount: 'Rp 1.300.000', method: 'Transfer', date: '04/09/2026', status: 'lunas' },
  { name: 'Dewi Kusuma', room: '108', period: 'Sep 2026', amount: 'Rp 1.300.000', method: '—', date: '—', status: 'tunggak' },
  { name: 'Rian Hidayat', room: '109', period: 'Sep 2026', amount: 'Rp 1.300.000', method: 'QRIS', date: '01/09/2026', status: 'lunas' },
  { name: 'Maya Sari', room: '115', period: 'Sep 2026', amount: 'Rp 1.300.000', method: '—', date: '—', status: 'tunggak' },
];

export const violations = [
  { name: 'Budi Santoso', room: '103', desc: 'Membawa tamu menginap tanpa izin', date: '28/08/2026', sp: 'SP1', sent: true },
  { name: 'Dewi Kusuma', room: '108', desc: 'Kebisingan berlebih di atas jam 22.00', date: '05/09/2026', sp: 'SP1', sent: false },
  { name: 'Rian Hidayat', room: '109', desc: 'Terlambat bayar 2 bulan berturut-turut', date: '01/08/2026', sp: 'SP2', sent: true },
];

export const mantan = [
  { name: 'Andi Saputra', room: '104', masuk: '01/01/2025', keluar: '30/06/2026', lama: '18 bln', alasan: 'Lulus kuliah', star: 5 },
  { name: 'Lina Anggraini', room: '107', masuk: '15/03/2025', keluar: '15/08/2026', lama: '17 bln', alasan: 'Pindah kota', star: 5 },
  { name: 'Toni Kurniawan', room: '112', masuk: '01/06/2024', keluar: '01/06/2026', lama: '24 bln', alasan: 'Lulus kuliah', star: 4 },
  { name: 'Reza Firdaus', room: '116', masuk: '01/09/2025', keluar: '31/07/2026', lama: '11 bln', alasan: 'Menikah', star: 5 },
  { name: 'Wati Priyatni', room: '120', masuk: '01/01/2025', keluar: '30/04/2026', lama: '16 bln', alasan: 'Pindah kerja', star: 3 },
];

export const expenses = [
  { date: '05/09/2026', desc: 'Tagihan Listrik PLN', cat: 'Utilitas', amount: 'Rp 1.450.000' },
  { date: '05/09/2026', desc: 'Tagihan Air PDAM', cat: 'Utilitas', amount: 'Rp 380.000' },
  { date: '06/09/2026', desc: 'Internet IndiHome', cat: 'Utilitas', amount: 'Rp 600.000' },
  { date: '07/09/2026', desc: 'Cat kamar 104', cat: 'Perawatan', amount: 'Rp 350.000' },
  { date: '08/09/2026', desc: 'Servis AC kamar 102', cat: 'Perawatan', amount: 'Rp 250.000' },
  { date: '08/09/2026', desc: 'Alat kebersihan', cat: 'Kebersihan', amount: 'Rp 185.000' },
];

export const activities = [
  { c: 'ok', t: '<strong>Daffa Abiyu</strong> membayar sewa kamar 101 via QRIS', ts: '3 jam lalu' },
  { c: 'jade', t: '<strong>Gilang Ramadhan</strong> baru terdaftar sebagai penghuni kamar 119', ts: '2 hari lalu' },
  { c: 'warn', t: 'Surat Peringatan SP1 terkirim ke email <strong>Dewi Kusuma</strong>', ts: '3 hari lalu' },
  { c: 'ok', t: '<strong>Rian Hidayat</strong> melunasi tagihan September', ts: '5 hari lalu' },
  { c: 'pebble', t: 'Kamar 104 selesai renovasi, siap disewakan kembali', ts: '6 hari lalu' },
];

export const revenues = [
  { m: 'Apr', v: 15200000 }, { m: 'Mei', v: 16900000 }, { m: 'Jun', v: 16400000 },
  { m: 'Jul', v: 17200000 }, { m: 'Agu', v: 17300000 }, { m: 'Sep', v: 18500000 },
];

export const transactions = [
  { dir: 'in', n: 'Pembayaran Sewa · Daffa Abiyu', d: '03 Sep 2026', a: '+Rp 1.300.000' },
  { dir: 'in', n: 'Pembayaran Sewa · Siti Rahayu', d: '02 Sep 2026', a: '+Rp 1.300.000' },
  { dir: 'out', n: 'Tagihan Listrik PLN', d: '05 Sep 2026', a: '−Rp 1.450.000' },
  { dir: 'out', n: 'Internet IndiHome', d: '06 Sep 2026', a: '−Rp 600.000' },
  { dir: 'in', n: 'Pembayaran Sewa · Ahmad Fauzi', d: '04 Sep 2026', a: '+Rp 1.300.000' },
];

export const expCats = [
  { name: 'Utilitas', amt: 2430000, pct: 76, col: 'jade' },
  { name: 'Perawatan', amt: 600000, pct: 19, col: 'warn' },
  { name: 'Kebersihan', amt: 185000, pct: 6, col: 'pebble' },
];

export const insights = [
  { ico: '💡', txt: '3 penghuni menunggak >7 hari. Ingin kirim pengingat WhatsApp otomatis?', btn: 'Kirim Sekarang' },
  { ico: '📈', txt: 'Tingkat hunian September (75%) lebih tinggi dari rata-rata tahun lalu (68%).' },
  { ico: '🔄', txt: '5 kamar kosong. Berdasarkan tren, biasanya terisi 2–3 minggu setelah dipasang di Instagram.' },
  { ico: '⚠️', txt: 'Budi Santoso memiliki 1 pelanggaran aktif dan 1 tunggakan — risiko tinggi tidak perpanjang.' },
];

export const preds = [
  { room: '105', name: 'Siti Rahayu', risk: 'Rendah', desc: 'Kontrak aktif 5 bulan ke depan', col: 'ok' },
  { room: '109', name: 'Rian Hidayat', risk: 'Sedang', desc: 'Pernah SP2 — perlu tindak lanjut', col: 'warn' },
  { room: '103', name: 'Budi Santoso', risk: 'Tinggi', desc: 'Tunggakan + pelanggaran aktif', col: 'err' },
];

// Mock AI knowledge base — keyword → response
export const aiKnowledge = {
  terlambat: 'Berdasarkan riwayat, <strong>Budi Santoso (Kamar 103)</strong> dan <strong>Dewi Kusuma (Kamar 108)</strong> paling sering terlambat. Keduanya menunggak September dan pernah terlambat di bulan sebelumnya.',
  'lama tinggal': 'Rata-rata lama tinggal penghuni aktif <strong>6,8 bulan</strong>. Paling lama: Budi Santoso & Fitri Handayani (9 bulan). Mantan penghuni rata-rata 8,4 bulan.',
  tren: 'Tren hunian: Apr 76% → Mei 80% → Jun 80% → Jul 85% → Agu 80% → Sep 75%. Pendapatan naik dari Rp 15,2 jt (April) ke Rp 18,5 jt (September).',
  pendapatan: 'September 2026 diproyeksikan <strong>Rp 18,5 juta</strong> (15 × Rp 1.300.000 = Rp 19,5 jt, minus 3 tunggakan). Pendapatan YTD Jan–Sep: Rp 142 juta.',
  kosong: '5 kamar tersedia: 104, 107, 112, 116, 120. Berdasarkan tren historis, kamar biasanya terisi 2–3 minggu setelah dipromosikan. Kamar 104 baru selesai renovasi.',
  default: 'Saya bisa bantu analisa pola pembayaran, tren hunian, atau profil penghuni. Coba tanya lebih spesifik — misalnya nama penghuni, bulan tertentu, atau topik keuangan.',
};
