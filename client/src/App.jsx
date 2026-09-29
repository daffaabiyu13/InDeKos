import { useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Outlet, useLocation, Navigate, NavLink } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import AddResidentModal from './components/AddResidentModal.jsx';
import { Icons } from './components/icons.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import { SettingsProvider, useSettings } from './components/Settings.jsx';
import { AuthProvider, RequireAuth, RequirePemilik, useAuth } from './components/Auth.jsx';
import { AIProvider, AIPanel, AIChat, AIFab } from './components/AI.jsx';
import { api } from './api.js';
import { PHONE, TABLET, useMediaQuery, useScrollLock, useAutoTableLabels } from './responsive.js';

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
import FormPindah from './pages/FormPindah.jsx';
import PindahKamar from './pages/PindahKamar.jsx';
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
    '/pindah-kamar': ['Pindah Kamar', 'Pengajuan & jadwal pindah kamar penghuni'],
    '/keuangan': ['Keuangan', 'Laporan keuangan terpadu'],
    '/pengeluaran': ['Pengeluaran', 'Input manual atau scan struk'],
    '/pelanggaran': ['Pelanggaran', 'Kategori custom · riwayat disimpan 1 tahun'],
    '/mantan': ['Mantan Penghuni', 'Arsip penghuni yang sudah keluar'],
    '/ai': ['AI Analisa', 'Tanya jawab & insight dari data kos'],
    '/pengaturan': ['Pengaturan', 'Konfigurasi properti, pembayaran & integrasi'],
    '/akun': ['Akun', 'Password & pengguna'],
  };
}

// Menu utama di bottom navigation (HP). Sisanya ada di drawer "Menu".
const BOTTOM_NAV = [
  { to: '/', key: 'dashboard', label: 'Beranda', end: true },
  { to: '/penghuni', key: 'penghuni', label: 'Penghuni' },
  { to: '/kamar', key: 'kamar', label: 'Kamar' },
  { to: '/pembayaran', key: 'pembayaran', label: 'Bayar', badge: 'pendingConfirm' },
];

