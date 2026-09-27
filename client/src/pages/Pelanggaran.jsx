import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { fmtDate, todayISO } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import Modal from '../components/Modal.jsx';

const SEV = { ringan: 'b-neu', sedang: 'b-warn', berat: 'b-err' };

export default function Pelanggaran({ version, onChange }) {
  const [ver, setVer] = useState(0);
  const reload = () => { setVer((v) => v + 1); onChange?.(); };
  const { data: violations, loading } = useFetch(() => api.violations(), [version, ver]);
  const { data: cats } = useFetch(() => api.violationCategories(), [version, ver]);
  const [catFilter, setCatFilter] = useState('all');
  const [spFilter, setSpFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  async function send(v) {
    try {
      const r = await api.sendViolation(v.id);
      if (r.via === 'link') { window.open(r.link, '_blank', 'noopener'); toast('Membuka WhatsApp untuk mengirim SP.'); } else toast(`✅ ${v.sp} terkirim ke ${v.name}.`);
      reload();
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function remove(v) {
    if (!(await confirm({ title: 'Hapus Catatan', message: `Hapus pelanggaran ${v.name} (${fmtDate(v.date)})?`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteViolation(v.id); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  if (loading || !violations) return <div className="loading">Memuat pelanggaran…</div>;
  const shown = violations.filter((v) => (catFilter === 'all' || String(v.categoryId) === catFilter) && (spFilter === 'all' || v.sp === spFilter));

  return (
    <>
      <div className="fr">
        <select className="fi" style={{ width: 'auto' }} value={catFilter} onChange={(e) => setCatFilter(e.target.value)} aria-label="Kategori">
          <option value="all">Semua kategori</option>
          {(cats || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {['all', 'SP1', 'SP2', 'SP3'].map((s) => <button key={s} className={`chip${spFilter === s ? ' on' : ''}`} onClick={() => setSpFilter(s)}>{s === 'all' ? 'Semua SP' : s}</button>)}
        <div style={{ marginLeft: 'auto' }}><button className="btn btn-p btn-sm" onClick={() => setOpen(true)}>+ Catat Pelanggaran</button></div>
      </div>

      <div className="g-viol">
        <div className="card">
          <div className="ch"><div><div className="ct">Riwayat Pelanggaran</div><div className="cs">Disimpan 1 tahun, lalu dihapus otomatis dari database</div></div></div>
          <div className="tw">
            <table>
              <thead><tr><th>Penghuni</th><th>Kategori</th><th>Keterangan</th><th>Tanggal</th><th>SP</th><th>Terkirim</th><th>Aksi</th></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><td colSpan="7" className="empty">Tidak ada catatan</td></tr>}
                {shown.map((v) => (
                  <tr key={v.id}>
                    <td><div className="tn">{v.name}</div><div className="tm">Kamar {v.room}</div></td>
                    <td><div className="tn" style={{ fontSize: 12.5 }}>{v.categoryName || '—'}</div>{v.severity && <span className={`badge ${SEV[v.severity]}`}>{v.severity}</span>}</td>
                    <td style={{ maxWidth: 200, fontSize: 12.5 }}>{v.description}</td>
                    <td className="tm">{fmtDate(v.date)}<div title="Tanggal penghapusan otomatis">🗑 {fmtDate(v.expiresOn)}</div></td>
                    <td><span className={`sp ${v.sp === 'SP1' ? 'sp1' : 'sp2'}`}>{v.sp}</span></td>
                    <td>{v.sent ? <span className="badge b-ok">Terkirim</span> : <span className="badge b-warn">Belum</span>}</td>
                    <td><div className="row-actions">
                      <button className={`btn btn-sm ${v.sent ? 'btn-g' : 'btn-p'}`} onClick={() => send(v)}>{v.sent ? 'Kirim ulang' : `Kirim ${v.sp}`}</button>
                      <button className="btn btn-g btn-sm" onClick={() => remove(v)} aria-label="Hapus">✕</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <CategoryPanel cats={cats || []} reload={reload} />
      </div>

      {open && <ViolationModal cats={cats || []} onClose={() => setOpen(false)} onDone={reload} />}
    </>
  );
}

function CategoryPanel({ cats, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [f, setF] = useState({ name: '', severity: 'ringan', defaultSp: 'SP1' });
  async function add() {
    if (!f.name.trim()) return;
    try { await api.addViolationCategory(f); toast(`✅ Kategori "${f.name}" ditambahkan.`); setF({ name: '', severity: 'ringan', defaultSp: 'SP1' }); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function remove(c) {
    if (!(await confirm({ title: 'Hapus Kategori', message: `Hapus kategori "${c.name}"?${c.used ? ` ${c.used} catatan akan menjadi tanpa kategori.` : ''}`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteViolationCategory(c.id); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <div className="card">
      <div className="ch"><div><div className="ct">Kategori Pelanggaran</div><div className="cs">Tambahkan sesuai aturan kos Anda</div></div></div>
      <div className="cb">
        {cats.map((c) => (
          <div key={c.id} className="cat-row">
            <div style={{ flex: 1 }}><div className="tn" style={{ fontSize: 13 }}>{c.name}</div><div className="tm">{c.used} catatan · default {c.defaultSp}</div></div>
            <span className={`badge ${SEV[c.severity]}`}>{c.severity}</span>
            <button className="btn btn-g btn-sm" onClick={() => remove(c)} aria-label={`Hapus ${c.name}`}>✕</button>
          </div>
        ))}
        <div className="fp-sec">Kategori baru</div>
        <div className="fg"><input className="fi" placeholder="mis. Parkir sembarangan" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && add()} /></div>
        <div className="g2">
          <div className="fg"><select className="fi" value={f.severity} onChange={(e) => setF((x) => ({ ...x, severity: e.target.value }))}><option value="ringan">Ringan</option><option value="sedang">Sedang</option><option value="berat">Berat</option></select></div>
          <div className="fg"><select className="fi" value={f.defaultSp} onChange={(e) => setF((x) => ({ ...x, defaultSp: e.target.value }))}><option>SP1</option><option>SP2</option><option>SP3</option></select></div>
        </div>
        <button className="btn btn-p btn-sm" onClick={add}>Tambah Kategori</button>
      </div>
    </div>
  );
}

function ViolationModal({ cats, onClose, onDone }) {
  const toast = useToast();
  const { data: residents } = useFetch(() => api.residents(), []);
  const [f, setF] = useState({ residentId: '', categoryId: cats[0]?.id || '', sp: cats[0]?.defaultSp || 'SP1', date: todayISO(), description: '' });
  const set = (k) => (e) => {
    const v = e.target.value;
    setF((x) => {
      const next = { ...x, [k]: v };
      if (k === 'categoryId') next.sp = cats.find((c) => String(c.id) === v)?.defaultSp || x.sp;
      return next;
    });
  };
  async function save() {
    if (!f.residentId || !f.categoryId) { toast('⚠️ Pilih penghuni & kategori.'); return; }
    try { await api.addViolation({ ...f, residentId: Number(f.residentId), categoryId: Number(f.categoryId) }); toast('✅ Pelanggaran dicatat.'); onDone(); onClose(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <Modal title="Catat Pelanggaran" onClose={onClose} width={460} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button><button className="btn btn-p" onClick={save}>Simpan</button>
    </>}>
      <div className="fg"><label className="fl">Penghuni <span className="req">*</span></label>
        <select className="fi" value={f.residentId} onChange={set('residentId')}>
          <option value="">Pilih penghuni…</option>
          {(residents || []).map((r) => <option key={r.id} value={r.id}>{r.name} — Kamar {r.room}</option>)}
        </select>
      </div>
      <div className="fg"><label className="fl">Kategori <span className="req">*</span></label>
        <select className="fi" value={f.categoryId} onChange={set('categoryId')}>{cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.severity})</option>)}</select>
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Tingkat SP</label><select className="fi" value={f.sp} onChange={set('sp')}><option>SP1</option><option>SP2</option><option>SP3</option></select></div>
        <div className="fg"><label className="fl">Tanggal</label><input type="date" className="fi" value={f.date} onChange={set('date')} /></div>
      </div>
      <div className="fg"><label className="fl">Keterangan</label><textarea className="fi" rows="2" value={f.description} onChange={set('description')} /></div>
    </Modal>
  );
}
