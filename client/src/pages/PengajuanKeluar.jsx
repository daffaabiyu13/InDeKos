import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { fmtDate, fmtRp, stars, timeAgo, openWhatsApp } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import Modal from '../components/Modal.jsx';
import FormLinks from '../components/FormLinks.jsx';

export default function PengajuanKeluar({ version, onChange }) {
  const [ver, setVer] = useState(0);
  const [status, setStatus] = useState('pending');
  const { data: list, loading } = useFetch(() => api.exitRequests(status === 'all' ? '' : status), [version, ver, status]);
  const [active, setActive] = useState(null);
  const toast = useToast();
  const nav = useNavigate();
  const reload = () => { setVer((v) => v + 1); onChange?.(); };

  return (
    <>
      <div className="fr">
        {[['pending', 'Menunggu'], ['approved', 'Disetujui'], ['rejected', 'Ditolak'], ['all', 'Semua']].map(([k, l]) => (
          <button key={k} className={`chip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <FormLinks path="/keluar" name="form keluar" openLabel="Buka Form Keluar" />
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Penghuni</th><th>Tanggal Keluar</th><th>Alasan</th><th>Rating & Masukan</th><th>Pengembalian Deposit</th><th>Tunggakan</th><th>Status</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7" className="empty">Memuat…</td></tr>}
              {!loading && list?.length === 0 && <tr><td colSpan="7" className="empty">Tidak ada pengajuan</td></tr>}
              {list?.map((e) => (
                <tr key={e.id}>
                  <td><div className="tn">{e.name}</div><div className="tm">Kamar {e.room} · diajukan {timeAgo(e.createdAt)}</div></td>
                  <td className="tn">{fmtDate(e.exitDate)}</td>
                  <td style={{ fontSize: 12.5 }}>{e.reason || '—'}</td>
                  <td><div style={{ color: 'var(--warn)' }}>{stars(e.rating)}</div>{e.feedback && <div className="tm" style={{ maxWidth: 200 }}>“{e.feedback}”</div>}</td>
                  <td className="tm">{e.refundAccount ? <>{e.refundBank} {e.refundAccount}<div>a.n. {e.refundName}</div></> : '—'}</td>
                  <td style={{ fontWeight: 700, color: e.outstanding ? 'var(--err)' : 'var(--t3)' }}>{e.outstanding ? fmtRp(e.outstanding) : '—'}</td>
                  <td>
                    {e.status === 'pending' ? (
                      <div className="row-actions">
                        <button className="btn btn-p btn-sm" onClick={() => setActive(e)}>Proses</button>
                        {e.residentId && e.stillActive && <button className="btn btn-g btn-sm" onClick={() => nav(`/penghuni/${e.residentId}`)}>Detail</button>}
                      </div>
                    ) : <span className={`badge ${e.status === 'approved' ? 'b-ok' : 'b-neu'}`}>{e.status === 'approved' ? 'Disetujui' : 'Ditolak'}</span>}
                    {e.adminNote && <div className="tm">{e.adminNote}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {active && <ProcessModal req={active} onClose={() => setActive(null)} onDone={reload} />}
    </>
  );
}

function ProcessModal({ req, onClose, onDone }) {
  const toast = useToast();
  const [exitDate, setExitDate] = useState(req.exitDate);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function approve() {
    setBusy(true);
    try {
      const r = await api.approveExit(req.id, { exitDate, adminNote: note });
      toast(`✅ ${req.name} keluar per ${fmtDate(r.keluar)}. Kamar ${req.room} kini kosong.${r.outstanding ? ` Sisa tagihan ${fmtRp(r.outstanding)}.` : ''}`);
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }
  async function reject() {
    setBusy(true);
    try { await api.rejectExit(req.id, note); toast('Pengajuan ditolak.'); onDone(); onClose(); } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }
  return (
    <Modal title={`Proses Pengajuan Keluar · ${req.name}`} onClose={onClose} width={480} footer={<>
      <button className="btn btn-g" onClick={() => openWhatsApp(req.wa, `Halo ${req.name}, terkait pengajuan keluar Anda dari kamar ${req.room}: `)}>WhatsApp</button>
      <button className="btn btn-d" onClick={reject} disabled={busy}>Tolak</button>
      <button className="btn btn-p" onClick={approve} disabled={busy}>Setujui & Checkout</button>
    </>}>
      {req.outstanding > 0 && <div className="fp-alert">Masih ada tunggakan {fmtRp(req.outstanding)} — invoice tetap tersimpan setelah keluar.</div>}
      <div className="g2">
        <div className="fg"><label className="fl">Tanggal keluar final</label><input type="date" className="fi" value={exitDate} onChange={(e) => setExitDate(e.target.value)} /></div>
        <div className="fg"><label className="fl">Deposit dikembalikan ke</label><div className="tm" style={{ paddingTop: 8 }}>{req.refundAccount ? `${req.refundBank} ${req.refundAccount} a.n. ${req.refundName}` : 'Tidak diisi'}</div></div>
      </div>
      <div className="fg"><label className="fl">Catatan admin</label><textarea className="fi" rows="2" placeholder="mis. Kunci dikembalikan, deposit ditransfer 12 Okt" value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <div className="field-hint">Saat disetujui: penghuni dipindah ke arsip mantan, kamar menjadi kosong, invoice setelah tanggal keluar dibatalkan, charge bulanan dihentikan, dan bila rate harian aktif periode terakhir dihitung pro-rata.</div>
    </Modal>
  );
}
