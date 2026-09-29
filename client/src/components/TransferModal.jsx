// Proses pindah kamar: setujui pengajuan penghuni, atau admin memindahkan langsung.
// Pratinjau langsung: harga baru, selisih pro-rata periode berjalan, invoice yang disesuaikan.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtRp, fmtDate, todayISO } from '../helpers.js';
import { useToast } from './Toast.jsx';
import Modal from './Modal.jsx';

export default function TransferModal({ transfer, resident, onClose, onDone }) {
  const toast = useToast();
  const direct = !transfer;
  const residentId = transfer?.residentId ?? resident?.id;
  const [rooms, setRooms] = useState(null);
  const [f, setF] = useState({
    toRoom: transfer?.toRoom || '', moveDate: transfer?.moveDate && transfer.moveDate >= todayISO() ? transfer.moveDate : todayISO(),
    keepCustomRent: false, prorate: true, notify: true, note: '',
  });
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  useEffect(() => { api.transferRooms(residentId).then(setRooms).catch(() => setRooms([])); }, [residentId]);

  useEffect(() => {
    if (!f.toRoom || !f.moveDate) { setPlan(null); return undefined; }
    let alive = true;
    const body = { toRoom: f.toRoom, moveDate: f.moveDate, keepCustomRent: f.keepCustomRent, prorate: f.prorate };
    const t = setTimeout(() => {
      (direct ? api.residentTransferPreview(residentId, body) : api.transferPreview(transfer.id, body))
        .then((p) => { if (alive) { setPlan(p); setErr(''); } })
        .catch((e) => { if (alive) { setPlan(null); setErr(e.message); } });
    }, 150);
    return () => { alive = false; clearTimeout(t); };
  }, [f.toRoom, f.moveDate, f.keepCustomRent, f.prorate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    setBusy(true);
    const body = { ...f, notify: f.notify && Boolean(plan?.notifyReady) };
    try {
      const r = direct ? await api.residentTransfer(residentId, body) : await api.approveTransfer(transfer.id, body);
      toast(r.status === 'done'
        ? `✅ Pindah ke kamar ${f.toRoom} selesai — kamar, harga & invoice sudah diperbarui.`
        : `✅ Disetujui — kamar ${f.toRoom} dipesan, pindah otomatis ${fmtDate(f.moveDate)}.`);
      onDone?.(r);
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }

  const byType = {};
  for (const r of rooms || []) (byType[r.typeName] ||= []).push(r);
  const requestedType = transfer && !transfer.toRoom ? transfer.toTypeName : '';
  const p = plan?.prorata;

  return (
    <Modal title={direct ? `Pindahkan ${resident.name}` : `Proses Pindah Kamar · ${transfer.name}`} onClose={onClose} width={560} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={submit} disabled={busy || !plan}>{busy ? 'Memproses…' : plan?.immediate ? 'Pindahkan Sekarang' : direct ? 'Jadwalkan Pindah' : 'Setujui & Jadwalkan'}</button>
    </>}>
      <div className="tf-head">
        <div><span className="tm">Dari</span><strong>Kamar {transfer?.fromRoom || resident.room}</strong></div>
        <span className="tf-arrow">→</span>
        <div><span className="tm">Ke</span><strong>{f.toRoom ? `Kamar ${f.toRoom}` : '—'}</strong></div>
      </div>
      {transfer?.reason && <div className="field-hint" style={{ marginBottom: 10 }}>Alasan penghuni: “{transfer.reason}”</div>}
      <div className="g2">
        <div className="fg">
          <label className="fl">Kamar tujuan{requestedType ? ` (diminta: tipe ${requestedType})` : ''}</label>
          <select className="fi" value={f.toRoom} onChange={set('toRoom')}>
            <option value="">Pilih kamar kosong ({rooms?.length ?? '…'})</option>
            {Object.entries(byType).map(([type, list]) => (
              <optgroup key={type} label={`${type} · ${fmtRp(list[0].price)}/bln`}>
                {list.map((r) => <option key={r.number} value={r.number}>Kamar {r.number} · lantai {r.floor}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="fg">
          <label className="fl">Tanggal pindah</label>
          <input type="date" className="fi" min={todayISO()} value={f.moveDate} onChange={set('moveDate')} />
        </div>
      </div>
      {err && <div className="fp-alert">⚠️ {err}</div>}
      {plan && (
        <div className="tf-plan">
          <div className="tf-row"><span>Sewa per bulan</span><strong>{fmtRp(plan.oldPrice)} → {fmtRp(plan.newPrice)}{plan.monthlyDiff ? <span className={`tf-diff ${plan.monthlyDiff > 0 ? 'up' : 'down'}`}>{plan.monthlyDiff > 0 ? '+' : '−'}{fmtRp(Math.abs(plan.monthlyDiff))}</span> : null}</strong></div>
          {p && <div className="tf-row"><span>Periode berjalan ({p.days}/{p.periodDays} hari)</span><strong>{p.diff > 0 ? `Ditagih selisih ${fmtRp(p.diff)}` : p.action === 'kurangi' ? `Invoice ${p.invoice} dikurangi ${fmtRp(-p.diff)}` : `Kelebihan bayar ${fmtRp(-p.diff)} (selesaikan manual)`}</strong></div>}
          <div className="tf-row"><span>Invoice mendatang</span><strong>{plan.futureInvoices.length ? `${plan.futureInvoices.length} disesuaikan ke harga baru` : 'Belum ada — terbit otomatis dengan harga baru'}</strong></div>
          <div className="tf-row"><span>Waktu</span><strong>{plan.immediate ? 'Langsung sekarang' : `Otomatis pada ${fmtDate(plan.moveDate)} (kamar dipesan)`}</strong></div>
        </div>
      )}
      {plan?.customRent && (
        <label className="switch-row fg"><input type="checkbox" checked={f.keepCustomRent} onChange={set('keepCustomRent')} /> Pertahankan harga khusus {fmtRp(plan.customRent)}/bln</label>
      )}
      {plan && plan.monthlyDiff !== 0 && (
        <label className="switch-row fg"><input type="checkbox" checked={f.prorate} onChange={set('prorate')} /> Hitung selisih harga periode berjalan (pro-rata)</label>
      )}
      {plan && (
        <label className="switch-row fg"><input type="checkbox" checked={f.notify && plan.notifyReady} disabled={!plan.notifyReady} onChange={set('notify')} /> Beri tahu penghuni via WhatsApp{!plan.notifyReady && <span className="tm"> (gateway WA belum diatur)</span>}</label>
      )}
      {direct && (
        <div className="fg" style={{ marginBottom: 0 }}><label className="fl">Catatan (opsional)</label><input className="fi" maxLength={300} placeholder="mis. Permintaan penghuni / renovasi kamar lama" value={f.note} onChange={set('note')} /></div>
      )}
    </Modal>
  );
}
