import { useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../components/Settings.jsx';
import { todayISO, fmtDate } from '../helpers.js';

const REASONS = ['Lulus kuliah', 'Pindah kerja / kota', 'Pindah ke kos lain', 'Menikah', 'Alasan keuangan', 'Lainnya'];

// Public exit-request form for current residents (no login).
export default function FormKeluar() {
  const { info } = useSettings();
  const [f, setF] = useState({ name: '', room: '', wa: '', exitDate: '', reason: REASONS[0], reasonOther: '', rating: 5, feedback: '', refundBank: '', refundAccount: '', refundName: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!f.name.trim() || !f.room.trim() || !f.exitDate) { setErr('Nama, nomor kamar dan tanggal keluar wajib diisi.'); return; }
    setBusy(true);
    try {
      await api.submitExit({ ...f, reason: f.reason === 'Lainnya' ? f.reasonOther || 'Lainnya' : f.reason, rating: Number(f.rating) });
      setDone(true);
      window.scrollTo(0, 0);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  return (
    <div className="form-public">
      <div className="fp-card">
        <div className="fp-head">
          <div className="fp-logo">In</div>
          <div><div className="fp-brand">Inde<em>Kos</em></div><div className="fp-kos">{info?.namaKos} · Pengajuan Keluar</div></div>
        </div>

        {done ? (
          <div className="fp-success">
            <div className="fp-success-ico">👋</div>
            <h2>Pengajuan Keluar Terkirim</h2>
            <p>Terima kasih telah tinggal di <strong>{info?.namaKos}</strong>. Pengajuan keluar kamar <strong>{f.room}</strong> pada <strong>{fmtDate(f.exitDate)}</strong> akan diproses admin. Kami akan menghubungi Anda terkait serah terima kunci dan pengembalian deposit.</p>
          </div>
        ) : (
          <>
            <div className="fp-intro">
              <h1>Formulir Keluar Kos</h1>
              <p>Ajukan tanggal keluar Anda. Pastikan tagihan sudah lunas sebelum serah terima kunci.</p>
            </div>
            <form onSubmit={submit} noValidate>
              <div className="fp-sec">Data Penghuni</div>
              <div className="g2">
                <div className="fg"><label className="fl">Nama Lengkap <span className="req">*</span></label><input className="fi" value={f.name} onChange={set('name')} /></div>
                <div className="fg"><label className="fl">Nomor Kamar <span className="req">*</span></label><input className="fi" placeholder="mis. 103" value={f.room} onChange={set('room')} /></div>
              </div>
              <div className="g2">
                <div className="fg"><label className="fl">No. WhatsApp aktif</label><input className="fi" inputMode="tel" value={f.wa} onChange={set('wa')} /></div>
                <div className="fg"><label className="fl">Tanggal Keluar <span className="req">*</span></label><input type="date" className="fi" min={todayISO()} value={f.exitDate} onChange={set('exitDate')} /></div>
              </div>
              <div className="fg"><label className="fl">Alasan Keluar</label>
                <select className="fi" value={f.reason} onChange={set('reason')}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
              </div>
              {f.reason === 'Lainnya' && <div className="fg"><input className="fi" placeholder="Tuliskan alasan" value={f.reasonOther} onChange={set('reasonOther')} /></div>}

              <div className="fp-sec">Pengembalian Deposit</div>
              <div className="g3">
                <div className="fg"><label className="fl">Bank / E-wallet</label><input className="fi" placeholder="BCA / GoPay" value={f.refundBank} onChange={set('refundBank')} /></div>
                <div className="fg"><label className="fl">No. Rekening</label><input className="fi" inputMode="numeric" value={f.refundAccount} onChange={set('refundAccount')} /></div>
                <div className="fg"><label className="fl">Atas Nama</label><input className="fi" value={f.refundName} onChange={set('refundName')} /></div>
              </div>

              <div className="fp-sec">Penilaian</div>
              <div className="fg">
                <label className="fl">Bagaimana pengalaman Anda tinggal di sini?</label>
                <div className="star-pick" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button type="button" key={n} role="radio" aria-checked={Number(f.rating) === n} className={n <= f.rating ? 'on' : ''} onClick={() => setF((x) => ({ ...x, rating: n }))}>★</button>
                  ))}
                </div>
              </div>
              <div className="fg"><label className="fl">Kritik & saran</label><textarea className="fi" rows="3" value={f.feedback} onChange={set('feedback')} /></div>

              {err && <div className="fp-alert" role="alert">⚠️ {err}</div>}
              <button className="btn btn-p fp-submit" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Ajukan Keluar'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
