import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, invoicePdfUrl } from '../api.js';
import { fmtRp, fmtDate, INVOICE_STATE, KIND_LABEL } from '../helpers.js';

// Public invoice (link sent via WhatsApp): details, dynamic QRIS, tenant
// payment confirmation, and a print-friendly layout.
export default function InvoicePublic() {
  const { publicId } = useParams();
  const [inv, setInv] = useState(null);
  const [err, setErr] = useState('');
  const [method, setMethod] = useState('QRIS');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.publicInvoice(publicId).then(setInv).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [publicId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function confirm() {
    setBusy(true);
    try { await api.confirmInvoice(publicId, { method, note }); await load(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  if (err && !inv) return <div className="form-public"><div className="fp-card"><div className="fp-alert">⚠️ {err}</div></div></div>;
  if (!inv) return <div className="form-public"><div className="fp-card"><div className="loading">Memuat invoice…</div></div></div>;

  const st = INVOICE_STATE[inv.state];
  return (
    <div className="form-public invoice-page">
      <div className="fp-card invoice-doc">
        <div className="inv-top">
          <div className="fp-head" style={{ border: 'none', margin: 0, padding: 0 }}>
            <div className="fp-logo">In</div>
            <div><div className="fp-brand">{inv.kos.namaKos}</div><div className="fp-kos">{inv.kos.alamat}</div></div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="inv-title">INVOICE</div>
            <div className="tm">{inv.number}</div>
          </div>
        </div>

        {inv.status === 'paid' && <div className="paid-stamp">LUNAS</div>}

        <div className="g2 inv-meta">
          <div><div className="tm">Ditagihkan kepada</div><div className="tn">{inv.name}</div><div className="tm">Kamar {inv.room}</div></div>
          <div style={{ textAlign: 'right' }}>
            <div className="tm">Tanggal terbit: {fmtDate(inv.issueDate)}</div>
            <div className="tm">Jatuh tempo: <strong style={{ color: 'var(--t1)' }}>{fmtDate(inv.dueDate)}</strong></div>
            <span className={`badge ${st.cls}`} style={{ marginTop: 4 }}>{st.label}</span>
          </div>
        </div>

        <table className="inv-table">
          <thead><tr><th>Keterangan</th><th style={{ textAlign: 'right' }}>Jumlah</th></tr></thead>
          <tbody>
            <tr><td><div className="tn">{KIND_LABEL[inv.kind]}</div><div className="tm">{inv.description}</div>{!inv.description.includes(fmtDate(inv.periodStart)) && inv.periodStart !== inv.periodEnd && <div className="tm">Periode {fmtDate(inv.periodStart)} – {fmtDate(inv.periodEnd)}</div>}</td><td style={{ textAlign: 'right' }}>{fmtRp(inv.amount)}</td></tr>
            {inv.uniqueCode > 0 && inv.status !== 'paid' && <tr><td className="tm">Kode unik pembayaran (untuk verifikasi)</td><td style={{ textAlign: 'right' }}>{fmtRp(inv.uniqueCode)}</td></tr>}
          </tbody>
          <tfoot><tr><td>Total {inv.status === 'paid' ? 'dibayar' : 'bayar'}</td><td style={{ textAlign: 'right' }}>{fmtRp(inv.status === 'paid' ? inv.amount : inv.total)}</td></tr></tfoot>
        </table>

        {inv.status === 'paid' && <div className="face-status ok">✅ Dibayar {fmtDate(inv.paidAt)} via {inv.method}. Terima kasih!</div>}
        {inv.status === 'menunggu' && <div className="face-status neutral">⏳ Pembayaran sudah Anda laporkan dan sedang diverifikasi admin.</div>}

        {inv.status === 'unpaid' && (
          <div className="no-print">
            {inv.qrImage ? (
              <div className="pay-qr">
                <img src={inv.qrImage} alt="QRIS pembayaran" width="240" height="240" />
                <div className="pay-qr-cap">Scan dengan GoPay, OVO, DANA, ShopeePay, atau m-banking. Nominal <strong>{fmtRp(inv.total)}</strong> sudah terisi otomatis.</div>
              </div>
            ) : (
              <div className="face-status neutral"><span>Bayar sesuai instruksi pengelola (transfer/tunai) sebesar <strong>{fmtRp(inv.total)}</strong>{inv.uniqueCode ? ' — mohon sertakan kode unik agar mudah diverifikasi' : ''}. Hubungi: {inv.kos.wa}</span></div>
            )}
            <div className="fp-sec">Sudah membayar?</div>
            <div className="g2">
              <div className="fg"><label className="fl">Metode</label><select className="fi" value={method} onChange={(e) => setMethod(e.target.value)}><option>QRIS</option><option>Transfer</option><option>Tunai</option></select></div>
              <div className="fg"><label className="fl">Catatan (opsional)</label><input className="fi" placeholder="mis. a.n. Budi, 10 Sep" value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
            {err && <div className="fp-alert">⚠️ {err}</div>}
            <button className="btn btn-p fp-submit" style={{ marginTop: 4 }} onClick={confirm} disabled={busy}>{busy ? 'Mengirim…' : 'Saya Sudah Bayar'}</button>
          </div>
        )}

        <div className="no-print" style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <a className="btn btn-g" style={{ flex: 1, justifyContent: 'center' }} href={invoicePdfUrl(publicId, true)}>⬇ Unduh PDF</a>
          <button className="btn btn-g" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.print()}>🖨 Cetak</button>
          <a className="btn btn-g" style={{ flex: 1, justifyContent: 'center' }} href="/bayar">Tagihan lain</a>
        </div>
      </div>
    </div>
  );
}
