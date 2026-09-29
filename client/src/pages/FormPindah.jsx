import { useState } from 'react';
import { api } from '../api.js';
import { useSettings } from '../components/Settings.jsx';
import { todayISO, fmtDate, fmtRp } from '../helpers.js';

const REASONS = ['Ingin kamar lebih besar / fasilitas lebih baik', 'Ingin harga lebih hemat', 'Masalah di kamar sekarang', 'Pindah lantai', 'Lainnya'];

// Formulir publik: penghuni mengajukan pindah kamar (tanpa login).
export default function FormPindah() {
  const { info } = useSettings();
  const [who, setWho] = useState({ name: '', room: '' });
  const [data, setData] = useState(null); // hasil cek: kamar sekarang + kamar kosong
  const [f, setF] = useState({ toRoom: '', toTypeId: '', moveDate: todayISO(), reason: REASONS[0], reasonOther: '', wa: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function check(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try { setData(await api.transferLookup(who.name.trim(), who.room.trim())); } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (!f.toRoom && !f.toTypeId) { setErr('Pilih kamar tujuan atau tipe kamar yang diinginkan.'); return; }
    setBusy(true);
    try {
      const r = await api.submitTransfer({
        name: who.name.trim(), room: who.room.trim(), wa: f.wa,
        toRoom: f.toRoom, toTypeId: f.toRoom ? null : Number(f.toTypeId), moveDate: f.moveDate,
        reason: f.reason === 'Lainnya' ? f.reasonOther || 'Lainnya' : f.reason,
      });
      setDone(r);
      window.scrollTo(0, 0);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  }

  const byType = {};
  for (const r of data?.rooms || []) (byType[r.typeName] ||= []).push(r);

  return (
    <div className="form-public">
      <div className="fp-card">
        <div className="fp-head">
          <div className="fp-logo">In</div>
          <div><div className="fp-brand">Inde<em>Kos</em></div><div className="fp-kos">{info?.namaKos} · Pindah Kamar</div></div>
        </div>

        {done ? (
          <div className="fp-success">
            <div className="fp-success-ico">🔁</div>
            <h2>Pengajuan Pindah Terkirim</h2>
            <p>Pengajuan pindah dari kamar <strong>{who.room}</strong> ke <strong>{done.toRoom ? `kamar ${done.toRoom}` : `tipe ${done.toTypeName}`}</strong> pada <strong>{fmtDate(done.moveDate)}</strong> akan diproses pengelola. Anda akan mendapat kabar via WhatsApp. Setelah disetujui, kamar, harga sewa, dan tagihan diperbarui otomatis.</p>
          </div>
        ) : !data ? (
          <>
            <div className="fp-intro">
              <h1>Ajukan Pindah Kamar</h1>
              <p>Masukkan nama dan nomor kamar Anda sekarang untuk melihat kamar yang tersedia.</p>
            </div>
            <form onSubmit={check} noValidate>
              <div className="g2">
                <div className="fg"><label className="fl">Nama Lengkap <span className="req">*</span></label><input className="fi" autoComplete="name" value={who.name} onChange={(e) => setWho((x) => ({ ...x, name: e.target.value }))} /></div>
                <div className="fg"><label className="fl">Kamar Sekarang <span className="req">*</span></label><input className="fi" placeholder="mis. 103" value={who.room} onChange={(e) => setWho((x) => ({ ...x, room: e.target.value }))} /></div>
              </div>
              {err && <div className="fp-alert" role="alert">⚠️ {err}</div>}
              <button className="btn btn-p fp-submit" type="submit" disabled={busy}>{busy ? 'Memeriksa…' : 'Lihat Kamar Tersedia'}</button>
            </form>
          </>
        ) : (
          <>
            <div className="fp-intro">
              <h1>Halo, {data.name.split(' ')[0]} 👋</h1>
              <p>Kamar sekarang: <strong>{data.room}</strong> ({data.typeName}) · sewa <strong>{fmtRp(data.rent)}/bulan</strong>{data.customRent ? ' (harga khusus)' : ''}.</p>
            </div>
            {data.pending ? (
              <div className="fp-alert" role="status">Anda sudah punya pengajuan pindah ke {data.pending.toRoom ? `kamar ${data.pending.toRoom}` : `tipe ${data.pending.toTypeName}`} ({fmtDate(data.pending.moveDate)}) yang {data.pending.status === 'approved' ? 'sudah dijadwalkan' : 'sedang diproses'}.</div>
            ) : (
              <form onSubmit={submit} noValidate>
                <div className="fp-sec">Pilih Kamar Tujuan</div>
                {data.rooms.length === 0 && <div className="field-hint" style={{ marginBottom: 10 }}>Saat ini belum ada kamar kosong. Anda tetap bisa mengajukan tipe kamar yang diinginkan — pengelola akan menghubungi bila tersedia.</div>}
                <div className="room-picks" role="radiogroup" aria-label="Kamar tujuan">
                  {Object.entries(byType).map(([type, list]) => (
                    <div key={type} className="room-pick-group">
                      <div className="room-pick-type"><strong>{type}</strong> · {fmtRp(list[0].price)}/bln
                        {list[0].diff ? <span className={`tf-diff ${list[0].diff > 0 ? 'up' : 'down'}`}>{list[0].diff > 0 ? '+' : '−'}{fmtRp(Math.abs(list[0].diff))}</span> : null}
                        {list[0].facilities.length ? <div className="tm">{list[0].facilities.join(', ')}</div> : null}
                      </div>
                      <div className="room-pick-list">
                        {list.map((r) => (
                          <button type="button" role="radio" aria-checked={f.toRoom === r.number} key={r.number}
                            className={`room-pick${f.toRoom === r.number ? ' on' : ''}`} onClick={() => setF((x) => ({ ...x, toRoom: r.number, toTypeId: '' }))}>
                            <strong>{r.number}</strong><span>Lt {r.floor}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="fg" style={{ marginTop: 10 }}>
                  <label className="fl">…atau tipe kamar yang diinginkan (pengelola memilihkan kamarnya)</label>
                  <select className="fi" value={f.toRoom ? '' : f.toTypeId} onChange={(e) => setF((x) => ({ ...x, toTypeId: e.target.value, toRoom: '' }))}>
                    <option value="">—</option>
                    {data.types.map((t) => <option key={t.id} value={t.id}>{t.name} · {fmtRp(t.price)}/bln</option>)}
                  </select>
                </div>

                <div className="fp-sec">Detail</div>
                <div className="g2">
                  <div className="fg"><label className="fl">Tanggal Pindah <span className="req">*</span></label><input type="date" className="fi" min={todayISO()} value={f.moveDate} onChange={set('moveDate')} /></div>
                  <div className="fg"><label className="fl">No. WhatsApp aktif</label><input className="fi" inputMode="tel" placeholder="kosongkan bila sama" value={f.wa} onChange={set('wa')} /></div>
                </div>
                <div className="fg"><label className="fl">Alasan</label>
                  <select className="fi" value={f.reason} onChange={set('reason')}>{REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                </div>
                {f.reason === 'Lainnya' && <div className="fg"><input className="fi" placeholder="Tuliskan alasan" value={f.reasonOther} onChange={set('reasonOther')} /></div>}
                <div className="field-hint">Harga sewa baru mengikuti tipe kamar tujuan. Selisih di bulan berjalan dihitung per hari sejak tanggal pindah.</div>
                {err && <div className="fp-alert" role="alert">⚠️ {err}</div>}
                <button className="btn btn-p fp-submit" type="submit" disabled={busy}>{busy ? 'Mengirim…' : 'Ajukan Pindah Kamar'}</button>
              </form>
            )}
            <button type="button" className="btn btn-g" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }} onClick={() => { setData(null); setErr(''); }}>← Ganti data penghuni</button>
          </>
        )}
      </div>
    </div>
  );
}
