import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Pengeluaran({ version, onChange }) {
  const [localVer, setLocalVer] = useState(0);
  const { data: expenses, loading } = useFetch(() => api.expenses(), [version, localVer]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ desc: '', cat: 'Utilitas', amount: '', date: '' });
  const toast = useToast();

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.desc || !form.amount) {
      toast('⚠️ Keterangan dan jumlah wajib diisi.');
      return;
    }
    const amount = form.amount.startsWith('Rp') ? form.amount : `Rp ${form.amount}`;
    try {
      await api.addExpense({
        desc: form.desc,
        cat: form.cat,
        amount,
        date: form.date ? form.date.split('-').reverse().join('/') : '',
      });
      toast('✅ Pengeluaran berhasil dicatat.');
      setForm({ desc: '', cat: 'Utilitas', amount: '', date: '' });
      setOpen(false);
      setLocalVer((v) => v + 1);
      onChange?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  if (loading || !expenses) return <div className="loading">Memuat pengeluaran…</div>;

  return (
    <>
      <div className="fr">
        <div className="chip on">September 2026</div>
        <div className="chip">Harian</div>
        <div className="chip">Bulanan</div>
        <div className="chip">Tahunan</div>
        <div style={{ marginLeft: 'auto' }}><button className="btn btn-p btn-sm" onClick={() => setOpen(true)}>+ Catat Pengeluaran</button></div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jumlah</th><th>Bukti</th></tr></thead>
            <tbody>
              {expenses.map((e, i) => (
                <tr key={i}>
                  <td className="tm">{e.date}</td>
                  <td className="tn">{e.desc}</td>
                  <td><span className="badge b-neu">{e.cat}</span></td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--err)' }}>{e.amount}</td>
                  <td><button className="btn btn-g btn-sm" onClick={() => toast('📎 Belum ada bukti/foto nota terlampir untuk transaksi ini.')}>📎 Lihat</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {open && (
        <div className="mo open" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="mh">
              <div className="mt">Catat Pengeluaran</div>
              <button className="mc" onClick={() => setOpen(false)}><Icons.close /></button>
            </div>
            <div className="mb2">
              <div className="fg"><label className="fl">Keterangan <span className="req">*</span></label><input className="fi" placeholder="mis: Tagihan Listrik PLN" value={form.desc} onChange={set('desc')} /></div>
              <div className="fg">
                <label className="fl">Kategori</label>
                <select className="fi" value={form.cat} onChange={set('cat')}>
                  <option>Utilitas</option><option>Perawatan</option><option>Kebersihan</option><option>Lainnya</option>
                </select>
              </div>
              <div className="fg"><label className="fl">Nominal <span className="req">*</span></label><input className="fi" placeholder="mis: 1.450.000" value={form.amount} onChange={set('amount')} /></div>
              <div className="fg" style={{ marginBottom: 0 }}><label className="fl">Tanggal</label><input type="date" className="fi" value={form.date} onChange={set('date')} /></div>
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
