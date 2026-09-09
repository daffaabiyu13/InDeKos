import { NavLink } from 'react-router-dom';
import { Icons } from './icons.jsx';

const groups = [
  {
    label: 'Utama',
    items: [
      { to: '/', key: 'dashboard', label: 'Dashboard', end: true },
      { to: '/penghuni', key: 'penghuni', label: 'Penghuni', badge: '15' },
      { to: '/kamar', key: 'kamar', label: 'Kamar' },
      { to: '/pembayaran', key: 'pembayaran', label: 'Pembayaran', badge: '3' },
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
      { to: '/pendaftaran', key: 'pendaftaran', label: 'Pendaftaran', dynamic: 'pending' },
      { to: '/pelanggaran', key: 'pelanggaran', label: 'Pelanggaran', badge: '2' },
      { to: '/mantan', key: 'mantan', label: 'Mantan Penghuni' },
    ],
  },
  {
    label: 'AI & Insight',
    items: [{ to: '/ai', key: 'ai', label: 'AI Analisa' }],
  },
  {
    label: 'Sistem',
    items: [{ to: '/pengaturan', key: 'setting', label: 'Pengaturan' }],
  },
];

export default function Sidebar({ collapsed, onToggle, kosName, pendingCount = 0 }) {
  return (
    <aside className="sb">
      <div className="sb-logo">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div className="logo-row">
            <div className="logo-icon">In</div>
            <div className="logo-text">
              Inde<em>Kos</em>
            </div>
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
        {groups.map((g) => (
          <div key={g.label}>
            <span className="nav-label">{g.label}</span>
            {g.items.map((it) => {
              const Icon = Icons[it.key];
              const badge = it.dynamic === 'pending' ? (pendingCount || null) : it.badge;
              return (
                <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `ni${isActive ? ' active' : ''}`}>
                  <Icon />
                  <span className="ni-lbl">
                    {it.label}
                    {badge && <span className="nb">{badge}</span>}
                  </span>
                  <span className="ni-tip">{it.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="sb-foot">
        <div className="ua">
          <div className="uav">A</div>
          <div className="ua-info">
            <div className="ua-name">Admin</div>
            <div className="ua-role">Pemilik Kos</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
