import { useState } from 'react';
import { Icons } from './icons.jsx';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';

const empty = {
  name: '', room: '', tempatLahir: '', tglLahir: '', alamat: '',
  wa: '', masuk: '', job: 'Mahasiswa', uni: '', wali: '', waliStatus: 'Ayah',
  waWali: '', sumber: 'Instagram',
};

export default function AddResidentModal({ open, onClose, availableRooms = [], onAdded }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  if (!open) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    if (!form.name || !form.room) {
      toast('⚠️ Nama dan kamar wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await api.addResident({
        name: form.name,
        room: form.room,
        masuk: form.masuk ? form.masuk.split('-').reverse().join('/') : '',
        job: form.job,
        wa: form.wa,
        uni: form.uni,
      });
      toast('✅ Penghuni berhasil ditambahkan!');
      setForm(empty);
      onAdded?.();
      onClose();
    } catch (err) {
      toast(`⚠️ ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mo open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="mh">
          <div className="mt">Tambah Penghuni Baru</div>
          <button className="mc" onClick={onClose}><Icons.close /></button>
        </div>
        <div className="mb2">
          <div className="g2">
            <div className="fg">
              <label className="fl">Nama Lengkap <span className="req">*</span></label>
              <input className="fi" placeholder="Sesuai KTP" value={form.name} onChange={set('name')} />
            </div>
            <div className="fg">
              <label className="fl">Nomor Kamar <span className="req">*</span></label>
              <select className="fi" value={form.room} onChange={set('room')}>
                <option value="">Pilih kamar tersedia...</option>
                {availableRooms.map((r) => (
                  <option key={r} value={r}>Kamar {r}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="g2">
            <div className="fg">
              <label className="fl">Tempat Lahir</label>
              <input className="fi" placeholder="Kota" value={form.tempatLahir} onChange={set('tempatLahir')} />
            </div>
            <div className="fg">
              <label className="fl">Tanggal Lahir</label>
              <input type="date" className="fi" value={form.tglLahir} onChange={set('tglLahir')} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Alamat</label>
            <input className="fi" placeholder="Sesuai KTP" value={form.alamat} onChange={set('alamat')} />
          </div>
          <div className="g2">
            <div className="fg">
              <label className="fl">No. WhatsApp <span className="req">*</span></label>
              <input className="fi" placeholder="08xx..." value={form.wa} onChange={set('wa')} />
            </div>
            <div className="fg">
              <label className="fl">Tanggal Masuk <span className="req">*</span></label>
              <input type="date" className="fi" value={form.masuk} onChange={set('masuk')} />
            </div>
          </div>
          <div className="g2">
            <div className="fg">
              <label className="fl">Pekerjaan/Profesi</label>
              <select className="fi" value={form.job} onChange={set('job')}>
                <option>Mahasiswa</option>
                <option>Karyawan/Pegawai</option>
                <option>Lainnya</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">Universitas (jika mahasiswa)</label>
              <select className="fi" value={form.uni} onChange={set('uni')}>
                <option value="">Pilih universitas...</option>
                <option>POLINEMA</option><option>UB</option><option>UMM</option>
                <option>UNISMA</option><option>UIN</option><option>ITN</option><option>Lainnya</option>
              </select>
            </div>
          </div>
          <div className="fg">
            <label className="fl">Nama Wali</label>
            <input className="fi" placeholder="Orang yang bisa dihubungi" value={form.wali} onChange={set('wali')} />
          </div>
          <div className="g2">
            <div className="fg">
              <label className="fl">Status Wali</label>
              <select className="fi" value={form.waliStatus} onChange={set('waliStatus')}>
                <option>Ayah</option><option>Ibu</option><option>Kakak</option>
                <option>Paman/Bibi</option><option>Lainnya</option>
              </select>
            </div>
            <div className="fg">
              <label className="fl">No. WA Wali</label>
              <input className="fi" placeholder="08xx..." value={form.waWali} onChange={set('waWali')} />
            </div>
          </div>
          <div className="fg">
            <label className="fl">Darimana mengetahui kos ini?</label>
            <select className="fi" value={form.sumber} onChange={set('sumber')}>
              <option>Instagram</option><option>TikTok</option>
              <option>Rekomendasi teman/kenalan</option>
              <option>Mamikos / platform kos online</option>
              <option>Papan nama / jalan-jalan</option><option>Lainnya</option>
            </select>
          </div>
        </div>
        <div className="mf">
          <button className="btn btn-g" onClick={onClose}>Batal</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Menyimpan...' : 'Tambahkan Penghuni'}
          </button>
        </div>
      </div>
    </div>
  );
}
