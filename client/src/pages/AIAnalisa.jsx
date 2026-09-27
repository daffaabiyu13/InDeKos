import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useSettings } from '../components/Settings.jsx';
import { useAuth } from '../components/Auth.jsx';
import { AIChatBody, ModeBadge, useAI } from '../components/AI.jsx';
import Md from '../components/Md.jsx';

const RISK_TONE = { Tinggi: 'b-err', Sedang: 'b-warn', Rendah: 'b-ok' };
const TARGET = { scope: 'ai' };

export default function AIAnalisa({ version }) {
  const { kosName } = useSettings();
  const { isPemilik } = useAuth();
  const ai = useAI();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ai.enabled) return;
    api.aiInsights('ai').then(setData).catch((e) => setError(e.message));
  }, [version, ai.enabled]);

  if (ai.status && !ai.enabled) {
    return (
      <div className="card"><div className="cb empty-state">
        <div style={{ fontSize: 32 }}>🤖</div>
        <strong>Fitur AI sedang dimatikan.</strong>
        {isPemilik ? <Link className="btn btn-p btn-sm" to="/pengaturan#ai">Aktifkan di Pengaturan</Link> : <span className="tm">Minta pemilik mengaktifkannya di Pengaturan.</span>}
      </div></div>
    );
  }

  return (
    <div className="g-ai">
      <div className="card ai-main">
        <div className="ch">
          <div><div className="ct">🤖 AI Analisa {kosName}</div><div className="cs">Tanya tentang penghuni, pembayaran, kamar, dan keuangan</div></div>
          <ModeBadge mode={ai.mode} />
        </div>
        <AIChatBody target={TARGET} suggestions={data?.suggestions || []} />
        {ai.mode !== 'claude' && isPemilik && (
          <div className="ai-upsell">
            <span>Mode lokal menjawab pertanyaan umum. Untuk tanya jawab bebas, isi API key Claude.</span>
            <Link className="btn btn-g btn-sm" to="/pengaturan#ai">Atur AI</Link>
          </div>
        )}
      </div>

      <div className="ai-side">
        <div className="card mb">
          <div className="ch"><div className="ct">Insight Otomatis</div></div>
          <div className="cb">
            {error && <div className="tm">⚠️ {error}</div>}
            {!data && !error && <div className="loading">Menganalisa data…</div>}
            {data?.insights.map((it, i) => (
              <div className={`ins t-${it.tone}`} key={i}>
                <div className="ins-ico">{it.ico}</div>
                <div className="ins-txt">
                  <strong className="ins-title">{it.title}</strong>
                  <Md text={it.text} />
                  {it.to && <Link className="aic-link" to={it.to}>Buka →</Link>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="ch"><div><div className="ct">Prediksi Risiko Penghuni</div><div className="cs">Tunggakan, keterlambatan, pelanggaran & pengajuan keluar</div></div></div>
          <div className="cb">
            {data?.preds?.map((p) => (
              <Link key={p.id} to={`/penghuni/${p.id}`} className="risk-row">
                <span className="badge b-neu">{p.room}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>{p.desc}</div>
                </div>
                <span className={`badge ${RISK_TONE[p.risk]}`}>{p.risk}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
