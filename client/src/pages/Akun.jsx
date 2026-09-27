import { useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { useAuth } from '../components/Auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Confirm.jsx';
import { fmtDate } from '../helpers.js';
import Modal from '../components/Modal.jsx';

export default function Akun() {
  const { user, isPemilik } = useAuth();
  return (
    <div className="g2">
      <div>
        <div className="card mb">
          <div className="ch"><div className="ct">Profil</div></div>
          <div className="cb" style={{ fontSize: 13, display: 'grid', gap: 8 }}>
            <div><span className="tm">Nama</span><div className="tn">{user.name}</div></div>
            <div><span className="tm">Username</span><div className="tn">{user.username}</div></div>
            <div><span className="tm">Peran</span><div><span className="badge b-cor">{user.role === 'pemilik' ? 'Pemilik' : 'Admin'}</span></div></div>
          </div>
        </div>
        <ChangePassword />
      </div>
      {isPemilik ? <Users /> : (
        <div className="card"><div className="cb tm">Pengelolaan akun pengguna hanya dapat dilakukan oleh <strong>Pemilik</strong>.</div></div>
      )}
    </div>
  );
}

function ChangePassword() {
  const toast = useToast();
  const [f, setF] = useState({ current: '', next: '', confirm: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function submit(e) {
    e.preventDefault();
    if (f.next !== f.confirm) { toast('⚠️ Konfirmasi password tidak sama.'); return; }
    try { await api.changePassword(f.current, f.next); toast('✅ Password berhasil diganti.'); setF({ current: '', next: '', confirm: '' }); } catch (err) { toast(`⚠️ ${err.message}`); }
  }
  return (
    <form className="card" onSubmit={submit}>
      <div className="ch"><div><div className="ct">Ganti Password</div><div className="cs">Minimal 8 karakter</div></div></div>
      <div className="cb">
        <div className="fg"><label className="fl">Password saat ini</label><input type="password" className="fi" autoComplete="current-password" value={f.current} onChange={set('current')} required /></div>
        <div className="fg"><label className="fl">Password baru</label><input type="password" className="fi" autoComplete="new-password" minLength={8} value={f.next} onChange={set('next')} required /></div>
        <div className="fg"><label className="fl">Ulangi password baru</label><input type="password" className="fi" autoComplete="new-password" value={f.confirm} onChange={set('confirm')} required /></div>
        <button className="btn btn-p" type="submit">Simpan Password</button>
      </div>
    </form>
  );
}

function Users() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [ver, setVer] = useState(0);
  const { data: users } = useFetch(() => api.users(), [ver]);
  const [edit, setEdit] = useState(null);
  const reload = () => setVer((v) => v + 1);

  async function remove(u) {
    if (!(await confirm({ title: 'Hapus Akun', message: `Hapus akun ${u.username}? Pengguna tidak bisa login lagi.`, confirmText: 'Hapus', danger: true }))) return;
    try { await api.deleteUser(u.id); toast('Akun dihapus.'); reload(); } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <div className="card">
      <div className="ch"><div><div className="ct">Pengguna</div><div className="cs">Pemilik: akses penuh · Admin: operasional harian</div></div>
        <button className="btn btn-p btn-sm" onClick={() => setEdit({})}>+ Tambah Pengguna</button></div>
      <div className="tw">
        <table>
          <thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Dibuat</th><th /></tr></thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id}>
                <td className="tn">{u.name}{u.id === user.id && <span className="tm"> (Anda)</span>}</td>
                <td className="tm">{u.username}</td>
                <td><span className={`badge ${u.role === 'pemilik' ? 'b-cor' : 'b-neu'}`}>{u.role === 'pemilik' ? 'Pemilik' : 'Admin'}</span></td>
                <td className="tm">{fmtDate(u.createdAt?.slice(0, 10))}</td>
                <td><div className="row-actions">
                  <button className="btn btn-g btn-sm" onClick={() => setEdit(u)}>Ubah</button>
                  {u.id !== user.id && <button className="btn btn-g btn-sm" onClick={() => remove(u)}>✕</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && <UserModal u={edit} onClose={() => setEdit(null)} onDone={reload} />}
    </div>
  );
}

function UserModal({ u, onClose, onDone }) {
  const toast = useToast();
  const isNew = !u.id;
  const [f, setF] = useState({ username: u.username || '', name: u.name || '', role: u.role || 'admin', password: '' });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    try {
      if (isNew) await api.addUser(f);
      else await api.updateUser(u.id, { name: f.name, role: f.role, ...(f.password ? { password: f.password } : {}) });
      toast('✅ Akun disimpan.');
      onDone();
      onClose();
    } catch (e) { toast(`⚠️ ${e.message}`); }
  }
  return (
    <Modal title={isNew ? 'Tambah Pengguna' : `Ubah ${u.username}`} onClose={onClose} width={420} footer={<>
      <button className="btn btn-g" onClick={onClose}>Batal</button><button className="btn btn-p" onClick={save}>Simpan</button>
    </>}>
      {isNew && <div className="fg"><label className="fl">Username</label><input className="fi" autoComplete="off" value={f.username} onChange={set('username')} /></div>}
      <div className="fg"><label className="fl">Nama</label><input className="fi" value={f.name} onChange={set('name')} /></div>
      <div className="fg"><label className="fl">Peran</label>
        <select className="fi" value={f.role} onChange={set('role')}><option value="admin">Admin (operasional)</option><option value="pemilik">Pemilik (akses penuh)</option></select>
      </div>
      <div className="fg"><label className="fl">{isNew ? 'Password' : 'Reset password (opsional)'}</label><input type="password" className="fi" autoComplete="new-password" placeholder="Minimal 8 karakter" value={f.password} onChange={set('password')} /></div>
    </Modal>
  );
}
