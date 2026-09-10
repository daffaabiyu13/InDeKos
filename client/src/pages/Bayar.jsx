import { useEffect, useState } from 'react';
import { api } from '../api.js';

// Public, no-login payment page. A tenant looks up their bill by
// name + room, pays via the generated dynamic QRIS, then confirms —
// which puts the bill into the admin's verification queue.
export default function Bayar() {
  const [step, setStep] = useState('lookup'); // lookup | bill | done
  const [form, setForm] = useState({ name: '', room: '' });
  const [bill, setBill] = useState(null);
  const [method, setMethod] = useState('QRIS');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [kos, setKos] = useState({ namaKos: 'InDeKos' });

  useEffect(() => { api.settings().then(setKos).catch(() => {}); }, []);

  async function lookup(e) {
    e.preventDefault();
    setErr('');
    if (!form.room) { setErr('Nomor kamar wajib diisi.'); return; }
    setBusy(true);
    try {
      const b = await api.bill(form.name, form.room);
      setBill(b);
      setStep('bill');
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await api.confirmPayment({ room: bill.room, method, note });
      setStep('done');
      window.scrollTo(0, 0);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-public">
      <div className="fp-card">
        <div className="fp-head">
          <div className="fp-logo">In</div>
          <div>
            <div className="fp-brand">Inde<em>Kos</em></div>
            <div className="fp-kos">{kos.namaKos} · Pembayaran Sewa</div>
          </div>
        </div>

        {step === 'lookup' && (
          <>
            <div className="fp-intro">
              <h1>Bayar Sewa Kos</h1>
              <p>Masukkan nama dan nomor kamar Anda untuk menampilkan tagihan dan kode pembayaran.</p>
            </div>
            {err && <div className="fp-alert">⚠️ {err}</div>}
            <form onSubmit={lookup}>
              <div className="fg"><label className="fl">Nama Lengkap</label><input className="fi" placeholder="Nama penghuni" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
              <div className="fg"><label className="fl">Nomor Kamar <span className="req">*</span></label><input className="fi" placeholder="mis: 103" value={form.room} onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))} required /></div>
              <button className="btn btn-p fp-submit" type="submit" disabled={busy}>{busy ? 'Mencari...' : 'Cek Tagihan'}</button>
            </form>
          </>
        )}

        {step === 'bill' && bill && (
          <>
            {bill.status === 'lunas' ? (
              <div className="fp-success">
                <div className="fp-success-ico">✅</div>
                <h2>Sudah Lunas</h2>
                <p>Tagihan <strong>{bill.name}</strong> (Kamar {bill.room}) periode {bill.period} sudah tercatat lunas. Terima kasih!</p>
                <button className="btn btn-g" onClick={() => { setStep('lookup'); setBill(null); }}>Kembali</button>
              </div>
            ) : (
              <>
                <div className="fp-intro">
                  <h1>Tagihan Anda</h1>
                  <p>Bayar dengan memindai QRIS di bawah. Nominal sudah termasuk <strong>kode unik</strong> — mohon bayar sesuai jumlah persis.</p>
                </div>

                <div className="pay-bill">
                  <div className="pay-row"><span>Nama</span><strong>{bill.name}</strong></div>
                  <div className="pay-row"><span>Kamar</span><strong>{bill.room}</strong></div>
                  <div className="pay-row"><span>Periode</span><strong>{bill.period}</strong></div>
                  <div className="pay-row pay-total"><span>Total Bayar</span><strong>{bill.amount}</strong></div>
                </div>

                {bill.status === 'menunggu' && (
                  <div className="fp-alert" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
                    ⏳ Pembayaran Anda sudah dilaporkan dan sedang menunggu verifikasi admin.
                  </div>
                )}

                {bill.qrImage ? (
                  <div className="pay-qr">
                    <img src={bill.qrImage} alt="QRIS Pembayaran" width="240" height="240" />
                    <div className="pay-qr-cap">Scan dengan GoPay, OVO, DANA, ShopeePay, m-banking, atau e-wallet lain (QRIS)</div>
                  </div>
                ) : (
                  <div className="fp-alert" style={{ background: 'var(--pebble-bg)', color: 'var(--pebble-d)' }}>
                    ℹ️ QRIS belum dikonfigurasi admin. Silakan bayar sesuai instruksi admin, lalu tekan tombol di bawah.
                  </div>
                )}

                <div className="fp-sec">Konfirmasi Pembayaran</div>
                {err && <div className="fp-alert">⚠️ {err}</div>}
                <div className="fg">
                  <label className="fl">Metode Pembayaran</label>
                  <select className="fi" value={method} onChange={(e) => setMethod(e.target.value)}>
                    <option>QRIS</option><option>Transfer</option><option>Tunai</option>
                  </select>
                </div>
                <div className="fg">
                  <label className="fl">Catatan (opsional)</label>
                  <input className="fi" placeholder="mis: a.n. Budi, bayar 10 Sep" value={note} onChange={(e) => setNote(e.target.value)} />
                </div>
                <button className="btn btn-p fp-submit" onClick={confirm} disabled={busy}>
                  {busy ? 'Mengirim...' : 'Saya Sudah Bayar'}
                </button>
                <p className="fp-note">Setelah dikonfirmasi, admin akan memverifikasi pembayaran Anda.</p>
                <button className="btn btn-g" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} onClick={() => { setStep('lookup'); setBill(null); }}>Kembali</button>
              </>
            )}
          </>
        )}

        {step === 'done' && (
          <div className="fp-success">
            <div className="fp-success-ico">🎉</div>
            <h2>Konfirmasi Terkirim!</h2>
            <p>Terima kasih. Laporan pembayaran Anda untuk <strong>Kamar {bill?.room}</strong> sudah kami terima dan sedang <strong>menunggu verifikasi admin</strong>. Status akan berubah menjadi Lunas setelah diverifikasi.</p>
            <button className="btn btn-p" onClick={() => { setStep('lookup'); setBill(null); setForm({ name: '', room: '' }); setNote(''); }}>Selesai</button>
          </div>
        )}
      </div>
    </div>
  );
}
