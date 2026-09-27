// ─────────────────────────────────────────────────────────────
// InDeKos — seed data (schema v2)
// Dipakai db.js HANYA untuk mengisi database saat pertama kali
// dibuat. Tanggal = ISO (YYYY-MM-DD), uang = integer rupiah.
// ─────────────────────────────────────────────────────────────

export const settings = {
  namaKos: 'Kos Elliptica',
  alamat: 'Jl. Soekarno Hatta No. 12, Malang',
  wa: '08123456789',
  email: 'elliptica@gmail.com',
  kosType: 'putra',
  lantai: 2,
  deposit: 500000,
  jamMalam: '23:00',
  jamTamu: '21:00',
  pet: 'tidak',
  peraturan: `1. Dilarang membawa tamu menginap tanpa seizin pengelola.
2. Jaga kebersihan kamar dan area bersama.
3. Dilarang merokok di dalam kamar dan area tertutup.
4. Pembayaran sewa paling lambat sesuai tanggal jatuh tempo masing-masing kamar.
5. Kerusakan fasilitas akibat kelalaian ditanggung penghuni.
6. Konflik antar penghuni diselesaikan melalui pengelola.`,

  // Penagihan
  invoiceLeadDays: 7, // invoice terbit H-7 sebelum jatuh tempo
  dailyRateEnabledDefault: false, // default rate harian untuk penghuni baru
  dailyRateDefault: 45000,

  // Pembayaran: 'manual' | 'qris_static' | 'midtrans'
  paymentMode: 'manual',
  qrisString: '',
  midtransServerKey: '',

  // Notifikasi WhatsApp
  waProvider: 'none', // 'none' | 'fonnte' | 'wablas'
  waToken: '',
  waBaseUrl: '', // khusus Wablas, mis. https://jkt.wablas.com
  reminderEnabled: true,
  reminderDaysBefore: 3,
  invoiceAutoSend: false,
  publicUrl: 'http://localhost:5173', // dipakai untuk link invoice di pesan WA

  // Google Calendar
  gcalCalendarId: 'primary',
  gcalRefreshToken: '',
  gcalConnectedAt: '',

  // Pelanggaran
  violationRetentionDays: 365,
};

// Kunci rahasia: tidak pernah dikirim ke browser apa adanya.
export const SECRET_KEYS = ['waToken', 'midtransServerKey', 'gcalRefreshToken'];

export const roomTypes = [
  { name: 'Standar', price: 1300000, facilities: ['Kasur', 'Lemari', 'Meja belajar', 'Wi-Fi', 'Kamar mandi luar'], description: 'Kamar standar nyaman untuk mahasiswa & pekerja.' },
  { name: 'Premium AC', price: 1700000, facilities: ['AC', 'Kasur', 'Lemari', 'Meja belajar', 'Wi-Fi', 'Kamar mandi dalam', 'Water heater'], description: 'Kamar ber-AC dengan kamar mandi dalam.' },
];

// 101–115 Standar, 116–120 Premium AC. 116 sedang perbaikan (demo warna kuning).
export const rooms = Array.from({ length: 20 }, (_, i) => {
  const n = 101 + i;
  return {
    number: String(n),
    floor: n <= 110 ? 1 : 2,
    type: n <= 115 ? 'Standar' : 'Premium AC',
    maintenance: n === 116,
    note: n === 116 ? 'Perbaikan plafon bocor' : '',
  };
});

