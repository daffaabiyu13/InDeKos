import { useCallback, useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import AddResidentModal from './components/AddResidentModal.jsx';
import { Icons } from './components/icons.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import { SettingsProvider, useSettings } from './components/Settings.jsx';
import { AuthProvider, RequireAuth, RequirePemilik, useAuth } from './components/Auth.jsx';
import { api } from './api.js';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Penghuni from './pages/Penghuni.jsx';
import ResidentDetail from './pages/ResidentDetail.jsx';
import Kamar from './pages/Kamar.jsx';
import Pembayaran from './pages/Pembayaran.jsx';
import Keuangan from './pages/Keuangan.jsx';
import Pengeluaran from './pages/Pengeluaran.jsx';
import Pelanggaran from './pages/Pelanggaran.jsx';
import Mantan from './pages/Mantan.jsx';
import AIAnalisa from './pages/AIAnalisa.jsx';
import Pengaturan from './pages/Pengaturan.jsx';
import Akun from './pages/Akun.jsx';
import Pendaftaran from './pages/Pendaftaran.jsx';
import PengajuanKeluar from './pages/PengajuanKeluar.jsx';
import FormPendaftaran from './pages/FormPendaftaran.jsx';
import FormKeluar from './pages/FormKeluar.jsx';
import Bayar from './pages/Bayar.jsx';
import InvoicePublic from './pages/InvoicePublic.jsx';

function buildTitles(kosName) {
  return {
    '/': ['Dashboard', `Ringkasan ${kosName}`],
    '/penghuni': ['Data Penghuni', kosName],
    '/kamar': ['Manajemen Kamar', 'Status, tipe, harga & fasilitas kamar'],
    '/pembayaran': ['Pembayaran', 'Invoice, kalender penagihan, promo, charge & denda'],
    '/pendaftaran': ['Verifikasi Pendaftaran', 'Calon penghuni menunggu penempatan kamar'],
    '/pengajuan-keluar': ['Pengajuan Keluar', 'Penghuni yang akan keluar'],
    '/keuangan': ['Keuangan', 'Laporan keuangan terpadu'],
    '/pengeluaran': ['Pengeluaran', 'Input manual atau scan struk'],
    '/pelanggaran': ['Pelanggaran', 'Kategori custom · riwayat disimpan 1 tahun'],
    '/mantan': ['Mantan Penghuni', 'Arsip penghuni yang sudah keluar'],
    '/ai': ['AI Analisa', 'Powered by InDeKos AI'],
    '/pengaturan': ['Pengaturan', 'Konfigurasi properti, pembayaran & integrasi'],
    '/akun': ['Akun', 'Password & pengguna'],
  };
}

function Layout({ version, refresh }) {
  const { pathname } = useLocation();
  const toast = useToast();
  const { kosName } = useSettings();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('indekos-sb') === '1'; } catch { return false; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    api.dashboard().then((d) => setCounts({
      residents: d.stats.activeResidents,
      pendingConfirm: d.stats.pendingConfirm,
      pendingApplications: d.stats.pendingApplications,
      pendingExits: d.stats.pendingExits,
      arrears: d.stats.arrears,
    })).catch(() => {});
  }, [version, pathname]);

  const titles = buildTitles(kosName);
  const [title, sub] = titles[pathname] || (pathname.startsWith('/penghuni/') ? ['Detail Penghuni', kosName] : ['InDeKos', '']);

  return (
    <div className={`app${collapsed ? ' sb-c' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        kosName={kosName}
        counts={counts}
        onToggle={() => {
          const next = !collapsed;
          setCollapsed(next);
          try { localStorage.setItem('indekos-sb', next ? '1' : '0'); } catch { /* ignore */ }
        }}
      />
      <div className="main">
        <header className="tb">
          <div>
            <div className="tb-title">{title}</div>
            <div className="tb-sub">{sub}</div>
          </div>
          <div className="tb-r">
            <button
              className="notif-btn"
              title="Notifikasi"
              onClick={() => toast(`🔔 ${counts.arrears || 0} penghuni menunggak · ${counts.pendingConfirm || 0} pembayaran menunggu verifikasi · ${counts.pendingApplications || 0} pendaftaran · ${counts.pendingExits || 0} pengajuan keluar`)}
            >
              <Icons.bell />
              {(counts.pendingConfirm || counts.pendingApplications || counts.pendingExits) ? <div className="ndot" /> : null}
            </button>
            <button className="btn btn-p btn-sm" onClick={() => setModalOpen(true)}>+ Tambah Penghuni</button>
          </div>
        </header>
        <div className="cnt">
          <Outlet />
        </div>
      </div>
      {modalOpen && <AddResidentModal onClose={() => setModalOpen(false)} onAdded={refresh} />}
    </div>
  );
}

function ProtectedApp() {
  const [version, setVersion] = useState(0); // bump to refetch after mutations
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const { isPemilik } = useAuth();
  const p = { version, onChange: refresh };

  return (
    <Routes>
      <Route element={<Layout version={version} refresh={refresh} />}>
        <Route index element={<Dashboard {...p} />} />
        <Route path="penghuni" element={<Penghuni {...p} />} />
        <Route path="penghuni/:id" element={<ResidentDetail {...p} />} />
        <Route path="kamar" element={<Kamar {...p} />} />
        <Route path="pembayaran" element={<Pembayaran {...p} />} />
        <Route path="pendaftaran" element={<Pendaftaran {...p} />} />
        <Route path="pengajuan-keluar" element={<PengajuanKeluar {...p} />} />
        <Route path="keuangan" element={<Keuangan {...p} />} />
        <Route path="pengeluaran" element={<Pengeluaran {...p} />} />
        <Route path="pelanggaran" element={<Pelanggaran {...p} />} />
        <Route path="mantan" element={<Mantan {...p} />} />
        <Route path="ai" element={<AIAnalisa />} />
        <Route path="pengaturan" element={isPemilik ? <Pengaturan onSaved={refresh} /> : <RequirePemilik />} />
        <Route path="akun" element={<Akun />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <ConfirmProvider>
            <Routes>
              {/* Halaman publik (tanpa login) */}
              <Route path="/login" element={<Login />} />
              <Route path="/form" element={<FormPendaftaran />} />
              <Route path="/keluar" element={<FormKeluar />} />
              <Route path="/bayar" element={<Bayar />} />
              <Route path="/invoice/:publicId" element={<InvoicePublic />} />
              {/* Panel pengelola */}
              <Route path="/*" element={<RequireAuth><ProtectedApp /></RequireAuth>} />
            </Routes>
          </ConfirmProvider>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
