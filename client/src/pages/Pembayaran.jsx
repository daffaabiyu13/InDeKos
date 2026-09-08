import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { avatarColor, initials } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';

export default function Pembayaran({ version, onChange }) {
  const [localVer, setLocalVer] = useState(0);
  const { data: payments, loading } = useFetch(() => api.payments(), [version, localVer]);
  const toast = useToast();

  async function markPaid(p) {
    try {
      await api.markPaid({ room: p.room, method: 'Tunai' });
      toast(`✅ Pembayaran ${p.name} ditandai lunas.`);
      setLocalVer((v) => v + 1);
      onChange?.();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    }
  }

  if (loading || !payments) return <div className="loading">Memuat pembayaran…</div>;

  const paid = payments.filter((p) => p.status === 'lunas').length;
  const unpaid = payments.length - paid;

  return (
    <>
      <div className="sg3">
        <div className="tile"><div className="tile-lbl">Lunas Bulan Ini</div><div className="tile-val ok">{paid}</div><div className="tile-ch">dari {payments.length} penghuni</div></div>
        <div className="tile"><div className="tile-lbl">Total Diterima</div><div className="tile-val cor" style={{ fontSize: 20 }}>Rp 15,6 Jt</div><div className="tile-ch">September 2026</div></div>
        <div className="tile"><div className="tile-lbl">Belum Bayar</div><div className="tile-val warn">{unpaid}</div><div className="tile-ch dn">jatuh tempo terlewat</div></div>
      </div>

      <div className="card mb">
        <div className="ch">
          <div><div className="ct">Riwayat Pembayaran · September 2026</div></div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn btn-g btn-sm">Export</button>
            <button className="btn btn-p btn-sm">+ Catat Bayar</button>
          </div>
        </div>
        <div className="tw">
          <table>
            <thead><tr><th>Penghuni</th><th>Kamar</th><th>Periode</th><th>Jumlah</th><th>Metode</th><th>Tgl Bayar</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={i}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="av" style={{ background: avatarColor(p.name), color: '#fff', width: 26, height: 26, fontSize: 10 }}>{initials(p.name)}</div>
                      <span className="tn">{p.name}</span>
                    </div>
                  </td>
                  <td><span className="badge b-neu">{p.room}</span></td>
                  <td className="tm">{p.period}</td>
                  <td style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{p.amount}</td>
                  <td className="tm">{p.method}</td>
                  <td className="tm">{p.date}</td>
                  <td>{p.status === 'lunas' ? <span className="badge b-ok">Lunas</span> : <span className="badge b-err">Belum Bayar</span>}</td>
                  <td>
                    {p.status === 'lunas'
                      ? <button className="btn btn-g btn-sm">📄 Struk</button>
                      : <button className="btn btn-p btn-sm" onClick={() => markPaid(p)}>Tandai Lunas</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="ch">
          <div><div className="ct">Pembayaran QRIS</div><div className="cs">Kirim tagihan atau tampilkan QR langsung ke penghuni</div></div>
          <button className="btn btn-p btn-sm">Generate QRIS</button>
        </div>
        <div className="cb">
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 146, height: 146, border: '2px solid var(--bdr)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 7, background: 'var(--surf2)' }}>
                <svg width="76" height="76" viewBox="0 0 76 76">
                  <rect x="4" y="4" width="28" height="28" fill="none" stroke="var(--jade)" strokeWidth="4" />
                  <rect x="11" y="11" width="14" height="14" fill="var(--jade)" />
                  <rect x="44" y="4" width="28" height="28" fill="none" stroke="var(--jade)" strokeWidth="4" />
                  <rect x="51" y="11" width="14" height="14" fill="var(--jade)" />
                  <rect x="4" y="44" width="28" height="28" fill="none" stroke="var(--jade)" strokeWidth="4" />
                  <rect x="11" y="51" width="14" height="14" fill="var(--jade)" />
                  <rect x="44" y="44" width="8" height="8" fill="var(--jade)" />
                  <rect x="56" y="44" width="8" height="8" fill="var(--jade)" />
                  <rect x="44" y="56" width="8" height="8" fill="var(--jade)" />
                  <rect x="64" y="56" width="8" height="8" fill="var(--jade)" />
                  <rect x="44" y="64" width="8" height="8" fill="var(--jade)" />
                </svg>
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t2)' }}>QRIS InDeKos</div>
              <div style={{ fontSize: 11, color: 'var(--t3)' }}>Berlaku semua kamar</div>
            </div>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Kirim Tagihan ke Penghuni</div>
              <div className="fg">
                <label className="fl">Pilih Penghuni</label>
                <select className="fi">
                  <option>Pilih penghuni...</option>
                  {payments.filter((p) => p.status !== 'lunas').map((p, i) => (
                    <option key={i}>{p.name} — Kamar {p.room}</option>
                  ))}
                </select>
              </div>
              <div className="fg"><label className="fl">Nominal</label><input className="fi" defaultValue="Rp 1.300.000" /></div>
              <button className="btn btn-p">📱 Kirim via WhatsApp</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
