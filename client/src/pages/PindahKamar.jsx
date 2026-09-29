import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { fmtRp, fmtDate, timeAgo, avatarColor, initials, openWhatsApp } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import TransferModal from '../components/TransferModal.jsx';
import FormLinks from '../components/FormLinks.jsx';

const TABS = [
  ['pending', 'Menunggu'],
  ['approved', 'Dijadwalkan'],
  ['history', 'Riwayat'],
];
const STATUS = {
  pending: ['Menunggu', 'b-warn'], approved: ['Dijadwalkan', 'b-pebble'], done: ['Selesai', 'b-ok'],
  rejected: ['Ditolak', 'b-err'], cancelled: ['Dibatalkan', 'b-neu'],
};

export default function PindahKamar({ version, onChange }) {
  const [tab, setTab] = useState('pending');
  const [ver, setVer] = useState(0);
  const { data, loading } = useFetch(() => api.transfers(tab === 'history' ? '' : tab), [tab, ver, version]);
  const [active, setActive] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const reload = () => { setVer((v) => v + 1); onChange?.(); };
  const list = (data || []).filter((t) => (tab === 'history' ? ['done', 'rejected', 'cancelled'].includes(t.status) : true));

  async function reject(t) {
    const cancel = t.status === 'approved';
    if (!(await confirm({ title: cancel ? 'Batalkan Pindah Kamar' : 'Tolak Pengajuan', message: `${cancel ? 'Batalkan' : 'Tolak'} pindah kamar ${t.name} (${t.fromRoom} → ${t.toRoom || t.toTypeName})? Penghuni akan diberi tahu bila WhatsApp aktif.`, confirmText: cancel ? 'Batalkan' : 'Tolak', danger: true }))) return;
    try { await api.rejectTransfer(t.id, cancel ? 'Dibatalkan pengelola' : 'Kamar belum tersedia'); toast(cancel ? 'Pindah kamar dibatalkan, kamar tujuan dilepas.' : 'Pengajuan ditolak.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <>
      <div className="page-intro">
        <div className="field-hint">
          Penghuni mengajukan lewat form Pindah Kamar. Setelah disetujui, kamar tujuan dipesan dan pada tanggal pindah semuanya diperbarui otomatis: kamar, harga sewa, invoice, dan selisih pro-rata.
        </div>
        <FormLinks path="/pindah" name="form pindah kamar" openLabel="Buka Form Pindah" />
      </div>
      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {loading && <div className="loading">Memuat…</div>}
      {!loading && list.length === 0 && (
        <div className="card"><div className="cb empty-state">
          <div style={{ fontSize: 30 }}>🔁</div>
          <strong>{tab === 'pending' ? 'Tidak ada pengajuan pindah kamar.' : tab === 'approved' ? 'Tidak ada pindah kamar terjadwal.' : 'Belum ada riwayat.'}</strong>
        </div></div>
      )}
      <div className="g2">
        {list.map((t) => {
          const diff = t.toPrice != null && !t.customRent ? t.toPrice - t.fromPrice : 0;
          const [label, cls] = STATUS[t.status] || STATUS.pending;
          return (
            <div className="card" key={t.id}>
              <div className="cb">
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                  <div className="av" style={{ width: 42, height: 42, fontSize: 15, background: avatarColor(t.name), color: '#fff' }}>{initials(t.name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{t.name}</div>
                    <div className="tm">{t.source === 'admin' ? 'Dipindahkan pengelola' : 'Diajukan penghuni'} · {timeAgo(t.createdAt)}</div>
                  </div>
                  <span className={`badge ${cls}`}>{label}</span>
                </div>
                <div className="tf-head small">
                  <div><span className="tm">{t.fromTypeName}</span><strong>Kamar {t.fromRoom}</strong><span className="tm">{fmtRp(t.fromPrice)}/bln</span></div>
                  <span className="tf-arrow">→</span>
                  <div><span className="tm">{t.toTypeNameNow}</span><strong>{t.toRoom ? `Kamar ${t.toRoom}` : 'Pilih kamar'}</strong><span className="tm">{t.toPrice != null ? `${fmtRp(t.toPrice)}/bln` : '—'}{diff ? <span className={`tf-diff ${diff > 0 ? 'up' : 'down'}`}>{diff > 0 ? '+' : '−'}{fmtRp(Math.abs(diff))}</span> : null}</span></div>
                </div>
                <div style={{ fontSize: 12.5, display: 'grid', gap: 5, margin: '10px 0 14px' }}>
                  <div><span className="tm">Tanggal pindah:</span> <strong>{fmtDate(t.moveDate)}</strong></div>
                  {t.reason && <div><span className="tm">Alasan:</span> {t.reason}</div>}
                  {t.customRent ? <div className="tm">Penghuni memakai harga khusus {fmtRp(t.customRent)}.</div> : null}
                  {t.status === 'done' && t.result?.prorata && <div className="tm">Selisih periode berjalan: {t.result.prorata.diff > 0 ? `ditagih ${fmtRp(t.result.prorata.diff)}` : `${fmtRp(-t.result.prorata.diff)} ${t.result.prorata.action === 'kurangi' ? 'dikurangkan' : 'kelebihan bayar'}`}</div>}
                  {t.adminNote && <div className="tm">Catatan: {t.adminNote}</div>}
                  {!t.stillActive && t.status !== 'done' && <div style={{ color: 'var(--err)' }}>Penghuni sudah tidak aktif.</div>}
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {t.status === 'pending' && t.stillActive && <button className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={() => setActive(t)}>Proses</button>}
                  {['pending', 'approved'].includes(t.status) && <button className="btn btn-d btn-sm" onClick={() => reject(t)}>{t.status === 'approved' ? 'Batalkan' : 'Tolak'}</button>}
                  {t.wa && <button className="btn btn-g btn-sm" onClick={() => openWhatsApp(t.wa, `Halo ${t.name}, terkait pengajuan pindah kamar Anda…`)}>WA</button>}
                  {t.stillActive && <button className="btn btn-g btn-sm" onClick={() => nav(`/penghuni/${t.residentId}`)}>Detail</button>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {active && <TransferModal transfer={active} onClose={() => setActive(null)} onDone={reload} />}
    </>
  );
}
