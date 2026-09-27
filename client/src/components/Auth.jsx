import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, tokenStore } from '../api.js';

const AuthCtx = createContext(null);

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Validasi token yang tersimpan saat aplikasi dibuka.
  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api.me().then((d) => setUser(d.user)).catch(() => tokenStore.clear()).finally(() => setReady(true));
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  // Token kedaluwarsa di tengah pemakaian → keluar otomatis.
  useEffect(() => {
    window.addEventListener('indekos:unauthorized', logout);
    return () => window.removeEventListener('indekos:unauthorized', logout);
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const { token, user: u } = await api.login(username, password);
    tokenStore.set(token);
    setUser(u);
    return u;
  }, []);

  const value = { user, ready, login, logout, isPemilik: user?.role === 'pemilik' };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="loading">Memuat…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

// Hanya pemilik; admin diarahkan kembali ke dashboard.
export function RequirePemilik({ children }) {
  const { isPemilik } = useAuth();
  if (!isPemilik) {
    return (
      <div className="card"><div className="cb" style={{ textAlign: 'center', padding: 40, color: 'var(--t2)' }}>
        🔒 Halaman ini khusus untuk akun <strong>Pemilik</strong>.
      </div></div>
    );
  }
  return children;
}
