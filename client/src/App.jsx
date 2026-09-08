import { useEffect, useState } from 'react';
import { Routes, Route, Outlet, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import AddResidentModal from './components/AddResidentModal.jsx';
import { Icons } from './components/icons.jsx';
import { ToastProvider } from './components/Toast.jsx';
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

const titles = {
  '/': ['Dashboard', 'Ringkasan Kos Elliptica · September 2026'],
  '/penghuni': ['Data Penghuni', '15 penghuni aktif · Kos Elliptica'],
  '/kamar': ['Manajemen Kamar', 'Kos Elliptica · 20 kamar total'],
  '/pembayaran': ['Pembayaran', 'September 2026'],
  '/keuangan': ['Keuangan', 'Laporan keuangan terpadu'],
  '/pengeluaran': ['Pengeluaran', 'Catatan pengeluaran operasional'],
  '/pelanggaran': ['Pelanggaran', '3 catatan aktif'],
  '/mantan': ['Mantan Penghuni', '38 data alumni kos'],
  '/ai': ['AI Analisa', 'Powered by InDeKos AI'],
  '/pengaturan': ['Pengaturan', 'Konfigurasi properti kos'],
};

function Layout({ collapsed, setCollapsed, openModal, kosName }) {
  const { pathname } = useLocation();
  const [title, sub] = titles[pathname] || ['InDeKos', ''];

  return (
    <div className={`app${collapsed ? ' sb-c' : ''}`}>
      <Sidebar
        collapsed={collapsed}
        kosName={kosName}
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
            <div className="notif-btn"><Icons.bell /><div className="ndot" /></div>
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
  const [kosName, setKosName] = useState('Kos Elliptica');

  const refresh = () => setVersion((v) => v + 1);

  useEffect(() => {
    api.rooms().then((rooms) => {
      setAvailableRooms(rooms.filter((r) => r.status === 'av').map((r) => r.n));
    }).catch(() => {});
    api.settings().then((s) => setKosName(s.namaKos)).catch(() => {});
  }, [version]);

  return (
    <ToastProvider>
      <Routes>
        <Route
          element={
            <Layout
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              openModal={() => setModalOpen(true)}
              kosName={kosName}
            />
          }
        >
          <Route index element={<Dashboard version={version} />} />
          <Route path="penghuni" element={<Penghuni version={version} onChange={refresh} openModal={() => setModalOpen(true)} />} />
          <Route path="kamar" element={<Kamar version={version} />} />
          <Route path="pembayaran" element={<Pembayaran version={version} onChange={refresh} />} />
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
    </ToastProvider>
  );
}
