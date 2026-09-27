import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { toVar, fmtRp, fmtRpShort, fmtDate, BULAN_PANJANG } from '../helpers.js';

export default function Keuangan({ version }) {
  const nav = useNavigate();
  const { data, loading } = useFetch(() => api.finance(), [version]);
  if (loading || !data) return <div className="loading">Memuat data keuangan…</div>;

  const { income, spent, profit, ytd, revenues, transactions, expCats } = data;
  const [y, m] = data.month.split('-').map(Number);
  const max = Math.max(1, ...revenues.flatMap((r) => [r.v, r.e]));
  const margin = income ? Math.round((profit / income) * 100) : 0;

  return (
    <>
      <div className="sg">
        <div className="tile t-ok"><div className="tile-lbl">Pemasukan {BULAN_PANJANG[m - 1]}</div><div className="tile-val ok" style={{ fontSize: 20 }}>{fmtRpShort(income)}</div><div className="tile-ch">invoice lunas</div></div>
        <div className="tile t-warn"><div className="tile-lbl">Pengeluaran {BULAN_PANJANG[m - 1]}</div><div className="tile-val warn" style={{ fontSize: 20 }}>{fmtRpShort(spent)}</div><div className="tile-ch">{expCats.length} kategori</div></div>
        <div className="tile t-cor"><div className="tile-lbl">Keuntungan Bersih</div><div className="tile-val cor" style={{ fontSize: 20 }}>{fmtRpShort(profit)}</div><div className={`tile-ch ${profit >= 0 ? 'up' : 'dn'}`}>Margin {margin}%</div></div>
        <div className="tile t-blue"><div className="tile-lbl">Pendapatan {y}</div><div className="tile-val blue" style={{ fontSize: 19 }}>{fmtRpShort(ytd)}</div><div className="tile-ch">year to date</div></div>
      </div>

      <div className="card mb">
        <div className="ch"><div><div className="ct">Pemasukan vs Pengeluaran</div><div className="cs">6 bulan terakhir</div></div>
          <div className="legend"><span><i className="dot" style={{ background: 'var(--jade)' }} /> Pemasukan</span><span><i className="dot" style={{ background: 'var(--warn)' }} /> Pengeluaran</span></div>
        </div>
        <div className="cb">
          <div className="bch">
            {revenues.map((r) => (
              <div className="bi" key={r.key}>
                <div className="bval">{(r.v / 1e6).toFixed(1)}jt</div>
                <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', width: '100%' }}>
                  <div className="bar" style={{ height: Math.max(2, Math.round((r.v / max) * 110)), background: 'var(--jade)' }} title={`Pemasukan ${fmtRp(r.v)}`} />
                  <div className="bar" style={{ height: Math.max(2, Math.round((r.e / max) * 110)), background: 'var(--warn)' }} title={`Pengeluaran ${fmtRp(r.e)}`} />
                </div>
                <div className="blbl">{r.m}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="ch"><div className="ct">Transaksi Terbaru</div><button className="btn btn-g btn-sm" onClick={() => nav('/pengeluaran')}>+ Catat Pengeluaran</button></div>
          <div className="cb" style={{ paddingTop: 0, paddingBottom: 0 }}>
            {transactions.map((t, i) => (
              <div className="txr" key={i}>
                <div className="txi" style={{ background: t.dir === 'in' ? 'var(--ok-bg)' : 'var(--err-bg)', color: t.dir === 'in' ? 'var(--ok)' : 'var(--err)' }}>{t.dir === 'in' ? '↑' : '↓'}</div>
                <div className="txd"><div className="txn">{t.n}</div><div className="txdt">{fmtDate(t.d)}</div></div>
                <div className={`txa ${t.dir}`}>{t.dir === 'in' ? '+' : '−'}{fmtRp(t.a)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Pengeluaran per Kategori</div></div>
          <div className="cb">
            <div style={{ fontSize: 23, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>{fmtRp(spent)}</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 18 }}>Total pengeluaran {BULAN_PANJANG[m - 1]} {y}</div>
            {expCats.length === 0 && <div className="empty">Belum ada pengeluaran bulan ini</div>}
            {expCats.map((e) => (
              <div style={{ marginBottom: 13 }} key={e.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{e.name}</span>
                  <span style={{ color: 'var(--t2)' }}>{fmtRp(e.amt)} ({e.pct}%)</span>
                </div>
                <div className="prog"><div className="pf" style={{ width: `${e.pct}%`, background: toVar(e.col) }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
