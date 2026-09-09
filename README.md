# InDeKos — Sistem Manajemen Kos Digital

Aplikasi manajemen kos berbasis web (React + Node.js) untuk membantu pemilik
dan pengelola kos mendigitalkan operasional: data penghuni, kamar, pembayaran,
keuangan, pengeluaran, pelanggaran, arsip mantan penghuni, dan AI insight.

Implementasi ini adalah versi **full‑stack** dari prototipe InDeKos: UI React
(SPA) yang mengambil data dari REST API Node.js/Express.

## Palet Warna — "Jade pebble morning"

Seluruh antarmuka menggunakan palet yang diminta:

| Token   | Hex       | Penggunaan                          |
| ------- | --------- | ----------------------------------- |
| Jade    | `#7B9669` | Aksen utama (tombol, highlight)     |
| Pebble  | `#6C8480` | Aksen sekunder                      |
| Forest  | `#404E3B` | Banner & permukaan gelap            |
| Sage    | `#BAC8B1` | Hijau lembut / elemen pendukung     |
| Stone   | `#E6E6E6` | Netral abu-abu / border             |

## Struktur Proyek

```
InDeKos/
├── server/            # API Node.js + Express (in-memory store)
│   └── src/
│       ├── index.js   # routes & bootstrap
│       └── data.js    # seed data
└── client/            # SPA React + Vite
    └── src/
        ├── App.jsx        # shell + routing
        ├── api.js         # klien fetch
        ├── styles.css     # design tokens (palet baru)
        ├── components/    # Sidebar, Topbar, Modal, Toast, ikon
        └── pages/         # 10 modul
```

## Menjalankan (Development)

Butuh Node.js 18+ (dikembangkan pada Node 22).

```bash
# 1. Pasang semua dependency
npm run install:all

# 2. Jalankan API (terminal 1)
npm run dev:server        # http://localhost:4000

# 3. Jalankan SPA (terminal 2)
npm run dev:client        # http://localhost:5173
```

Vite dev server mem-proxy `/api` ke backend, jadi cukup buka
`http://localhost:5173`.

## Menjalankan (Production)

```bash
npm run build             # build client → client/dist
npm start                 # Express menyajikan API + client build
# buka http://localhost:4000
```

## Modul

Dashboard · Penghuni · Kamar · Pembayaran · **Pendaftaran** · Keuangan ·
Pengeluaran · Pelanggaran · Mantan Penghuni · AI Analisa · Pengaturan.

## Alur Pendaftaran Penghuni

1. Calon penghuni membuka **form publik** di `/form` (tanpa login) dan mengisi
   data diri, kontak, wali, dsb.
2. Data masuk ke antrian **Verifikasi Pendaftaran** (`/pendaftaran`) di panel
   admin — muncul badge jumlah pendaftaran menunggu di sidebar.
3. Admin membuka detail, memilih **nomor kamar yang tersedia**, lalu
   **Setujui & Tempatkan** → calon penghuni otomatis menjadi penghuni aktif
   (dengan tagihan awal), atau **Tolak** pendaftaran.

Bagikan tautan `/form` ke calon penghuni; tombol "Salin Link Form" tersedia di
halaman verifikasi.

## API Ringkas

| Method | Endpoint                      | Keterangan                         |
| ------ | ----------------------------- | ---------------------------------- |
| GET    | `/api/dashboard`              | Ringkasan & statistik              |
| GET    | `/api/residents`              | Daftar penghuni (`?q=&filter=`)    |
| POST   | `/api/residents`              | Tambah penghuni                    |
| POST   | `/api/residents/:id/checkout` | Proses keluar → arsip mantan       |
| POST   | `/api/applications`           | Kirim pendaftaran (form publik)    |
| GET    | `/api/applications`           | Daftar pendaftaran (`?status=`)    |
| POST   | `/api/applications/:id/approve` | Setujui & tempatkan ke kamar     |
| POST   | `/api/applications/:id/reject`  | Tolak pendaftaran                |
| GET    | `/api/rooms`                  | Denah & status kamar               |
| GET    | `/api/payments`               | Riwayat pembayaran                 |
| POST   | `/api/payments/mark-paid`     | Tandai lunas                       |
| GET/POST | `/api/expenses`             | Pengeluaran                        |
| GET/POST | `/api/violations`           | Pelanggaran                        |
| GET    | `/api/mantan`                 | Arsip mantan penghuni              |
| GET    | `/api/finance`                | Transaksi & kategori pengeluaran   |
| GET/PUT | `/api/settings`              | Konfigurasi kos                    |
| GET    | `/api/ai/insights`            | Insight & prediksi                 |
| POST   | `/api/ai/chat`                | Chat AI (mock)                     |

> Catatan: data disimpan **in-memory** (reset saat server restart), sesuai
> lingkup v1.0. Migrasi ke database relasional direncanakan untuk v2.0.