export const residents = [
  { name: 'Daffa Abiyu', room: '101', masuk: '2026-03-01', job: 'Mahasiswa', wa: '0899-2732-6323', uni: 'POLINEMA', paidThrough: 'all' },
  { name: 'Rizki Pratama', room: '102', masuk: '2026-02-15', job: 'Mahasiswa', wa: '0812-3456-7890', uni: 'UB', paidThrough: 'all' },
  { name: 'Budi Santoso', room: '103', masuk: '2026-01-01', job: 'Karyawan', wa: '0857-1122-3344', uni: '', paidThrough: '2026-08-31' },
  { name: 'Siti Rahayu', room: '105', masuk: '2026-04-01', job: 'Mahasiswi', wa: '0878-2233-4455', uni: 'POLINEMA', paidThrough: 'all' },
  { name: 'Ahmad Fauzi', room: '106', masuk: '2026-03-15', job: 'Mahasiswa', wa: '0856-3344-5566', uni: 'UMM', paidThrough: 'all' },
  { name: 'Dewi Kusuma', room: '108', masuk: '2026-02-01', job: 'Karyawan', wa: '0813-5566-7788', uni: '', paidThrough: '2026-08-31' },
  { name: 'Rian Hidayat', room: '109', masuk: '2026-05-01', job: 'Mahasiswa', wa: '0852-7788-9900', uni: 'UIN', paidThrough: 'all' },
  { name: 'Fitri Handayani', room: '110', masuk: '2026-01-01', job: 'Mahasiswi', wa: '0857-9900-1122', uni: 'POLINEMA', paidThrough: 'all' },
  { name: 'Hendra Wijaya', room: '111', masuk: '2026-06-01', job: 'Karyawan', wa: '0821-1122-3344', uni: '', paidThrough: 'all' },
  { name: 'Nurul Aini', room: '113', masuk: '2026-04-15', job: 'Mahasiswi', wa: '0836-2233-4455', uni: 'UNISMA', paidThrough: 'all' },
  { name: 'Bagas Eko', room: '114', masuk: '2026-07-01', job: 'Mahasiswa', wa: '0858-3344-5566', uni: 'UB', paidThrough: 'all' },
  { name: 'Maya Sari', room: '115', masuk: '2026-03-01', job: 'Karyawan', wa: '0812-4455-6677', uni: '', paidThrough: '2026-08-31', deferUntil: '2026-10-15' },
  { name: 'Irfan Maulana', room: '117', masuk: '2026-08-01', job: 'Mahasiswa', wa: '0857-5566-7788', uni: 'ITN', paidThrough: 'all' },
  { name: 'Putri Wulandari', room: '118', masuk: '2026-07-15', job: 'Mahasiswi', wa: '0821-6677-8899', uni: 'POLINEMA', paidThrough: 'all', dailyRateEnabled: true },
  { name: 'Gilang Ramadhan', room: '119', masuk: '2026-09-01', job: 'Mahasiswa', wa: '0836-7788-9900', uni: 'UMM', paidThrough: 'all' },
];

export const applications = [
  {
    name: 'Yoga Pratomo', tempatLahir: 'Kediri', tglLahir: '2003-05-12',
    alamat: 'Jl. Melati No. 8, Kediri', nik: '3506121205030002', wa: '0857-1234-5678',
    job: 'Mahasiswa', uni: 'POLINEMA', wali: 'Sutrisno', waliStatus: 'Ayah', waWali: '0857-0000-1111',
    emergency2Name: 'Rina Pratomo', emergency2Rel: 'Kakak', emergency2Wa: '0857-2222-3333',
    sumber: 'Instagram', masuk: '2026-10-01',
  },
  {
    name: 'Kevin Aditya', tempatLahir: 'Surabaya', tglLahir: '2002-11-03',
    alamat: 'Jl. Kenanga No. 21, Surabaya', nik: '3578030311020003', wa: '0812-9999-8888',
    job: 'Karyawan/Pegawai', uni: '', wali: 'Rahmawati', waliStatus: 'Ibu', waWali: '0812-2222-3333',
    emergency2Name: 'Doni Aditya', emergency2Rel: 'Paman/Bibi', emergency2Wa: '0812-4444-5555',
    sumber: 'Rekomendasi teman/kenalan', masuk: '2026-10-15',
  },
];

export const promos = [
  { name: 'Promo 6+1', payMonths: 6, freeMonths: 1, active: true, startDate: '2026-09-01', endDate: '2026-12-31', description: 'Bayar 6 bulan di muka, gratis 1 bulan.' },
];

// room → charge; `once` = tagihan sekali, selain itu bulanan.
export const charges = [
  { room: '110', kind: 'charge', name: 'Charge listrik (rice cooker & heater)', amount: 50000, recurring: true, billDay: 20, startDate: '2026-08-20' },
  { room: '103', kind: 'denda', name: 'Denda keterlambatan Agustus', amount: 50000, recurring: false, billDay: 20, startDate: '2026-09-20' },
];

export const violationCategories = [
  { name: 'Tamu menginap tanpa izin', severity: 'sedang', defaultSp: 'SP1' },
  { name: 'Kebisingan', severity: 'ringan', defaultSp: 'SP1' },
  { name: 'Keterlambatan pembayaran', severity: 'sedang', defaultSp: 'SP1' },
  { name: 'Merokok di area terlarang', severity: 'sedang', defaultSp: 'SP1' },
  { name: 'Kerusakan fasilitas', severity: 'berat', defaultSp: 'SP2' },
  { name: 'Lainnya', severity: 'ringan', defaultSp: 'SP1' },
];

