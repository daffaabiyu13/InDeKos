import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import {
  avatarColor, initials, openWhatsApp, fmtDate, fmtRp, todayISO, monthsBetween,
  PAY_STATUS, INVOICE_STATE, KIND_LABEL, stars,
} from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { useAuth } from '../components/Auth.jsx';
import Modal from '../components/Modal.jsx';
import FaceCheck from '../components/FaceCheck.jsx';
import StayInput, { StayPill } from '../components/StayInput.jsx';

const TABS = [
  ['tagihan', 'Tagihan'],
  ['penagihan', 'Pengaturan Penagihan'],
  ['charge', 'Charge & Denda'],
  ['profil', 'Profil & Dokumen'],
  ['pelanggaran', 'Pelanggaran'],
];

export default function ResidentDetail({ version, onChange }) {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [ver, setVer] = useState(0);
  const { data: r, loading, error } = useFetch(() => api.resident(id), [id, version, ver]);
  const [tab, setTab] = useState('tagihan');
  const [modal, setModal] = useState(null); // 'pay' | 'promo' | 'checkout'
  const [payInv, setPayInv] = useState(null);
  const reload = () => { setVer((v) => v + 1); onChange?.(); };

  if (error) return <div className="loading">⚠️ {error.message} <button className="btn btn-g btn-sm" onClick={() => nav('/penghuni')}>Kembali</button></div>;
  if (loading || !r) return <div className="loading">Memuat data penghuni…</div>;

  const st = PAY_STATUS[r.payStatus] || PAY_STATUS.lunas;

  return (
    <>
      <button className="btn btn-g btn-sm" style={{ marginBottom: 12 }} onClick={() => nav('/penghuni')}>← Semua penghuni</button>

      <div className="card mb">
        <div className="cb res-head">
          <div className="av" style={{ width: 54, height: 54, fontSize: 18, background: avatarColor(r.name), color: '#fff' }}>{initials(r.name)}</div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{r.name}</div>
            <div className="tm">Kamar <strong>{r.room}</strong> · {r.roomType || 'Tanpa tipe'} · masuk {fmtDate(r.masuk)} ({monthsBetween(r.masuk, todayISO())} bln)</div>
            <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className={`badge ${st.cls}`}>{st.label}</span>
              <span className="badge b-neu">Jatuh tempo tgl {r.dueDay}</span>
              {r.dailyRateEnabled ? <span className="badge b-pebble">Rate harian {fmtRp(r.dailyRateAmount)}</span> : null}
              {r.deferUntil ? <span className="badge b-pebble">Tangguh s/d {fmtDate(r.deferUntil)}</span> : null}
              {!r.reminderEnabled && <span className="badge b-neu">Reminder off</span>}
              <StayPill r={r} />
            </div>
          </div>
          <div className="res-actions">
            <button className="btn btn-g btn-sm" onClick={() => openWhatsApp(r.wa, `Halo ${r.name}, `)}>WhatsApp</button>
            <button className="btn btn-g btn-sm" onClick={() => setModal('promo')}>🎁 Terapkan Promo</button>
            <button className="btn btn-g btn-sm" onClick={() => setTab('charge')}>+ Charge / Denda</button>
            <button className="btn btn-d btn-sm" onClick={() => setModal('checkout')}>Proses Keluar</button>
          </div>
        </div>
      </div>

      <div className="sg">
        <div className="tile t-cor"><div className="tile-lbl">Sewa / bulan</div><div className="tile-val cor" style={{ fontSize: 20 }}>{fmtRp(r.rentAmount)}</div><div className="tile-ch">{r.rent ? 'harga khusus' : `harga tipe ${r.roomType}`}</div></div>
        <div className="tile t-warn"><div className="tile-lbl">Tunggakan</div><div className="tile-val warn" style={{ fontSize: 20 }}>{fmtRp(r.outstanding)}</div><div className="tile-ch">{r.overdueCount} invoice terlambat</div></div>
        <div className="tile t-blue"><div className="tile-lbl">Jatuh tempo berikut</div><div className="tile-val blue" style={{ fontSize: 20 }}>{r.nextDue ? fmtDate(r.nextDue) : '—'}</div><div className="tile-ch">{r.openCount} invoice terbuka</div></div>
        <div className="tile t-ok"><div className="tile-lbl">Charge aktif</div><div className="tile-val ok" style={{ fontSize: 20 }}>{r.charges.filter((c) => c.active).length}</div><div className="tile-ch">{r.violations.length} pelanggaran tercatat</div></div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === 'tagihan' && <InvoicesTab r={r} reload={reload} onPay={(inv) => { setPayInv(inv); setModal('pay'); }} />}
      {tab === 'penagihan' && <BillingTab r={r} reload={reload} />}
      {tab === 'charge' && <ChargesTab r={r} reload={reload} />}
      {tab === 'profil' && <ProfileTab r={r} reload={reload} />}
      {tab === 'pelanggaran' && <ViolationsTab r={r} />}

      {modal === 'pay' && payInv && <PayModal inv={payInv} onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'promo' && <PromoModal r={r} onClose={() => setModal(null)} onDone={reload} />}
      {modal === 'checkout' && <CheckoutModal r={r} onClose={() => setModal(null)} onDone={() => { onChange?.(); toast(`✅ ${r.name} dipindahkan ke arsip mantan penghuni.`); nav('/mantan'); }} />}
    </>
  );
}

