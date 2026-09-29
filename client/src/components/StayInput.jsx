// Input "Rencana lama tinggal": pilihan cepat + angka bebas (bulan/tahun).
// value = jumlah bulan (number) atau null (belum pasti).
import { useEffect, useRef, useState } from 'react';
import { addMonthsISO, fmtDate, fmtStay } from '../helpers.js';

const QUICK = [
  { v: null, label: 'Belum pasti' },
  { v: 3, label: '3 bln' },
  { v: 6, label: '6 bln' },
  { v: 12, label: '1 thn' },
  { v: 24, label: '2 thn' },
];

const toParts = (months) => (months && months % 12 === 0 ? { n: String(months / 12), unit: 'tahun' } : { n: months ? String(months) : '', unit: 'bulan' });

export default function StayInput({ value, onChange, masuk, label = 'Rencana Lama Tinggal', hint }) {
  const [parts, setParts] = useState(() => toParts(value));
  const emitted = useRef(value ?? null); // nilai terakhir yang dikirim dari ketikan sendiri
  useEffect(() => {
    // Sinkron hanya bila nilai diubah dari luar (mis. pilihan cepat), bukan dari ketikan.
    if ((value ?? null) !== emitted.current) { emitted.current = value ?? null; setParts(toParts(value)); }
  }, [value]);

  const typed = Math.round(Number(parts.n)) * (parts.unit === 'tahun' ? 12 : 1);
  const tooLong = parts.n !== '' && typed > 120;

  function update(next) {
    setParts(next);
    const n = Math.round(Number(next.n));
    const months = n > 0 ? n * (next.unit === 'tahun' ? 12 : 1) : null;
    const v = months && months <= 120 ? months : null;
    emitted.current = v;
    onChange(v);
  }

  const end = masuk && value ? addMonthsISO(masuk, value) : '';
  return (
    <div className="fg">
      <label className="fl">{label}</label>
      <div className="stay-quick" role="group" aria-label="Pilihan cepat rencana tinggal">
        {QUICK.map((q) => (
          <button key={q.label} type="button" className={`chip${(value ?? null) === q.v ? ' on' : ''}`} onClick={() => onChange(q.v)}>{q.label}</button>
        ))}
      </div>
      <div className="stay-row">
        <input className="fi" type="number" inputMode="numeric" min="1" max={parts.unit === 'tahun' ? 10 : 120} placeholder="Jumlah"
          value={parts.n} onChange={(e) => update({ ...parts, n: e.target.value })} aria-label="Jumlah" />
        <select className="fi" value={parts.unit} onChange={(e) => update({ ...parts, unit: e.target.value })} aria-label="Satuan">
          <option value="bulan">Bulan</option>
          <option value="tahun">Tahun</option>
        </select>
      </div>
      {tooLong && <div className="field-hint" style={{ color: 'var(--err)' }}>Maksimal 10 tahun (120 bulan).</div>}
      <div className="field-hint">
        {value ? <>Rencana <strong>{fmtStay(value)}</strong>{end ? <> — selesai sekitar <strong>{fmtDate(end)}</strong></> : ''}. </> : ''}
        {hint || 'Perkiraan saja; tagihan tetap bulanan dan rencana bisa diubah kapan saja.'}
      </div>
    </div>
  );
}

// Label rencana tinggal: "Rencana 1 tahun · s/d 1 Okt 2027 (30 hari lagi)".
export function StayPill({ r, short = false }) {
  if (!r.stayMonths) return short ? null : <span className="stay-pill">Rencana tinggal: belum pasti</span>;
  const left = r.stayDaysLeft;
  const cls = left < 0 ? ' over' : left <= 30 ? ' soon' : '';
  const when = left < 0 ? `lewat ${-left} hari` : left === 0 ? 'hari ini' : left <= 60 ? `${left} hari lagi` : '';
  return (
    <span className={`stay-pill${cls}`} title={`Rencana tinggal ${fmtStay(r.stayMonths)} mulai ${fmtDate(r.stayStart || r.masuk)}`}>
      📆 {short ? '' : `Rencana ${fmtStay(r.stayMonths)} · `}s/d {fmtDate(r.stayEnd)}{when ? ` (${when})` : ''}
    </span>
  );
}
