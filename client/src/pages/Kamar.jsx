import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { avatarColor, initials, openWhatsApp } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';

export default function Kamar({ version }) {
  const { data: rooms, loading } = useFetch(() => api.rooms(), [version]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const toast = useToast();

  const counts = useMemo(() => {
    const r = rooms || [];
    return {
      all: r.length,
      av: r.filter((x) => x.status === 'av').length,
      oc: r.filter((x) => x.status === 'oc').length,
    };
  }, [rooms]);

  if (loading || !rooms) return <div className="loading">Memuat denah kamar…</div>;

  const shown = rooms.filter((r) => filter === 'all' || r.status === filter);
  const room = selected != null ? rooms.find((r) => r.n === selected) : null;

  return (
    <>
      <div className="fr">
        <div className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>Semua ({counts.all})</div>
        <div className={`chip${filter === 'av' ? ' on' : ''}`} onClick={() => setFilter('av')}>Tersedia ({counts.av})</div>
        <div className={`chip${filter === 'oc' ? ' on' : ''}`} onClick={() => setFilter('oc')}>Terisi ({counts.oc})</div>
        <div style={{ marginLeft: 'auto' }}><button className="btn btn-g btn-sm" onClick={() => toast('🛠️ Pengaturan fasilitas kamar dapat diatur di menu Pengaturan.')}>Atur Fasilitas</button></div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="ch"><div className="ct">Denah Kamar</div></div>
          <div className="cb">
            <div className="rg">
              {shown.map((r) => (
                <div key={r.n} className={`rc ${r.status === 'av' ? 'avail' : 'oc'}`} onClick={() => setSelected(r.n)}>
                  <div className="rc-n">{r.n}</div>
                  <div>{r.status === 'av' ? 'Kosong' : 'Terisi'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 14, marginTop: 14, flexWrap: 'wrap' }}>
              <div className="dli"><div className="dot" style={{ background: 'var(--ok)' }} /><span style={{ fontSize: 12 }}>Tersedia</span></div>
              <div className="dli"><div className="dot" style={{ background: 'var(--jade)' }} /><span style={{ fontSize: 12 }}>Terisi</span></div>
              <div className="dli"><div className="dot" style={{ background: 'var(--warn)' }} /><span style={{ fontSize: 12 }}>Perbaikan</span></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Detail Kamar</div></div>
          <div className="cb">
            {!room && <div style={{ color: 'var(--t2)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Klik kamar di denah untuk melihat detail</div>}
            {room && room.status === 'av' && (
              <>
                <div style={{ marginBottom: 14 }}><span className="badge b-ok" style={{ fontSize: 12, padding: '5px 11px' }}>Kamar {room.n} — Tersedia</span></div>
                <div style={{ color: 'var(--t2)', fontSize: 13, marginBottom: 14 }}>Kamar ini kosong dan siap disewakan.</div>
                <div style={{ fontSize: 13, display: 'grid', gap: 9 }}>
                  <Row label="Harga Sewa" value="Rp 1.300.000/bln" bold />
                  <Row label="Fasilitas" value="AC, Lemari, Kasur" />
                  <Row label="Lantai" value={room.n < 111 ? '1' : '2'} />
                </div>
                <button
                  className="btn btn-p"
                  style={{ marginTop: 16, width: '100%' }}
                  onClick={() => {
                    openWhatsApp('', `Tersedia kamar kos! Kamar ${room.n} — Rp 1.300.000/bln, fasilitas AC, lemari, kasur. Hubungi kami untuk info lebih lanjut.`);
                    toast('📣 Membuka WhatsApp untuk membagikan info kamar…');
                  }}
                >
                  Pasarkan Kamar Ini
                </button>
              </>
            )}
            {room && room.status === 'oc' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
                  <div className="av" style={{ width: 42, height: 42, fontSize: 15, background: avatarColor(room.res?.name || ''), color: '#fff' }}>{room.res ? initials(room.res.name) : '?'}</div>
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>{room.res?.name || 'Penghuni'}</div><span className="badge b-cor">Kamar {room.n}</span></div>
                </div>
                <div style={{ fontSize: 13, display: 'grid', gap: 9 }}>
                  <Row label="Tgl Masuk" value={room.res?.masuk || '—'} bold />
                  <Row label="Profesi" value={room.res?.job || '—'} />
                  <Row label="Universitas" value={room.res?.uni || '—'} />
                  <Row label="No. WA" value={room.res?.wa || '—'} />
                  <Row label="Status Bayar" value={room.res?.status === 'lunas' ? <span className="badge b-ok">Lunas</span> : <span className="badge b-err">Menunggak</span>} />
                  <Row label="Sewa" value="Rp 1.300.000/bln" bold />
                </div>
                <div style={{ display: 'flex', gap: 7, marginTop: 14 }}>
                  <button className="btn btn-g btn-sm" style={{ flex: 1 }} onClick={() => toast(`ℹ️ ${room.res?.name} · Kamar ${room.n} · ${room.res?.job || '—'} · Masuk ${room.res?.masuk || '—'}`)}>Detail Lengkap</button>
                  <button className="btn btn-p btn-sm" style={{ flex: 1 }} onClick={() => openWhatsApp(room.res?.wa, `Halo ${room.res?.name}, ini pesan dari pengelola kos.`)}>Hubungi WA</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ color: 'var(--t2)' }}>{label}</span>
      <span style={bold ? { fontWeight: 700 } : undefined}>{value}</span>
    </div>
  );
}
