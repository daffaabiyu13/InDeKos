import { NavLink } from 'react-router-dom';
import { Icons } from './icons.jsx';
import { useAuth } from './Auth.jsx';

// `badge` = key into the counts object; `pemilik` = owner-only item.
const groups = [
  {
    label: 'Utama',
    items: [
      { to: '/', key: 'dashboard', label: 'Dashboard', end: true },
      { to: '/penghuni', key: 'penghuni', label: 'Penghuni', badge: 'residents' },
      { to: '/kamar', key: 'kamar', label: 'Kamar' },
      { to: '/pembayaran', key: 'pembayaran', label: 'Pembayaran', badge: 'pendingConfirm' },
    ],
  },
  {
    label: 'Keuangan',
    items: [
      { to: '/keuangan', key: 'keuangan', label: 'Keuangan' },
      { to: '/pengeluaran', key: 'pengeluaran', label: 'Pengeluaran' },
    ],
  },
  {
    label: 'Administrasi',
    items: [
      { to: '/pendaftaran', key: 'pendaftaran', label: 'Pendaftaran', badge: 'pendingApplications' },
      { to: '/pengajuan-keluar', key: 'keluar', label: 'Pengajuan Keluar', badge: 'pendingExits' },
      { to: '/pelanggaran', key: 'pelanggaran', label: 'Pelanggaran' },
      { to: '/mantan', key: 'mantan', label: 'Mantan Penghuni' },
    ],
  },
  {
    label: 'AI & Insight',
    items: [{ to: '/ai', key: 'ai', label: 'AI Analisa' }],
  },
  {
    label: 'Sistem',
    items: [
      { to: '/pengaturan', key: 'setting', label: 'Pengaturan', pemilik: true },
      { to: '/akun', key: 'akun', label: 'Akun' },
    ],
  },
];

export default function Sidebar({ collapsed, onToggle, kosName, counts = {} }) {
  const { user, isPemilik, logout } = useAuth();
  return (
    <aside className="sb">
      <div className="sb-logo">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="logo-row">
            <div className="logo-icon">In</div>
            <div className="logo-text">Inde<em>Kos</em></div>
          </div>
          <button className="sb-tog" onClick={onToggle} title={collapsed ? 'Perbesar sidebar' : 'Perkecil sidebar'}>
            <Icons.chevron />
          </button>
        </div>
        <div className="kos-chip">
          <small>Properti aktif</small>
          <strong>{kosName}</strong>
        </div>
      </div>

      <nav className="sb-nav">
        {groups.map((g) => {
          const items = g.items.filter((it) => !it.pemilik || isPemilik);
          if (!items.length) return null;
          return (
            <div key={g.label}>
              <span className="nav-label">{g.label}</span>
              {items.map((it) => {
                const Icon = Icons[it.key];
                const badge = it.badge ? counts[it.badge] : null;
                return (
                  <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `ni${isActive ? ' active' : ''}`}>
                    <Icon />
                    <span className="ni-lbl">
                      {it.label}
                      {badge ? <span className="nb">{badge}</span> : null}
                    </span>
                    <span className="ni-tip">{it.label}</span>
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="sb-foot">
        <div className="ua">
          <div className="uav">{(user?.name || 'A')[0].toUpperCase()}</div>
          <div className="ua-info">
            <div className="ua-name">{user?.name}</div>
            <div className="ua-role">{user?.role === 'pemilik' ? 'Pemilik Kos' : 'Admin'}</div>
          </div>
          <button className="ua-out" onClick={logout} title="Keluar"><Icons.logout /></button>
        </div>
      </div>
    </aside>
  );
}
