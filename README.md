# InDeKos — Sistem Manajemen Kos Digital

Aplikasi manajemen kos berbasis web (React + Node.js): penghuni, kamar & tipe
kamar, penagihan per kamar, promo, charge & denda, pengeluaran (termasuk scan
struk), pelanggaran, pendaftaran & keluar penghuni, reminder WhatsApp, serta
kalender penagihan yang tersinkron ke Google Calendar.

## Palet Warna — "Jade pebble morning"

| Token   | Hex       | Penggunaan                          |
| ------- | --------- | ----------------------------------- |
| Jade    | `#7B9669` | Aksen utama (tombol, highlight)     |
| Pebble  | `#6C8480` | Aksen sekunder                      |
| Forest  | `#404E3B` | Banner & permukaan gelap            |
| Sage    | `#BAC8B1` | Hijau lembut / elemen pendukung     |
| Stone   | `#E6E6E6` | Netral abu-abu / border             |

Status kamar: **terisi = hijau**, **kosong = merah**, **perbaikan = kuning**.

## Menjalankan

Butuh **Node.js 22.5+** (memakai SQLite bawaan `node:sqlite`).

```bash
npm run install:all
npm run dev:server        # API  → http://localhost:4000
npm run dev:client        # SPA  → http://localhost:5173 (proxy /api ke server)

npm test                  # semua test (server: API + WhatsApp/Google mock, client: parser struk)

npm run build && npm start   # produksi: Express menyajikan API + hasil build
```

### Login

| Peran       | Username  | Password awal | Akses |
| ----------- | --------- | ------------- | ----- |
| **Pemilik** | `pemilik` | `pemilik123`  | Semua fitur + Pengaturan, harga/tipe kamar, promo, akun pengguna, integrasi |
| **Admin**   | `admin`   | `admin123`    | Operasional harian (penghuni, tagihan, pengeluaran, pelanggaran, pendaftaran) |

**Masuk dengan Google (opsional).** Bila `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
terpasang, halaman login menampilkan tombol **Masuk dengan Google** di samping
username/password. Hanya akun yang **sudah terdaftar** yang bisa masuk: pemilik
mengisi *Email Google* pengguna di menu **Akun**, atau pengguna menautkan akun
Google-nya sendiri (Akun → Masuk dengan Google). Saat **pemilik** masuk dengan
Google dan kalender kos belum terhubung, izin **Google Calendar langsung diminta**
sehingga kalender tersambung sekaligus. Akun baru boleh dibuat tanpa password
bila diisi email Google (khusus login Google).

> ⚠️ **Segera ganti password** di menu **Akun**. Password awal bisa diatur lewat
> env `INIT_PEMILIK_PASSWORD` / `INIT_ADMIN_PASSWORD` sebelum server pertama kali
> dijalankan. Pemilik dapat menambah/menghapus pengguna di menu Akun.

### Halaman untuk penghuni (tanpa login)

| URL                   | Fungsi |
| --------------------- | ------ |
| `/form`               | Pendaftaran calon penghuni (data diri, **2 kontak darurat**, **foto KTP**, **foto selfie** + verifikasi wajah otomatis) |
| `/bayar`              | Cek semua tagihan terbuka (nama + nomor kamar) |
| `/invoice/:id`        | Invoice (link dikirim via WA): QRIS dinamis, "Saya sudah bayar", cetak/PDF |
| `/keluar`             | Form keluar: tanggal keluar, alasan, rating, rekening pengembalian deposit |

## Konfigurasi (env server)

| Variabel | Default | Keterangan |
| -------- | ------- | ---------- |
| `PORT` | `4000` | Port API |
| `DATA_DIR` | `server/data` | Lokasi database & folder `uploads/` (foto KTP/selfie/struk) |
| `AUTH_SECRET` | acak, disimpan di DB | Kunci penandatangan token login |
| `APP_TZ` | `Asia/Jakarta` | Zona waktu penentuan "hari ini" untuk penagihan |
| `INIT_PEMILIK_PASSWORD` / `INIT_ADMIN_PASSWORD` | `pemilik123` / `admin123` | Password akun awal |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Wajib untuk sinkron Google Calendar |
| `GOOGLE_REDIRECT_URI` | `http://localhost:4000/api/gcal/callback` | Redirect OAuth (harus sama dengan di Google Cloud) |
| `DISABLE_SCHEDULER` | — | Matikan job 30-menitan (untuk test) |
| `ANTHROPIC_API_KEY` | — | API key Claude untuk AI Asisten (alternatif mengisi di Pengaturan) |
| `AI_MODEL` | `claude-opus-5` | Model default AI bila belum diatur di Pengaturan |

