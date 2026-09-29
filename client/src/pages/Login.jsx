import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../components/Auth.jsx';
import { useSettings } from '../components/Settings.jsx';
import { useToast } from '../components/Toast.jsx';
import GoogleButton, { newNonce, takeNonce, rememberFrom, takeFrom } from '../components/GoogleButton.jsx';

// Kode dari callback Google hanya boleh ditukar sekali (StrictMode menjalankan efek dua kali di dev).
const handledCodes = new Set();

const GCAL_NOTICE = {
  ok: '📅 Google Calendar terhubung — tagihan sedang disinkronkan.',
  skip: 'Google Calendar belum dihubungkan. Anda bisa menghubungkannya nanti di Pengaturan.',
  error: '⚠️ Google Calendar gagal terhubung. Coba lagi di Pengaturan.',
};

export default function Login() {
  const { user, login, loginWithGoogle } = useAuth();
  const { kosName } = useSettings();
  const toast = useToast();
  const nav = useNavigate();
  const loc = useLocation();
  const [form, setForm] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [gBusy, setGBusy] = useState(false);
  const [show, setShow] = useState(false);
  const [googleOn, setGoogleOn] = useState(false);

  useEffect(() => { api.googleStatus().then((d) => setGoogleOn(Boolean(d.enabled))).catch(() => {}); }, []);

  // Kembali dari Google: ?gcode=… (berhasil) atau ?google=error&msg=…
  useEffect(() => {
    const p = new URLSearchParams(loc.search);
    if (p.get('google') === 'error') {
      setErr(p.get('msg') || 'Login Google gagal.');
      nav('/login', { replace: true });
      return;
    }
    const code = p.get('gcode');
    if (!code || handledCodes.has(code)) return;
    handledCodes.add(code);
    const gcal = p.get('gcal');
    setGBusy(true);
    loginWithGoogle(code, takeNonce())
      .then(() => {
        if (gcal && GCAL_NOTICE[gcal]) toast(GCAL_NOTICE[gcal]);
        nav(takeFrom(), { replace: true });
      })
      .catch((e) => { setErr(e.message); nav('/login', { replace: true }); })
      .finally(() => setGBusy(false));
  }, [loc.search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user && !new URLSearchParams(loc.search).get('gcode')) return <Navigate to={loc.state?.from || '/'} replace />;

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

  async function google() {
    setErr('');
    setGBusy(true);
    try {
      rememberFrom(loc.state?.from || '/');
      const { url } = await api.googleUrl(newNonce());
      window.location.assign(url);
    } catch (e) {
      setErr(e.message);
      setGBusy(false);
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
        {googleOn && (
          <>
            <GoogleButton onClick={google} busy={gBusy} />
            <div className="login-or"><span>atau dengan username</span></div>
          </>
        )}
        <form onSubmit={submit}>
          <div className="fg">
            <label className="fl" htmlFor="u">Username</label>
            <input id="u" className="fi" autoComplete="username" autoFocus={!googleOn} value={form.username}
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
