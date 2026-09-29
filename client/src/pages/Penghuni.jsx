import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { avatarColor, initials, openWhatsApp, fmtDate, fmtRp, PAY_STATUS } from '../helpers.js';
import { Icons } from '../components/icons.jsx';
import { StayPill } from '../components/StayInput.jsx';
import Modal from '../components/Modal.jsx';
import FormLinks from '../components/FormLinks.jsx';

const FORMS = [
  { path: '/bayar', name: 'halaman bayar', title: 'Bayar Sewa', desc: 'Cek & bayar semua tagihan (QRIS / transfer).', open: 'Buka' },
  { path: '/pindah', name: 'form pindah kamar', title: 'Pindah Kamar', desc: 'Ajukan pindah ke kamar lain yang kosong.', open: 'Buka' },
  { path: '/keluar', name: 'form keluar', title: 'Ajukan Keluar', desc: 'Tanggal keluar, alasan, dan rekening deposit.', open: 'Buka' },
];

const chips = [
  { f: 'all', label: 'Semua' },
  { f: 'lunas', label: 'Lunas' },
  { f: 'tunggak', label: 'Menunggak' },
  { f: 'mhs', label: 'Mahasiswa' },
];

export default function Penghuni({ version }) {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [list, setList] = useState(null);
  const [links, setLinks] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => api.residents(q, filter).then(setList).catch(() => setList([])), 150);
    return () => clearTimeout(t);
  }, [q, filter, version]);

  return (
    <>
      <div className="fr">
        <div className="srch">
          <Icons.search />
          <input placeholder="Cari nama atau kamar..." value={q} onChange={(e) => setQ(e.target.value)} aria-label="Cari penghuni" />
        </div>
        {chips.map((c) => (
          <button key={c.f} className={`chip${filter === c.f ? ' on' : ''}`} onClick={() => setFilter(c.f)}>{c.label}</button>
        ))}
        <button className="btn btn-g btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setLinks(true)}><Icons.link /> Link Form Penghuni</button>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Penghuni</th><th>Kamar</th><th>Masuk</th><th>Jatuh Tempo</th><th>Status Bayar</th><th>Tunggakan</th><th /></tr></thead>
            <tbody>
              {list === null && <tr><td colSpan="7" className="empty">Memuat…</td></tr>}
              {list?.length === 0 && <tr><td colSpan="7" className="empty">Tidak ada data</td></tr>}
              {list?.map((r) => {
                const st = PAY_STATUS[r.payStatus] || PAY_STATUS.lunas;
                return (
                  <tr key={r.id} className="row-link" onClick={() => nav(`/penghuni/${r.id}`)}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div className="av" style={{ background: avatarColor(r.name), color: '#fff' }}>{initials(r.name)}</div>
                        <div><div className="tn">{r.name}</div><div className="tm">{r.job}{r.uni ? ` · ${r.uni}` : ''}</div></div>
                      </div>
                    </td>
                    <td><span className="badge b-neu">{r.room}</span><div className="tm">{r.roomType}</div></td>
                    <td className="tm">{fmtDate(r.masuk)}{r.stayMonths ? <div><StayPill r={r} short /></div> : null}</td>
                    <td className="tm">Tgl {r.dueDay}<div>{r.nextDue ? `berikutnya ${fmtDate(r.nextDue)}` : ''}</div></td>
                    <td>
                      <span className={`badge ${st.cls}`}>{st.label}</span>
                      {r.payStatus === 'ditangguhkan' && <div className="tm">s/d {fmtDate(r.deferUntil)}</div>}
                    </td>
                    <td style={{ fontWeight: 700, color: r.outstanding ? 'var(--err)' : 'var(--t3)' }}>{r.outstanding ? fmtRp(r.outstanding) : '—'}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-g btn-sm" onClick={() => nav(`/penghuni/${r.id}`)}>Detail</button>
                        <button className="btn btn-g btn-sm" onClick={() => openWhatsApp(r.wa, `Halo ${r.name}, ini pesan dari pengelola kos.`)}>WA</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {links && (
        <Modal title="Link Form untuk Penghuni" onClose={() => setLinks(false)} width={580}>
          <div className="field-hint" style={{ marginBottom: 12 }}>Salin link lalu kirim ke penghuni (mis. via WhatsApp), atau buka di tab baru untuk melihat tampilannya.</div>
          <div className="link-list">
            {FORMS.map((f) => (
              <div key={f.path} className="link-row">
                <div><strong>{f.title}</strong><div className="tm">{f.desc}</div></div>
                <FormLinks path={f.path} name={f.name} openLabel={f.open} />
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