export const violations = [
  { room: '103', category: 'Tamu menginap tanpa izin', desc: 'Membawa tamu menginap tanpa izin', date: '2026-08-28', sp: 'SP1', sent: true },
  { room: '108', category: 'Kebisingan', desc: 'Kebisingan berlebih di atas jam 22.00', date: '2026-09-05', sp: 'SP1', sent: false },
  { room: '109', category: 'Keterlambatan pembayaran', desc: 'Terlambat bayar 2 bulan berturut-turut', date: '2026-08-01', sp: 'SP2', sent: true },
];

export const mantan = [
  { name: 'Andi Saputra', room: '104', masuk: '2025-01-01', keluar: '2026-06-30', alasan: 'Lulus kuliah', star: 5 },
  { name: 'Lina Anggraini', room: '107', masuk: '2025-03-15', keluar: '2026-08-15', alasan: 'Pindah kota', star: 5 },
  { name: 'Toni Kurniawan', room: '112', masuk: '2024-06-01', keluar: '2026-06-01', alasan: 'Lulus kuliah', star: 4 },
  { name: 'Reza Firdaus', room: '116', masuk: '2025-09-01', keluar: '2026-07-31', alasan: 'Menikah', star: 5 },
  { name: 'Wati Priyatni', room: '120', masuk: '2025-01-01', keluar: '2026-04-30', alasan: 'Pindah kerja', star: 3 },
];

export const expenses = [
  { date: '2026-09-05', desc: 'Tagihan Listrik PLN', cat: 'Utilitas', amount: 1450000 },
  { date: '2026-09-05', desc: 'Tagihan Air PDAM', cat: 'Utilitas', amount: 380000 },
  { date: '2026-09-06', desc: 'Internet IndiHome', cat: 'Utilitas', amount: 600000 },
  { date: '2026-09-07', desc: 'Cat kamar 104', cat: 'Perawatan', amount: 350000 },
  { date: '2026-09-08', desc: 'Servis AC kamar 117', cat: 'Perawatan', amount: 250000 },
  { date: '2026-09-08', desc: 'Alat kebersihan', cat: 'Kebersihan', amount: 185000 },
  { date: '2026-08-05', desc: 'Tagihan Listrik PLN', cat: 'Utilitas', amount: 1380000 },
  { date: '2026-08-06', desc: 'Internet IndiHome', cat: 'Utilitas', amount: 600000 },
];

export const activities = [
  { c: 'ok', t: '<strong>Daffa Abiyu</strong> membayar sewa kamar 101 via QRIS' },
  { c: 'jade', t: '<strong>Gilang Ramadhan</strong> baru terdaftar sebagai penghuni kamar 119' },
  { c: 'warn', t: 'Surat Peringatan SP1 terkirim ke <strong>Dewi Kusuma</strong>' },
];

// Mock AI knowledge base — keyword → response (tetap statis)
export const aiKnowledge = {
  terlambat: 'Berdasarkan riwayat, <strong>Budi Santoso (Kamar 103)</strong> dan <strong>Dewi Kusuma (Kamar 108)</strong> paling sering terlambat. Keduanya menunggak September.',
  'lama tinggal': 'Rata-rata lama tinggal penghuni aktif sekitar <strong>6,8 bulan</strong>. Mantan penghuni rata-rata 8,4 bulan.',
  tren: 'Tren hunian: Apr 76% → Mei 80% → Jun 80% → Jul 85% → Agu 80% → Sep 75%.',
  pendapatan: 'Lihat menu <strong>Keuangan</strong> untuk pendapatan aktual yang dihitung dari invoice lunas.',
  kosong: 'Lihat menu <strong>Kamar</strong> — kamar merah berarti kosong dan siap disewakan.',
  default: 'Saya bisa bantu analisa pola pembayaran, tren hunian, atau profil penghuni. Coba tanya lebih spesifik.',
};

export const insights = [
  { ico: '💡', txt: 'Aktifkan reminder WhatsApp H-3 di Pengaturan agar penghuni tidak lupa jatuh tempo.' },
  { ico: '📈', txt: 'Tingkat hunian September lebih tinggi dari rata-rata tahun lalu (68%).' },
  { ico: '🎁', txt: 'Promo 6+1 aktif sampai 31 Des — tawarkan ke penghuni yang kontraknya panjang.' },
];

export const preds = [
  { room: '105', name: 'Siti Rahayu', risk: 'Rendah', desc: 'Pembayaran selalu tepat waktu', col: 'ok' },
  { room: '109', name: 'Rian Hidayat', risk: 'Sedang', desc: 'Pernah SP2 — perlu tindak lanjut', col: 'warn' },
  { room: '103', name: 'Budi Santoso', risk: 'Tinggi', desc: 'Tunggakan + pelanggaran aktif', col: 'err' },
];