Token WhatsApp, Midtrans Server Key, refresh token Google, dan API key Claude
**disimpan di server dan tidak pernah dikirim ke browser**.

## Penagihan

- **Jatuh tempo per kamar** — tiap penghuni punya tanggal jatuh tempo sendiri
  (default = tanggal masuk). Periode sewa = tgl jatuh tempo s/d sehari sebelum
  jatuh tempo berikutnya. Invoice terbit otomatis H-7 (bisa diubah).
- **Rate harian (opsional, per penghuni)** — hari di luar periode penuh (masuk
  atau keluar di tengah periode) ditagih per hari, sehingga tidak ada hari yang
  tidak terbayar. Jika nonaktif, hari tersebut tidak ditagih.
- **Menunggak sampai tanggal tertentu** — atur *Tangguhkan s/d* di detail
  penghuni. Invoice **tetap terbit per bulan** (menunggak Mei s/d Juni = tetap
  2 invoice), status tampil "Ditangguhkan" dan reminder ditahan.
- **Promo** (mis. bayar 6 bln + gratis 1) — dibuat & di-on/off pemilik, punya
  periode berlaku. Saat diterapkan ke penghuni: satu invoice gabungan menutup
  6+1 periode; invoice bulanan di rentang itu dibatalkan; setelah promo habis
  tagihan **otomatis kembali normal**.
- **Charge & denda** — invoice terpisah, sekali atau bulanan, tanggal tagih
  bebas per kamar, bisa ditambahkan kapan saja (mis. watt berlebih).
- **Kode unik** — setiap invoice mendapat kode 1–999 agar pembayaran QRIS/transfer
  mudah dicocokkan.

## WhatsApp otomatis (Fonnte / Wablas)

