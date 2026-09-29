// Pengaturan → Kamar & Tipe:
//  1. Jumlah kamar, lantai & format nomor (pratinjau → terapkan)
//  2. Tipe kamar (harga & fasilitas)
//  3. Tipe per kamar — upgrade/downgrade satu atau banyak kamar
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { fmtRp } from '../helpers.js';
import { useToast } from './Toast.jsx';
import { useConfirm } from './Confirm.jsx';
import { RoomTypeModal, ChangeTypeModal } from './RoomTypes.jsx';

const STATUS = { oc: ['Terisi', 'b-ok'], av: ['Kosong', 'b-err'], mn: ['Perbaikan', 'b-warn'] };

function Stepper({ label, value, min, max, onChange, hint }) {
  const clamp = (v) => Math.max(min, Math.min(max, Math.round(Number(v) || min)));
  return (
    <div className="fg">
      <label className="fl">{label}</label>
      <div className="stepper">
        <button type="button" className="step-btn" onClick={() => onChange(clamp(value - 1))} aria-label={`Kurangi ${label}`}>−</button>
        <input className="fi step-val" type="number" inputMode="numeric" min={min} max={max} value={value}
          onChange={(e) => onChange(e.target.value === '' ? '' : clamp(e.target.value))} aria-label={label} />
        <button type="button" className="step-btn" onClick={() => onChange(clamp(value + 1))} aria-label={`Tambah ${label}`}>+</button>
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

const list = (arr, max = 12) => (arr.length > max ? `${arr.slice(0, max).join(', ')} … (+${arr.length - max})` : arr.join(', '));

export default function RoomSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [ver, setVer] = useState(0);
  const [rooms, setRooms] = useState(null);
  const [types, setTypes] = useState([]);
  const [layout, setLayout] = useState(null);
  const [plan, setPlan] = useState(null);
  const [planErr, setPlanErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [typeModal, setTypeModal] = useState(null);
  const [change, setChange] = useState(null); // { numbers, typeId? }
  const [picked, setPicked] = useState([]);
  const [floor, setFloor] = useState('all');
  const reload = () => setVer((v) => v + 1);

  useEffect(() => {
    api.rooms().then(setRooms).catch(() => setRooms([]));
    api.roomTypes().then(setTypes).catch(() => {});
  }, [ver]);
  useEffect(() => { api.roomLayout().then((l) => setLayout({ ...l, removeExtra: true })).catch(() => {}); }, [ver]);

  // Pratinjau otomatis setiap susunan diubah.
  useEffect(() => {
    if (!layout || layout.total === '' || layout.floors === '') return undefined;
    let alive = true;
    const t = setTimeout(() => {
      api.roomLayoutPreview(layout).then((p) => { if (alive) { setPlan(p); setPlanErr(''); } })
        .catch((e) => { if (alive) { setPlan(null); setPlanErr(e.message); } });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [layout]);

  const setL = (k) => (v) => setLayout((x) => ({ ...x, [k]: v && v.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v }));
  const floors = useMemo(() => [...new Set((rooms || []).map((r) => r.floor))].sort((a, b) => a - b), [rooms]);
  const shown = (rooms || []).filter((r) => floor === 'all' || String(r.floor) === floor);
  const changes = plan && (plan.add.length || plan.remove.length);

  async function applyLayout() {
    const msg = [
      plan.add.length ? `Tambah ${plan.add.length} kamar (${list(plan.add.map((a) => a.number), 8)}).` : '',
      plan.remove.length ? `Hapus ${plan.remove.length} kamar kosong (${list(plan.remove, 8)}).` : '',
      plan.blocked.length ? `Kamar berpenghuni tetap dipertahankan: ${list(plan.blocked, 8)}.` : '',
    ].filter(Boolean).join(' ');
    if (!(await confirm({ title: 'Terapkan Susunan Kamar', message: msg, confirmText: 'Terapkan', danger: plan.remove.length > 0 }))) return;
    setBusy(true);
    try {
      const r = await api.roomLayoutApply(layout);
      toast(`✅ Susunan kamar diperbarui — total ${r.resultTotal} kamar.`);
      reload();
    } catch (e) { toast(`⚠️ ${e.message}`); } finally { setBusy(false); }
  }

  const togglePick = (n) => setPicked((p) => (p.includes(n) ? p.filter((x) => x !== n) : [...p, n]));
  const allShownPicked = shown.length > 0 && shown.every((r) => picked.includes(r.number));

  return (
    <div className="card mb" id="kamar">
      <div className="ch">
        <div><div className="ct">🏠 Kamar & Tipe</div><div className="cs">Jumlah kamar, penomoran, tipe & upgrade/downgrade — perubahan di kartu ini langsung diterapkan</div></div>
        {rooms && <span className="badge b-neu">{rooms.length} kamar</span>}
      </div>
      <div className="cb">
        {/* 1. Jumlah & penomoran */}
        <div className="sec-hd"><div className="sec-hd-line" /><div className="sec-hd-lbl">Jumlah & Penomoran Kamar</div><div className="sec-hd-line" /></div>
        {!layout ? <div className="loading">Memuat…</div> : (
          <div className="rs-layout">
            <div className="rs-form">
              <div className="g2">
                <Stepper label="Total kamar" value={layout.total} min={1} max={500} onChange={setL('total')} />
                <Stepper label="Jumlah lantai" value={layout.floors} min={1} max={50} onChange={setL('floors')}
                  hint={layout.total && layout.floors ? `± ${Math.ceil(layout.total / layout.floors)} kamar per lantai` : ''} />
              </div>
              <div className="g2">
                <div className="fg">
                  <label className="fl">Format nomor</label>
                  <select className="fi" value={layout.mode} onChange={setL('mode')}>
                    <option value="urut">Berurutan (101, 102, 103, …)</option>
                    <option value="lantai">Per lantai (101…, 201…, 301…)</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Tipe untuk kamar baru</label>
                  <select className="fi" value={layout.typeId || ''} onChange={(e) => setL('typeId')(e.target.value ? Number(e.target.value) : null)}>
                    <option value="">— Tanpa tipe —</option>
                    {types.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtRp(t.price)}</option>)}
                  </select>
                </div>
              </div>
              <div className="g2">
                <div className="fg"><label className="fl">Prefiks (opsional)</label><input className="fi" maxLength={4} placeholder="mis. A" value={layout.prefix} onChange={setL('prefix')} /></div>
                {layout.mode === 'urut'
                  ? <div className="fg"><label className="fl">Nomor awal</label><input className="fi" type="number" inputMode="numeric" value={layout.start} onChange={(e) => setL('start')(e.target.value === '' ? '' : Number(e.target.value))} /></div>
                  : <div className="fg"><label className="fl">Contoh</label><div className="fi rs-example">{layout.prefix}101, {layout.prefix}102 … {layout.prefix}201</div></div>}
              </div>
              <label className="switch-row fg"><input type="checkbox" checked={layout.removeExtra} onChange={setL('removeExtra')} /> Hapus kamar <strong>kosong</strong> yang tidak ada di susunan baru</label>
            </div>
            <div className="rs-preview" aria-live="polite">
              <div className="fl">Pratinjau</div>
              {planErr && <div className="fp-alert">⚠️ {planErr}</div>}
              {plan && !changes && !plan.blocked.length && <div className="rs-ok">✅ Susunan sudah sesuai — tidak ada perubahan.</div>}
              {plan && plan.add.length > 0 && <div className="rs-line add"><strong>+{plan.add.length} kamar baru</strong><span>{list(plan.add.map((a) => `${a.number} (lt ${a.floor})`))}</span></div>}
              {plan && plan.remove.length > 0 && <div className="rs-line del"><strong>−{plan.remove.length} kamar dihapus</strong><span>{list(plan.remove)}</span></div>}
              {plan && plan.blocked.length > 0 && <div className="rs-line warn"><strong>⚠ Tetap dipertahankan (berpenghuni)</strong><span>{list(plan.blocked)} — pindahkan/keluarkan penghuni dulu bila ingin dihapus.</span></div>}
              {plan && plan.kept.length > 0 && <div className="rs-line"><strong>Kamar lain tetap ada</strong><span>{list(plan.kept)}</span></div>}
              {plan && <div className="rs-total">Total setelah diterapkan: <strong>{plan.resultTotal} kamar</strong></div>}
              <button className="btn btn-p" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={applyLayout} disabled={busy || !changes}>
                {busy ? 'Menerapkan…' : 'Terapkan Susunan'}
              </button>
              <div className="field-hint">Kamar yang sudah ada tidak diubah (tipe, lantai, penghuni). Kamar berpenghuni tidak pernah dihapus.</div>
            </div>
          </div>
        )}

        {/* 2. Tipe kamar */}
        <div className="sec-hd" style={{ marginTop: 18 }}><div className="sec-hd-line" /><div className="sec-hd-lbl">Tipe Kamar</div><div className="sec-hd-line" /></div>
        <div className="rs-types">
          {types.map((t) => (
            <button type="button" key={t.id} className="rs-type" onClick={() => setTypeModal(t)}>
              <strong>{t.name}</strong>
              <span className="type-price">{fmtRp(t.price)}<span>/bln</span></span>
              <span className="tm">{t.roomCount} kamar · {t.facilities.length} fasilitas</span>
            </button>
          ))}
          <button type="button" className="rs-type add" onClick={() => setTypeModal({})}>+ Tipe baru</button>
        </div>

        {/* 3. Tipe per kamar */}
        <div className="sec-hd" style={{ marginTop: 18 }}><div className="sec-hd-line" /><div className="sec-hd-lbl">Tipe per Kamar (Upgrade / Downgrade)</div><div className="sec-hd-line" /></div>
        <div className="rs-toolbar">
          <select className="fi" style={{ width: 'auto' }} value={floor} onChange={(e) => setFloor(e.target.value)} aria-label="Filter lantai">
            <option value="all">Semua lantai</option>
            {floors.map((f) => <option key={f} value={String(f)}>Lantai {f}</option>)}
          </select>
          <label className="switch-row"><input type="checkbox" checked={allShownPicked} onChange={() => setPicked(allShownPicked ? picked.filter((n) => !shown.some((r) => r.number === n)) : [...new Set([...picked, ...shown.map((r) => r.number)])])} /> Pilih semua</label>
          {picked.length > 0 && <button className="btn btn-p btn-sm" onClick={() => setChange({ numbers: picked })}>Ubah tipe {picked.length} kamar</button>}
          {picked.length > 0 && <button className="btn btn-g btn-sm" onClick={() => setPicked([])}>Batal pilih</button>}
        </div>
        <div className="tw">
          <table>
            <thead><tr><th style={{ width: 36 }} /><th>Kamar</th><th>Status</th><th>Tipe</th><th>Harga</th><th /></tr></thead>
            <tbody>
              {rooms === null && <tr><td colSpan="6" className="empty">Memuat…</td></tr>}
              {shown.map((r) => (
                <tr key={r.number}>
                  <td><input type="checkbox" checked={picked.includes(r.number)} onChange={() => togglePick(r.number)} aria-label={`Pilih kamar ${r.number}`} /></td>
                  <td className="tn">{r.number}<div className="tm">Lantai {r.floor}</div></td>
                  <td><span className={`badge ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>{r.resident && <div className="tm">{r.resident.name}</div>}</td>
                  <td>{r.typeName || '—'}</td>
                  <td className="tm">{r.typePrice ? fmtRp(r.typePrice) : '—'}{r.resident?.rentAmount && r.resident.rentAmount !== r.typePrice ? <div>khusus {fmtRp(r.resident.rentAmount)}</div> : null}</td>
                  <td><button className="btn btn-g btn-sm" onClick={() => setChange({ numbers: [r.number] })}>Ubah tipe</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {typeModal && <RoomTypeModal type={typeModal} onClose={() => setTypeModal(null)} onDone={reload} />}
      {change && <ChangeTypeModal numbers={change.numbers} types={types} onClose={() => setChange(null)} onDone={() => { setPicked([]); reload(); }} />}
    </div>
  );
}