function Layout({ version, refresh }) {
  const { pathname } = useLocation();
  const toast = useToast();
  const { kosName } = useSettings();
  const phone = useMediaQuery(PHONE);
  const tablet = useMediaQuery(TABLET);
  const [desktopCollapsed, setDesktopCollapsed] = useState(() => {
    try { return localStorage.getItem('indekos-sb') === '1'; } catch { return false; }
  });
  const [tabletOpen, setTabletOpen] = useState(false); // tablet: rail ikon, dibuka sebagai overlay
  const [drawer, setDrawer] = useState(false); // HP: menu geser dari kiri
  const [modalOpen, setModalOpen] = useState(false);
  const [counts, setCounts] = useState({});
  const cntRef = useRef(null);

  useAutoTableLabels(cntRef);
  useScrollLock(phone && drawer);

  useEffect(() => {
    api.dashboard().then((d) => setCounts({
      residents: d.stats.activeResidents,
      pendingConfirm: d.stats.pendingConfirm,
      pendingApplications: d.stats.pendingApplications,
      pendingExits: d.stats.pendingExits,
      pendingTransfers: d.stats.pendingTransfers,
      arrears: d.stats.arrears,
    })).catch(() => {});
  }, [version, pathname]);

  // Pindah halaman → tutup menu & mulai dari atas.
  useEffect(() => { setDrawer(false); setTabletOpen(false); window.scrollTo(0, 0); }, [pathname]);

  const overlayOpen = (phone && drawer) || (!phone && tablet && tabletOpen);
  const closeOverlay = useCallback(() => { setDrawer(false); setTabletOpen(false); }, []);
  useEffect(() => {
    if (!overlayOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeOverlay(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [overlayOpen, closeOverlay]);

  function toggleSidebar() {
    if (phone) setDrawer(false);
    else if (tablet) setTabletOpen((o) => !o);
    else {
      const next = !desktopCollapsed;
      setDesktopCollapsed(next);
      try { localStorage.setItem('indekos-sb', next ? '1' : '0'); } catch { /* ignore */ }
    }
  }

  const collapsed = !phone && (tablet ? !tabletOpen : desktopCollapsed);
  const titles = buildTitles(kosName);
  const [title, sub] = titles[pathname] || (pathname.startsWith('/penghuni/') ? ['Detail Penghuni', kosName] : ['InDeKos', '']);
  const menuBadge = (counts.pendingApplications || 0) + (counts.pendingExits || 0) + (counts.pendingTransfers || 0);
  const notify = () => toast(`🔔 ${counts.arrears || 0} penghuni menunggak · ${counts.pendingConfirm || 0} pembayaran menunggu verifikasi · ${counts.pendingApplications || 0} pendaftaran · ${counts.pendingTransfers || 0} pindah kamar · ${counts.pendingExits || 0} pengajuan keluar`);

  return (
    <div className={`app${collapsed ? ' sb-c' : ''}${phone && drawer ? ' m-open' : ''}${!phone && tablet && tabletOpen ? ' t-open' : ''}`}>
      <Sidebar collapsed={collapsed} mobile={phone} kosName={kosName} counts={counts} onToggle={toggleSidebar} />
      {overlayOpen && <div className="sb-backdrop" onClick={closeOverlay} aria-hidden="true" />}
      <div className="main">
        <header className="tb">
          {phone && (
            <button className="tb-icon" onClick={() => setDrawer(true)} aria-label="Buka menu" aria-expanded={drawer}>
              <Icons.menu />{menuBadge ? <span className="ndot" /> : null}
            </button>
          )}
          <div className="tb-text">
            <div className="tb-title">{title}</div>
            <div className="tb-sub">{sub}</div>
          </div>
          <div className="tb-r">
            <button className="notif-btn" title="Notifikasi" aria-label="Notifikasi" onClick={notify}>
              <Icons.bell />
              {(counts.pendingConfirm || counts.pendingApplications || counts.pendingExits || counts.pendingTransfers) ? <div className="ndot" /> : null}
            </button>
            {phone
              ? <button className="tb-icon tb-add" onClick={() => setModalOpen(true)} aria-label="Tambah penghuni"><Icons.plus /></button>
              : <button className="btn btn-p btn-sm" onClick={() => setModalOpen(true)}>+ Tambah Penghuni</button>}
          </div>
        </header>
        <div className="cnt" ref={cntRef}>
          <AIPanel />
          <Outlet />
        </div>
      </div>

      <AIFab />
      <AIChat />

      {phone && (
        <nav className="bnav" aria-label="Navigasi utama">
          {BOTTOM_NAV.map((it) => {
            const Icon = Icons[it.key];
            const badge = it.badge ? counts[it.badge] : 0;
            return (
              <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `bnav-i${isActive ? ' on' : ''}`}>
                <span className="bnav-ic"><Icon />{badge ? <span className="bnav-b">{badge}</span> : null}</span>
                <span>{it.label}</span>
              </NavLink>
            );
          })}
          <button className={`bnav-i${drawer ? ' on' : ''}`} onClick={() => setDrawer(true)} aria-label="Menu lainnya">
            <span className="bnav-ic"><Icons.more />{menuBadge ? <span className="bnav-b">{menuBadge}</span> : null}</span>
            <span>Menu</span>
          </button>
        </nav>
      )}

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
    <AIProvider version={version}>
    <Routes>
      <Route element={<Layout version={version} refresh={refresh} />}>
        <Route index element={<Dashboard {...p} />} />
        <Route path="penghuni" element={<Penghuni {...p} />} />
        <Route path="penghuni/:id" element={<ResidentDetail {...p} />} />
        <Route path="kamar" element={<Kamar {...p} />} />
        <Route path="pembayaran" element={<Pembayaran {...p} />} />
        <Route path="pendaftaran" element={<Pendaftaran {...p} />} />
        <Route path="pengajuan-keluar" element={<PengajuanKeluar {...p} />} />
        <Route path="pindah-kamar" element={<PindahKamar {...p} />} />
        <Route path="keuangan" element={<Keuangan {...p} />} />
        <Route path="pengeluaran" element={<Pengeluaran {...p} />} />
        <Route path="pelanggaran" element={<Pelanggaran {...p} />} />
        <Route path="mantan" element={<Mantan {...p} />} />
        <Route path="ai" element={<AIAnalisa {...p} />} />
        <Route path="pengaturan" element={isPemilik ? <Pengaturan onSaved={refresh} /> : <RequirePemilik />} />
        <Route path="akun" element={<Akun />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </AIProvider>
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
              <Route path="/pindah" element={<FormPindah />} />
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