1. Buat akun di [Fonnte](https://fonnte.com) atau Wablas, sambungkan nomor WA, salin token.
2. **Pengaturan → WhatsApp Otomatis**: pilih gateway, tempel token (Wablas: isi
   juga URL server), isi *URL publik aplikasi* (untuk link invoice), Simpan, lalu **Kirim Tes**.
3. Atur toggle:
   - **Reminder sebelum jatuh tempo** (default H-3, on/off global & per penghuni)
   - **Kirim invoice otomatis saat terbit** (on/off)

Scheduler berjalan tiap 30 menit. Setiap pesan dicatat (Pembayaran → Notifikasi WA)
dan tidak pernah terkirim dua kali. Tanpa gateway, tombol **Kirim** membuka wa.me manual.

## Google Calendar

1. Google Cloud Console → buat project → aktifkan **Google Calendar API**.
2. Buat **OAuth client ID** (tipe *Web application*), tambahkan redirect URI
   `http://localhost:4000/api/gcal/callback` (atau domain Anda).
3. Set `GOOGLE_CLIENT_ID` & `GOOGLE_CLIENT_SECRET`, restart server.
4. Login sebagai pemilik → **Pengaturan → Google Calendar → Hubungkan Akun Google**
   — atau cukup **Masuk dengan Google** sebagai pemilik (kalender langsung terhubung).

Kredensial yang sama dipakai untuk **login Google** (redirect URI sama, tidak perlu
menambah URI baru). Di OAuth consent screen, tambahkan email pengguna sebagai
*Test users* selama status masih *Testing* (izin kedaluwarsa tiap 7 hari), atau
klik *Publish app* agar permanen. Semua gratis — tidak perlu billing Google Cloud.

Setiap tagihan menjadi event sepanjang hari di tanggal jatuh tempo (merah =
belum bayar, kuning = menunggu verifikasi, hijau ✅ = lunas; dibatalkan = event
dihapus) dengan pengingat H-3. Kalender internal ada di **Pembayaran → Kalender Penagihan**.

## Verifikasi wajah & scan struk

- **Wajah KTP ↔ selfie** memakai `@vladmandic/face-api` **di browser** (model
  disajikan dari server sendiri, tanpa CDN). Hasilnya berupa skor kemiripan
  untuk *screening*; admin dapat **cek ulang di perangkatnya** dan tetap
  memutuskan dengan membandingkan kedua foto. Ini bukan verifikasi biometrik resmi.
- **Scan struk** memakai Tesseract.js di browser (bahasa Indonesia + Inggris;
  pertama kali mengunduh data bahasa dari CDN). Total, tanggal, toko, dan
  kategori diisi otomatis dan tetap bisa diedit sebelum disimpan.

## AI Asisten (di setiap menu)

Setiap menu punya panel **AI Insight** di bagian atas dan tombol **Tanya AI**
(melayang di pojok kanan bawah):

| Menu | Contoh insight |
| ---- | -------------- |
| Dashboard | prioritas hari ini, hunian, capaian pemasukan, penghuni perlu perhatian |
| Penghuni / Detail | skor risiko (tunggakan, keterlambatan, pelanggaran, pengajuan keluar), data belum lengkap, draf pesan WA |
| Kamar | kamar kosong + lama kosong + potensi pendapatan hilang, keterisian per tipe |
| Pembayaran | prioritas penagihan, tingkat penagihan bulan ini, jatuh tempo 7 hari |
| Keuangan | laba, tren 6 bulan, perkiraan pemasukan bulan depan |
| Pengeluaran | perbandingan bulan lalu, lonjakan per kategori, kemungkinan data ganda |
| Pendaftaran | skor kelengkapan pendaftar (KTP, selfie, verifikasi wajah, kontak darurat) + saran kamar |
| Pengajuan Keluar / Mantan | tunggakan sebelum keluar, alasan keluar, rating, kandidat testimoni |
| Pelanggaran | kategori terbanyak, pelanggar berulang → saran naik SP |
| Pengaturan / Akun | audit konfigurasi (WA, QRIS, URL publik), password bawaan |

- **Mode lokal (tanpa API key)** — insight & jawaban dihitung langsung dari
  database (`server/src/aiData.js`). Gratis dan selalu jalan.
- **Mode Claude** — isi API key di **Pengaturan → AI Asisten** (atau env
  `ANTHROPIC_API_KEY`). Pertanyaan bebas dijawab Claude (default `claude-opus-5`,
  dengan fallback otomatis server-side bila permintaan ditolak) memakai ringkasan
  data menu yang sedang dibuka. **NIK, alamat, nomor WhatsApp, dan foto tidak
  dikirim.** Bila Claude gagal (key salah, limit), jawaban otomatis beralih ke
  mode lokal. Dibatasi 20 pertanyaan/menit per pengguna.
- AI bisa dimatikan total dari Pengaturan.

## Pelanggaran

Kategori bisa ditambah sendiri (tingkat ringan/sedang/berat + SP default).
Riwayat disimpan **1 tahun** (bisa diubah) lalu **dihapus otomatis** dari database.

## Pembayaran QRIS

Pemilik dengan **QRIS statis merchant** (mis. GoPay Merchant) menempelkan payload
QRIS di Pengaturan; halaman invoice membuat **QRIS dinamis** (nominal + kode unik)
sesuai standar EMVCo (`server/src/qris.js`). Penghuni menekan "Saya sudah bayar",
admin memverifikasi. Endpoint `POST /api/payments/webhook` sudah disiapkan untuk
upgrade ke **Midtrans** (otomatis penuh) — pencocokan via total nominal + kode unik.

## Struktur Proyek

```
server/src/
  index.js     routes + scheduler        billing.js   mesin penagihan
  db.js        skema SQLite v2 & seed    auth.js      login, peran, akun
  repo.js      rooms/residents/dashboard notify.js    WhatsApp gateway & reminder
  settings.js  setting (rahasia di-mask) gcal.js      Google Calendar sync
  uploads.js   foto (validasi magic byte) qris.js     QRIS statis → dinamis
  aiData.js    insight per menu + jawaban lokal       ai.js  tanya jawab Claude
  googleAuth.js  login dengan Google (akun terdaftar saja, kode sekali pakai + nonce)
server/test/   api.test.mjs, integration.test.mjs, ai.test.mjs, run.mjs
client/src/
  pages/       Dashboard, Penghuni, ResidentDetail, Kamar, Pembayaran, ...
               publik: FormPendaftaran, Bayar, InvoicePublic, FormKeluar, Login
  components/AI.jsx  panel insight, chat & tombol Tanya AI di setiap menu
  faceVerify.js, ocr.js, receiptParser.js
```

## Database & upgrade

SQLite di `DATA_DIR/indekos.db`, diisi data contoh saat pertama jalan. Saat
upgrade dari skema v1, file lama **otomatis di-backup** ke `indekos.db.bak-v1`
lalu skema v2 dibuat. Untuk reset ke data contoh, hapus `indekos.db*` dan
jalankan ulang server.
