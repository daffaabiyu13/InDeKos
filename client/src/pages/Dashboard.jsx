import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { toVar, fmtRp, fmtRpShort, fmtDate, timeAgo, BULAN_PANJANG, INVOICE_STATE, KIND_LABEL } from '../helpers.js';
import { useAuth } from '../components/Auth.jsx';

export default function Dashboard({ version }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const { data, loading, error } = useFetch(() => api.dashboard(), [version]);

  if (error) return <div className="loading">⚠️ {error.message}</div>;
  if (loading || !data) return <div className="loading">Memuat dashboard…</div>;

  const { stats, revenues, activities, overdue, occupancy } = data;
  const max = Math.max(1, ...revenues.map((r) => r.v));
  const diff = stats.incomeThisMonth - stats.incomePrevMonth;
  const monthName = BULAN_PANJANG[new Date().getMonth()];

  // Donut (r = 50, keliling ≈ 314)
  const C = 314;
  const seg = (n) => (stats.totalRooms ? (n / stats.totalRooms) * C : 0);
  const occLen = seg(occupancy.terisi);
  const avLen = seg(occupancy.tersedia);
  const mnLen = seg(occupancy.perbaikan);

  const alerts = [
    stats.pendingConfirm && { t: `${stats.pendingConfirm} pembayaran menunggu verifikasi`, to: '/pembayaran' },
    stats.pendingApplications && { t: `${stats.pendingApplications} pendaftaran baru`, to: '/pendaftaran' },
    stats.pendingExits && { t: `${stats.pendingExits} pengajuan keluar`, to: '/pengajuan-keluar' },
  ].filter(Boolean);

  return (
    <>
      <div className="welcome-banner">
        <div className="wb-l">
          <div className="wb-greeting">Selamat datang kembali</div>
          <div className="wb-name">Halo, <em>{user?.name}</em> 👋</div>
          <div className="wb-meta">
            <div className="wb-stat"><div className="wb-stat-dot" style={{ background: 'var(--sage)' }} /><strong>{stats.activeResidents}</strong> penghuni aktif</div>
            <div className="wb-stat"><div className="wb-stat-dot" style={{ background: '#E59A8F' }} /><strong>{stats.arrears}</strong> menunggak</div>
            <div className="wb-stat"><div className="wb-stat-dot" style={{ background: '#fff' }} /><strong>{stats.availableRooms}</strong> kamar kosong</div>
          </div>
        </div>
        <div className="wb-r">
          <div className="wb-date">{monthName} {new Date().getFullYear()}</div>
          <div className="wb-month">{fmtRpShort(stats.incomeThisMonth)}</div>
          <div className="wb-income">Pendapatan diterima bulan ini</div>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="alert-row">
          {alerts.map((a) => <button key={a.to} className="alert-chip" onClick={() => nav(a.to)}>⚡ {a.t} →</button>)}
        </div>
      )}

      <div className="sg">
        <div className="tile t-blue"><div className="tile-lbl">Penghuni Aktif</div><div className="tile-val blue">{stats.activeResidents}</div><div className="tile-ch">{stats.occupiedRooms} kamar terisi</div></div>
        <div className="tile t-ok"><div className="tile-lbl">Kamar Kosong</div><div className="tile-val ok">{stats.availableRooms}</div><div className="tile-ch">dari {stats.totalRooms} kamar · {stats.maintenanceRooms} perbaikan</div></div>
        <div className="tile t-cor"><div className="tile-lbl">Pendapatan {monthName}</div><div className="tile-val cor" style={{ fontSize: 22 }}>{fmtRpShort(stats.incomeThisMonth)}</div>
          <div className={`tile-ch ${diff >= 0 ? 'up' : 'dn'}`}>{diff >= 0 ? '↑' : '↓'} {fmtRpShort(Math.abs(diff))} dari bulan lalu</div></div>
        <div className="tile t-warn"><div className="tile-lbl">Penghuni Menunggak</div><div className="tile-val warn">{stats.arrears}</div><div className="tile-ch dn">{overdue.length} invoice terlambat</div></div>
      </div>

      <div className="g2 mb">
        <div className="card">
          <div className="ch"><div><div className="ct">Pendapatan Bulanan</div><div className="cs">6 bulan terakhir · dari invoice lunas</div></div></div>
          <div className="cb">
            <div className="bch">
              {revenues.map((r, i) => (
                <div className="bi" key={r.key}>
                  <div className="bval">{(r.v / 1e6).toFixed(1)}jt</div>
                  <div className="bar" style={{ height: Math.max(2, Math.round((r.v / max) * 118)), background: i === revenues.length - 1 ? 'var(--jade)' : 'var(--sage)' }} title={fmtRp(r.v)} />
                  <div className="blbl">{r.m}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Tingkat Hunian Kamar</div></div>
          <div className="cb">
            <div className="dw">
              <svg width="126" height="126" viewBox="0 0 126 126" role="img" aria-label={`${occupancy.pct}% terisi`}>
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--bdr)" strokeWidth="16" />
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--room-oc)" strokeWidth="16" strokeDasharray={`${occLen} ${C}`} transform="rotate(-90 63 63)" />
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--room-av)" strokeWidth="16" strokeDasharray={`${avLen} ${C}`} strokeDashoffset={-occLen} transform="rotate(-90 63 63)" />
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--room-mn)" strokeWidth="16" strokeDasharray={`${mnLen} ${C}`} strokeDashoffset={-(occLen + avLen)} transform="rotate(-90 63 63)" />
                <text x="63" y="58" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--t1)" fontFamily="Plus Jakarta Sans,sans-serif">{occupancy.pct}%</text>
                <text x="63" y="73" textAnchor="middle" fontSize="11" fill="var(--t2)" fontFamily="Plus Jakarta Sans,sans-serif">terisi</text>
              </svg>
              <div className="dleg">
                <div className="dli"><div className="dot" style={{ background: 'var(--room-oc)' }} /><div><strong>{occupancy.terisi}</strong> Terisi</div></div>
                <div className="dli"><div className="dot" style={{ background: 'var(--room-av)' }} /><div><strong>{occupancy.tersedia}</strong> Kosong</div></div>
                <div className="dli"><div className="dot" style={{ background: 'var(--room-mn)' }} /><div><strong>{occupancy.perbaikan}</strong> Perbaikan</div></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="ch"><div className="ct">Aktivitas Terkini</div></div>
          <div className="cb" style={{ paddingTop: 0 }}>
            <div className="al">
              {activities.map((a, i) => (
                <div className="ai-item" key={i}>
                  <div className="adot" style={{ background: toVar(a.c) }} />
                  <div>
                    <div className="at" dangerouslySetInnerHTML={{ __html: a.t }} />
                    <div className="atime">{timeAgo(a.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <div className="ct">Invoice Terlambat</div>
            <button className="btn btn-g btn-sm" onClick={() => nav('/pembayaran')}>Lihat semua</button>
          </div>
          <div className="tw">
            <table>
              <thead><tr><th>Penghuni</th><th>Tagihan</th><th>Jatuh Tempo</th><th>Status</th></tr></thead>
              <tbody>
                {overdue.length === 0 && <tr><td colSpan="4" className="empty">🎉 Tidak ada tunggakan</td></tr>}
                {overdue.slice(0, 8).map((t) => (
                  <tr key={t.id} className="row-link" onClick={() => t.residentId && nav(`/penghuni/${t.residentId}`)}>
                    <td><div className="tn">{t.name}</div><div className="tm">Kamar {t.room}</div></td>
                    <td><div style={{ fontWeight: 700, color: 'var(--err)' }}>{fmtRp(t.amount)}</div><div className="tm">{KIND_LABEL[t.kind]}</div></td>
                    <td className="tm">{fmtDate(t.dueDate)}<div>{t.daysLate} hari</div></td>
                    <td><span className={`badge ${INVOICE_STATE[t.state].cls}`}>{INVOICE_STATE[t.state].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
