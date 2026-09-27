import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/Auth.jsx';
import { useSettings } from '../components/Settings.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const { kosName } = useSettings();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(form.username.trim(), form.password);
      nav(loc.state?.from || '/', { replace: true });
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-public login-page">
      <div className="fp-card login-card">
        <div className="fp-head" style={{ justifyContent: 'center', borderBottom: 'none', paddingBottom: 6 }}>
          <div className="fp-logo">In</div>
          <div>
            <div className="fp-brand">Inde<em>Kos</em></div>
            <div className="fp-kos">{kosName}</div>
          </div>
        </div>
        <div className="fp-intro" style={{ textAlign: 'center' }}>
          <h1>Masuk ke Panel Pengelola</h1>
          <p>Khusus pemilik & admin kos.</p>
        </div>
        {err && <div className="fp-alert" role="alert">⚠️ {err}</div>}
        <form onSubmit={submit}>
          <div className="fg">
            <label className="fl" htmlFor="u">Username</label>
            <input id="u" className="fi" autoComplete="username" autoFocus value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="p">Password</label>
            <div style={{ position: 'relative' }}>
              <input id="p" className="fi" type={show ? 'text' : 'password'} autoComplete="current-password" value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required style={{ paddingRight: 64 }} />
              <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)}>{show ? 'Sembunyi' : 'Lihat'}</button>
            </div>
          </div>
          <button className="btn btn-p fp-submit" type="submit" disabled={busy}>{busy ? 'Masuk...' : 'Masuk'}</button>
        </form>
        <div className="login-links">
          <span>Penghuni?</span>
          <a href="/bayar">Bayar sewa</a>·<a href="/form">Daftar kos</a>·<a href="/keluar">Ajukan keluar</a>
        </div>
      </div>
    </div>
  );
}
