import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useSettings } from '../components/Settings.jsx';

const DEFAULTS = {
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
  peraturan: '',
  paymentMode: 'manual',
  qrisString: '',
  midtransServerKey: '',
};

const typeNotes = {
  putri: 'Saat ini dikonfigurasi sebagai <strong>Kos Putri</strong> — hanya menerima penghuni perempuan.',
  putra: 'Saat ini dikonfigurasi sebagai <strong>Kos Putra</strong> — hanya menerima penghuni laki-laki.',
  campur: 'Saat ini dikonfigurasi sebagai <strong>Kos Campur</strong> — menerima penghuni laki-laki dan perempuan.',
};

const types = [
  { key: 'putri', ico: '👩', name: 'Kos Putri', desc: 'Khusus penghuni perempuan' },
  { key: 'putra', ico: '👨', name: 'Kos Putra', desc: 'Khusus penghuni laki-laki' },
  { key: 'campur', ico: '🏠', name: 'Kos Campur', desc: 'Laki-laki dan perempuan' },
];

export default function Pengaturan({ onSaved }) {
  const [s, setS] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const toast = useToast();
  const { reload } = useSettings();

  useEffect(() => {
    api.settings().then((data) => { setS({ ...DEFAULTS, ...data }); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  const set = (k) => (e) => setS((prev) => ({ ...prev, [k]: e.target.value }));
  const step = (k, d, min, max) => setS((prev) => ({ ...prev, [k]: Math.max(min, Math.min(max, (parseInt(prev[k], 10) || min) + d)) }));

  async function save() {
    try {
      await api.saveSettings(s);
      toast('✅ Pengaturan berhasil disimpan!');
      reload();
      onSaved?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  function reset() {
    setS(DEFAULTS);
    toast('↺ Pengaturan direset ke default.');
  }

  if (!loaded) return <div className="loading">Memuat pengaturan…</div>;

  const start = parseInt(s.roomStart, 10) || 101;
  const total = parseInt(s.totalKamar, 10) || 20;
  const preview = `${s.roomPrefix}${start} – ${s.roomPrefix}${start + total - 1}`;

  return (
    <>
      <div className="g2 mb">
        <div className="card">
          <div className="ch"><div><div className="ct">Tipe Kos</div><div className="cs">Tentukan kategori penghuni yang diterima</div></div></div>
          <div className="cb">
            <div className="sec-hd"><div className="sec-hd-line" /><div className="sec-hd-lbl">Pilih Tipe</div><div className="sec-hd-line" /></div>
            <div className="kos-type-grid">
              {types.map((t) => (
                <div key={t.key} className={`ktype${s.kosType === t.key ? ' sel' : ''}`} onClick={() => setS((p) => ({ ...p, kosType: t.key }))}>
                  <div className="ktype-ico">{t.ico}</div>
                  <div className="ktype-name">{t.name}</div>
                  <div className="ktype-desc">{t.desc}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 14, padding: '10px 13px', background: 'var(--warn-bg)', borderRadius: 8, border: '1px solid var(--bdr)', fontSize: 12.5, color: 'var(--warn)' }}
              dangerouslySetInnerHTML={{ __html: `ℹ️ ${typeNotes[s.kosType]}` }} />
          </div>
        </div>

        <div className="card">
          <div className="ch"><div><div className="ct">Informasi Properti</div><div className="cs">Nama, alamat, dan kontak kos</div></div></div>
          <div className="cb">
            <div className="fg"><label className="fl">Nama Kos <span className="req">*</span></label><input className="fi" value={s.namaKos} onChange={set('namaKos')} /></div>
            <div className="fg"><label className="fl">Alamat Lengkap <span className="req">*</span></label><input className="fi" value={s.alamat} onChange={set('alamat')} /></div>
            <div className="fg"><label className="fl">No. WA Admin / Pemilik</label><input className="fi" value={s.wa} onChange={set('wa')} /></div>
            <div className="fg"><label className="fl">Email Admin</label><input type="email" className="fi" value={s.email} onChange={set('email')} /></div>
          </div>
        </div>
      </div>

      <div className="g2 mb">
        <div className="card">
          <div className="ch"><div><div className="ct">Konfigurasi Kamar</div><div className="cs">Jumlah, nomor, dan tata letak kamar</div></div></div>
          <div className="cb">
            <div className="sec-hd"><div className="sec-hd-line" /><div className="sec-hd-lbl">Jumlah &amp; Penomoran</div><div className="sec-hd-line" /></div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 16 }}>
              <div>
                <div className="fl" style={{ marginBottom: 8 }}>Total Kamar</div>
                <div className="stepper">
                  <button className="step-btn" onClick={() => step('totalKamar', -1, 1, 200)}>−</button>
                  <input className="step-val" type="number" value={s.totalKamar} readOnly />
                  <button className="step-btn" onClick={() => step('totalKamar', 1, 1, 200)}>+</button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 5 }}>kamar saat ini: {s.totalKamar}</div>
              </div>
              <div>
                <div className="fl" style={{ marginBottom: 8 }}>Jumlah Lantai</div>
                <div className="stepper">
                  <button className="step-btn" onClick={() => step('lantai', -1, 1, 10)}>−</button>
                  <input className="step-val" type="number" value={s.lantai} readOnly />
                  <button className="step-btn" onClick={() => step('lantai', 1, 1, 10)}>+</button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 5 }}>lantai</div>
              </div>
            </div>

            <div className="sec-hd" style={{ marginTop: 4 }}><div className="sec-hd-line" /><div className="sec-hd-lbl">Format Nomor Kamar</div><div className="sec-hd-line" /></div>
            <div className="g2" style={{ marginBottom: 12 }}>
              <div className="fg" style={{ marginBottom: 0 }}><label className="fl">Nomor Awal</label><input type="number" className="fi" value={s.roomStart} onChange={set('roomStart')} /></div>
              <div className="fg" style={{ marginBottom: 0 }}><label className="fl">Prefiks (opsional)</label><input className="fi" placeholder="mis: A, B, atau kosong" value={s.roomPrefix} onChange={set('roomPrefix')} /></div>
            </div>
            <div style={{ background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '10px 13px', fontSize: 12.5, color: 'var(--t2)' }}>
              Preview nomor kamar: <strong style={{ color: 'var(--t1)' }}>{preview}</strong>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div><div className="ct">Tarif Sewa</div><div className="cs">Harga sewa per bulan berdasarkan tipe</div></div></div>
          <div className="cb">
            <div className="sec-hd"><div className="sec-hd-line" /><div className="sec-hd-lbl">Tipe Kamar &amp; Harga</div><div className="sec-hd-line" /></div>
            <PriceField label="Kamar Standar (per bulan)" value={s.priceStd} onChange={set('priceStd')} />
            <PriceField label="Kamar Premium / AC (per bulan)" value={s.pricePrem} onChange={set('pricePrem')} />
            <PriceField label="Uang Jaminan / Deposit" value={s.deposit} onChange={set('deposit')} />
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">Tanggal Jatuh Tempo Pembayaran</label>
              <select className="fi" value={s.dueDate} onChange={set('dueDate')}>
                <option value="1">Tanggal 1 setiap bulan</option>
                <option value="5">Tanggal 5 setiap bulan</option>
                <option value="10">Tanggal 10 setiap bulan</option>
                <option value="15">Tanggal 15 setiap bulan</option>
                <option value="sesuai">Sesuai tanggal masuk</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card mb">
        <div className="ch"><div><div className="ct">Pembayaran</div><div className="cs">Metode pembayaran & konfigurasi QRIS untuk halaman /bayar</div></div></div>
        <div className="cb">
          <div className="fg">
            <label className="fl">Metode Pembayaran</label>
            <select className="fi" value={s.paymentMode} onChange={set('paymentMode')}>
              <option value="manual">Manual (admin catat sendiri)</option>
              <option value="qris_static">QRIS Statis (GoPay Merchant / dll) — generate QR dinamis</option>
              <option value="midtrans" disabled>Midtrans (otomatis penuh) — segera hadir</option>
            </select>
          </div>

          {s.paymentMode === 'qris_static' && (
            <div className="fg">
              <label className="fl">Payload QRIS Statis</label>
              <textarea
                className="fi" rows="4" style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
                placeholder="Tempel string QRIS statis di sini (hasil decode gambar QR merchant Anda, diawali 00020101...)"
                value={s.qrisString} onChange={set('qrisString')}
              />
              <div style={{ fontSize: 11.5, color: 'var(--t2)', marginTop: 6, lineHeight: 1.5 }}>
                Dapatkan string ini dengan men-decode gambar QRIS merchant Anda (mis. lewat pemindai QR online).
                Aplikasi akan otomatis membuat QR dinamis ber-nominal untuk tiap tagihan. Uang tetap masuk ke akun Anda.
              </div>
            </div>
          )}

          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">Midtrans Server Key <span style={{ color: 'var(--t3)', fontWeight: 500 }}>(opsional, untuk otomatis penuh nanti)</span></label>
            <input
              className="fi" placeholder="SB-Mid-server-xxxx (isi saat upgrade ke Midtrans)"
              value={s.midtransServerKey} onChange={set('midtransServerKey')}
            />
          </div>
        </div>
      </div>

      <div className="card mb">
        <div className="ch"><div><div className="ct">Peraturan Kos</div><div className="cs">Ditampilkan ke calon penghuni saat pendaftaran</div></div></div>
        <div className="cb">
          <div className="g2">
            <div>
              <div className="sec-hd"><div className="sec-hd-line" /><div className="sec-hd-lbl">Aturan Umum</div><div className="sec-hd-line" /></div>
              <div className="fg">
                <label className="fl">Jam Malam / Jam Tutup Gerbang</label>
                <select className="fi" value={s.jamMalam} onChange={set('jamMalam')}>
                  <option value="22:00">22.00 WIB</option><option value="22:30">22.30 WIB</option>
                  <option value="23:00">23.00 WIB</option><option value="23:30">23.30 WIB</option>
                  <option value="00:00">00.00 WIB (tengah malam)</option>
                </select>
              </div>
              <div className="fg">
                <label className="fl">Tamu Diperbolehkan Sampai</label>
                <select className="fi" value={s.jamTamu} onChange={set('jamTamu')}>
                  <option value="20:00">20.00 WIB</option><option value="21:00">21.00 WIB</option>
                  <option value="22:00">22.00 WIB</option><option value="tidak">Tidak ada tamu menginap</option>
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Hewan Peliharaan</label>
                <select className="fi" value={s.pet} onChange={set('pet')}>
                  <option value="tidak">Tidak diperbolehkan</option>
                  <option value="kecil">Hewan kecil diperbolehkan</option>
                  <option value="semua">Semua diperbolehkan</option>
                </select>
              </div>
            </div>
            <div>
              <div className="sec-hd"><div className="sec-hd-line" /><div className="sec-hd-lbl">Catatan Peraturan</div><div className="sec-hd-line" /></div>
              <textarea className="fi" rows="7" style={{ resize: 'vertical', lineHeight: 1.6 }} value={s.peraturan} onChange={set('peraturan')} />
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn btn-g" onClick={reset}>↺ Reset ke Default</button>
        <button className="btn btn-p" onClick={save}><Icons.save /> Simpan Pengaturan</button>
      </div>
    </>
  );
}

function PriceField({ label, value, onChange }) {
  return (
    <div className="fg">
      <label className="fl">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--t2)', whiteSpace: 'nowrap' }}>Rp</span>
        <input className="fi" value={value} onChange={onChange} placeholder="0" />
      </div>
    </div>
  );
}
