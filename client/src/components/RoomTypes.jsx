// Komponen tipe kamar: ubah tipe (harga & fasilitas), upgrade/downgrade kamar, riwayat.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtRp, fmtDate } from '../helpers.js';
import { useToast } from './Toast.jsx';
import { useConfirm } from './Confirm.jsx';
import Modal from './Modal.jsx';

const DIR = {
  upgrade: { label: 'Upgrade', cls: 'b-ok', ico: '⬆' },
  downgrade: { label: 'Downgrade', cls: 'b-warn', ico: '⬇' },
  setara: { label: 'Harga sama', cls: 'b-neu', ico: '↔' },
};

export function RoomTypeModal({ type, onClose, onDone }) {
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

// Upgrade / downgrade satu atau beberapa kamar — pratinjau langsung sebelum diterapkan.
export function ChangeTypeModal({ numbers, types, initialTypeId, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ typeId: initialTypeId || '', effective: 'next', updateInvoices: true, notify: true, note: '' });
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => {
    if (!f.typeId) { setPlan(null); return undefined; }
    let alive = true;
    setErr('');
    const t = setTimeout(() => {
      api.changeTypePreview({ numbers, typeId: Number(f.typeId), effective: f.effective, updateInvoices: f.updateInvoices })
        .then((d) => { if (alive) setPlan(d); }).catch((e) => { if (alive) { setPlan(null); setErr(e.message); } });
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [f.typeId, f.effective, f.updateInvoices, numbers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  async function apply() {
    setBusy(true);
    try {
      const r = await api.changeType({ numbers, typeId: Number(f.typeId), effective: f.effective, updateInvoices: f.updateInvoices, notify: f.notify && plan.notifyReady, note: f.note });
      const sentWa = (r.notified || []).filter((n) => n.ok).length;
      toast(`✅ Tipe ${r.changed} kamar diperbarui${r.invoiceCount ? ` · ${r.invoiceCount} invoice disesuaikan` : ''}${sentWa ? ` · ${sentWa} penghuni diberi tahu via WA` : ''}.`);
      onDone?.();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }

  const occupied = plan?.items.some((i) => i.resident && !i.same);
  return (
    <Modal title={numbers.length === 1 ? `Ubah Tipe Kamar ${numbers[0]}` : `Ubah Tipe ${numbers.length} Kamar`} onClose={onClose} width={560} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={apply} disabled={busy || !plan || !plan.changed}>{busy ? 'Menyimpan…' : plan && !plan.changed ? 'Tidak ada perubahan' : 'Terapkan'}</button>
    </>}>
      <div className="fg">
        <label className="fl">Tipe baru</label>
        <select className="fi" value={f.typeId} onChange={set('typeId')}>
          <option value="">Pilih tipe…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtRp(t.price)}/bln</option>)}
        </select>
      </div>
      {err && <div className="fp-alert">⚠️ {err}</div>}
      {plan && (
        <div className="tc-list">
          {plan.items.map((i) => (
            <div key={i.number} className="tc-row">
              <div className="tc-room">{i.number}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tc-types">{i.from.name} <span className="tm">{fmtRp(i.from.price)}</span> → <strong>{i.to.name}</strong> <span className="tm">{fmtRp(i.to.price)}</span></div>
                <div className="tm">{i.resident ? `Penghuni: ${i.resident.name}${i.resident.customRent ? ` · harga khusus ${fmtRp(i.resident.customRent)} (tidak berubah)` : ''}` : 'Kamar kosong'}{i.invoices.length ? ` · ${i.invoices.length} invoice disesuaikan` : ''}</div>
              </div>
              {i.same ? <span className="badge b-neu">Sudah tipe ini</span> : <span className={`badge ${DIR[i.direction].cls}`}>{DIR[i.direction].ico} {DIR[i.direction].label}{i.direction !== 'setara' ? ` ${i.to.price > i.from.price ? '+' : '−'}${fmtRp(Math.abs(i.to.price - i.from.price))}` : ''}</span>}
            </div>
          ))}
        </div>
      )}
      {plan && occupied && (
        <>
          <div className="fg" style={{ marginTop: 12 }}>
            <label className="fl">Harga baru berlaku</label>
            <div className="seg">
              <label className={f.effective === 'next' ? 'on' : ''}><input type="radio" name="eff" value="next" checked={f.effective === 'next'} onChange={set('effective')} /> Mulai periode berikutnya</label>
              <label className={f.effective === 'now' ? 'on' : ''}><input type="radio" name="eff" value="now" checked={f.effective === 'now'} onChange={set('effective')} /> Mulai periode berjalan</label>
            </div>
            <div className="field-hint">{f.effective === 'now' ? 'Invoice periode ini yang belum dibayar ikut harga baru.' : 'Invoice periode ini tetap harga lama; periode berikutnya pakai harga baru.'}</div>
          </div>
          <label className="switch-row fg"><input type="checkbox" checked={f.updateInvoices} onChange={set('updateInvoices')} /> Sesuaikan invoice yang sudah terbit & belum dibayar ({plan.invoiceCount})</label>
          <label className="switch-row fg"><input type="checkbox" checked={f.notify && plan.notifyReady} disabled={!plan.notifyReady} onChange={set('notify')} /> Beri tahu penghuni via WhatsApp{!plan.notifyReady && <span className="tm"> (gateway WA belum diatur)</span>}</label>
        </>
      )}
      {plan && (
        <div className="fg" style={{ marginBottom: 0 }}>
          <label className="fl">Catatan (opsional)</label>
          <input className="fi" placeholder="mis. Pasang AC baru / renovasi kamar mandi" value={f.note} onChange={set('note')} maxLength={300} />
        </div>
      )}
    </Modal>
  );
}

// Riwayat upgrade/downgrade satu kamar.
export function RoomHistory({ number, version = 0, limit = 5 }) {
  const [list, setList] = useState(null);
  useEffect(() => { api.roomHistory(number).then(setList).catch(() => setList([])); }, [number, version]);
  if (!list || !list.length) return null;
  return (
    <div className="room-hist">
      <div className="fp-sec">Riwayat Tipe</div>
      {list.slice(0, limit).map((h) => (
        <div key={h.id} className="room-hist-row">
          <span className={`badge ${(DIR[h.direction] || DIR.setara).cls}`}>{(DIR[h.direction] || DIR.setara).ico}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div><strong>{h.fromName}</strong> → <strong>{h.toName}</strong> <span className="tm">({fmtRp(h.fromPrice)} → {fmtRp(h.toPrice)})</span></div>
            <div className="tm">{fmtDate(String(h.createdAt).slice(0, 10))}{h.userName ? ` · oleh ${h.userName}` : ''}{h.residentName ? ` · penghuni ${h.residentName}` : ''}{h.note ? ` · ${h.note}` : ''}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
