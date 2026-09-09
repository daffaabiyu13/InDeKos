import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { avatarColor, initials, downloadCSV, printReceipt, openWhatsApp } from '../helpers.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';

export default function Pembayaran({ version, onChange }) {
  const [localVer, setLocalVer] = useState(0);
  const { data: payments, loading } = useFetch(() => api.payments(), [version, localVer]);
  const toast = useToast();

  // "Catat Bayar" modal state
  const [payOpen, setPayOpen] = useState(false);
  const [payForm, setPayForm] = useState({ room: '', method: 'Tunai' });

  // QRIS billing form state
  const [billTarget, setBillTarget] = useState('');
  const [billAmount, setBillAmount] = useState('Rp 1.300.000');

  async function markPaid(room, method = 'Tunai') {
    try {
      const p = await api.markPaid({ room, method });
      toast(`✅ Pembayaran ${p.name} ditandai lunas.`);
      setLocalVer((v) => v + 1);
      onChange?.();
      return true;
    } catch (err) {
      toast(`⚠️ ${err.message}`);
      return false;
    }
  }

  if (loading || !payments) return <div className="loading">Memuat pembayaran…</div>;

  const paid = payments.filter((p) => p.status === 'lunas').length;
  const unpaid = payments.length - paid;
  const unpaidList = payments.filter((p) => p.status !== 'lunas');

  function exportCSV() {
    downloadCSV(
      'pembayaran-september-2026.csv',
      payments.map((p) => ({
        Penghuni: p.name, Kamar: p.room, Periode: p.period, Jumlah: p.amount,
        Metode: p.method, 'Tgl Bayar': p.date, Status: p.status === 'lunas' ? 'Lunas' : 'Belum Bayar',
      })),
    );
    toast('📄 Laporan pembayaran diexport (CSV).');
  }

  async function submitCatatBayar() {
    if (!payForm.room) { toast('⚠️ Pilih penghuni terlebih dahulu.'); return; }
    const ok = await markPaid(payForm.room, payForm.method);
    if (ok) { setPayOpen(false); setPayForm({ room: '', method: 'Tunai' }); }
  }

  function kirimTagihan() {
    if (!billTarget) { toast('⚠️ Pilih penghuni terlebih dahulu.'); return; }
    const p = payments.find((x) => `${x.name} — Kamar ${x.room}` === billTarget);
    const resWa = p?.wa || '';
    openWhatsApp(
      resWa,
      `Halo ${p?.name || ''}, ini pengingat pembayaran sewa kamar ${p?.room || ''} sebesar ${billAmount} untuk periode ${p?.period || 'bulan ini'}. Terima kasih.`,
    );
    toast('📱 Membuka WhatsApp untuk mengirim tagihan…');
  }

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
            <button className="btn btn-g btn-sm" onClick={exportCSV}>Export</button>
            <button className="btn btn-p btn-sm" onClick={() => setPayOpen(true)}>+ Catat Bayar</button>
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
                      ? <button className="btn btn-g btn-sm" onClick={() => printReceipt(p)}>📄 Struk</button>
                      : <button className="btn btn-p btn-sm" onClick={() => markPaid(p.room)}>Tandai Lunas</button>}
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
          <button className="btn btn-p btn-sm" onClick={() => toast('🔳 QRIS aktif — tampilkan kode di bawah ke penghuni.')}>Generate QRIS</button>
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
                <select className="fi" value={billTarget} onChange={(e) => setBillTarget(e.target.value)}>
                  <option value="">Pilih penghuni...</option>
                  {unpaidList.map((p, i) => (
                    <option key={i}>{p.name} — Kamar {p.room}</option>
                  ))}
                </select>
              </div>
              <div className="fg"><label className="fl">Nominal</label><input className="fi" value={billAmount} onChange={(e) => setBillAmount(e.target.value)} /></div>
              <button className="btn btn-p" onClick={kirimTagihan}>📱 Kirim via WhatsApp</button>
            </div>
          </div>
        </div>
      </div>

      {payOpen && (
        <div className="mo open" onClick={(e) => e.target === e.currentTarget && setPayOpen(false)}>
          <div className="modal" style={{ width: 420 }}>
            <div className="mh">
              <div className="mt">Catat Pembayaran</div>
              <button className="mc" onClick={() => setPayOpen(false)}><Icons.close /></button>
            </div>
            <div className="mb2">
              <div className="fg">
                <label className="fl">Penghuni (belum bayar) <span className="req">*</span></label>
                <select className="fi" value={payForm.room} onChange={(e) => setPayForm((f) => ({ ...f, room: e.target.value }))}>
                  <option value="">Pilih penghuni...</option>
                  {unpaidList.map((p, i) => (
                    <option key={i} value={p.room}>{p.name} — Kamar {p.room}</option>
                  ))}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">Metode Pembayaran</label>
                <select className="fi" value={payForm.method} onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}>
                  <option>Tunai</option><option>Transfer</option><option>QRIS</option>
                </select>
              </div>
              {unpaidList.length === 0 && (
                <p style={{ fontSize: 12.5, color: 'var(--ok)', marginTop: 12 }}>✓ Semua penghuni sudah lunas bulan ini.</p>
              )}
            </div>
            <div className="mf">
              <button className="btn btn-g" onClick={() => setPayOpen(false)}>Batal</button>
              <button className="btn btn-p" onClick={submitCatatBayar}>Tandai Lunas</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
