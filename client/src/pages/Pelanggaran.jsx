import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Pelanggaran({ version, onChange }) {
  const [localVer, setLocalVer] = useState(0);
  const [filter, setFilter] = useState('all');
  const { data: violations, loading } = useFetch(() => api.violations(), [version, localVer]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', room: '', desc: '', sp: 'SP1', date: '' });
  const toast = useToast();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name || !form.desc) {
      toast('⚠️ Nama dan deskripsi wajib diisi.');
      return;
    }
    try {
      await api.addViolation({
        name: form.name,
        room: form.room,
        desc: form.desc,
        sp: form.sp,
        date: form.date ? form.date.split('-').reverse().join('/') : '',
      });
      toast('✅ Pelanggaran berhasil dicatat.');
      setForm({ name: '', room: '', desc: '', sp: 'SP1', date: '' });
      setOpen(false);
      setLocalVer((v) => v + 1);
      onChange?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  if (loading || !violations) return <div className="loading">Memuat pelanggaran…</div>;

  const shown = violations.filter((v) => filter === 'all' || v.sp === filter);

  return (
    <>
      <div className="fr">
        <div className={`chip${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>Semua</div>
        <div className={`chip${filter === 'SP1' ? ' on' : ''}`} onClick={() => setFilter('SP1')}>SP1</div>
        <div className={`chip${filter === 'SP2' ? ' on' : ''}`} onClick={() => setFilter('SP2')}>SP2</div>
        <div style={{ marginLeft: 'auto' }}><button className="btn btn-p btn-sm" onClick={() => setOpen(true)}>+ Catat Pelanggaran</button></div>
      </div>

      <div className="card">
        <div className="ch"><div className="ct">Riwayat Pelanggaran</div></div>
        <div className="tw">
          <table>
            <thead><tr><th>Penghuni</th><th>Kamar</th><th>Pelanggaran</th><th>Tanggal</th><th>SP</th><th>Email Terkirim</th><th>Aksi</th></tr></thead>
            <tbody>
              {shown.map((v, i) => (
                <tr key={i}>
                  <td className="tn">{v.name}</td>
                  <td><span className="badge b-neu">{v.room}</span></td>
                  <td style={{ maxWidth: 180, fontSize: 12.5 }}>{v.desc}</td>
                  <td className="tm">{v.date}</td>
                  <td><span className={`sp ${v.sp === 'SP1' ? 'sp1' : 'sp2'}`}>{v.sp}</span></td>
                  <td>{v.sent ? <span className="badge b-ok">Terkirim</span> : <span className="badge b-warn">Belum</span>}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {!v.sent && <button className="btn btn-p btn-sm">Kirim Email {v.sp}</button>}
                      <button className="btn btn-g btn-sm">Detail</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="mo open" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" style={{ width: 440 }}>
            <div className="mh">
              <div className="mt">Catat Pelanggaran</div>
              <button className="mc" onClick={() => setOpen(false)}><Icons.close /></button>
            </div>
            <div className="mb2">
              <div className="g2">
                <div className="fg"><label className="fl">Nama Penghuni <span className="req">*</span></label><input className="fi" value={form.name} onChange={set('name')} /></div>
                <div className="fg"><label className="fl">Kamar</label><input className="fi" placeholder="mis: 103" value={form.room} onChange={set('room')} /></div>
              </div>
              <div className="fg"><label className="fl">Jenis Pelanggaran <span className="req">*</span></label><input className="fi" value={form.desc} onChange={set('desc')} /></div>
              <div className="g2">
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label className="fl">Tingkat Sanksi</label>
                  <select className="fi" value={form.sp} onChange={set('sp')}><option>SP1</option><option>SP2</option></select>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}><label className="fl">Tanggal</label><input type="date" className="fi" value={form.date} onChange={set('date')} /></div>
              </div>
            </div>
            <div className="mf">
              <button className="btn btn-g" onClick={() => setOpen(false)}>Batal</button>
              <button className="btn btn-p" onClick={submit}>Simpan</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
