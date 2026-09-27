import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { fmtRp, fmtRpShort, fmtDate, todayISO, downloadCSV, timeAgo, INVOICE_STATE, KIND_LABEL, BULAN_PANJANG } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { useAuth } from '../components/Auth.jsx';
import { Icons } from '../components/icons.jsx';
import Modal from '../components/Modal.jsx';
import { InvoiceActions, PayModal } from './ResidentDetail.jsx';
import { revealOnSmall } from '../responsive.js';

const TABS = [['tagihan', 'Tagihan'], ['kalender', 'Kalender Penagihan'], ['promo', 'Promo'], ['charge', 'Charge & Denda'], ['notif', 'Notifikasi WA']];

export default function Pembayaran({ version, onChange }) {
  const [tab, setTab] = useState('tagihan');
  const [ver, setVer] = useState(0);
  const reload = () => { setVer((v) => v + 1); onChange?.(); };
  const p = { version: version + ver, reload };
  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      {tab === 'tagihan' && <InvoicesTab {...p} />}
      {tab === 'kalender' && <CalendarTab {...p} />}
      {tab === 'promo' && <PromoTab {...p} />}
      {tab === 'charge' && <ChargesTab {...p} />}
      {tab === 'notif' && <NotifTab {...p} />}
    </>
  );
}

// ── Tagihan ──
const FILTERS = [['open', 'Belum lunas'], ['terlambat', 'Terlambat'], ['menunggu', 'Menunggu verifikasi'], ['belum_jatuh_tempo', 'Akan datang'], ['lunas', 'Lunas'], ['all', 'Semua']];

