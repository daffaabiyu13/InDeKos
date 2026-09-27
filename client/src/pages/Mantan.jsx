import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { stars, fmtDate, monthsBetween } from '../helpers.js';
import { Icons } from '../components/icons.jsx';

export default function Mantan({ version }) {
  const { data: mantan, loading } = useFetch(() => api.mantan(), [version]);
  const [q, setQ] = useState('');

  if (loading || !mantan) return <div className="loading">Memuat arsip mantan penghuni…</div>;

  const shown = mantan.filter((m) => m.name.toLowerCase().includes(q.toLowerCase()) || m.room.includes(q));
  const good = mantan.filter((m) => m.star >= 4).length;
  const avg = mantan.length ? (mantan.reduce((a, m) => a + monthsBetween(m.masuk, m.keluar), 0) / mantan.length).toFixed(1).replace('.', ',') : '0';

  return (
    <>
      <div className="sg3 mb">
        <div className="tile"><div className="tile-lbl">Total Mantan Penghuni</div><div className="tile-val">{mantan.length}</div></div>
        <div className="tile"><div className="tile-lbl">Keluar Baik-Baik (★4+)</div><div className="tile-val ok">{good}</div><div className="tile-ch">{mantan.length ? Math.round((good / mantan.length) * 100) : 0}% dari total</div></div>
        <div className="tile"><div className="tile-lbl">Rata-rata Lama Tinggal</div><div className="tile-val">{avg} bln</div></div>
      </div>

      <div className="fr">
        <div className="srch"><Icons.search /><input placeholder="Cari nama atau kamar..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Nama</th><th>Kamar</th><th>Masuk</th><th>Keluar</th><th>Lama</th><th>Alasan</th><th>Rating</th></tr></thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan="7" className="empty">Tidak ada data</td></tr>}
              {shown.map((m) => (
                <tr key={m.id}>
                  <td className="tn">{m.name}{m.feedback && <div className="tm" style={{ fontWeight: 400 }}>“{m.feedback}”</div>}</td>
                  <td><span className="badge b-neu">{m.room}</span></td>
                  <td className="tm">{fmtDate(m.masuk)}</td>
                  <td className="tm">{fmtDate(m.keluar)}</td>
                  <td><span className="badge b-cor">{monthsBetween(m.masuk, m.keluar)} bln</span></td>
                  <td className="tm">{m.alasan}</td>
                  <td style={{ color: 'var(--warn)' }}>{stars(m.star || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
