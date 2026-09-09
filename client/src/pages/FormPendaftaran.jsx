import { useEffect, useState } from 'react';
import { api } from '../api.js';

const empty = {
  name: '', tempatLahir: '', tglLahir: '', alamat: '', nik: '', wa: '',
  masuk: '', job: 'Mahasiswa', uni: '', wali: '', waliStatus: 'Ayah', waWali: '', sumber: 'Instagram',
};

// Public-facing registration form for prospective tenants.
// Rendered outside the admin layout (no sidebar).
export default function FormPendaftaran() {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const [kos, setKos] = useState({ namaKos: 'InDeKos', alamat: '' });

  useEffect(() => {
    api.settings().then((s) => setKos(s)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!form.name || !form.wa) {
      setErr('Nama lengkap dan nomor WhatsApp wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await api.submitApplication({
        ...form,
        tglLahir: form.tglLahir ? form.tglLahir.split('-').reverse().join('/') : '',
        masuk: form.masuk ? form.masuk.split('-').reverse().join('/') : '',
      });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-public">
      <div className="fp-card">
        <div className="fp-head">
          <div className="fp-logo">In</div>
          <div>
            <div className="fp-brand">Inde<em>Kos</em></div>
            <div className="fp-kos">{kos.namaKos}{kos.alamat ? ` · ${kos.alamat}` : ''}</div>
          </div>
        </div>

        {done ? (
          <div className="fp-success">
            <div className="fp-success-ico">✅</div>
            <h2>Pendaftaran Terkirim!</h2>
            <p>
              Terima kasih, <strong>{form.name}</strong>. Data pendaftaran Anda sudah kami terima
              dan sedang <strong>menunggu verifikasi admin</strong>. Kami akan menghubungi Anda
              melalui WhatsApp di <strong>{form.wa}</strong> untuk konfirmasi kamar.
            </p>
            <button className="btn btn-p" onClick={() => { setForm(empty); setDone(false); }}>
              Daftar Penghuni Lain
            </button>
          </div>
        ) : (
          <>
            <div className="fp-intro">
              <h1>Formulir Pendaftaran Penghuni</h1>
              <p>Isi data diri Anda dengan lengkap dan benar. Admin akan memverifikasi dan menentukan nomor kamar Anda.</p>
            </div>

            {err && <div className="fp-alert">⚠️ {err}</div>}

            <form onSubmit={submit}>
              <div className="fp-sec">Data Diri</div>
              <div className="fg">
                <label className="fl">Nama Lengkap <span className="req">*</span></label>
                <input className="fi" placeholder="Sesuai KTP" value={form.name} onChange={set('name')} required />
              </div>
              <div className="g2">
                <div className="fg"><label className="fl">Tempat Lahir</label><input className="fi" placeholder="Kota" value={form.tempatLahir} onChange={set('tempatLahir')} /></div>
                <div className="fg"><label className="fl">Tanggal Lahir</label><input type="date" className="fi" value={form.tglLahir} onChange={set('tglLahir')} /></div>
              </div>
              <div className="fg"><label className="fl">NIK (Nomor KTP)</label><input className="fi" placeholder="16 digit" value={form.nik} onChange={set('nik')} inputMode="numeric" /></div>
              <div className="fg"><label className="fl">Alamat Asal</label><input className="fi" placeholder="Sesuai KTP" value={form.alamat} onChange={set('alamat')} /></div>
              <div className="g2">
                <div className="fg"><label className="fl">No. WhatsApp <span className="req">*</span></label><input className="fi" placeholder="08xx..." value={form.wa} onChange={set('wa')} required /></div>
                <div className="fg"><label className="fl">Rencana Tanggal Masuk</label><input type="date" className="fi" value={form.masuk} onChange={set('masuk')} /></div>
              </div>

              <div className="fp-sec">Pekerjaan</div>
              <div className="g2">
                <div className="fg">
                  <label className="fl">Pekerjaan/Profesi</label>
                  <select className="fi" value={form.job} onChange={set('job')}>
                    <option>Mahasiswa</option><option>Karyawan/Pegawai</option><option>Lainnya</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Universitas (jika mahasiswa)</label>
                  <select className="fi" value={form.uni} onChange={set('uni')}>
                    <option value="">Pilih universitas...</option>
                    <option>POLINEMA</option><option>UB</option><option>UMM</option>
                    <option>UNISMA</option><option>UIN</option><option>ITN</option><option>Lainnya</option>
                  </select>
                </div>
              </div>

              <div className="fp-sec">Kontak Darurat / Wali</div>
              <div className="fg"><label className="fl">Nama Wali</label><input className="fi" placeholder="Orang yang bisa dihubungi" value={form.wali} onChange={set('wali')} /></div>
              <div className="g2">
                <div className="fg">
                  <label className="fl">Status Wali</label>
                  <select className="fi" value={form.waliStatus} onChange={set('waliStatus')}>
                    <option>Ayah</option><option>Ibu</option><option>Kakak</option><option>Paman/Bibi</option><option>Lainnya</option>
                  </select>
                </div>
                <div className="fg"><label className="fl">No. WA Wali</label><input className="fi" placeholder="08xx..." value={form.waWali} onChange={set('waWali')} /></div>
              </div>
              <div className="fg">
                <label className="fl">Darimana mengetahui kos ini?</label>
                <select className="fi" value={form.sumber} onChange={set('sumber')}>
                  <option>Instagram</option><option>TikTok</option>
                  <option>Rekomendasi teman/kenalan</option>
                  <option>Mamikos / platform kos online</option>
                  <option>Papan nama / jalan-jalan</option><option>Lainnya</option>
                </select>
              </div>

              <button className="btn btn-p fp-submit" type="submit" disabled={saving}>
                {saving ? 'Mengirim...' : 'Kirim Pendaftaran'}
              </button>
              <p className="fp-note">Data Anda hanya digunakan untuk proses administrasi kos.</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
