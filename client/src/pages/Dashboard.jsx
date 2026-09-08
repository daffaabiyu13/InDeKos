import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { toVar } from '../helpers.js';

export default function Dashboard({ version }) {
  const nav = useNavigate();
  const { data, loading } = useFetch(() => api.dashboard(), [version]);

  if (loading || !data) return <div className="loading">Memuat dashboard…</div>;

  const { stats, revenues, activities, tunggakan, occupancy } = data;
  const max = Math.max(...revenues.map((r) => r.v));

  // Donut geometry (r = 50, circumference ≈ 314)
  const C = 314;
  const occLen = (occupancy.terisi / stats.totalRooms) * C;
  const availLen = (occupancy.tersedia / stats.totalRooms) * C;

  return (
    <>
      <div className="welcome-banner">
        <div className="wb-l">
          <div className="wb-greeting">Selamat datang kembali</div>
          <div className="wb-name">Halo, <em>Admin</em> 👋</div>
          <div className="wb-meta">
            <div className="wb-stat"><div className="wb-stat-dot" style={{ background: 'var(--sage)' }} /><strong>{stats.activeResidents}</strong> penghuni aktif</div>
            <div className="wb-stat"><div className="wb-stat-dot" style={{ background: 'var(--err)' }} /><strong>{stats.arrears}</strong> menunggak</div>
            <div className="wb-stat"><div className="wb-stat-dot" style={{ background: 'var(--pebble)' }} /><strong>{stats.availableRooms}</strong> kamar kosong</div>
          </div>
        </div>
        <div className="wb-r">
          <div className="wb-date">September 2026</div>
          <div className="wb-month">{stats.incomeLabel}</div>
          <div className="wb-income">Pendapatan bulan ini</div>
        </div>
      </div>

      <div className="sg">
        <div className="tile t-blue"><div className="tile-lbl">Penghuni Aktif</div><div className="tile-val blue">{stats.activeResidents}</div><div className="tile-ch up">↑ 2 dari bulan lalu</div></div>
        <div className="tile t-ok"><div className="tile-lbl">Kamar Tersedia</div><div className="tile-val ok">{stats.availableRooms}</div><div className="tile-ch">dari {stats.totalRooms} kamar total</div></div>
        <div className="tile t-cor"><div className="tile-lbl">Pendapatan Sept.</div><div className="tile-val cor" style={{ fontSize: 22 }}>{stats.incomeLabel}</div><div className="tile-ch up">↑ Rp 1,2 jt dari Agustus</div></div>
        <div className="tile t-warn"><div className="tile-lbl">Tagihan Menunggak</div><div className="tile-val warn">{stats.arrears}</div><div className="tile-ch dn">↑ 1 dari bulan lalu</div></div>
      </div>

      <div className="g2 mb">
        <div className="card">
          <div className="ch"><div><div className="ct">Pendapatan Bulanan</div><div className="cs">6 bulan terakhir · 2026</div></div></div>
          <div className="cb">
            <div className="bch">
              {revenues.map((r) => {
                const h = Math.round((r.v / max) * 118);
                const isCur = r.m === 'Sep';
                return (
                  <div className="bi" key={r.m}>
                    <div className="bval">{(r.v / 1e6).toFixed(1)}jt</div>
                    <div className="bar" style={{ height: h, background: isCur ? 'var(--jade)' : 'var(--sage)' }} title={`Rp ${r.v.toLocaleString('id-ID')}`} />
                    <div className="blbl">{r.m}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Tingkat Hunian Kamar</div></div>
          <div className="cb">
            <div className="dw">
              <svg width="126" height="126" viewBox="0 0 126 126">
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--bdr)" strokeWidth="16" />
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--jade)" strokeWidth="16"
                  strokeDasharray={`${occLen} ${C}`} strokeDashoffset="0" strokeLinecap="round" transform="rotate(-90 63 63)" />
                <circle cx="63" cy="63" r="50" fill="none" stroke="var(--pebble)" strokeWidth="16"
                  strokeDasharray={`${availLen} ${C}`} strokeDashoffset={`${-occLen}`} strokeLinecap="round" transform="rotate(-90 63 63)" />
                <text x="63" y="58" textAnchor="middle" fontSize="20" fontWeight="800" fill="var(--t1)" fontFamily="Plus Jakarta Sans,sans-serif">{occupancy.pct}%</text>
                <text x="63" y="73" textAnchor="middle" fontSize="11" fill="var(--t2)" fontFamily="Plus Jakarta Sans,sans-serif">terisi</text>
              </svg>
              <div className="dleg">
                <div className="dli"><div className="dot" style={{ background: 'var(--jade)' }} /><div><div style={{ fontWeight: 600 }}>{occupancy.terisi} Terisi</div><div style={{ fontSize: 12, color: 'var(--t2)' }}>{occupancy.pct}%</div></div></div>
                <div className="dli"><div className="dot" style={{ background: 'var(--pebble)' }} /><div><div style={{ fontWeight: 600 }}>{occupancy.tersedia} Tersedia</div><div style={{ fontSize: 12, color: 'var(--t2)' }}>{100 - occupancy.pct}%</div></div></div>
                <div className="dli"><div className="dot" style={{ background: 'var(--bdr)' }} /><div><div style={{ fontWeight: 600 }}>{occupancy.perbaikan} Perbaikan</div><div style={{ fontSize: 12, color: 'var(--t2)' }}>0%</div></div></div>
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
                    <div className="atime">{a.ts}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <div className="ct">Tagihan Menunggak</div>
            <button className="btn btn-g btn-sm" onClick={() => nav('/pembayaran')}>Lihat semua</button>
          </div>
          <div className="tw">
            <table>
              <thead><tr><th>Penghuni</th><th>Kamar</th><th>Jumlah</th><th>Status</th></tr></thead>
              <tbody>
                {tunggakan.map((t, i) => (
                  <tr key={i}>
                    <td className="tn">{t.name}</td>
                    <td><span className="badge b-neu">{t.room}</span></td>
                    <td style={{ fontWeight: 700, color: 'var(--err)' }}>{t.amount}</td>
                    <td><span className="badge b-err">Terlambat</span></td>
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
