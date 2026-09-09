import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { avatarColor, initials, openWhatsApp } from '../helpers.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';

export default function Pendaftaran({ version, onChange }) {
  const [localVer, setLocalVer] = useState(0);
  const deps = [version, localVer];
  const { data: apps, loading } = useFetch(() => api.applications('pending'), deps);
  const { data: rooms } = useFetch(() => api.rooms(), deps);
  const [active, setActive] = useState(null); // application being verified
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  const available = (rooms || []).filter((r) => r.status === 'av').map((r) => r.n);

  function openVerify(a) {
    setActive(a);
    setRoom('');
  }

  async function approve() {
    if (!room) { toast('⚠️ Pilih nomor kamar terlebih dahulu.'); return; }
    setBusy(true);
    try {
      await api.approveApplication(active.id, room);
      toast(`✅ ${active.name} disetujui & ditempatkan di kamar ${room}.`);
      setActive(null);
      setLocalVer((v) => v + 1);
      onChange?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function reject(a) {
    const ok = await confirm({
      title: 'Tolak Pendaftaran',
      icon: '🚫',
      message: `Tolak pendaftaran ${a.name}? Data tidak akan ditempatkan ke kamar.`,
      confirmText: 'Ya, Tolak',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.rejectApplication(a.id, '');
      toast(`Pendaftaran ${a.name} ditolak.`);
      setLocalVer((v) => v + 1);
      onChange?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  if (loading || !apps) return <div className="loading">Memuat pendaftaran…</div>;

  const formUrl = `${window.location.origin}/form`;

  return (
    <>
      <div className="fr">
        <div className="chip on">Menunggu Verifikasi ({apps.length})</div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button className="btn btn-g btn-sm" onClick={() => { navigator.clipboard?.writeText(formUrl); toast('🔗 Link form pendaftaran disalin.'); }}>Salin Link Form</button>
          <button className="btn btn-p btn-sm" onClick={() => window.open('/form', '_blank')}>Buka Form Pendaftaran</button>
        </div>
      </div>

      {apps.length === 0 ? (
        <div className="card"><div className="cb"><div style={{ textAlign: 'center', color: 'var(--t3)', padding: 32 }}>Tidak ada pendaftaran yang menunggu verifikasi.</div></div></div>
      ) : (
        <div className="g2">
          {apps.map((a) => (
            <div className="card" key={a.id}>
              <div className="cb">
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                  <div className="av" style={{ width: 42, height: 42, fontSize: 15, background: avatarColor(a.name), color: '#fff' }}>{initials(a.name)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--t2)' }}>{a.job}{a.uni ? ` · ${a.uni}` : ''}</div>
                  </div>
                  <span className="badge b-warn">Menunggu</span>
                </div>
                <div style={{ fontSize: 12.5, display: 'grid', gap: 7, marginBottom: 14 }}>
                  <Row label="No. WA" value={a.wa} />
                  <Row label="Tempat, Tgl Lahir" value={`${a.tempatLahir || '—'}, ${a.tglLahir || '—'}`} />
                  <Row label="Rencana Masuk" value={a.masuk || '—'} />
                  <Row label="Sumber Info" value={a.sumber || '—'} />
                  <Row label="Tgl Daftar" value={a.createdAt} />
                </div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={() => openVerify(a)}>Verifikasi & Tempatkan</button>
                  <button className="btn btn-g btn-sm" onClick={() => openWhatsApp(a.wa, `Halo ${a.name}, terima kasih sudah mendaftar di kos kami.`)}>WA</button>
                  <button className="btn btn-d btn-sm" onClick={() => reject(a)}>Tolak</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {active && (
        <div className="mo open" onClick={(e) => e.target === e.currentTarget && setActive(null)}>
          <div className="modal">
            <div className="mh">
              <div className="mt">Verifikasi Pendaftaran</div>
              <button className="mc" onClick={() => setActive(null)}><Icons.close /></button>
            </div>
            <div className="mb2">
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
                <div className="av" style={{ width: 40, height: 40, fontSize: 14, background: avatarColor(active.name), color: '#fff' }}>{initials(active.name)}</div>
                <div><div style={{ fontWeight: 700 }}>{active.name}</div><div style={{ fontSize: 12, color: 'var(--t2)' }}>{active.wa}</div></div>
              </div>

              <div className="detail-grid">
                <Detail label="NIK" value={active.nik} />
                <Detail label="Tempat/Tgl Lahir" value={`${active.tempatLahir || '—'}, ${active.tglLahir || '—'}`} />
                <Detail label="Alamat Asal" value={active.alamat} full />
                <Detail label="Pekerjaan" value={active.job} />
                <Detail label="Universitas" value={active.uni || '—'} />
                <Detail label="Wali" value={`${active.wali || '—'} (${active.waliStatus || '—'})`} />
                <Detail label="No. WA Wali" value={active.waWali || '—'} />
                <Detail label="Rencana Masuk" value={active.masuk || '—'} />
                <Detail label="Sumber Info" value={active.sumber || '—'} />
              </div>

              <div className="fg" style={{ marginTop: 16, marginBottom: 0 }}>
                <label className="fl">Tempatkan di Kamar <span className="req">*</span></label>
                <select className="fi" value={room} onChange={(e) => setRoom(e.target.value)}>
                  <option value="">Pilih kamar tersedia ({available.length})...</option>
                  {available.map((n) => <option key={n} value={n}>Kamar {n}</option>)}
                </select>
                {available.length === 0 && <p style={{ fontSize: 12, color: 'var(--err)', marginTop: 6 }}>Tidak ada kamar tersedia saat ini.</p>}
              </div>
            </div>
            <div className="mf">
              <button className="btn btn-g" onClick={() => setActive(null)}>Batal</button>
              <button className="btn btn-p" onClick={approve} disabled={busy || !room}>
                {busy ? 'Memproses...' : 'Setujui & Tempatkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ color: 'var(--t2)' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function Detail({ label, value, full }) {
  return (
    <div style={full ? { gridColumn: '1 / -1' } : undefined}>
      <div style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--t3)', fontWeight: 700, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--t1)' }}>{value || '—'}</div>
    </div>
  );
}
