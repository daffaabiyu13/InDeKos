import { useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import AddResidentModal from './components/AddResidentModal.jsx';
import { Icons } from './components/icons.jsx';
import { ToastProvider, useToast } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Confirm.jsx';
import { SettingsProvider, useSettings } from './components/Settings.jsx';
import { api } from './api.js';

import Dashboard from './pages/Dashboard.jsx';
import Penghuni from './pages/Penghuni.jsx';
import Kamar from './pages/Kamar.jsx';
import Pembayaran from './pages/Pembayaran.jsx';
import Keuangan from './pages/Keuangan.jsx';
import Pengeluaran from './pages/Pengeluaran.jsx';
import Pelanggaran from './pages/Pelanggaran.jsx';
import Mantan from './pages/Mantan.jsx';
import AIAnalisa from './pages/AIAnalisa.jsx';
import Pengaturan from './pages/Pengaturan.jsx';
import Pendaftaran from './pages/Pendaftaran.jsx';
import FormPendaftaran from './pages/FormPendaftaran.jsx';
import Bayar from './pages/Bayar.jsx';

function buildTitles(kosName) {
  return {
    '/': ['Dashboard', `Ringkasan ${kosName} · September 2026`],
    '/penghuni': ['Data Penghuni', `15 penghuni aktif · ${kosName}`],
    '/kamar': ['Manajemen Kamar', `${kosName} · 20 kamar total`],
    '/pembayaran': ['Pembayaran', 'September 2026'],
    '/pendaftaran': ['Verifikasi Pendaftaran', 'Calon penghuni menunggu penempatan kamar'],
    '/keuangan': ['Keuangan', 'Laporan keuangan terpadu'],
    '/pengeluaran': ['Pengeluaran', 'Catatan pengeluaran operasional'],
    '/pelanggaran': ['Pelanggaran', '3 catatan aktif'],
    '/mantan': ['Mantan Penghuni', '38 data alumni kos'],
    '/ai': ['AI Analisa', 'Powered by InDeKos AI'],
    '/pengaturan': ['Pengaturan', 'Konfigurasi properti kos'],
  };
}

function Layout({ collapsed, setCollapsed, openModal, pendingCount }) {
  const { pathname } = useLocation();
  const toast = useToast();
  const { kosName } = useSettings();
  const [title, sub] = buildTitles(kosName)[pathname] || ['InDeKos', ''];

  return (
    <div className={`app${collapsed ? ' sb-c' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        kosName={kosName}
        pendingCount={pendingCount}
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
            <button className="notif-btn" onClick={() => toast('🔔 3 tagihan menunggak · 2 pelanggaran aktif memerlukan tindak lanjut.')} title="Notifikasi"><Icons.bell /><div className="ndot" /></button>
            <button className="btn btn-p btn-sm" onClick={openModal}>+ Tambah Penghuni</button>
          </div>
        </header>
        <div className="cnt">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('indekos-sb') === '1'; } catch { return false; }
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [version, setVersion] = useState(0); // bump to refetch after mutations
  const [availableRooms, setAvailableRooms] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    api.rooms().then((rooms) => {
      setAvailableRooms(rooms.filter((r) => r.status === 'av').map((r) => r.n));
    }).catch(() => {});
    api.applications('pending').then((a) => setPendingCount(a.length)).catch(() => {});
  }, [version]);

  return (
    <ToastProvider>
      <SettingsProvider>
      <ConfirmProvider>
      <Routes>
        <Route path="/form" element={<FormPendaftaran />} />
        <Route path="/bayar" element={<Bayar />} />
        <Route
          element={
            <Layout
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              openModal={() => setModalOpen(true)}
              pendingCount={pendingCount}
            />
          }
        >
          <Route index element={<Dashboard version={version} />} />
          <Route path="penghuni" element={<Penghuni version={version} onChange={refresh} openModal={() => setModalOpen(true)} />} />
          <Route path="kamar" element={<Kamar version={version} />} />
          <Route path="pembayaran" element={<Pembayaran version={version} onChange={refresh} />} />
          <Route path="pendaftaran" element={<Pendaftaran version={version} onChange={refresh} />} />
          <Route path="keuangan" element={<Keuangan version={version} />} />
          <Route path="pengeluaran" element={<Pengeluaran version={version} onChange={refresh} />} />
          <Route path="pelanggaran" element={<Pelanggaran version={version} onChange={refresh} />} />
          <Route path="mantan" element={<Mantan version={version} />} />
          <Route path="ai" element={<AIAnalisa />} />
          <Route path="pengaturan" element={<Pengaturan onSaved={refresh} />} />
        </Route>
      </Routes>

      <AddResidentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        availableRooms={availableRooms}
        onAdded={refresh}
      />
      </ConfirmProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}
