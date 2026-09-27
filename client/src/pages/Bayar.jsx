import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../components/Settings.jsx';
import { fmtRp, fmtDate, INVOICE_STATE, KIND_LABEL } from '../helpers.js';

// Public: tenant finds their open invoices by name + room.
export default function Bayar() {
  const { info } = useSettings();
  const [form, setForm] = useState({ name: '', room: '' });
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function lookup(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try { setRes(await api.publicBills(form.name, form.room)); } catch (e2) { setErr(e2.message); setRes(null); } finally { setBusy(false); }
  }

  const total = (res?.invoices || []).filter((i) => i.state !== 'menunggu').reduce((a, i) => a + i.amount, 0);

  return (
    <div className="form-public">
      <div className="fp-card">
        <div className="fp-head">
          <div className="fp-logo">In</div>
          <div><div className="fp-brand">Inde<em>Kos</em></div><div className="fp-kos">{info?.namaKos} · Pembayaran Sewa</div></div>
        </div>

        {!res ? (
          <>
            <div className="fp-intro"><h1>Cek & Bayar Tagihan</h1><p>Masukkan nama dan nomor kamar untuk melihat tagihan Anda.</p></div>
            {err && <div className="fp-alert" role="alert">⚠️ {err}</div>}
            <form onSubmit={lookup}>
              <div className="fg"><label className="fl">Nama Lengkap</label><input className="fi" placeholder="Nama penghuni" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="fg"><label className="fl">Nomor Kamar</label><input className="fi" placeholder="mis. 103" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} /></div>
              <button className="btn btn-p fp-submit" type="submit" disabled={busy}>{busy ? 'Mencari…' : 'Cek Tagihan'}</button>
            </form>
          </>
        ) : (
          <>
            <div className="fp-intro"><h1>Halo, {res.name} 👋</h1><p>Kamar {res.room} · {res.invoices.length ? `${res.invoices.length} tagihan terbuka` : 'tidak ada tagihan terbuka'}</p></div>
            {res.invoices.length === 0 ? (
              <div className="fp-success"><div className="fp-success-ico">🎉</div><h2>Semua tagihan lunas</h2><p>Terima kasih sudah membayar tepat waktu.</p></div>
            ) : (
              <>
                {res.invoices.length > 1 && total > 0 && <div className="fp-alert" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>Total belum dibayar: <strong>{fmtRp(total)}</strong> — setiap invoice dibayar terpisah.</div>}
                <div className="inv-list">
                  {res.invoices.map((i) => (
                    <Link key={i.publicId} to={`/invoice/${i.publicId}`} className="inv-item">
                      <div style={{ flex: 1 }}>
                        <div className="tn">{KIND_LABEL[i.kind]} · {i.number}</div>
                        <div className="tm">{i.description}</div>
                        <div className="tm">Jatuh tempo {fmtDate(i.dueDate)}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800 }}>{fmtRp(i.amount)}</div>
                        <span className={`badge ${INVOICE_STATE[i.state].cls}`}>{INVOICE_STATE[i.state].label}</span>
                        <div className="tm" style={{ color: 'var(--jade-d)', fontWeight: 700, marginTop: 4 }}>{i.state === 'menunggu' ? 'Lihat' : 'Bayar'} →</div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            )}
            <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={() => setRes(null)}>Kembali</button>
          </>
        )}
      </div>
    </div>
  );
}