function InvoicesTab({ version, reload }) {
  const toast = useToast();
  const nav = useNavigate();
  const [state, setState] = useState('open');
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState('');
  const [payInv, setPayInv] = useState(null);
  const { data: all, loading } = useFetch(() => api.invoices({}), [version]);

  const stats = useMemo(() => {
    const list = all || [];
    const today = todayISO();
    const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    return {
      overdue: list.filter((i) => i.state === 'terlambat').reduce((a, i) => a + i.amount, 0),
      overdueCount: list.filter((i) => i.state === 'terlambat').length,
      pending: list.filter((i) => i.status === 'menunggu').length,
      paidMonth: list.filter((i) => i.status === 'paid' && (i.paidAt || '').startsWith(month)).reduce((a, i) => a + i.amount, 0),
      dueWeek: list.filter((i) => i.status === 'unpaid' && i.dueDate >= today && i.dueDate <= week).length,
    };
  }, [all]);

  if (loading || !all) return <div className="loading">Memuat tagihan…</div>;

  const needle = q.toLowerCase();
  const list = all
    .filter((i) => (state === 'all' ? true : state === 'open' ? ['unpaid', 'menunggu'].includes(i.status) : i.state === state))
    .filter((i) => kind === 'all' || i.kind === kind)
    .filter((i) => !needle || i.name.toLowerCase().includes(needle) || i.room.includes(needle) || i.number.toLowerCase().includes(needle))
    .sort((a, b) => (state === 'lunas' ? (a.paidAt < b.paidAt ? 1 : -1) : a.dueDate < b.dueDate ? -1 : 1));

  async function generate() {
    try { const r = await api.generateInvoices(); toast(r.created ? `✅ ${r.created} invoice baru diterbitkan.` : 'Semua invoice sudah up to date.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  function exportCSV() {
    downloadCSV(`invoice-${todayISO()}.csv`, list.map((i) => ({
      'No. Invoice': i.number, Penghuni: i.name, Kamar: i.room, Jenis: KIND_LABEL[i.kind], Keterangan: i.description,
      'Jatuh Tempo': i.dueDate, Nominal: i.amount, 'Kode Unik': i.uniqueCode, Status: INVOICE_STATE[i.state].label, Metode: i.method, 'Tgl Bayar': i.paidAt,
    })));
  }

  return (
    <>
      <div className="sg">
        <div className="tile t-warn"><div className="tile-lbl">Tunggakan</div><div className="tile-val warn" style={{ fontSize: 20 }}>{fmtRpShort(stats.overdue)}</div><div className="tile-ch dn">{stats.overdueCount} invoice terlambat</div></div>
        <div className="tile t-cor"><div className="tile-lbl">Menunggu Verifikasi</div><div className="tile-val cor">{stats.pending}</div><div className="tile-ch">dilaporkan penghuni</div></div>
        <div className="tile t-ok"><div className="tile-lbl">Diterima Bulan Ini</div><div className="tile-val ok" style={{ fontSize: 20 }}>{fmtRpShort(stats.paidMonth)}</div><div className="tile-ch">dari invoice lunas</div></div>
        <div className="tile t-blue"><div className="tile-lbl">Jatuh Tempo 7 Hari</div><div className="tile-val blue">{stats.dueWeek}</div><div className="tile-ch">invoice akan datang</div></div>
      </div>

      <div className="fr">
        {FILTERS.map(([k, l]) => <button key={k} className={`chip${state === k ? ' on' : ''}`} onClick={() => setState(k)}>{l}</button>)}
        <select className="fi" style={{ width: 'auto', padding: '5px 10px' }} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Jenis tagihan">
          <option value="all">Semua jenis</option><option value="sewa">Sewa</option><option value="charge">Charge</option><option value="denda">Denda</option>
        </select>
      </div>

      <div className="card">
        <div className="ch">
          <div className="srch"><Icons.search /><input placeholder="Cari nama, kamar, no. invoice…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button className="btn btn-g btn-sm" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/bayar`); toast('🔗 Link /bayar disalin.'); }}>Salin Link /bayar</button>
            <button className="btn btn-g btn-sm" onClick={exportCSV}>Export</button>
            <button className="btn btn-p btn-sm" onClick={generate}>Terbitkan Invoice</button>
          </div>
        </div>
        <div className="tw">
          <table>
            <thead><tr><th>Invoice</th><th>Penghuni</th><th>Keterangan</th><th>Jatuh Tempo</th><th>Jumlah</th><th>Status</th><th>Aksi</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan="7" className="empty">Tidak ada invoice</td></tr>}
              {list.map((i) => (
                <tr key={i.id} className={i.status === 'menunggu' ? 'row-hl' : ''}>
                  <td style={{ whiteSpace: 'nowrap' }}><div className="tn">{i.number}</div><span className={`badge ${i.kind === 'sewa' ? 'b-cor' : i.kind === 'denda' ? 'b-err' : 'b-warn'}`}>{KIND_LABEL[i.kind]}</span>{i.promoId ? <span className="badge b-ok" style={{ marginLeft: 4 }}>Promo</span> : null}</td>
                  <td className="row-link" onClick={() => i.residentId && nav(`/penghuni/${i.residentId}`)}><div className="tn">{i.name}</div><div className="tm">Kamar {i.room}{!i.residentId ? ' · sudah keluar' : ''}</div></td>
                  <td style={{ maxWidth: 240, fontSize: 12.5 }}>{i.description}{i.status === 'menunggu' && i.note ? <div className="tm">“{i.note}”</div> : null}</td>
                  <td className="tm">{fmtDate(i.dueDate)}{i.daysLate ? <div style={{ color: 'var(--err)' }}>+{i.daysLate} hari</div> : null}</td>
                  <td style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtRp(i.amount)}{i.status === 'paid' ? <div className="tm">{i.method} · {fmtDate(i.paidAt)}</div> : i.uniqueCode ? <div className="tm">QRIS: {fmtRp(i.total)}</div> : null}</td>
                  <td>
                    <span className={`badge ${INVOICE_STATE[i.state].cls}`}>{INVOICE_STATE[i.state].label}</span>
                    {i.sentAt ? <div className="tm">📤 terkirim</div> : null}{i.remindedAt ? <div className="tm">🔔 diingatkan</div> : null}
                  </td>
                  <td><InvoiceActions inv={i} reload={reload} onPay={setPayInv} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {payInv && <PayModal inv={payInv} onClose={() => setPayInv(null)} onDone={reload} />}
    </>
  );
}

// ── Kalender penagihan + Google Calendar ──
function CalendarTab({ version, reload }) {
  const toast = useToast();
  const nav = useNavigate();
  const { isPemilik } = useAuth();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [day, setDay] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const { data, loading } = useFetch(() => api.calendar(month), [month, version]);

  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // mulai Senin
  const shift = (n) => { const d = new Date(y, m - 1 + n, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); setDay(null); };
  const byDay = {};
  for (const i of data?.invoices || []) (byDay[Number(i.dueDate.slice(8, 10))] ||= []).push(i);
  const today = todayISO();
  const totalMonth = (data?.invoices || []).reduce((a, i) => a + i.amount, 0);
  const paidMonth = (data?.invoices || []).filter((i) => i.status === 'paid').reduce((a, i) => a + i.amount, 0);

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.gcalSync();
      if (r.skipped) toast('Google Calendar belum terhubung.');
      else toast(`✅ Sinkron: +${r.created} baru, ${r.updated} diperbarui, ${r.removed} dihapus${r.errors?.length ? ` · ${r.errors.length} gagal` : ''}.`);
      reload();
    } catch (e) { toast(`⚠️ ${e.message}`); } finally { setSyncing(false); }
  }

  const g = data?.gcal;
  return (
    <div className="g-cal">
      <div className="card">
        <div className="ch">
          <button className="btn btn-g btn-sm" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><Icons.chevronLeft /></button>
          <div style={{ textAlign: 'center' }}>
            <div className="ct">{BULAN_PANJANG[m - 1]} {y}</div>
            <div className="cs">{(data?.invoices || []).length} tagihan · {fmtRpShort(paidMonth)} dari {fmtRpShort(totalMonth)} lunas</div>
          </div>
          <button className="btn btn-g btn-sm" onClick={() => shift(1)} aria-label="Bulan berikutnya"><Icons.chevronRight /></button>
        </div>
        <div className="cb">
          {loading ? <div className="loading">Memuat…</div> : (
            <div className="cal">
              {['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].map((d) => <div key={d} className="cal-h">{d}</div>)}
              {Array.from({ length: offset }, (_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: days }, (_, i) => {
                const d = i + 1;
                const iso = `${month}-${String(d).padStart(2, '0')}`;
                const items = byDay[d] || [];
                const worst = items.some((x) => x.state === 'terlambat') ? 'late' : items.some((x) => x.status === 'menunggu') ? 'wait' : items.some((x) => x.status === 'unpaid') ? 'due' : items.length ? 'paid' : '';
                return (
                  <button key={d} className={`cal-d${iso === today ? ' today' : ''}${day === d ? ' sel' : ''}${worst ? ` has ${worst}` : ''}`} onClick={() => { setDay(d); revealOnSmall('cal-day'); }} aria-label={`${d} ${BULAN_PANJANG[m - 1]}: ${items.length} tagihan`}>
                    <span className="cal-n">{d}</span>
                    {items.length > 0 && <span className="cal-c">{items.length}</span>}
                  </button>
                );
              })}
            </div>
          )}
          <div className="legend" style={{ marginTop: 12 }}>
            <span><i className="dot" style={{ background: 'var(--err)' }} /> Terlambat</span>
            <span><i className="dot" style={{ background: 'var(--warn)' }} /> Menunggu verifikasi</span>
            <span><i className="dot" style={{ background: 'var(--pebble)' }} /> Belum bayar</span>
            <span><i className="dot" style={{ background: 'var(--ok)' }} /> Lunas</span>
          </div>
        </div>
      </div>

      <div>
        <div className="card mb" id="cal-day">
          <div className="ch"><div className="ct">{day ? `Tagihan ${day} ${BULAN_PANJANG[m - 1]}` : 'Pilih tanggal'}</div></div>
          <div className="cb" style={{ paddingTop: 4 }}>
            {!day && <div className="empty">Klik tanggal untuk melihat tagihan yang jatuh tempo.</div>}
            {day && !(byDay[day] || []).length && <div className="empty">Tidak ada tagihan.</div>}
            {(byDay[day] || []).map((i) => (
              <div key={i.id} className="txr row-link" onClick={() => i.residentId && nav(`/penghuni/${i.residentId}`)}>
                <div className="txd"><div className="txn">{i.name} · Kamar {i.room}</div><div className="txdt">{KIND_LABEL[i.kind]} · {i.number}</div></div>
                <div style={{ textAlign: 'right' }}><div className="txa">{fmtRp(i.amount)}</div><span className={`badge ${INVOICE_STATE[i.state].cls}`}>{INVOICE_STATE[i.state].label}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="ch"><div><div className="ct">📅 Google Calendar</div><div className="cs">Tiap tagihan jadi event di tanggal jatuh tempo</div></div></div>
          <div className="cb">
            {!g?.configured && (
              <div className="field-hint">Server belum dikonfigurasi. Set <code>GOOGLE_CLIENT_ID</code> & <code>GOOGLE_CLIENT_SECRET</code> (lihat README), lalu hubungkan di Pengaturan.</div>
            )}
            {g?.configured && !g.connected && (
              <>
                <div className="field-hint" style={{ marginBottom: 10 }}>Belum terhubung ke akun Google.</div>
                {isPemilik ? <button className="btn btn-p btn-sm" onClick={() => nav('/pengaturan#gcal')}>Hubungkan di Pengaturan</button> : <div className="tm">Minta pemilik menghubungkan akun Google.</div>}
              </>
            )}
            {g?.connected && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span className="badge b-ok">● Terhubung</span><span className="tm">sejak {timeAgo(g.connectedAt)} · {g.syncedEvents} event</span>
                </div>
                <div className="field-hint" style={{ marginBottom: 10 }}>Otomatis tersinkron tiap 30 menit dan setiap ada perubahan tagihan. Event merah = belum bayar, hijau = lunas, kuning = menunggu verifikasi; pengingat popup H-3.</div>
                <button className="btn btn-p btn-sm" onClick={sync} disabled={syncing}>{syncing ? 'Menyinkronkan…' : 'Sinkronkan Sekarang'}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Promo ──
function PromoTab({ version, reload }) {
  const { isPemilik } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: promos, loading } = useFetch(() => api.promos(), [version]);
  const [edit, setEdit] = useState(null);

  async function toggle(p) {
    try { await api.updatePromo(p.id, { ...p, active: !p.active }); toast(p.active ? 'Promo dinonaktifkan.' : 'Promo diaktifkan.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function remove(p) {
    if (!(await confirm({ title: 'Hapus Promo', message: `Hapus promo "${p.name}"? Invoice promo yang sudah dibuat tetap berlaku.`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deletePromo(p.id); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  if (loading || !promos) return <div className="loading">Memuat promo…</div>;
  return (
    <>
      <div className="card mb">
        <div className="cb" style={{ fontSize: 13, color: 'var(--t2)', lineHeight: 1.6 }}>
          🎁 <strong>Cara kerja:</strong> promo diterapkan per penghuni (menu Penghuni → detail → <em>Terapkan Promo</em>). Sistem membuat <strong>satu invoice</strong> senilai
          <em> bulan bayar × sewa</em> yang menutup <em>bulan bayar + bulan gratis</em>. Setelah periode promo habis, invoice bulanan <strong>kembali normal otomatis</strong>.
          Promo yang nonaktif / lewat tanggal berakhir tidak bisa diterapkan lagi, tapi invoice yang sudah dibuat tetap berlaku.
        </div>
      </div>
      <div className="card">
        <div className="ch"><div className="ct">Daftar Promo</div>{isPemilik && <button className="btn btn-p btn-sm" onClick={() => setEdit({})}>+ Promo Baru</button>}</div>
        <div className="tw">
          <table>
            <thead><tr><th>Promo</th><th>Skema</th><th>Periode Berlaku</th><th>Status</th><th>Dipakai</th>{isPemilik && <th>Aksi</th>}</tr></thead>
            <tbody>
              {promos.length === 0 && <tr><td colSpan="6" className="empty">Belum ada promo</td></tr>}
              {promos.map((p) => (
                <tr key={p.id}>
                  <td><div className="tn">{p.name}</div><div className="tm">{p.description}</div></td>
                  <td>Bayar <strong>{p.payMonths}</strong> bln + gratis <strong>{p.freeMonths}</strong> bln</td>
                  <td className="tm">{p.startDate ? fmtDate(p.startDate) : '—'} – {p.endDate ? fmtDate(p.endDate) : 'tanpa batas'}</td>
                  <td>{p.open ? <span className="badge b-ok">Berjalan</span> : p.active ? <span className="badge b-neu">Di luar periode</span> : <span className="badge b-neu">Nonaktif</span>}</td>
                  <td>{p.used}×</td>
                  {isPemilik && (
                    <td><div className="row-actions">
                      <label className="switch-row"><input type="checkbox" checked={p.active} onChange={() => toggle(p)} /> {p.active ? 'On' : 'Off'}</label>
                      <button className="btn btn-g btn-sm" onClick={() => setEdit(p)}>Ubah</button>
                      <button className="btn btn-g btn-sm" onClick={() => remove(p)}>✕</button>
                    </div></td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {edit && <PromoModal promo={edit} onClose={() => setEdit(null)} onDone={reload} />}
    </>
  );
}

function PromoModal({ promo, onClose, onDone }) {
  const toast = useToast();
  const [f, setF] = useState({ name: promo.name || '', payMonths: promo.payMonths || 6, freeMonths: promo.freeMonths ?? 1, startDate: promo.startDate || todayISO(), endDate: promo.endDate || '', active: promo.active ?? true, description: promo.description || '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  async function save() {
    try {
      const body = { ...f, payMonths: Number(f.payMonths), freeMonths: Number(f.freeMonths) };
      if (promo.id) await api.updatePromo(promo.id, body); else await api.addPromo(body);
      toast('✅ Promo disimpan.');
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <Modal title={promo.id ? 'Ubah Promo' : 'Promo Baru'} onClose={onClose} width={460} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button><button className="btn btn-p" onClick={save}>Simpan</button>
    </>}>
      <div className="fg"><label className="fl">Nama promo</label><input className="fi" placeholder="mis. Promo 6+1" value={f.name} onChange={set('name')} /></div>
      <div className="g2">
        <div className="fg"><label className="fl">Bulan dibayar</label><input type="number" min="1" max="24" className="fi" value={f.payMonths} onChange={set('payMonths')} /></div>
        <div className="fg"><label className="fl">Bulan gratis</label><input type="number" min="0" max="12" className="fi" value={f.freeMonths} onChange={set('freeMonths')} /></div>
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">Mulai berlaku</label><input type="date" className="fi" value={f.startDate} onChange={set('startDate')} /></div>
        <div className="fg"><label className="fl">Berakhir</label><input type="date" className="fi" value={f.endDate} onChange={set('endDate')} /></div>
      </div>
      <div className="fg"><label className="fl">Deskripsi</label><input className="fi" value={f.description} onChange={set('description')} /></div>
      <label className="switch-row"><input type="checkbox" checked={f.active} onChange={set('active')} /> Promo aktif</label>
    </Modal>
  );
}

// ── Charge & denda (semua penghuni) ──
function ChargesTab({ version, reload }) {
  const toast = useToast();
  const nav = useNavigate();
  const { data: charges, loading } = useFetch(() => api.charges(), [version]);
  async function toggle(c) {
    try { await api.updateCharge(c.id, { active: !c.active }); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  if (loading || !charges) return <div className="loading">Memuat…</div>;
  return (
    <div className="card">
      <div className="ch"><div><div className="ct">Charge & Denda Semua Kamar</div><div className="cs">Tambah charge/denda baru dari halaman detail penghuni</div></div></div>
      <div className="tw">
        <table>
          <thead><tr><th>Penghuni</th><th>Jenis</th><th>Keterangan</th><th>Nominal</th><th>Jadwal Tagih</th><th>Status</th></tr></thead>
          <tbody>
            {charges.length === 0 && <tr><td colSpan="6" className="empty">Belum ada charge / denda</td></tr>}
            {charges.map((c) => (
              <tr key={c.id}>
                <td className="row-link" onClick={() => nav(`/penghuni/${c.residentId}`)}><div className="tn">{c.residentName}</div><div className="tm">Kamar {c.room}</div></td>
                <td><span className={`badge ${c.kind === 'denda' ? 'b-err' : 'b-warn'}`}>{c.kind === 'denda' ? 'Denda' : 'Charge'}</span></td>
                <td>{c.name}</td>
                <td style={{ fontWeight: 700 }}>{fmtRp(c.amount)}</td>
                <td className="tm">{c.recurring ? `Tiap tgl ${c.billDay}, mulai ${fmtDate(c.startDate)}` : `Sekali · ${fmtDate(c.startDate)}`}</td>
                <td>{c.recurring ? <label className="switch-row"><input type="checkbox" checked={c.active} onChange={() => toggle(c)} /> {c.active ? 'Aktif' : 'Nonaktif'}</label> : <span className="badge b-neu">Sekali</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Notifikasi WhatsApp ──
function NotifTab({ version, reload }) {
  const toast = useToast();
  const nav = useNavigate();
  const { isPemilik } = useAuth();
  const { data, loading } = useFetch(() => api.notifications(), [version]);
  const [running, setRunning] = useState(false);
  async function run() {
    setRunning(true);
    try {
      const r = await api.runNotifications();
      toast(r.invoices.skipped && r.reminders.skipped ? 'Pengiriman otomatis nonaktif atau gateway belum diatur.' : `✅ ${r.invoices.sent || 0} invoice & ${r.reminders.sent || 0} reminder terkirim.`);
      reload();
    } catch (e) { toast(`⚠️ ${e.message}`); } finally { setRunning(false); }
  }
  if (loading || !data) return <div className="loading">Memuat…</div>;
  return (
    <div className="card">
      <div className="ch">
        <div>
          <div className="ct">Log Pengiriman WhatsApp</div>
          <div className="cs">{data.ready ? 'Gateway aktif — invoice & reminder H-3 terkirim otomatis sesuai pengaturan.' : 'Gateway belum diatur — tombol Kirim akan membuka WhatsApp manual.'}</div>
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {isPemilik && <button className="btn btn-g btn-sm" onClick={() => nav('/pengaturan#wa')}>Pengaturan WA</button>}
          <button className="btn btn-p btn-sm" onClick={run} disabled={running || !data.ready}>{running ? 'Mengirim…' : 'Jalankan Sekarang'}</button>
        </div>
      </div>
      <div className="tw">
        <table>
          <thead><tr><th>Waktu</th><th>Jenis</th><th>Invoice</th><th>Tujuan</th><th>Status</th></tr></thead>
          <tbody>
            {data.log.length === 0 && <tr><td colSpan="5" className="empty">Belum ada pengiriman</td></tr>}
            {data.log.map((n) => (
              <tr key={n.id}>
                <td className="tm">{timeAgo(n.createdAt)}</td>
                <td>{n.kind === 'reminder' ? '🔔 Reminder' : '🧾 Invoice'}</td>
                <td><div className="tn">{n.number}</div><div className="tm">{n.name}</div></td>
                <td className="tm">{n.target}</td>
                <td>{n.status === 'terkirim' ? <span className="badge b-ok">Terkirim</span> : <span className="badge b-err" title={n.response}>Gagal</span>}{n.status !== 'terkirim' && <div className="tm">{n.response}</div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
