// Perbaikan kamar: catat masalah, status pengerjaan, biaya, tukang/vendor,
// foto sebelum & sesudah. Bisa menandai kamar "Perbaikan" selama dikerjakan
// dan mencatat biaya ke Pengeluaran (kategori Perawatan).
import { useState } from 'react';
import { api, fileUrl } from '../api.js';
import { useFetch } from '../useFetch.js';
import { fmtDate, fmtRp, todayISO } from '../helpers.js';
import { useToast } from './Toast.jsx';
import { useConfirm } from './Confirm.jsx';
import { useAuth } from './Auth.jsx';
import Modal from './Modal.jsx';
import { MultiPhotoInput, PhotoGallery } from './MultiPhoto.jsx';

export const REPAIR_STATUS = {
  dilaporkan: { label: 'Dilaporkan', cls: 'b-err' },
  dikerjakan: { label: 'Dikerjakan', cls: 'b-warn' },
  selesai: { label: 'Selesai', cls: 'b-ok' },
};
const CATEGORIES = ['Listrik', 'Air & Pipa', 'AC / Kipas', 'Furnitur', 'Bangunan & Cat', 'Pintu & Kunci', 'Kebersihan & Hama', 'Lainnya'];
const PHOTO_MAX = 6;
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const fmtNum = (v) => (digits(v) ? Number(digits(v)).toLocaleString('id-ID') : '');

// Satu baris log (dipakai di detail kamar & daftar semua perbaikan).
export function RepairItem({ x, showRoom, onOpen }) {
  const st = REPAIR_STATUS[x.status] || REPAIR_STATUS.dilaporkan;
  const nPhotos = x.photosBefore.length + x.photosAfter.length;
  return (
    <button type="button" className="rp-item" onClick={() => onOpen(x)}>
      <div className="rp-top">
        <span className="rp-title">{showRoom && <span className="rp-room">Kamar {x.room}</span>}{x.title}</span>
        <span className={`badge ${st.cls}`}>{st.label}</span>
      </div>
      <div className="rp-meta">
        <span>{fmtDate(x.date)}{x.status === 'selesai' && x.doneDate && x.doneDate !== x.date ? ` → ${fmtDate(x.doneDate)}` : ''}</span>
        <span>{x.category}</span>
        {x.cost > 0 && <span className="rp-cost">{fmtRp(x.cost)}</span>}
        {x.vendor && <span>🔧 {x.vendor}</span>}
        {nPhotos > 0 && <span>📷 {nPhotos}</span>}
        {x.blockRoom && x.status !== 'selesai' && <span className="rp-block">Kamar tidak dihuni</span>}
      </div>
    </button>
  );
}

