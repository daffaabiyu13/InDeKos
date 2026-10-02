import { useState } from 'react';
import { api, fileUrl } from '../api.js';
import { useFetch } from '../useFetch.js';
import { fmtRp, fmtDate, todayISO, compressImage, BULAN_PANJANG } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { Icons } from '../components/icons.jsx';
import Modal from '../components/Modal.jsx';
import PhotoInput from '../components/PhotoInput.jsx';

const CATS = ['Utilitas', 'Perawatan', 'Kebersihan', 'Lainnya'];

export default function Pengeluaran({ version, onChange }) {
  const [ver, setVer] = useState(0);
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const { data: expenses, loading } = useFetch(() => api.expenses(month), [version, ver, month]);
  const [modal, setModal] = useState(null); // 'manual' | 'scan'
  const toast = useToast();
  const confirm = useConfirm();
  const reload = () => { setVer((v) => v + 1); onChange?.(); };

  async function remove(e) {
    if (!(await confirm({ title: 'Hapus Pengeluaran', message: `Hapus "${e.description}" (${fmtRp(e.amount)})?`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteExpense(e.id); toast('Pengeluaran dihapus.'); reload(); } catch (err) { toast(`⚠️ ${err.message}`); }
  }

  const [y, m] = month.split('-').map(Number);
  const total = (expenses || []).reduce((a, e) => a + e.amount, 0);

  return (
    <>
      <div className="fr">
        <input type="month" className="fi" style={{ width: 'auto' }} value={month} onChange={(e) => setMonth(e.target.value || todayISO().slice(0, 7))} aria-label="Bulan" />
        <span className="tm">Total {BULAN_PANJANG[m - 1]} {y}: <strong style={{ color: 'var(--t1)' }}>{fmtRp(total)}</strong></span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
          <button className="btn btn-g btn-sm" onClick={() => setModal('manual')}>+ Input Manual</button>
          <button className="btn btn-p btn-sm" onClick={() => setModal('scan')}><Icons.scan /> Scan Struk</button>
        </div>
      </div>

      <div className="card">
        <div className="tw">
          <table>
            <thead><tr><th>Tanggal</th><th>Keterangan</th><th>Kategori</th><th>Jumlah</th><th>Sumber</th><th>Bukti</th><th /></tr></thead>
            <tbody>
              {loading && <tr><td colSpan="7" className="empty">Memuat…</td></tr>}
              {!loading && expenses?.length === 0 && <tr><td colSpan="7" className="empty">Belum ada pengeluaran bulan ini</td></tr>}
              {expenses?.map((e) => (
                <tr key={e.id}>
                  <td className="tm">{fmtDate(e.date)}</td>
                  <td><div className="tn">{e.description}</div>{e.merchant && <div className="tm">{e.merchant}</div>}</td>
                  <td><span className="badge b-neu">{e.cat}</span></td>
                  <td style={{ fontWeight: 700, color: 'var(--err)' }}>{fmtRp(e.amount)}</td>
                  <td>{e.source === 'scan' ? <span className="badge b-pebble">📷 Scan</span> : e.source === 'perbaikan' ? <span className="badge b-warn" title="Otomatis dari Perbaikan Kamar">🛠️ Perbaikan</span> : <span className="badge b-neu">Manual</span>}</td>
                  <td>{e.receiptPhoto ? <a className="btn btn-g btn-sm" href={fileUrl(e.receiptPhoto)} target="_blank" rel="noreferrer">📎 Lihat</a> : <span className="tm">—</span>}</td>
                  <td><button className="btn btn-g btn-sm" onClick={() => remove(e)} aria-label="Hapus">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {modal === 'manual' && <ExpenseModal onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'scan' && <ScanModal onClose={() => setModal(null)} onDone={reload} />}
    </>
  );
}

function ExpenseForm({ f, setF }) {
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  return (
    <>
      <div className="fg"><label className="fl">Keterangan <span className="req">*</span></label><input className="fi" placeholder="mis. Tagihan listrik PLN" value={f.description} onChange={set('description')} /></div>
      <div className="g2">
        <div className="fg"><label className="fl">Nominal <span className="req">*</span></label><input className="fi" inputMode="numeric" value={f.amount} onChange={set('amount')} />
          {f.amount ? <div className="field-hint">{fmtRp(String(f.amount).replace(/\D/g, ''))}</div> : null}</div>
        <div className="fg"><label className="fl">Tanggal</label><input type="date" className="fi" value={f.date} onChange={set('date')} /></div>
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Kategori</label><select className="fi" value={f.cat} onChange={set('cat')}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="fg"><label className="fl">Toko / penerima</label><input className="fi" value={f.merchant} onChange={set('merchant')} /></div>
      </div>
    </>
  );
}

async function saveExpense(f, source, toast) {
  const amount = Number(String(f.amount).replace(/\D/g, ''));
  if (!f.description.trim() || !amount) { toast('⚠️ Keterangan & nominal wajib diisi.'); return false; }
  await api.addExpense({ ...f, amount, source });
  toast('✅ Pengeluaran dicatat.');
  return true;
}

function ExpenseModal({ onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ description: '', amount: '', date: todayISO(), cat: 'Utilitas', merchant: '', receiptPhoto: '' });
  async function save() {
    try { if (await saveExpense(f, 'manual', toast)) { onDone(); onClose(); } } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <Modal title="Input Pengeluaran Manual" onClose={onClose} width={480} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button><button className="btn btn-p" onClick={save}>Simpan</button>
    </>}>
      <ExpenseForm f={f} setF={setF} />
      <PhotoInput label="Foto bukti / nota (opsional)" capture="environment" value={f.receiptPhoto} onChange={(v) => setF((x) => ({ ...x, receiptPhoto: v }))} />
    </Modal>
  );
}

function ScanModal({ onClose, onDone }) {
  const toast = useToast();
  const [photo, setPhoto] = useState('');
  const [progress, setProgress] = useState(null); // null | 0..100
  const [result, setResult] = useState(null);
  const [showText, setShowText] = useState(false);
  const [f, setF] = useState(null);

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let dataUrl = '';
    try {
      // Resolusi lebih tinggi agar teks struk terbaca OCR.
      dataUrl = await compressImage(file, 1800, 0.9);
      setPhoto(dataUrl);
      setResult(null);
      setProgress(0);
      const { scanReceipt } = await import('../ocr.js');
      const r = await scanReceipt(dataUrl, setProgress);
      setResult(r);
      setF({ description: r.merchant ? `Belanja ${r.merchant}` : '', amount: r.amount ? String(r.amount) : '', date: r.date || todayISO(), cat: r.cat, merchant: r.merchant, receiptPhoto: dataUrl });
      if (!r.amount) toast('Total belum terbaca otomatis — isi nominal secara manual.');
    } catch (err) {
      toast(`⚠️ Scan gagal: ${err.message}. Anda tetap bisa mengisi manual.`);
      setF({ description: '', amount: '', date: todayISO(), cat: 'Lainnya', merchant: '', receiptPhoto: dataUrl });
    } finally {
      setProgress(null);
    }
  }

  async function save() {
    try { if (await saveExpense(f, 'scan', toast)) { onDone(); onClose(); } } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <Modal title="Scan Struk Pengeluaran" onClose={onClose} width={640} footer={f && <>
      <button className="btn btn-g" onClick={onClose}>Batal</button><button className="btn btn-p" onClick={save}>Simpan Pengeluaran</button>
    </>}>
      {!photo && (
        <label className="scan-drop">
          <Icons.camera />
          <strong>Foto atau pilih gambar struk</strong>
          <span>Letakkan struk di permukaan rata, cahaya cukup, seluruh struk terlihat.</span>
          <input type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        </label>
      )}
      {photo && (
        <div className="scan-grid">
          <div>
            <img src={photo} alt="Struk" className="scan-img" />
            <label className="btn btn-g btn-sm" style={{ marginTop: 8 }}>Scan ulang<input type="file" accept="image/*" capture="environment" hidden onChange={pick} /></label>
          </div>
          <div>
            {progress !== null && (
              <div>
                <div className="tm" style={{ marginBottom: 6 }}>Membaca struk… {progress}% <span className="field-hint">(pertama kali mengunduh data bahasa, mohon tunggu)</span></div>
                <div className="prog"><div className="pf" style={{ width: `${progress}%`, background: 'var(--jade)' }} /></div>
              </div>
            )}
            {f && (
              <>
                {result && <div className="fp-alert" style={{ background: 'var(--jade-bg)', color: 'var(--jade-d)' }}>✨ Terisi otomatis dari struk (akurasi OCR {result.confidence}%). Periksa sebelum menyimpan.</div>}
                <ExpenseForm f={f} setF={setF} />
                {result?.text && (
                  <>
                    <button className="btn btn-g btn-sm" onClick={() => setShowText((s) => !s)}>{showText ? 'Sembunyikan' : 'Lihat'} teks hasil scan</button>
                    {showText && <pre className="ocr-text">{result.text}</pre>}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