// ── Tagihan ──
export function InvoiceActions({ inv, reload, onPay }) {
  const toast = useToast();
  const confirm = useConfirm();
  async function send(kind) {
    try {
      const res = await api.sendInvoice(inv.id, kind);
      if (res.via === 'link') { window.open(res.link, '_blank', 'noopener'); toast('Gateway WA belum diatur — membuka WhatsApp manual.'); }
      else toast(`✅ ${kind === 'reminder' ? 'Reminder' : 'Invoice'} terkirim via WhatsApp.`);
      reload?.();
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function voidIt() {
    if (!(await confirm({ title: 'Batalkan Invoice', message: `Batalkan ${inv.number}? Invoice tidak akan ditagihkan lagi.`, confirmText: 'Ya, batalkan', danger: true }))) return;
    try { await api.voidInvoice(inv.id); toast('Invoice dibatalkan.'); reload?.(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function reject() {
    try { await api.rejectInvoice(inv.id); toast('Klaim pembayaran ditolak, invoice kembali belum dibayar.'); reload?.(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  const open = inv.status === 'unpaid' || inv.status === 'menunggu';
  return (
    <div className="row-actions">
      {open && <button className="btn btn-p btn-sm" onClick={() => onPay(inv)}>{inv.status === 'menunggu' ? 'Verifikasi' : 'Tandai Lunas'}</button>}
      {inv.status === 'menunggu' && <button className="btn btn-d btn-sm" onClick={reject}>Tolak</button>}
      {inv.status === 'unpaid' && <button className="btn btn-g btn-sm" onClick={() => send('invoice')} title="Kirim invoice via WhatsApp">Kirim</button>}
      {inv.status === 'unpaid' && <button className="btn btn-g btn-sm" onClick={() => send('reminder')} title="Kirim pengingat">🔔</button>}
      <a className="btn btn-g btn-sm" href={`/invoice/${inv.publicId}`} target="_blank" rel="noreferrer">Lihat</a>
      {inv.status === 'unpaid' && <button className="btn btn-g btn-sm" onClick={voidIt} title="Batalkan">✕</button>}
    </div>
  );
}

function InvoicesTab({ r, reload, onPay }) {
  const [show, setShow] = useState('open');
  const list = r.invoices.filter((i) => show === 'all' || (show === 'open' ? ['unpaid', 'menunggu'].includes(i.status) : i.status === 'paid'));
  return (
    <div className="card">
      <div className="ch">
        <div><div className="ct">Invoice</div><div className="cs">Satu invoice per periode — tunggakan antar bulan tetap tercatat terpisah</div></div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['open', 'Belum lunas'], ['paid', 'Lunas'], ['all', 'Semua']].map(([k, l]) => (
            <button key={k} className={`chip${show === k ? ' on' : ''}`} onClick={() => setShow(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>No. Invoice</th><th>Jenis</th><th>Keterangan</th><th>Jatuh Tempo</th><th>Jumlah</th><th>Status</th><th>Aksi</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan="7" className="empty">Tidak ada invoice</td></tr>}
            {list.map((i) => (
              <tr key={i.id}>
                <td className="tn" style={{ whiteSpace: 'nowrap' }}>{i.number}</td>
                <td><span className={`badge ${i.kind === 'sewa' ? 'b-cor' : i.kind === 'denda' ? 'b-err' : 'b-warn'}`}>{KIND_LABEL[i.kind]}</span>{i.promoId ? <span className="badge b-ok" style={{ marginLeft: 4 }}>Promo</span> : null}</td>
                <td style={{ maxWidth: 260, fontSize: 12.5 }}>{i.description}</td>
                <td className="tm">{fmtDate(i.dueDate)}{i.daysLate ? <div style={{ color: 'var(--err)' }}>+{i.daysLate} hari</div> : null}</td>
                <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRp(i.amount)}{i.status === 'paid' && <div className="tm">{i.method} · {fmtDate(i.paidAt)}</div>}</td>
                <td><span className={`badge ${INVOICE_STATE[i.state].cls}`}>{INVOICE_STATE[i.state].label}</span></td>
                <td><InvoiceActions inv={i} reload={reload} onPay={onPay} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PayModal({ inv, onClose, onDone }) {
  const toast = useToast();
  const [method, setMethod] = useState(inv.method || 'Transfer');
  const [paidAt, setPaidAt] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      await api.payInvoice(inv.id, { method, paidAt });
      toast(`✅ ${inv.number} tercatat lunas.`);
      onDone?.();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); } finally { setBusy(false); }
  }
  return (
    <Modal title={inv.status === 'menunggu' ? 'Verifikasi Pembayaran' : 'Catat Pembayaran'} onClose={onClose} width={440} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={submit} disabled={busy}>{busy ? 'Menyimpan…' : 'Tandai Lunas'}</button>
    </>}>
      <div className="pay-bill">
        <div className="pay-row"><span>Invoice</span><strong>{inv.number}</strong></div>
        <div className="pay-row"><span>Penghuni</span><strong>{inv.name} · Kamar {inv.room}</strong></div>
        <div className="pay-row"><span>Keterangan</span><strong style={{ textAlign: 'right', maxWidth: 240 }}>{inv.description}</strong></div>
        <div className="pay-row pay-total"><span>Nominal</span><strong>{fmtRp(inv.amount)}</strong></div>
        {inv.uniqueCode ? <div className="pay-row"><span>Jika via QRIS/transfer dgn kode unik</span><strong>{fmtRp(inv.total)}</strong></div> : null}
      </div>
      {inv.status === 'menunggu' && (
        <div className="fp-alert" style={{ background: 'var(--warn-bg)', color: 'var(--warn)' }}>
          Penghuni melaporkan sudah bayar via <strong>{inv.method}</strong>{inv.note ? ` — “${inv.note}”` : ''}. Cek mutasi/aplikasi merchant sebelum verifikasi.
        </div>
      )}
      <div className="g2">
        <div className="fg"><label className="fl">Metode</label>
          <select className="fi" value={method} onChange={(e) => setMethod(e.target.value)}><option>QRIS</option><option>Transfer</option><option>Tunai</option></select>
        </div>
        <div className="fg"><label className="fl">Tanggal Bayar</label><input type="date" className="fi" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></div>
      </div>
    </Modal>
  );
}

// ── Pengaturan penagihan ──
function BillingTab({ r, reload }) {
  const toast = useToast();
  const { isPemilik } = useAuth();
  const [f, setF] = useState({
    dueDay: r.dueDay, rent: r.rent || '', dailyRateEnabled: Boolean(r.dailyRateEnabled), dailyRate: r.dailyRate || '',
    deferUntil: r.deferUntil || '', reminderEnabled: Boolean(r.reminderEnabled), stayMonths: r.stayMonths ?? null,
  });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function save() {
    const body = { dueDay: Number(f.dueDay), dailyRateEnabled: f.dailyRateEnabled, dailyRate: f.dailyRate ? Number(f.dailyRate) : null, deferUntil: f.deferUntil, reminderEnabled: f.reminderEnabled, stayMonths: f.stayMonths };
    if (isPemilik) body.rent = f.rent ? Number(String(f.rent).replace(/\D/g, '')) : null;
    try { await api.updateResident(r.id, body); toast('✅ Pengaturan penagihan disimpan.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <div className="g2">
      <div className="card">
        <div className="ch"><div><div className="ct">Jadwal & Tarif</div><div className="cs">Berlaku khusus untuk penghuni ini</div></div></div>
        <div className="cb">
          <div className="fg">
            <label className="fl">Tanggal jatuh tempo tiap bulan</label>
            <select className="fi" value={f.dueDay} onChange={set('dueDay')}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Tanggal {d}{d === Number(r.masuk.slice(8, 10)) ? ' (tanggal masuk)' : ''}</option>)}
            </select>
            <div className="field-hint">Periode sewa: tgl {f.dueDay} s/d sehari sebelum tgl {f.dueDay} bulan berikutnya. Untuk tanggal 29–31, bulan pendek memakai hari terakhir.</div>
          </div>
          <div className="fg">
            <label className="fl">Harga sewa khusus {!isPemilik && <span className="tm">(hanya pemilik)</span>}</label>
            <input className="fi" inputMode="numeric" disabled={!isPemilik} placeholder={`Kosong = ikut harga tipe (${fmtRp(r.rentAmount)})`} value={f.rent} onChange={set('rent')} />
          </div>
          <StayInput value={f.stayMonths} masuk={r.stayStart || r.masuk} onChange={(v) => setF((x) => ({ ...x, stayMonths: v }))}
            hint={`Dihitung mulai ${fmtDate(r.stayStart || r.masuk)}${r.stayStart && r.stayStart !== r.masuk ? ' (tanggal rencana diisi otomatis)' : ' (tanggal masuk)'}. Bila penghuni memperpanjang, tambah angkanya. AI akan mengingatkan menjelang selesai.`} />
          <div className="fg">
            <label className="switch-row"><input type="checkbox" checked={f.dailyRateEnabled} onChange={set('dailyRateEnabled')} /> Aktifkan rate harian</label>
            <div className="field-hint">Hari di luar periode penuh (masuk/keluar di tengah periode) ditagih per hari, sehingga tidak ada hari yang tidak dibayar. Jika nonaktif, hari tersebut tidak ditagih.</div>
            {f.dailyRateEnabled && <input className="fi" style={{ marginTop: 8 }} inputMode="numeric" placeholder={`Rate per hari (kosong = default ${fmtRp(r.dailyRateAmount)})`} value={f.dailyRate} onChange={set('dailyRate')} />}
          </div>
        </div>
      </div>
      <div className="card">
        <div className="ch"><div><div className="ct">Penangguhan & Reminder</div><div className="cs">Penghuni ingin menunggak sampai tanggal tertentu</div></div></div>
        <div className="cb">
          <div className="fg">
            <label className="fl">Tangguhkan pembayaran sampai</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="date" className="fi" value={f.deferUntil} min={todayISO()} onChange={set('deferUntil')} />
              {f.deferUntil && <button className="btn btn-g btn-sm" onClick={() => setF((x) => ({ ...x, deferUntil: '' }))}>Hapus</button>}
            </div>
            <div className="field-hint">
              Invoice <strong>tetap terbit tiap periode</strong> (mis. menunggak Mei s/d Juni → tetap ada 2 invoice: Mei & Juni).
              Selama masa tangguh, status tampil “Ditangguhkan” (bukan terlambat) dan reminder ditahan.
            </div>
          </div>
          <div className="fg">
            <label className="switch-row"><input type="checkbox" checked={f.reminderEnabled} onChange={set('reminderEnabled')} /> Kirim reminder WhatsApp sebelum jatuh tempo</label>
            <div className="field-hint">Jadwal (mis. H-3) & aktif/nonaktif global diatur pemilik di Pengaturan → WhatsApp.</div>
          </div>
          <button className="btn btn-p" onClick={save}>Simpan Pengaturan Penagihan</button>
        </div>
      </div>
    </div>
  );
}

// ── Charge & denda ──
function ChargesTab({ r, reload }) {
  const toast = useToast();
  const [f, setF] = useState({ kind: 'charge', name: '', amount: '', recurring: true, billDay: r.dueDay, startDate: todayISO(), endDate: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function add() {
    if (!f.name.trim() || !f.amount) { toast('⚠️ Nama & nominal wajib diisi.'); return; }
    try {
      await api.addCharge({ ...f, residentId: r.id, amount: Number(String(f.amount).replace(/\D/g, '')), billDay: Number(f.billDay) });
      toast(`✅ ${f.kind === 'denda' ? 'Denda' : 'Charge'} ditambahkan — invoice terpisah dibuat.`);
      setF((x) => ({ ...x, name: '', amount: '' }));
      reload();
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function toggle(c) {
    try { await api.updateCharge(c.id, { active: !c.active }); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <div className="g2">
      <div className="card">
        <div className="ch"><div><div className="ct">Tambah Charge / Denda</div><div className="cs">Ditagih dengan invoice terpisah, bisa ditambahkan kapan saja</div></div></div>
        <div className="cb">
          <div className="g2">
            <div className="fg"><label className="fl">Jenis</label>
              <select className="fi" value={f.kind} onChange={set('kind')}><option value="charge">Charge (mis. watt berlebih)</option><option value="denda">Denda</option></select>
            </div>
            <div className="fg"><label className="fl">Nominal</label><input className="fi" inputMode="numeric" placeholder="50000" value={f.amount} onChange={set('amount')} /></div>
          </div>
          <div className="fg"><label className="fl">Keterangan</label><input className="fi" placeholder="mis. Heater & rice cooker (watt berlebih)" value={f.name} onChange={set('name')} /></div>
          <label className="switch-row fg"><input type="checkbox" checked={f.recurring} onChange={set('recurring')} /> Tagih setiap bulan</label>
          <div className="g2">
            <div className="fg"><label className="fl">{f.recurring ? 'Mulai' : 'Tanggal tagih'}</label><input type="date" className="fi" value={f.startDate} onChange={set('startDate')} /></div>
            {f.recurring && (
              <div className="fg"><label className="fl">Ditagih tiap tanggal</label>
                <select className="fi" value={f.billDay} onChange={set('billDay')}>{Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</select>
              </div>
            )}
          </div>
          {f.recurring && <div className="fg"><label className="fl">Berakhir (opsional)</label><input type="date" className="fi" value={f.endDate} onChange={set('endDate')} /></div>}
          <button className="btn btn-p" onClick={add}>Tambahkan</button>
        </div>
      </div>
      <div className="card">
        <div className="ch"><div className="ct">Daftar Charge & Denda</div></div>
        <div className="tw">
          <table>
            <thead><tr><th>Keterangan</th><th>Nominal</th><th>Jadwal</th><th>Status</th></tr></thead>
            <tbody>
              {r.charges.length === 0 && <tr><td colSpan="4" className="empty">Belum ada</td></tr>}
              {r.charges.map((c) => (
                <tr key={c.id}>
                  <td><span className={`badge ${c.kind === 'denda' ? 'b-err' : 'b-warn'}`}>{c.kind === 'denda' ? 'Denda' : 'Charge'}</span><div className="tn" style={{ marginTop: 4 }}>{c.name}</div></td>
                  <td style={{ fontWeight: 700 }}>{fmtRp(c.amount)}</td>
                  <td className="tm">{c.recurring ? `Bulanan tgl ${c.billDay}` : `Sekali, ${fmtDate(c.startDate)}`}{c.endDate ? <div>s/d {fmtDate(c.endDate)}</div> : null}</td>
                  <td>{c.recurring ? <label className="switch-row"><input type="checkbox" checked={Boolean(c.active)} onChange={() => toggle(c)} /> {c.active ? 'Aktif' : 'Nonaktif'}</label> : <span className="badge b-neu">Sekali</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Profil & dokumen ──
function ProfileTab({ r, reload }) {
  const toast = useToast();
  const fields = ['name', 'wa', 'job', 'uni', 'nik', 'alamat', 'emergencyName', 'emergencyRel', 'emergencyWa', 'emergency2Name', 'emergency2Rel', 'emergency2Wa'];
  const [f, setF] = useState(() => Object.fromEntries(fields.map((k) => [k, r[k] || ''])));
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    try { await api.updateResident(r.id, f); toast('✅ Profil disimpan.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  const input = (k, label, extra = {}) => <div className="fg"><label className="fl">{label}</label><input className="fi" value={f[k]} onChange={set(k)} {...extra} /></div>;
  return (
    <div className="g2">
      <div className="card">
        <div className="ch"><div className="ct">Data Diri & Kontak Darurat</div></div>
        <div className="cb">
          <div className="g2">{input('name', 'Nama')}{input('wa', 'No. WhatsApp')}</div>
          <div className="g2">{input('job', 'Pekerjaan')}{input('uni', 'Universitas / Kantor')}</div>
          <div className="g2">{input('nik', 'NIK', { inputMode: 'numeric' })}{input('alamat', 'Alamat asal')}</div>
          <div className="fp-sec">Kontak darurat 1</div>
          <div className="g3">{input('emergencyName', 'Nama')}{input('emergencyRel', 'Hubungan')}{input('emergencyWa', 'No. WA')}</div>
          <div className="fp-sec">Kontak darurat 2</div>
          <div className="g3">{input('emergency2Name', 'Nama')}{input('emergency2Rel', 'Hubungan')}{input('emergency2Wa', 'No. WA')}</div>
          <button className="btn btn-p" onClick={save}>Simpan Profil</button>
        </div>
      </div>
      <div className="card">
        <div className="ch"><div className="ct">Dokumen & Verifikasi Wajah</div></div>
        <div className="cb">
          <FaceCheck ktp={r.ktpPhoto} selfie={r.selfiePhoto} storedScore={r.faceScore} />
        </div>
      </div>
    </div>
  );
}

function ViolationsTab({ r }) {
  return (
    <div className="card">
      <div className="tw">
        <table>
          <thead><tr><th>Tanggal</th><th>Kategori</th><th>Keterangan</th><th>SP</th></tr></thead>
          <tbody>
            {r.violations.length === 0 && <tr><td colSpan="4" className="empty">Tidak ada pelanggaran 👍</td></tr>}
            {r.violations.map((v) => (
              <tr key={v.id}><td className="tm">{fmtDate(v.date)}</td><td className="tn">{v.categoryName || '—'}</td><td style={{ fontSize: 12.5 }}>{v.description}</td><td><span className={`sp ${v.sp === 'SP1' ? 'sp1' : 'sp2'}`}>{v.sp}</span></td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Promo ──
function PromoModal({ r, onClose, onDone }) {
  const toast = useToast();
  const [promos, setPromos] = useState(null);
  const [sel, setSel] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.promos().then((p) => { const open = p.filter((x) => x.open); setPromos(open); if (open[0]) setSel(String(open[0].id)); }).catch(() => setPromos([])); }, []);
  const p = promos?.find((x) => String(x.id) === sel);
  async function apply() {
    setBusy(true);
    try {
      const inv = await api.applyPromo(r.id, Number(sel));
      toast(`✅ Invoice promo ${inv.number} dibuat (${fmtRp(inv.amount)}).`);
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); } finally { setBusy(false); }
  }
  return (
    <Modal title="Terapkan Promo" onClose={onClose} width={460} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={apply} disabled={!p || busy}>{busy ? 'Memproses…' : 'Buat Invoice Promo'}</button>
    </>}>
      {promos === null && <div className="loading">Memuat promo…</div>}
      {promos?.length === 0 && <div className="fp-alert" style={{ background: 'var(--surf2)', color: 'var(--t2)' }}>Tidak ada promo aktif. Pemilik dapat membuat/mengaktifkan promo di menu Pembayaran → Promo.</div>}
      {promos?.length > 0 && (
        <>
          <div className="fg"><label className="fl">Promo</label>
            <select className="fi" value={sel} onChange={(e) => setSel(e.target.value)}>{promos.map((x) => <option key={x.id} value={x.id}>{x.name} — bayar {x.payMonths} bln, gratis {x.freeMonths} bln</option>)}</select>
          </div>
          {p && (
            <div className="pay-bill">
              <div className="pay-row"><span>Sewa per bulan</span><strong>{fmtRp(r.rentAmount)}</strong></div>
              <div className="pay-row"><span>Dibayar</span><strong>{p.payMonths} bulan</strong></div>
              <div className="pay-row"><span>Gratis</span><strong>{p.freeMonths} bulan</strong></div>
              <div className="pay-row pay-total"><span>Total invoice promo</span><strong>{fmtRp(r.rentAmount * p.payMonths)}</strong></div>
              <div className="field-hint" style={{ marginTop: 8 }}>
                Menutup {p.payMonths + p.freeMonths} periode mulai periode belum lunas berikutnya. Invoice bulanan biasa di rentang itu dibatalkan otomatis.
                Setelah masa promo selesai, tagihan <strong>kembali normal</strong> per bulan. Promo berlaku s/d {fmtDate(p.endDate)}.
              </div>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

// ── Form keluar (oleh admin) ──
function CheckoutModal({ r, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ exitDate: todayISO(), alasan: '', star: 5, feedback: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit() {
    if (!f.alasan.trim()) { toast('⚠️ Alasan keluar wajib diisi.'); return; }
    setBusy(true);
    try {
      const res = await api.checkoutResident(r.id, { ...f, star: Number(f.star) });
      if (res.outstanding) toast(`⚠️ Masih ada tagihan ${fmtRp(res.outstanding)} yang belum dibayar — tetap tercatat.`);
      onDone();
    } catch (e) { toast(`⚠️ ${e.message}`); setBusy(false); }
  }
  return (
    <Modal title={`Proses Keluar · ${r.name}`} onClose={onClose} width={480} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-d" onClick={submit} disabled={busy}>{busy ? 'Memproses…' : 'Proses Keluar'}</button>
    </>}>
      {r.outstanding > 0 && <div className="fp-alert">Penghuni masih memiliki tunggakan {fmtRp(r.outstanding)}. Invoice tetap tersimpan setelah keluar.</div>}
      <div className="g2">
        <div className="fg"><label className="fl">Tanggal keluar</label><input type="date" className="fi" value={f.exitDate} onChange={set('exitDate')} /></div>
        <div className="fg"><label className="fl">Rating penghuni</label>
          <select className="fi" value={f.star} onChange={set('star')}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{stars(n)}</option>)}</select>
        </div>
      </div>
      <div className="fg"><label className="fl">Alasan keluar <span className="req">*</span></label><input className="fi" placeholder="mis. Lulus kuliah" value={f.alasan} onChange={set('alasan')} /></div>
      <div className="fg"><label className="fl">Catatan</label><textarea className="fi" rows="2" value={f.feedback} onChange={set('feedback')} /></div>
      <div className="field-hint">
        Invoice untuk periode setelah tanggal keluar dibatalkan otomatis.
        {r.dailyRateEnabled ? ' Rate harian aktif: periode berjalan dihitung pro-rata sampai tanggal keluar.' : ' Rate harian nonaktif: periode berjalan tetap ditagih penuh.'}
        {' '}Charge bulanan dihentikan.
      </div>
    </Modal>
  );
}


