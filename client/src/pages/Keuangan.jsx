import { api } from '../api.js';
import { useFetch } from '../useFetch.js';
import { toVar } from '../helpers.js';

export default function Keuangan({ version }) {
  const { data, loading } = useFetch(() => api.finance(), [version]);
  if (loading || !data) return <div className="loading">Memuat data keuangan…</div>;

  const { transactions, expCats } = data;
  const total = expCats.reduce((s, e) => s + e.amt, 0);

  return (
    <>
      <div className="sg">
        <div className="tile"><div className="tile-lbl">Pemasukan Bulan Ini</div><div className="tile-val ok" style={{ fontSize: 20 }}>Rp 18,5 Jt</div><div className="tile-ch up">↑ 7% dari Agustus</div></div>
        <div className="tile"><div className="tile-lbl">Pengeluaran Bulan Ini</div><div className="tile-val warn" style={{ fontSize: 20 }}>Rp 3,2 Jt</div><div className="tile-ch">Listrik, air, internet, lain</div></div>
        <div className="tile"><div className="tile-lbl">Keuntungan Bersih</div><div className="tile-val cor" style={{ fontSize: 20 }}>Rp 15,3 Jt</div><div className="tile-ch up">Margin 82%</div></div>
        <div className="tile"><div className="tile-lbl">Pendapatan YTD</div><div className="tile-val" style={{ fontSize: 19 }}>Rp 142 Jt</div><div className="tile-ch">Jan–Sep 2026</div></div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="ch"><div className="ct">Transaksi Terbaru</div><button className="btn btn-g btn-sm">+ Catat</button></div>
          <div className="cb" style={{ paddingTop: 0, paddingBottom: 0 }}>
            <div>
              {transactions.map((t, i) => (
                <div className="txr" key={i}>
                  <div className="txi" style={{ background: t.dir === 'in' ? 'var(--ok-bg)' : 'var(--err-bg)', color: t.dir === 'in' ? 'var(--ok)' : 'var(--err)' }}>{t.dir === 'in' ? '↑' : '↓'}</div>
                  <div className="txd"><div className="txn">{t.n}</div><div className="txdt">{t.d}</div></div>
                  <div className={`txa ${t.dir}`}>{t.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Pengeluaran per Kategori</div></div>
          <div className="cb">
            <div style={{ fontSize: 23, fontWeight: 800, fontVariantNumeric: 'tabular-nums', marginBottom: 3 }}>Rp {(total / 1e6).toFixed(2)} Jt</div>
            <div style={{ fontSize: 12, color: 'var(--t2)', marginBottom: 18 }}>Total pengeluaran September 2026</div>
            {expCats.map((e) => (
              <div style={{ marginBottom: 13 }} key={e.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                  <span style={{ fontWeight: 600 }}>{e.name}</span>
                  <span style={{ color: 'var(--t2)' }}>Rp {(e.amt / 1000).toFixed(0)}k ({e.pct}%)</span>
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
