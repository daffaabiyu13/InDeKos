import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { avatarColor, initials, openWhatsApp, fmtDate, fmtRp, timeAgo, fmtStay } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import Modal from '../components/Modal.jsx';
import FaceCheck, { FaceBadge } from '../components/FaceCheck.jsx';
import StayInput from '../components/StayInput.jsx';
import FormLinks from '../components/FormLinks.jsx';

export default function Pendaftaran({ version, onChange }) {
  const [ver, setVer] = useState(0);
  const { data: apps, loading } = useFetch(() => api.applications('pending'), [version, ver]);
  const [active, setActive] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const reload = () => { setVer((v) => v + 1); onChange?.(); };

  async function reject(a) {
    if (!(await confirm({ title: 'Tolak Pendaftaran', icon: '🚫', message: `Tolak pendaftaran ${a.name}?`, confirmText: 'Ya, Tolak', danger: true }))) return;
    try { await api.rejectApplication(a.id, ''); toast(`Pendaftaran ${a.name} ditolak.`); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  if (loading || !apps) return <div className="loading">Memuat pendaftaran…</div>;

  return (
    <>
      <div className="fr">
        <span className="chip on">Menunggu Verifikasi ({apps.length})</span>
        <div style={{ marginLeft: 'auto' }}>
          <FormLinks path="/form" name="form pendaftaran" openLabel="Buka Form Pendaftaran" />
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="card"><div className="cb"><div className="empty">Tidak ada pendaftaran yang menunggu verifikasi.</div></div></div>
      ) : (
        <div className="g2">
          {apps.map((a) => (
            <div className="card" key={a.id}>
              <div className="cb">
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
                  <div className="av" style={{ width: 42, height: 42, fontSize: 15, background: avatarColor(a.name), color: '#fff' }}>{initials(a.name)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                    <div className="tm">{a.job}{a.uni ? ` · ${a.uni}` : ''} · daftar {timeAgo(a.createdAt)}</div>
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}><FaceBadge score={a.faceScore} match={a.faceMatch} /></div>
                <div style={{ fontSize: 12.5, display: 'grid', gap: 6, marginBottom: 14 }}>
                  <Row label="No. WA" value={a.wa} />
                  <Row label="Rencana masuk" value={fmtDate(a.masuk)} />
                  <Row label="Rencana tinggal" value={fmtStay(a.stayMonths)} />
                  <Row label="Kontak darurat" value={`${a.wali || '—'} (${a.waliStatus || '-'}) · ${a.emergency2Name || '—'} (${a.emergency2Rel || '-'})`} />
                  <Row label="Sumber info" value={a.sumber || '—'} />
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={() => setActive(a)}>Verifikasi & Tempatkan</button>
                  <button className="btn btn-g btn-sm" onClick={() => openWhatsApp(a.wa, `Halo ${a.name}, terima kasih sudah mendaftar di kos kami.`)}>WA</button>
                  <button className="btn btn-d btn-sm" onClick={() => reject(a)}>Tolak</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && <VerifyModal app={active} onClose={() => setActive(null)} onDone={reload} />}
    </>
  );
}

function VerifyModal({ app, onClose, onDone }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data: rooms } = useFetch(() => api.rooms(), []);
  const masukDay = app.masuk ? Number(app.masuk.slice(8, 10)) : 1;
  const [room, setRoom] = useState('');
  const [dueDay, setDueDay] = useState(masukDay);
  const [stayMonths, setStayMonths] = useState(app.stayMonths ?? null);
  const [busy, setBusy] = useState(false);
  const available = (rooms || []).filter((r) => r.status === 'av');
  const sel = available.find((r) => r.number === room);

  async function approve() {
    setBusy(true);
    try {
      const { resident } = await api.approveApplication(app.id, { room, dueDay: Number(dueDay), stayMonths });
      toast(`✅ ${app.name} ditempatkan di kamar ${room}. Invoice pertama dibuat.`);
      onDone();
      onClose();
      nav(`/penghuni/${resident.id}`);
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }

  return (
    <Modal title="Verifikasi Pendaftaran" onClose={onClose} width={680} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={approve} disabled={busy || !room}>{busy ? 'Memproses…' : 'Setujui & Tempatkan'}</button>
    </>}>
      <div className="g2">
        <div>
          <div className="fp-sec" style={{ marginTop: 0 }}>Data Calon Penghuni</div>
          <div className="detail-grid">
            <Detail label="Nama" value={app.name} full />
            <Detail label="NIK" value={app.nik} />
            <Detail label="No. WA" value={app.wa} />
            <Detail label="Tempat/Tgl Lahir" value={`${app.tempatLahir || '—'}, ${fmtDate(app.tglLahir)}`} full />
            <Detail label="Alamat Asal" value={app.alamat} full />
            <Detail label="Pekerjaan" value={app.job} />
            <Detail label="Universitas/Kantor" value={app.uni} />
            <Detail label="Kontak Darurat 1" value={`${app.wali || '—'} (${app.waliStatus || '-'}) · ${app.waWali || '—'}`} full />
            <Detail label="Kontak Darurat 2" value={`${app.emergency2Name || '—'} (${app.emergency2Rel || '-'}) · ${app.emergency2Wa || '—'}`} full />
            <Detail label="Rencana Masuk" value={fmtDate(app.masuk)} />
            <Detail label="Rencana Tinggal" value={fmtStay(app.stayMonths)} />
            <Detail label="Sumber Info" value={app.sumber} />
          </div>
        </div>
        <div>
          <div className="fp-sec" style={{ marginTop: 0 }}>Verifikasi Wajah KTP ↔ Selfie</div>
          <FaceCheck ktp={app.ktpPhoto} selfie={app.selfiePhoto} storedScore={app.faceScore} storedMatch={app.faceMatch} />
        </div>
      </div>

      <div className="fp-sec">Penempatan & Penagihan</div>
      <div className="g2">
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Kamar <span className="req">*</span></label>
          <select className="fi" value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Pilih kamar kosong ({available.length})…</option>
            {available.map((r) => <option key={r.number} value={r.number}>Kamar {r.number} · {r.typeName || '—'} · {fmtRp(r.typePrice)}</option>)}
          </select>
          {sel && <div className="field-hint">Fasilitas: {sel.facilities.join(', ')}</div>}
        </div>
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Jatuh tempo tiap bulan</label>
          <select className="fi" value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Tanggal {d}{app.masuk && d === masukDay ? ' (tgl masuk)' : ''}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <StayInput value={stayMonths} masuk={app.masuk} onChange={setStayMonths} hint="Diisi calon penghuni di formulir; boleh disesuaikan." />
      </div>
    </Modal>
  );
}

function Row({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: 'var(--t2)' }}>{label}</span><span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span></div>;
}

function Detail({ label, value, full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--t3)', fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t1)' }}>{value || '—'}</div>
    </div>
  );
}
