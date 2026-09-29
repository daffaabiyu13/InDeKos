import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../components/Settings.jsx';
import PhotoInput from '../components/PhotoInput.jsx';
import { fmtRp } from '../helpers.js';
import { compareFaces } from '../faceVerify.js'; // ringan; face-api dimuat lazy di dalamnya
import StayInput from '../components/StayInput.jsx';

const empty = {
  name: '', tempatLahir: '', tglLahir: '', alamat: '', nik: '', wa: '', masuk: '', job: 'Mahasiswa', uni: '',
  wali: '', waliStatus: 'Ayah', waWali: '', emergency2Name: '', emergency2Rel: 'Ibu', emergency2Wa: '',
  sumber: 'Instagram', roomTypeId: '', ktpPhoto: '', selfiePhoto: '', stayMonths: null,
};
const RELATIONS = ['Ayah', 'Ibu', 'Kakak', 'Adik', 'Paman/Bibi', 'Suami/Istri', 'Teman', 'Lainnya'];

// Public registration form for prospective tenants (no login).
export default function FormPendaftaran() {
  const { info } = useSettings();
  const [form, setForm] = useState(empty);
  const [face, setFace] = useState({ state: 'idle' }); // idle | checking | done | error
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Verifikasi wajah otomatis begitu foto KTP & selfie lengkap.
  useEffect(() => {
    if (!form.ktpPhoto || !form.selfiePhoto) { setFace({ state: 'idle' }); return undefined; }
    let alive = true;
    setFace({ state: 'checking' });
    compareFaces(form.ktpPhoto, form.selfiePhoto)
      .then((r) => alive && setFace(r.ok ? { state: 'done', ...r } : { state: 'error', reason: r.reason }))
      .catch(() => alive && setFace({ state: 'error', reason: 'Verifikasi wajah tidak dapat dijalankan di perangkat ini.' }));
    return () => { alive = false; };
  }, [form.ktpPhoto, form.selfiePhoto]);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    const required = [['name', 'Nama lengkap'], ['wa', 'No. WhatsApp'], ['wali', 'Nama kontak darurat 1'], ['waWali', 'No. WA kontak darurat 1'], ['emergency2Name', 'Nama kontak darurat 2'], ['emergency2Wa', 'No. WA kontak darurat 2']];
    const missing = required.filter(([k]) => !String(form[k]).trim()).map(([, l]) => l);
    if (missing.length) { setErr(`Lengkapi: ${missing.join(', ')}.`); return; }
    if (!form.ktpPhoto || !form.selfiePhoto) { setErr('Foto KTP dan foto selfie wajib diunggah.'); return; }
    if (face.state === 'checking') { setErr('Tunggu sebentar, verifikasi wajah sedang berjalan…'); return; }
    if (!agree) { setErr('Anda harus menyetujui peraturan kos.'); return; }
    setSaving(true);
    try {
      await api.submitApplication({
        ...form,
        roomTypeId: form.roomTypeId ? Number(form.roomTypeId) : null,
        faceScore: face.state === 'done' ? face.score : null,
        faceMatch: face.state === 'done' ? face.match : null,
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
            <div className="fp-kos">{info?.namaKos}{info?.alamat ? ` · ${info.alamat}` : ''}</div>
          </div>
        </div>

        {done ? (
          <div className="fp-success">
            <div className="fp-success-ico">✅</div>
            <h2>Pendaftaran Terkirim!</h2>
            <p>Terima kasih, <strong>{form.name}</strong>. Data Anda sedang <strong>diverifikasi admin</strong>. Kami akan menghubungi Anda via WhatsApp di <strong>{form.wa}</strong> untuk konfirmasi kamar.</p>
            <button className="btn btn-p" onClick={() => { setForm(empty); setDone(false); setAgree(false); }}>Daftar Penghuni Lain</button>
          </div>
        ) : (
          <>
            <div className="fp-intro">
              <h1>Formulir Pendaftaran Penghuni</h1>
              <p>Isi data dengan lengkap dan benar. Admin akan memverifikasi identitas Anda dan menentukan nomor kamar.</p>
            </div>

            <form onSubmit={submit} noValidate>
              <div className="fp-sec">Data Diri</div>
              <div className="fg"><label className="fl">Nama Lengkap <span className="req">*</span></label><input className="fi" placeholder="Sesuai KTP" autoComplete="name" value={form.name} onChange={set('name')} /></div>
              <div className="g2">
                <div className="fg"><label className="fl">Tempat Lahir</label><input className="fi" value={form.tempatLahir} onChange={set('tempatLahir')} /></div>
                <div className="fg"><label className="fl">Tanggal Lahir</label><input type="date" className="fi" value={form.tglLahir} onChange={set('tglLahir')} /></div>
              </div>
              <div className="g2">
                <div className="fg"><label className="fl">NIK</label><input className="fi" inputMode="numeric" maxLength={16} placeholder="16 digit" value={form.nik} onChange={set('nik')} /></div>
                <div className="fg"><label className="fl">No. WhatsApp <span className="req">*</span></label><input className="fi" inputMode="tel" placeholder="08xx…" value={form.wa} onChange={set('wa')} /></div>
              </div>
              <div className="fg"><label className="fl">Alamat Asal</label><input className="fi" value={form.alamat} onChange={set('alamat')} /></div>
              <div className="g2">
                <div className="fg"><label className="fl">Pekerjaan</label><select className="fi" value={form.job} onChange={set('job')}><option>Mahasiswa</option><option>Karyawan/Pegawai</option><option>Lainnya</option></select></div>
                <div className="fg"><label className="fl">Universitas / Kantor</label><input className="fi" value={form.uni} onChange={set('uni')} /></div>
              </div>

              <div className="fp-sec">Rencana Tinggal</div>
              <div className="g2">
                <div className="fg"><label className="fl">Rencana Tanggal Masuk</label><input type="date" className="fi" value={form.masuk} onChange={set('masuk')} /></div>
                <div className="fg">
                  <label className="fl">Tipe Kamar Diminati</label>
                  <select className="fi" value={form.roomTypeId} onChange={set('roomTypeId')}>
                    <option value="">Bebas / belum tahu</option>
                    {(info?.roomTypes || []).map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtRp(t.price)}/bln</option>)}
                  </select>
                </div>
              </div>
              <StayInput value={form.stayMonths} masuk={form.masuk} onChange={(v) => setForm((f) => ({ ...f, stayMonths: v }))}
                hint="Perkiraan saja, membantu kami menyiapkan kamar. Pembayaran tetap per bulan." />
              {form.roomTypeId && (
                <div className="field-hint" style={{ marginTop: -6, marginBottom: 12 }}>
                  Fasilitas: {info?.roomTypes.find((t) => String(t.id) === form.roomTypeId)?.facilities.join(', ')}
                </div>
              )}

              <div className="fp-sec">Kontak Darurat 1 <span className="req">*</span></div>
              <div className="g3">
                <div className="fg"><label className="fl">Nama</label><input className="fi" value={form.wali} onChange={set('wali')} /></div>
                <div className="fg"><label className="fl">Hubungan</label><select className="fi" value={form.waliStatus} onChange={set('waliStatus')}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
                <div className="fg"><label className="fl">No. WA</label><input className="fi" inputMode="tel" value={form.waWali} onChange={set('waWali')} /></div>
              </div>
              <div className="fp-sec">Kontak Darurat 2 <span className="req">*</span></div>
              <div className="g3">
                <div className="fg"><label className="fl">Nama</label><input className="fi" value={form.emergency2Name} onChange={set('emergency2Name')} /></div>
                <div className="fg"><label className="fl">Hubungan</label><select className="fi" value={form.emergency2Rel} onChange={set('emergency2Rel')}>{RELATIONS.map((r) => <option key={r}>{r}</option>)}</select></div>
                <div className="fg"><label className="fl">No. WA</label><input className="fi" inputMode="tel" value={form.emergency2Wa} onChange={set('emergency2Wa')} /></div>
              </div>

              <div className="fp-sec">Verifikasi Identitas</div>
              <div className="g2">
                <PhotoInput label="Foto KTP" required capture="environment" hint="Foto KTP asli, tidak silau & terbaca jelas"
                  value={form.ktpPhoto} onChange={(v) => setForm((f) => ({ ...f, ktpPhoto: v }))} />
                <PhotoInput label="Foto Selfie" required capture="user" maxDim={960} hint="Wajah menghadap kamera, tanpa masker/kacamata hitam"
                  value={form.selfiePhoto} onChange={(v) => setForm((f) => ({ ...f, selfiePhoto: v }))} />
              </div>
              <FaceStatus face={face} />

              <div className="fp-sec">Peraturan Kos</div>
              {info?.peraturan && <pre className="rules">{info.peraturan}</pre>}
              <label className="switch-row"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Saya telah membaca dan menyetujui peraturan kos.</label>

              <div className="fg" style={{ marginTop: 14 }}>
                <label className="fl">Dari mana mengetahui kos ini?</label>
                <select className="fi" value={form.sumber} onChange={set('sumber')}>
                  <option>Instagram</option><option>TikTok</option><option>Rekomendasi teman/kenalan</option>
                  <option>Mamikos / platform kos online</option><option>Papan nama / jalan-jalan</option><option>Lainnya</option>
                </select>
              </div>

              {err && <div className="fp-alert" role="alert">⚠️ {err}</div>}
              <button className="btn btn-p fp-submit" type="submit" disabled={saving}>{saving ? 'Mengirim…' : 'Kirim Pendaftaran'}</button>
              <p className="fp-note">Foto KTP & selfie hanya dapat dilihat pengelola kos untuk keperluan verifikasi.</p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function FaceStatus({ face }) {
  if (face.state === 'idle') return <div className="face-status neutral">🔍 Verifikasi wajah otomatis berjalan setelah foto KTP & selfie diunggah.</div>;
  if (face.state === 'checking') return <div className="face-status neutral"><span className="spinner" /> Mencocokkan wajah KTP dengan selfie… (pertama kali memuat model, mohon tunggu)</div>;
  if (face.state === 'error') return <div className="face-status warn">⚠️ {face.reason} Anda tetap dapat mengirim; admin akan memeriksa manual.</div>;
  const pct = Math.round(face.score * 100);
  return face.match
    ? <div className="face-status ok">✅ Wajah cocok dengan KTP ({pct}% kemiripan).</div>
    : <div className="face-status warn">⚠️ Wajah kurang cocok dengan KTP ({pct}%). Coba selfie ulang dengan cahaya lebih terang dan wajah lurus ke kamera. Pendaftaran tetap bisa dikirim untuk diperiksa admin.</div>;
}
