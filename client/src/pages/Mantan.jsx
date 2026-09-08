import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { stars } from '../helpers.js';
import { Icons } from '../components/icons.jsx';

export default function Mantan({ version }) {
  const { data: mantan, loading } = useFetch(() => api.mantan(), [version]);
  const [q, setQ] = useState('');

  if (loading || !mantan) return <div className="loading">Memuat arsip mantan penghuni…</div>;

  const shown = mantan.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || m.room.includes(q));
  const goodExit = mantan.filter((m) => m.star >= 4).length;

  return (
    <>
      <div className="sg3 mb">
        <div className="tile"><div className="tile-lbl">Total Mantan Penghuni</div><div className="tile-val">{mantan.length}</div></div>
        <div className="tile"><div className="tile-lbl">Keluar Baik-Baik</div><div className="tile-val ok">{goodExit}</div><div className="tile-ch">{Math.round((goodExit / mantan.length) * 100)}% dari total</div></div>
        <div className="tile"><div className="tile-lbl">Avg. Lama Tinggal</div><div className="tile-val">8,4 bl</div></div>
      </div>

      <div className="fr">
        <div className="srch">
          <Icons.search />
          <input placeholder="Cari nama atau kamar..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Nama</th><th>Kamar</th><th>Tanggal Masuk</th><th>Tanggal Keluar</th><th>Lama</th><th>Alasan</th><th>Rating</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--t3)', padding: 28 }}>Tidak ada data</td></tr>}
              {shown.map((m, i) => (
                <tr key={i}>
                  <td className="tn">{m.name}</td>
                  <td><span className="badge b-neu">{m.room}</span></td>
                  <td className="tm">{m.masuk}</td>
                  <td className="tm">{m.keluar}</td>
                  <td><span className="badge b-cor">{m.lama}</span></td>
                  <td className="tm">{m.alasan}</td>
                  <td style={{ color: 'var(--warn)' }}>{stars(m.star)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
