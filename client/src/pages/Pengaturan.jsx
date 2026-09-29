import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { Icons } from '../components/icons.jsx';
import { useToast } from '../components/Toast.jsx';
import { useSettings } from '../components/Settings.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { fmtRp, timeAgo } from '../helpers.js';
import RoomSettings from '../components/RoomSettings.jsx';

const typeNotes = {
  putri: 'Kos Putri — hanya menerima penghuni perempuan.',
  putra: 'Kos Putra — hanya menerima penghuni laki-laki.',
  campur: 'Kos Campur — menerima penghuni laki-laki dan perempuan.',
};
const types = [
  { key: 'putri', ico: '👩', name: 'Kos Putri' },
  { key: 'putra', ico: '👨', name: 'Kos Putra' },
  { key: 'campur', ico: '🏠', name: 'Kos Campur' },
];

export default function Pengaturan({ onSaved }) {
  const [s, setS] = useState(null);
  const [secrets, setSecrets] = useState({ waToken: '', midtransServerKey: '', aiApiKey: '' });
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { reload } = useSettings();
  const loc = useLocation();
  const nav = useNavigate();

  const load = () => api.settings().then(setS).catch((e) => toast(`⚠️ ${e.message}`));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Kembali dari consent Google.
  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    if (p.get('gcal') === 'ok') toast('✅ Google Calendar terhubung. Tagihan sedang disinkronkan.');
    if (p.get('gcal') === 'error') toast(`⚠️ Google Calendar gagal terhubung: ${p.get('msg') || ''}`);
    if (p.get('gcal')) nav('/pengaturan#gcal', { replace: true });
  }, [loc.search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (s && loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [s, loc.hash]);

  if (!s) return <div className="loading">Memuat pengaturan…</div>;

  const set = (k) => (e) => setS((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Number(e.target.value) : e.target.value }));
  const setSecret = (k) => (e) => setSecrets((x) => ({ ...x, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    try {
      const body = { ...s };
      for (const k of Object.keys(body)) if (k.endsWith('Set')) delete body[k];
      for (const [k, v] of Object.entries(secrets)) if (v.trim()) body[k] = v.trim();
      const next = await api.saveSettings(body);
      setS(next);
      setSecrets({ waToken: '', midtransServerKey: '', aiApiKey: '' });
      reload();
      onSaved?.();
      toast('✅ Pengaturan berhasil disimpan!');
    } catch (e) { toast(`⚠️ ${e.message}`); } finally { setSaving(false); }
  }
  async function clearSecret(k) {
    try {
      const next = await api.saveSettings({ [k]: null });
      // Hanya perbarui status kunci ini — perubahan lain di form yang belum disimpan tetap utuh.
      setS((x) => ({ ...x, [`${k}Set`]: next[`${k}Set`] }));
      setSecrets((x) => ({ ...x, [k]: '' }));
      toast('Kredensial dihapus.');
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <>
      <div className="g2 mb">
        <div className="card">
          <div className="ch"><div><div className="ct">Informasi Properti</div><div className="cs">Nama & kontak tampil di seluruh aplikasi dan pesan WA</div></div></div>
          <div className="cb">
            <div className="fg"><label className="fl">Nama Kos <span className="req">*</span></label><input className="fi" value={s.namaKos} onChange={set('namaKos')} /></div>
            <div className="fg"><label className="fl">Alamat Lengkap</label><input className="fi" value={s.alamat} onChange={set('alamat')} /></div>
            <div className="g2">
              <div className="fg"><label className="fl">No. WA Admin</label><input className="fi" value={s.wa} onChange={set('wa')} /></div>
              <div className="fg"><label className="fl">Email</label><input type="email" className="fi" value={s.email} onChange={set('email')} /></div>
            </div>
            <div className="kos-type-grid">
              {types.map((t) => (
                <button type="button" key={t.key} className={`ktype${s.kosType === t.key ? ' sel' : ''}`} onClick={() => setS((x) => ({ ...x, kosType: t.key }))}>
                  <div className="ktype-ico">{t.ico}</div><div className="ktype-name">{t.name}</div>
                </button>
              ))}
            </div>
            <div className="field-hint" style={{ marginTop: 8 }}>ℹ️ {typeNotes[s.kosType]}</div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div><div className="ct">Penagihan</div><div className="cs">Harga per tipe kamar diatur di menu Kamar</div></div></div>
          <div className="cb">
            <div className="fg">
              <label className="fl">Invoice terbit berapa hari sebelum jatuh tempo</label>
              <input type="number" min="0" max="28" className="fi" value={s.invoiceLeadDays} onChange={set('invoiceLeadDays')} />
            </div>
            <div className="fg">
              <label className="fl">Rate harian default</label>
              <input className="fi" inputMode="numeric" value={s.dailyRateDefault} onChange={(e) => setS((x) => ({ ...x, dailyRateDefault: Number(e.target.value.replace(/\D/g, '')) || 0 }))} />
              <div className="field-hint">{fmtRp(s.dailyRateDefault)}/hari — dipakai untuk hari di luar periode penuh (masuk/keluar di tengah periode). Bisa diubah per penghuni.</div>
            </div>
            <label className="switch-row fg"><input type="checkbox" checked={Boolean(s.dailyRateEnabledDefault)} onChange={set('dailyRateEnabledDefault')} /> Aktifkan rate harian secara default untuk penghuni baru</label>
            <div className="fg">
              <label className="fl">Uang jaminan / deposit</label>
              <input className="fi" inputMode="numeric" value={s.deposit} onChange={(e) => setS((x) => ({ ...x, deposit: Number(e.target.value.replace(/\D/g, '')) || 0 }))} />
            </div>
          </div>
        </div>
      </div>

      <RoomSettings />

      <div className="g2 mb">
        <div className="card" id="wa">
          <div className="ch"><div><div className="ct">📱 WhatsApp Otomatis</div><div className="cs">Kirim invoice & reminder langsung ke penghuni</div></div>
            {s.waProvider !== 'none' && s.waTokenSet ? <span className="badge b-ok">● Aktif</span> : <span className="badge b-neu">Belum diatur</span>}</div>
          <div className="cb">
            <div className="fg">
              <label className="fl">Gateway</label>
              <select className="fi" value={s.waProvider} onChange={set('waProvider')}>
                <option value="none">Tidak ada (kirim manual lewat wa.me)</option>
                <option value="fonnte">Fonnte</option>
                <option value="wablas">Wablas</option>
              </select>
            </div>
            {s.waProvider !== 'none' && (
              <>
                <div className="fg">
                  <label className="fl">Token API {s.waTokenSet && <span className="badge b-ok" style={{ marginLeft: 4 }}>tersimpan</span>}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input className="fi" type="password" autoComplete="off" placeholder={s.waTokenSet ? '•••••••• (kosongkan untuk mempertahankan)' : 'Tempel token dari dashboard gateway'} value={secrets.waToken} onChange={setSecret('waToken')} />
                    {s.waTokenSet && <button className="btn btn-g btn-sm" onClick={() => clearSecret('waToken')}>Hapus</button>}
                  </div>
                  <div className="field-hint">Token disimpan di server dan tidak pernah ditampilkan kembali.</div>
                </div>
                {s.waProvider === 'wablas' && (
                  <div className="fg"><label className="fl">URL server Wablas</label><input className="fi" placeholder="https://jkt.wablas.com" value={s.waBaseUrl} onChange={set('waBaseUrl')} /></div>
                )}
              </>
            )}
            <div className="fg">
              <label className="fl">URL publik aplikasi</label>
              <input className="fi" placeholder="https://kos-anda.com" value={s.publicUrl} onChange={set('publicUrl')} />
              <div className="field-hint">Dipakai untuk link invoice di pesan WA (mis. {s.publicUrl}/invoice/…).</div>
            </div>
            <div className="toggle-card">
              <label className="switch-row"><input type="checkbox" checked={Boolean(s.reminderEnabled)} onChange={set('reminderEnabled')} /> <strong>Reminder sebelum jatuh tempo</strong></label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                <span className="tm">Kirim H-</span>
                <input type="number" min="0" max="14" className="fi" style={{ width: 70 }} value={s.reminderDaysBefore} onChange={set('reminderDaysBefore')} disabled={!s.reminderEnabled} />
                <span className="tm">hari sebelum jatuh tempo (bisa dimatikan per penghuni)</span>
              </div>
            </div>
            <div className="toggle-card">
              <label className="switch-row"><input type="checkbox" checked={Boolean(s.invoiceAutoSend)} onChange={set('invoiceAutoSend')} /> <strong>Kirim invoice otomatis saat terbit</strong></label>
              <div className="tm" style={{ marginTop: 4 }}>Termasuk invoice charge/denda dan invoice promo.</div>
            </div>
            <div className="toggle-card">
              <label className="switch-row"><input type="checkbox" checked={s.receiptAutoSend !== false} onChange={set('receiptAutoSend')} /> <strong>Kirim bukti pelunasan otomatis</strong></label>
              <div className="tm" style={{ marginTop: 4 }}>Begitu invoice lunas (dicatat admin atau pembayaran QRIS diverifikasi), penghuni langsung menerima pesan “pembayaran diterima” + link kwitansi.</div>
            </div>
            <div className="toggle-card">
              <label className="switch-row"><input type="checkbox" checked={s.waAttachPdf !== false} onChange={set('waAttachPdf')} /> <strong>Lampirkan PDF invoice / kwitansi</strong></label>
              <div className="tm" style={{ marginTop: 4 }}>
                Pesan invoice & bukti pelunasan disertai file PDF. Fonnte: kirim file hanya tersedia di paket tertentu; Wablas: butuh URL publik aplikasi.
                Bila lampiran ditolak gateway, pesan tetap terkirim sebagai teks + link.
              </div>
            </div>
            <TestSend defaultTarget={s.wa} ready={s.waProvider !== 'none' && s.waTokenSet} />
          </div>
        </div>

        <GcalCard s={s} setS={setS} />
      </div>

      <div className="g2 mb">
        <div className="card">
          <div className="ch"><div><div className="ct">QRIS & Pembayaran</div><div className="cs">QR dinamis di halaman invoice penghuni</div></div></div>
          <div className="cb">
            <div className="fg">
              <label className="fl">Metode Pembayaran</label>
              <select className="fi" value={s.paymentMode} onChange={set('paymentMode')}>
                <option value="manual">Manual (admin catat sendiri)</option>
                <option value="qris_static">QRIS Statis (GoPay Merchant / dll) — generate QR dinamis</option>
                <option value="midtrans" disabled>Midtrans (otomatis penuh) — segera hadir</option>
              </select>
            </div>
            {s.paymentMode === 'qris_static' && (
              <div className="fg">
                <label className="fl">Payload QRIS Statis</label>
                <textarea className="fi" rows="3" style={{ fontFamily: 'monospace', fontSize: 12 }} placeholder="00020101021126…6304XXXX" value={s.qrisString} onChange={set('qrisString')} />
                <div className="field-hint">Hasil decode gambar QRIS merchant Anda. QR dinamis per invoice dibuat otomatis (nominal + kode unik).</div>
              </div>
            )}
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">Midtrans Server Key {s.midtransServerKeySet && <span className="badge b-ok" style={{ marginLeft: 4 }}>tersimpan</span>}</label>
              <input className="fi" type="password" autoComplete="off" placeholder={s.midtransServerKeySet ? '•••••••• (kosongkan untuk mempertahankan)' : 'SB-Mid-server-… (untuk otomatis penuh nanti)'} value={secrets.midtransServerKey} onChange={setSecret('midtransServerKey')} />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div><div className="ct">Peraturan & Pelanggaran</div></div></div>
          <div className="cb">
            <div className="g3">
              <div className="fg"><label className="fl">Jam malam</label><select className="fi" value={s.jamMalam} onChange={set('jamMalam')}>{['22:00', '22:30', '23:00', '23:30', '00:00'].map((t) => <option key={t} value={t}>{t} WIB</option>)}</select></div>
              <div className="fg"><label className="fl">Batas tamu</label><select className="fi" value={s.jamTamu} onChange={set('jamTamu')}><option value="20:00">20.00</option><option value="21:00">21.00</option><option value="22:00">22.00</option><option value="tidak">Tidak boleh menginap</option></select></div>
              <div className="fg"><label className="fl">Hewan</label><select className="fi" value={s.pet} onChange={set('pet')}><option value="tidak">Dilarang</option><option value="kecil">Hewan kecil</option><option value="semua">Boleh</option></select></div>
            </div>
            <div className="fg"><label className="fl">Catatan peraturan</label><textarea className="fi" rows="5" style={{ resize: 'vertical', lineHeight: 1.6 }} value={s.peraturan} onChange={set('peraturan')} /></div>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl">Simpan riwayat pelanggaran selama (hari)</label>
              <input type="number" min="30" max="3650" className="fi" value={s.violationRetentionDays} onChange={set('violationRetentionDays')} />
              <div className="field-hint">Default 365 hari (1 tahun). Catatan lebih lama dihapus otomatis dari database.</div>
            </div>
          </div>
        </div>
        <AICard s={s} set={set} secrets={secrets} setSecret={setSecret} clearSecret={clearSecret} />
      </div>

      <div className="save-bar">
        <button className="btn btn-p" onClick={save} disabled={saving}><Icons.save /> {saving ? 'Menyimpan…' : 'Simpan Pengaturan'}</button>
      </div>
    </>
  );
}

function TestSend({ defaultTarget, ready }) {
  const toast = useToast();
  const [target, setTarget] = useState(defaultTarget || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { ok, text }
  async function test() {
    setBusy(true);
    setResult(null);
    try {
      const r = await api.testNotification(target);
      setResult({ ok: true, text: `Diterima ${r.provider} untuk ${r.target}. Respons: ${r.response || '-'}` });
      toast('✅ Diterima gateway. Cek WhatsApp tujuan.');
    } catch (e) {
      setResult({ ok: false, text: e.message });
      toast(`⚠️ ${e.message}`);
    } finally { setBusy(false); }
  }
  return (
    <div className="fg" style={{ marginBottom: 0, marginTop: 12 }}>
      <label className="fl">Tes pengiriman</label>
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="fi" placeholder="08xx…" value={target} onChange={(e) => setTarget(e.target.value)} />
        <button className="btn btn-g btn-sm" onClick={test} disabled={!ready || busy} title={ready ? '' : 'Simpan gateway & token dulu'}>{busy ? 'Mengirim…' : 'Kirim Tes'}</button>
      </div>
      {!ready && <div className="field-hint">Pilih gateway, isi token, lalu klik Simpan Pengaturan sebelum tes.</div>}
      {result && (
        <div className={`test-result ${result.ok ? 'ok' : 'err'}`}>
          {result.text}
          {result.ok && /pending|queue/i.test(result.text) && (
            <div style={{ marginTop: 4 }}>Status “pending/queue” berarti pesan masih antre di gateway — pastikan device di dashboard gateway berstatus <strong>connect</strong>.</div>
          )}
        </div>
      )}
    </div>
  );
}

function GcalCard({ s, setS }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = () => api.gcalStatus().then(setSt).catch(() => {});
  useEffect(() => { load(); }, []);

  async function connect() {
    try { const { url } = await api.gcalAuthUrl(); window.location.href = url; } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  async function sync() {
    setBusy(true);
    try { const r = await api.gcalSync(); toast(`✅ +${r.created || 0} event baru, ${r.updated || 0} diperbarui, ${r.removed || 0} dihapus.`); load(); } catch (e) { toast(`⚠️ ${e.message}`); } finally { setBusy(false); }
  }
  async function disconnect() {
    if (!(await confirm({ title: 'Putuskan Google Calendar', message: 'Hentikan sinkronisasi dan cabut akses InDeKos ke Google Calendar? Event yang sudah dibuat tidak dihapus.', confirmText: 'Putuskan', danger: true }))) return;
    try { await api.gcalDisconnect(); toast('Google Calendar diputuskan.'); load(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }

  return (
    <div className="card" id="gcal">
      <div className="ch"><div><div className="ct">📅 Google Calendar</div><div className="cs">Kalender penagihan tersinkron otomatis</div></div>
        {st?.connected ? <span className="badge b-ok">● Terhubung</span> : <span className="badge b-neu">Tidak terhubung</span>}</div>
      <div className="cb">
        {!st && <div className="loading">Memuat…</div>}
        {st && !st.configured && (
          <div className="field-hint" style={{ lineHeight: 1.7 }}>
            Server belum dikonfigurasi. Langkah satu kali:
            <ol style={{ paddingLeft: 18, margin: '6px 0' }}>
              <li>Buat OAuth Client (Web application) di Google Cloud Console & aktifkan <em>Google Calendar API</em>.</li>
              <li>Tambahkan Authorized redirect URI: <code>{st.redirectUri}</code></li>
              <li>Set env server <code>GOOGLE_CLIENT_ID</code> & <code>GOOGLE_CLIENT_SECRET</code>, lalu restart.</li>
            </ol>
          </div>
        )}
        {st?.configured && (
          <>
            <div className="fg">
              <label className="fl">ID Kalender</label>
              <input className="fi" value={s.gcalCalendarId} onChange={(e) => setS((x) => ({ ...x, gcalCalendarId: e.target.value }))} />
              <div className="field-hint"><code>primary</code> = kalender utama akun. Untuk kalender terpisah, isi ID-nya (…@group.calendar.google.com) lalu Simpan.</div>
            </div>
            {st.connected ? (
              <>
                <div className="tm" style={{ marginBottom: 10 }}>Terhubung {timeAgo(st.connectedAt)} · {st.syncedEvents} event tersinkron. Sinkron otomatis tiap 30 menit & tiap perubahan tagihan.</div>
                <div style={{ display: 'flex', gap: 7 }}>
                  <button className="btn btn-p btn-sm" onClick={sync} disabled={busy}>{busy ? 'Menyinkronkan…' : 'Sinkronkan Sekarang'}</button>
                  <button className="btn btn-g btn-sm" onClick={disconnect}>Putuskan</button>
                </div>
              </>
            ) : (
              <button className="btn btn-p btn-sm" onClick={connect}>Hubungkan Akun Google</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 — paling cerdas (default)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 — seimbang & lebih hemat' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 — paling cepat & hemat' },
];

function AICard({ s, set, secrets, setSecret, clearSecret }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const custom = s.aiModel && !AI_MODELS.some((m) => m.id === s.aiModel);
  async function test() {
    setBusy(true);
    try { const r = await api.aiTest(); toast(`✅ Terhubung ke ${r.model}.`); } catch (e) { toast(`⚠️ ${e.message}`); } finally { setBusy(false); }
  }
  return (
    <div className="card" id="ai">
      <div className="ch"><div><div className="ct">🤖 AI Asisten</div><div className="cs">Insight & tanya jawab di setiap menu</div></div>
        {s.aiEnabled === false ? <span className="badge b-neu">Mati</span> : s.aiApiKeySet ? <span className="badge b-ok">● Claude</span> : <span className="badge b-neu">Mode lokal</span>}</div>
      <div className="cb">
        <div className="toggle-card">
          <label className="switch-row"><input type="checkbox" checked={s.aiEnabled !== false} onChange={set('aiEnabled')} /> <strong>Tampilkan AI di setiap menu</strong></label>
          <div className="tm" style={{ marginTop: 4 }}>Kartu insight di atas tiap halaman + tombol “Tanya AI”. Insight dihitung dari data Anda dan tetap jalan tanpa API key.</div>
        </div>
        <div className="fg">
          <label className="fl">API key Claude {s.aiApiKeySet && <span className="badge b-ok" style={{ marginLeft: 4 }}>tersimpan</span>}</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="fi" type="password" autoComplete="off" placeholder={s.aiApiKeySet ? '•••••••• (kosongkan untuk mempertahankan)' : 'sk-ant-…'} value={secrets.aiApiKey} onChange={setSecret('aiApiKey')} />
            {s.aiApiKeySet && <button className="btn btn-g btn-sm" onClick={() => clearSecret('aiApiKey')}>Hapus</button>}
          </div>
          <div className="field-hint">Buat di console.anthropic.com → API Keys. Disimpan di server, tidak pernah ditampilkan kembali. Tanpa key, AI memakai mode lokal.</div>
        </div>
        <div className="fg">
          <label className="fl">Model</label>
          <select className="fi" value={custom ? '__custom' : (s.aiModel || 'claude-opus-5')} onChange={(e) => set('aiModel')({ target: { type: 'text', value: e.target.value === '__custom' ? '' : e.target.value } })}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            <option value="__custom">Lainnya…</option>
          </select>
          {(custom || s.aiModel === '') && (
            <input className="fi" style={{ marginTop: 6 }} placeholder="mis. claude-opus-5" value={s.aiModel} onChange={set('aiModel')} />
          )}
        </div>
        <div className="field-hint" style={{ marginBottom: 10 }}>
          Yang dikirim ke Claude hanya ringkasan data kos (nama, kamar, tagihan, keuangan). NIK, alamat, nomor WhatsApp, dan foto tidak dikirim.
        </div>
        <button className="btn btn-g btn-sm" onClick={test} disabled={!s.aiApiKeySet || busy} title={s.aiApiKeySet ? '' : 'Simpan API key dulu'}>{busy ? 'Menguji…' : 'Uji Koneksi'}</button>
      </div>
    </div>
  );
}
