import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { avatarColor, initials } from '../helpers.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

const chips = [
  { f: 'all', label: 'Semua' },
  { f: 'lunas', label: 'Lunas' },
  { f: 'tunggak', label: 'Menunggak' },
  { f: 'mhs', label: 'Mahasiswa' },
];

export default function Penghuni({ version, onChange, openModal }) {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState([]);
  const [count, setCount] = useState(0);
  const toast = useToast();

  useEffect(() => {
    api.residents(q, filter).then(setList).catch(() => setList([]));
  }, [q, filter, version]);

  useEffect(() => {
    api.residents('', 'all').then((all) => setCount(all.length)).catch(() => {});
  }, [version]);

  async function checkout(r) {
    if (!window.confirm(`Proses keluar untuk ${r.name}? Data akan dipindah ke arsip mantan penghuni.`)) return;
    try {
      await api.checkoutResident(r.id, { alasan: 'Keluar' });
      toast(`✅ ${r.name} dipindahkan ke arsip mantan penghuni.`);
      onChange?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  return (
    <>
      <div className="fr">
        <div className="srch">
          <Icons.search />
          <input placeholder="Cari nama atau kamar..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {chips.map((c) => (
          <div key={c.f} className={`chip${filter === c.f ? ' on' : ''}`} onClick={() => setFilter(c.f)}>
            {c.label}{c.f === 'all' ? ` (${count})` : ''}
          </div>
        ))}
        <div style={{ marginLeft: 'auto' }}>
          <button className="btn btn-p btn-sm" onClick={openModal}>+ Tambah</button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Penghuni</th><th>Kamar</th><th>Masuk</th><th>Status Bayar</th><th>Profesi</th><th>No. WA</th><th /></tr></thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan="7" style={{ textAlign: 'center', color: 'var(--t3)', padding: 28 }}>Tidak ada data</td></tr>
              )}
              {list.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <div className="av" style={{ background: avatarColor(r.name), color: '#fff' }}>{initials(r.name)}</div>
                      <div><div className="tn">{r.name}</div>{r.uni && <div className="tm">{r.uni}</div>}</div>
                    </div>
                  </td>
                  <td><span className="badge b-neu">{r.room}</span></td>
                  <td className="tm">{r.masuk}</td>
                  <td>{r.status === 'lunas' ? <span className="badge b-ok">Lunas</span> : <span className="badge b-err">Menunggak</span>}</td>
                  <td className="tm">{r.job}</td>
                  <td className="tm">{r.wa}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-g btn-sm" onClick={() => checkout(r)}>Keluar</button>
                      <button className="btn btn-g btn-sm">WA</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
