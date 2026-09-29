import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { avatarColor, initials, openWhatsApp, fmtRp, fmtDate, PAY_STATUS } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { useAuth } from '../components/Auth.jsx';
import Modal from '../components/Modal.jsx';
import { revealOnSmall } from '../responsive.js';
import { StayPill } from '../components/StayInput.jsx';

const STATUS = {
  oc: { label: 'Terisi', cls: 'oc' },
  av: { label: 'Kosong', cls: 'avail' },
  mn: { label: 'Perbaikan', cls: 'mn' },
};

export default function Kamar({ version, onChange }) {
  const [ver, setVer] = useState(0);
  const { data: rooms, loading } = useFetch(() => api.rooms(), [version, ver]);
  const { data: types } = useFetch(() => api.roomTypes(), [version, ver]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [typeModal, setTypeModal] = useState(null); // null | {} (new) | type
  const [addRoom, setAddRoom] = useState(false);
  const { isPemilik } = useAuth();
  const reload = () => { setVer((v) => v + 1); onChange?.(); };

  const counts = useMemo(() => {
    const r = rooms || [];
    return { all: r.length, oc: r.filter((x) => x.status === 'oc').length, av: r.filter((x) => x.status === 'av').length, mn: r.filter((x) => x.status === 'mn').length };
  }, [rooms]);

  if (loading || !rooms) return <div className="loading">Memuat denah kamar…</div>;

  const shown = rooms.filter((r) => filter === 'all' || r.status === filter);
  const room = rooms.find((r) => r.number === selected);
  const floors = [...new Set(shown.map((r) => r.floor))].sort();

  return (
    <>
      <div className="fr">
        {[['all', `Semua (${counts.all})`], ['oc', `Terisi (${counts.oc})`], ['av', `Kosong (${counts.av})`], ['mn', `Perbaikan (${counts.mn})`]].map(([k, l]) => (
          <button key={k} className={`chip${filter === k ? ' on' : ''}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
        {isPemilik && <div style={{ marginLeft: 'auto' }}><button className="btn btn-g btn-sm" onClick={() => setAddRoom(true)}>+ Tambah Kamar</button></div>}
      </div>

      <div className="g2 mb">
        <div className="card">
          <div className="ch">
            <div className="ct">Denah Kamar</div>
            <div className="legend">
              <span><i className="dot" style={{ background: 'var(--room-oc)' }} /> Terisi</span>
              <span><i className="dot" style={{ background: 'var(--room-av)' }} /> Kosong</span>
              <span><i className="dot" style={{ background: 'var(--room-mn)' }} /> Perbaikan</span>
            </div>
          </div>
          <div className="cb">
            {floors.map((fl) => (
              <div key={fl} style={{ marginBottom: 14 }}>
                <div className="sec-hd"><div className="sec-hd-lbl">Lantai {fl}</div><div className="sec-hd-line" /></div>
                <div className="rg">
                  {shown.filter((r) => r.floor === fl).map((r) => (
                    <button key={r.number} className={`rc ${STATUS[r.status].cls}${selected === r.number ? ' sel' : ''}`} onClick={() => { setSelected(r.number); revealOnSmall('room-detail'); }}
                      title={`Kamar ${r.number} · ${STATUS[r.status].label}`}>
                      <div className="rc-n">{r.number}</div>
                      <div>{STATUS[r.status].label}</div>
                      <div className="rc-t">{r.typeName || '—'}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" id="room-detail">
          <div className="ch"><div className="ct">Detail Kamar</div></div>
          <div className="cb">
            {!room ? <div className="empty">Klik kamar di denah untuk melihat detail</div> : <RoomDetail room={room} types={types || []} reload={reload} />}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <div><div className="ct">Tipe Kamar, Harga & Fasilitas</div><div className="cs">{isPemilik ? 'Atur sendiri harga dan fasilitas setiap tipe' : 'Hanya pemilik yang dapat mengubah'}</div></div>
          {isPemilik && <button className="btn btn-p btn-sm" onClick={() => setTypeModal({})}>+ Tipe Kamar</button>}
        </div>
        <div className="type-grid">
          {(types || []).map((t) => (
            <div className="type-card" key={t.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div className="ct">{t.name}</div>
                  <div className="type-price">{fmtRp(t.price)}<span>/bulan</span></div>
                </div>
                <span className="badge b-neu">{t.roomCount} kamar</span>
              </div>
              {t.description && <div className="tm" style={{ margin: '6px 0' }}>{t.description}</div>}
              <div className="fac-list">{t.facilities.map((f) => <span key={f} className="fac">{f}</span>)}</div>
              {isPemilik && <button className="btn btn-g btn-sm" style={{ marginTop: 10 }} onClick={() => setTypeModal(t)}>Ubah</button>}
            </div>
          ))}
        </div>
      </div>

      {typeModal && <RoomTypeModal type={typeModal} onClose={() => setTypeModal(null)} onDone={reload} />}
      {addRoom && <AddRoomModal types={types || []} onClose={() => setAddRoom(false)} onDone={reload} />}
    </>
  );
}

function RoomDetail({ room, types, reload }) {
  const toast = useToast();
  const confirm = useConfirm();
  const nav = useNavigate();
  const { isPemilik } = useAuth();
  const [note, setNote] = useState(room.note || '');
  const res = room.resident;

  async function update(body, msg) {
    try { await api.updateRoom(room.number, body); toast(msg); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Hapus Kamar', message: `Hapus kamar ${room.number} dari daftar?`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteRoom(room.number); toast('Kamar dihapus.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span className={`badge ${room.status === 'oc' ? 'b-ok' : room.status === 'mn' ? 'b-warn' : 'b-err'}`} style={{ fontSize: 12, padding: '5px 11px' }}>
          Kamar {room.number} — {STATUS[room.status].label}
        </span>
        <span className="tm">Lantai {room.floor}</span>
      </div>

      <div style={{ fontSize: 13, display: 'grid', gap: 8, marginBottom: 14 }}>
        <Row label="Tipe" value={isPemilik ? (
          <select className="fi" style={{ width: 'auto', padding: '4px 8px' }} value={room.typeId || ''} onChange={(e) => update({ typeId: e.target.value ? Number(e.target.value) : null }, 'Tipe kamar diperbarui.')}>
            <option value="">— Tanpa tipe —</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtRp(t.price)}</option>)}
          </select>
        ) : room.typeName || '—'} />
        <Row label="Harga Sewa" value={<strong>{room.typePrice ? `${fmtRp(room.typePrice)}/bln` : '—'}</strong>} />
        <Row label="Fasilitas" value={<span style={{ textAlign: 'right' }}>{room.facilities.join(', ') || '—'}</span>} />
      </div>

      {res && (
        <div className="res-mini" onClick={() => nav(`/penghuni/${res.id}`)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && nav(`/penghuni/${res.id}`)}>
          <div className="av" style={{ width: 38, height: 38, background: avatarColor(res.name), color: '#fff' }}>{initials(res.name)}</div>
          <div style={{ flex: 1 }}>
            <div className="tn">{res.name}</div>
            <div className="tm">Masuk {fmtDate(res.masuk)} · jatuh tempo tgl {res.dueDay}</div>
            {res.stayMonths ? <div style={{ marginTop: 3 }}><StayPill r={res} /></div> : null}
          </div>
          <span className={`badge ${(PAY_STATUS[res.payStatus] || PAY_STATUS.lunas).cls}`}>{(PAY_STATUS[res.payStatus] || PAY_STATUS.lunas).label}</span>
        </div>
      )}

      <div className="fp-sec">Status Perbaikan</div>
      <label className="switch-row fg">
        <input type="checkbox" checked={room.maintenance} onChange={(e) => update({ maintenance: e.target.checked, note }, e.target.checked ? 'Kamar ditandai sedang perbaikan.' : 'Perbaikan selesai.')} />
        Kamar sedang dalam perbaikan
      </label>
      <div className="fg" style={{ display: 'flex', gap: 6 }}>
        <input className="fi" placeholder="Catatan perbaikan (mis. plafon bocor)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn btn-g btn-sm" onClick={() => update({ note }, 'Catatan disimpan.')}>Simpan</button>
      </div>

      <div style={{ display: 'flex', gap: 7, marginTop: 6, flexWrap: 'wrap' }}>
        {res && <button className="btn btn-g btn-sm" onClick={() => openWhatsApp(res.wa, `Halo ${res.name}, `)}>Hubungi WA</button>}
        {room.status === 'av' && (
          <button className="btn btn-p btn-sm" onClick={() => openWhatsApp('', `Tersedia kamar kos! Kamar ${room.number} (${room.typeName || 'kamar'}) — ${fmtRp(room.typePrice)}/bln. Fasilitas: ${room.facilities.join(', ')}. Daftar: ${window.location.origin}/form`)}>
            Pasarkan Kamar
          </button>
        )}
        {isPemilik && !res && <button className="btn btn-g btn-sm" onClick={remove}>Hapus Kamar</button>}
      </div>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <span style={{ color: 'var(--t2)' }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RoomTypeModal({ type, onClose, onDone }) {
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = !type.id;
  const [f, setF] = useState({ name: type.name || '', price: type.price || '', description: type.description || '', facilities: type.facilities || [] });
  const [fac, setFac] = useState('');
  const addFac = () => {
    const v = fac.trim();
    if (v && !f.facilities.includes(v)) setF((x) => ({ ...x, facilities: [...x.facilities, v] }));
    setFac('');
  };
  async function save() {
    try {
      const body = { ...f, price: Number(String(f.price).replace(/\D/g, '')) };
      if (isNew) await api.addRoomType(body); else await api.updateRoomType(type.id, body);
      toast('✅ Tipe kamar disimpan. Harga baru berlaku untuk invoice berikutnya.');
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function remove() {
    if (!(await confirm({ title: 'Hapus Tipe Kamar', message: `Hapus tipe "${type.name}"?`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteRoomType(type.id); toast('Tipe dihapus.'); onDone(); onClose(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  const presets = ['AC', 'Kipas angin', 'Kasur', 'Lemari', 'Meja belajar', 'Kursi', 'Wi-Fi', 'Kamar mandi dalam', 'Kamar mandi luar', 'Water heater', 'TV', 'Kulkas', 'Jendela', 'Parkir motor', 'Dapur bersama', 'Laundry'];
  return (
    <Modal title={isNew ? 'Tipe Kamar Baru' : `Ubah Tipe · ${type.name}`} onClose={onClose} width={520} footer={<>
      {!isNew && <button className="btn btn-g" style={{ marginRight: 'auto' }} onClick={remove}>Hapus</button>}
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={save}>Simpan</button>
    </>}>
      <div className="g2">
        <div className="fg"><label className="fl">Nama tipe <span className="req">*</span></label><input className="fi" placeholder="mis. VIP" value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></div>
        <div className="fg"><label className="fl">Harga / bulan <span className="req">*</span></label><input className="fi" inputMode="numeric" placeholder="1500000" value={f.price} onChange={(e) => setF((x) => ({ ...x, price: e.target.value }))} />
          {f.price ? <div className="field-hint">{fmtRp(String(f.price).replace(/\D/g, ''))}</div> : null}</div>
      </div>
      <div className="fg"><label className="fl">Deskripsi</label><input className="fi" value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} /></div>
      <div className="fg">
        <label className="fl">Fasilitas</label>
        <div className="fac-list" style={{ marginBottom: 8 }}>
          {f.facilities.map((x) => <button type="button" key={x} className="fac fac-on" onClick={() => setF((y) => ({ ...y, facilities: y.facilities.filter((z) => z !== x) }))}>{x} ✕</button>)}
          {f.facilities.length === 0 && <span className="tm">Belum ada fasilitas</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="fi" placeholder="Tambah fasilitas lain…" value={fac} onChange={(e) => setFac(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFac(); } }} />
          <button type="button" className="btn btn-g btn-sm" onClick={addFac}>Tambah</button>
        </div>
        <div className="fac-list" style={{ marginTop: 8 }}>
          {presets.filter((p) => !f.facilities.includes(p)).map((p) => <button type="button" key={p} className="fac" onClick={() => setF((y) => ({ ...y, facilities: [...y.facilities, p] }))}>+ {p}</button>)}
        </div>
      </div>
    </Modal>
  );
}

function AddRoomModal({ types, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ number: '', floor: 1, typeId: types[0]?.id || '' });
  async function save() {
    try { await api.addRoom({ ...f, floor: Number(f.floor), typeId: f.typeId ? Number(f.typeId) : null }); toast(`✅ Kamar ${f.number} ditambahkan.`); onDone(); onClose(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <Modal title="Tambah Kamar" onClose={onClose} width={420} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button><button className="btn btn-p" onClick={save}>Simpan</button>
    </>}>
      <div className="g2">
        <div className="fg"><label className="fl">Nomor kamar</label><input className="fi" placeholder="mis. 121 atau A1" value={f.number} onChange={(e) => setF((x) => ({ ...x, number: e.target.value }))} /></div>
        <div className="fg"><label className="fl">Lantai</label><input type="number" min="1" className="fi" value={f.floor} onChange={(e) => setF((x) => ({ ...x, floor: e.target.value }))} /></div>
      </div>
      <div className="fg"><label className="fl">Tipe kamar</label>
        <select className="fi" value={f.typeId} onChange={(e) => setF((x) => ({ ...x, typeId: e.target.value }))}>{types.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtRp(t.price)}</option>)}</select>
      </div>
    </Modal>
  );
}