// Bagian di detail kamar.
export function RoomRepairs({ room, reload }) {
  const [ver, setVer] = useState(0);
  const { data } = useFetch(() => api.repairs(room.number), [room, ver]);
  const [modal, setModal] = useState(null); // null | {} | repair
  const [all, setAll] = useState(false);
  const list = data || [];
  const shown = all ? list : list.slice(0, 4);
  const done = () => { setVer((v) => v + 1); reload(); };
  const total = list.reduce((a, x) => a + (x.cost || 0), 0);
  return (
    <div className="rp-room-box">
      <div className="rp-head">
        <div className="fp-sec" style={{ margin: 0 }}>Riwayat Perbaikan{list.length ? ` (${list.length})` : ''}</div>
        <button className="btn btn-p btn-sm" onClick={() => setModal({})}>+ Catat Perbaikan</button>
      </div>
      {data && !list.length && <div className="tm" style={{ padding: '4px 0 8px' }}>Belum ada perbaikan tercatat untuk kamar ini.</div>}
      {total > 0 && <div className="tm" style={{ marginBottom: 6 }}>Total biaya perbaikan: <strong>{fmtRp(total)}</strong></div>}
      <div className="rp-list">{shown.map((x) => <RepairItem key={x.id} x={x} onOpen={setModal} />)}</div>
      {list.length > 4 && <button className="btn btn-g btn-sm" style={{ marginTop: 6 }} onClick={() => setAll((v) => !v)}>{all ? 'Tampilkan lebih sedikit' : `Lihat semua (${list.length})`}</button>}
      {modal && <RepairModal repair={modal.id ? modal : null} room={room} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

// Kartu "Perbaikan Kamar" di halaman Kamar (semua kamar).
export function RepairLogCard({ rooms, version, reload }) {
  const [status, setStatus] = useState('open');
  const [ver, setVer] = useState(0);
  const { data } = useFetch(() => api.repairs('', status === 'all' ? '' : status), [status, ver, version]);
  const { data: sum } = useFetch(() => api.repairSummary(), [ver, version]);
  const [modal, setModal] = useState(null);
  const done = () => { setVer((v) => v + 1); reload(); };
  const pickRoom = modal && (modal.id ? rooms.find((r) => r.number === modal.room) || { number: modal.room } : null);
  return (
    <div className="card mb" id="perbaikan-kamar">
      <div className="ch">
        <div>
          <div className="ct">Perbaikan Kamar</div>
          {sum && <div className="cs">{sum.open} belum selesai · {sum.yearCount} perbaikan tahun {sum.year} · biaya {fmtRp(sum.yearCost)}</div>}
        </div>
        <button className="btn btn-p btn-sm" onClick={() => setModal({})}>+ Catat Perbaikan</button>
      </div>
      <div className="cb">
        <div className="fr" style={{ marginBottom: 10 }}>
          {[['open', 'Belum selesai'], ['done', 'Selesai'], ['all', 'Semua']].map(([k, l]) => (
            <button key={k} className={`chip${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
          ))}
        </div>
        {data && !data.length && <div className="empty">{status === 'open' ? 'Tidak ada perbaikan yang sedang berjalan 👍' : 'Belum ada perbaikan tercatat.'}</div>}
        <div className="rp-list rp-grid">{(data || []).map((x) => <RepairItem key={x.id} x={x} showRoom onOpen={setModal} />)}</div>
      </div>
      {modal && <RepairModal repair={modal.id ? modal : null} room={pickRoom} rooms={rooms} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}

export function RepairModal({ repair, room, rooms = [], onClose, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { isPemilik } = useAuth();
  const edit = Boolean(repair);
  const [roomNo, setRoomNo] = useState(room?.number || '');
  const target = room || rooms.find((r) => r.number === roomNo);
  const occupied = Boolean(target?.resident);
  const [f, setF] = useState(() => ({
    title: repair?.title || '', category: repair?.category || 'Lainnya', description: repair?.description || '',
    date: repair?.date || todayISO(), status: repair?.status || 'dilaporkan', doneDate: repair?.doneDate || todayISO(),
    cost: repair?.cost ? String(repair.cost) : '', vendor: repair?.vendor || '',
    blockRoom: repair ? repair.blockRoom : !room?.resident, recordExpense: repair ? repair.recordExpense : true,
  }));
  const [before, setBefore] = useState([]);
  const [after, setAfter] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const keptBefore = (repair?.photosBefore || []).filter((p) => !removed.includes(p));
  const keptAfter = (repair?.photosAfter || []).filter((p) => !removed.includes(p));
  const gal = (files, label) => files.map((file) => ({ key: file, file, url: fileUrl(file), caption: label }));

  async function save() {
    if (!roomNo) { toast('⚠️ Pilih kamar.'); return; }
    if (!f.title.trim()) { toast('⚠️ Isi masalah / pekerjaan perbaikan.'); return; }
    setBusy(true);
    const body = { ...f, cost: Number(digits(f.cost)) || 0, doneDate: f.status === 'selesai' ? f.doneDate : '' };
    try {
      if (edit) await api.updateRepair(repair.id, { ...body, addPhotosBefore: before, addPhotosAfter: after, removePhotos: removed });
      else await api.addRepair({ ...body, room: roomNo, photosBefore: before, photosAfter: after });
      toast(f.status === 'selesai' ? `✅ Perbaikan kamar ${roomNo} selesai dicatat.` : `✅ Perbaikan kamar ${roomNo} dicatat.`);
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Hapus Catatan Perbaikan', message: `Hapus "${repair.title}" (kamar ${repair.room}) dari riwayat?${repair.expenseId ? ' Pengeluaran terkait juga dihapus.' : ''}`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteRepair(repair.id); toast('Catatan perbaikan dihapus.'); onDone(); onClose(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <Modal title={edit ? `Perbaikan Kamar ${repair.room}` : `Catat Perbaikan${room ? ` · Kamar ${room.number}` : ''}`} onClose={onClose} width={640} footer={<>
      {edit && isPemilik && <button className="btn btn-d" style={{ marginRight: 'auto' }} onClick={remove} disabled={busy}>Hapus</button>}
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={save} disabled={busy}>{busy ? 'Menyimpan…' : 'Simpan'}</button>
    </>}>
      {edit && (repair.createdBy || repair.residentName) && (
        <div className="field-hint" style={{ marginBottom: 10 }}>
          Dicatat {repair.createdBy ? `oleh ${repair.createdBy} ` : ''}{fmtDate(repair.createdAt?.slice(0, 10))}{repair.residentName ? ` · penghuni saat itu: ${repair.residentName}` : ''}
        </div>
      )}
      {!room && !edit && (
        <div className="fg">
          <label className="fl">Kamar <span className="req">*</span></label>
          <select className="fi" value={roomNo} onChange={(e) => { setRoomNo(e.target.value); const r = rooms.find((x) => x.number === e.target.value); setF((x) => ({ ...x, blockRoom: !r?.resident })); }}>
            <option value="">Pilih kamar…</option>
            {rooms.map((r) => <option key={r.number} value={r.number}>Kamar {r.number}{r.resident ? ` · ${r.resident.name}` : ' · kosong'}</option>)}
          </select>
        </div>
      )}
      <div className="g2">
        <div className="fg"><label className="fl">Masalah / pekerjaan <span className="req">*</span></label><input className="fi" maxLength={200} placeholder="mis. AC tidak dingin, keran bocor" value={f.title} onChange={set('title')} /></div>
        <div className="fg"><label className="fl">Kategori</label><select className="fi" value={f.category} onChange={set('category')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div className="fg"><label className="fl">Keterangan</label><textarea className="fi" rows="2" maxLength={1000} placeholder="Detail kerusakan, penyebab, bahan yang diganti…" value={f.description} onChange={set('description')} /></div>

      <div className="fg">
        <label className="fl">Status</label>
        <div className="seg" role="radiogroup" aria-label="Status perbaikan">
          {Object.entries(REPAIR_STATUS).map(([k, v]) => (
            <button type="button" key={k} role="radio" aria-checked={f.status === k} className={`seg-btn${f.status === k ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, status: k }))}>{v.label}</button>
          ))}
        </div>
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Tanggal lapor</label><input type="date" className="fi" max={todayISO()} value={f.date} onChange={set('date')} /></div>
        {f.status === 'selesai'
          ? <div className="fg"><label className="fl">Tanggal selesai</label><input type="date" className="fi" min={f.date} value={f.doneDate} onChange={set('doneDate')} /></div>
          : <div />}
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Biaya</label><div className="rp-rp"><span>Rp</span><input className="fi" inputMode="numeric" placeholder="0" value={fmtNum(f.cost)} onChange={(e) => setF((x) => ({ ...x, cost: digits(e.target.value) }))} /></div></div>
        <div className="fg"><label className="fl">Tukang / vendor</label><input className="fi" maxLength={120} placeholder="mis. Pak Slamet (teknisi AC)" value={f.vendor} onChange={set('vendor')} /></div>
      </div>
      <label className="switch-row fg"><input type="checkbox" checked={f.blockRoom} onChange={set('blockRoom')} /> Kamar tidak bisa ditempati selama perbaikan
        {occupied && f.blockRoom && <span className="tm"> — kamar ini berpenghuni</span>}
      </label>
      <label className="switch-row fg"><input type="checkbox" checked={f.recordExpense} onChange={set('recordExpense')} /> Catat biaya ke Pengeluaran (kategori Perawatan)</label>

      <div className="g2">
        <div>
          <div className="fp-sec">Foto Sebelum</div>
          {edit && <PhotoGallery photos={gal(keptBefore, 'Sebelum')} onDelete={(p) => setRemoved((r) => [...r, p.file])} empty="" />}
          <MultiPhotoInput value={before} onChange={setBefore} max={PHOTO_MAX - keptBefore.length} captions={false} idPrefix="rpb" />
        </div>
        <div>
          <div className="fp-sec">Foto Sesudah</div>
          {edit && <PhotoGallery photos={gal(keptAfter, 'Sesudah')} onDelete={(p) => setRemoved((r) => [...r, p.file])} empty="" />}
          <MultiPhotoInput value={after} onChange={setAfter} max={PHOTO_MAX - keptAfter.length} captions={false} idPrefix="rpa" />
        </div>
      </div>
    </Modal>
  );
}
