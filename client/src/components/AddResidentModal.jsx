import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from './Modal.jsx';
import PhotoInput from './PhotoInput.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtRp, todayISO } from '../helpers.js';

const empty = () => ({
  name: '', room: '', masuk: todayISO(), dueDay: '', wa: '', job: 'Mahasiswa', uni: '', nik: '', alamat: '',
  emergencyName: '', emergencyRel: 'Ayah', emergencyWa: '', emergency2Name: '', emergency2Rel: 'Ibu', emergency2Wa: '',
  dailyRateEnabled: false, dailyRate: '', reminderEnabled: true, ktpPhoto: '', selfiePhoto: '',
});

export default function AddResidentModal({ onClose, onAdded }) {
  const [form, setForm] = useState(empty);
  const [rooms, setRooms] = useState([]);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const nav = useNavigate();

  useEffect(() => { api.rooms().then((r) => setRooms(r.filter((x) => x.status === 'av'))).catch(() => {}); }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const room = rooms.find((r) => r.number === form.room);
  const dueDay = form.dueDay || (form.masuk ? Number(form.masuk.slice(8, 10)) : '');

  async function submit() {
    if (!form.name.trim() || !form.room || !form.masuk || !form.wa.trim()) { toast('⚠️ Nama, kamar, tanggal masuk & No. WA wajib diisi.'); return; }
    setSaving(true);
    try {
      const r = await api.addResident({ ...form, dueDay: Number(dueDay), dailyRate: form.dailyRate ? Number(form.dailyRate) : null });
      toast(`✅ ${r.name} ditambahkan ke kamar ${r.room}. Invoice dibuat otomatis.`);
      onAdded?.();
      onClose();
      nav(`/penghuni/${r.id}`);
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Penghuni Baru" onClose={onClose} width={600} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button>
      <button className="btn btn-p" onClick={submit} disabled={saving}>{saving ? 'Menyimpan...' : 'Tambahkan Penghuni'}</button>
    </>}>
      <div className="fp-sec" style={{ marginTop: 0 }}>Data Penghuni</div>
      <div className="g2">
        <div className="fg"><label className="fl">Nama Lengkap <span className="req">*</span></label><input className="fi" value={form.name} onChange={set('name')} /></div>
        <div className="fg"><label className="fl">No. WhatsApp <span className="req">*</span></label><input className="fi" placeholder="08xx..." value={form.wa} onChange={set('wa')} /></div>
      </div>
      <div className="g2">
        <div className="fg">
          <label className="fl">Pekerjaan</label>
          <select className="fi" value={form.job} onChange={set('job')}><option>Mahasiswa</option><option>Karyawan/Pegawai</option><option>Lainnya</option></select>
        </div>
        <div className="fg"><label className="fl">Universitas / Kantor</label><input className="fi" value={form.uni} onChange={set('uni')} /></div>
      </div>
      <div className="g2">
        <div className="fg"><label className="fl">NIK</label><input className="fi" inputMode="numeric" value={form.nik} onChange={set('nik')} /></div>
        <div className="fg"><label className="fl">Alamat Asal</label><input className="fi" value={form.alamat} onChange={set('alamat')} /></div>
      </div>

      <div className="fp-sec">Kamar & Penagihan</div>
      <div className="g2">
        <div className="fg">
          <label className="fl">Kamar <span className="req">*</span></label>
          <select className="fi" value={form.room} onChange={set('room')}>
            <option value="">Pilih kamar kosong ({rooms.length})…</option>
            {rooms.map((r) => <option key={r.number} value={r.number}>Kamar {r.number} · {r.typeName || 'Tanpa tipe'} · {fmtRp(r.typePrice)}</option>)}
          </select>
          {room && <div className="field-hint">Fasilitas: {room.facilities.join(', ') || '—'}</div>}
        </div>
        <div className="fg"><label className="fl">Tanggal Masuk <span className="req">*</span></label><input type="date" className="fi" value={form.masuk} onChange={set('masuk')} /></div>
      </div>
      <div className="g2">
        <div className="fg">
          <label className="fl">Jatuh Tempo Tiap Bulan</label>
          <select className="fi" value={dueDay} onChange={set('dueDay')}>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>Tanggal {d}{form.masuk && d === Number(form.masuk.slice(8, 10)) ? ' (tgl masuk)' : ''}</option>)}
          </select>
        </div>
        <div className="fg">
          <label className="fl">Reminder WA H-3</label>
          <label className="switch-row"><input type="checkbox" checked={form.reminderEnabled} onChange={set('reminderEnabled')} /> Kirim pengingat otomatis</label>
        </div>
      </div>
      <div className="fg">
        <label className="switch-row"><input type="checkbox" checked={form.dailyRateEnabled} onChange={set('dailyRateEnabled')} /> Aktifkan rate harian (hari di luar periode penuh ditagih per hari)</label>
        {form.dailyRateEnabled && (
          <input className="fi" style={{ marginTop: 8 }} inputMode="numeric" placeholder="Rate harian (kosong = ikut default di Pengaturan)" value={form.dailyRate} onChange={set('dailyRate')} />
        )}
      </div>

      <div className="fp-sec">Kontak Darurat</div>
      <div className="g3">
        <div className="fg"><label className="fl">Nama (1)</label><input className="fi" value={form.emergencyName} onChange={set('emergencyName')} /></div>
        <div className="fg"><label className="fl">Hubungan</label><input className="fi" value={form.emergencyRel} onChange={set('emergencyRel')} /></div>
        <div className="fg"><label className="fl">No. WA</label><input className="fi" value={form.emergencyWa} onChange={set('emergencyWa')} /></div>
      </div>
      <div className="g3">
        <div className="fg"><label className="fl">Nama (2)</label><input className="fi" value={form.emergency2Name} onChange={set('emergency2Name')} /></div>
        <div className="fg"><label className="fl">Hubungan</label><input className="fi" value={form.emergency2Rel} onChange={set('emergency2Rel')} /></div>
        <div className="fg"><label className="fl">No. WA</label><input className="fi" value={form.emergency2Wa} onChange={set('emergency2Wa')} /></div>
      </div>

      <div className="fp-sec">Dokumen (opsional)</div>
      <div className="g2">
        <PhotoInput label="Foto KTP" value={form.ktpPhoto} capture="environment" onChange={(v) => setForm((f) => ({ ...f, ktpPhoto: v }))} />
        <PhotoInput label="Foto Selfie" value={form.selfiePhoto} capture="user" maxDim={960} onChange={(v) => setForm((f) => ({ ...f, selfiePhoto: v }))} />
      </div>
    </Modal>
  );
}
