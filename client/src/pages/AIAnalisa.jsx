import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { toVar } from '../helpers.js';
import { useToast } from '../components/Toast.jsx';
import { useSettings } from '../components/Settings.jsx';

export default function AIAnalisa() {
  const { kosName } = useSettings();
  const greeting = {
    role: 'a',
    html: `Halo! Saya AI InDeKos. Data <strong>${kosName}</strong> sudah dimuat — 15 penghuni aktif, 20 kamar, riwayat keuangan Jan–Sep 2026.<br /><br />Coba tanya:<br />• "Siapa yang paling sering terlambat bayar?"<br />• "Tren hunian 6 bulan terakhir?"<br />• "Rata-rata lama tinggal penghuni?"`,
  };
  const [messages, setMessages] = useState([greeting]);
  const [input, setInput] = useState('');
  const [insights, setInsights] = useState([]);
  const [preds, setPreds] = useState([]);
  const feedRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    api.aiInsights().then((d) => { setInsights(d.insights); setPreds(d.preds); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q) return;
    setMessages((m) => [...m, { role: 'u', html: q }]);
    setInput('');
    try {
      const { reply } = await api.aiChat(q);
      setMessages((m) => [...m, { role: 'a', html: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'a', html: 'Maaf, terjadi kesalahan saat menghubungi AI.' }]);
    }
  }

  return (
    <>
      <div className="card mb">
        <div className="ch">
          <div><div className="ct">🤖 AI Analisa InDeKos</div><div className="cs">Tanya tentang penghuni, keuangan, dan tren hunian {kosName}</div></div>
          <span className="badge b-ok">● Online</span>
        </div>
        <div className="aic">
          <div className="aim" ref={feedRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role}`} dangerouslySetInnerHTML={{ __html: m.html }} />
            ))}
          </div>
          <div className="ai-inp-row">
            <input
              className="ai-inp"
              placeholder="Tanya tentang penghuni, pembayaran, atau keuangan..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="btn btn-p btn-sm" onClick={send}>Kirim</button>
          </div>
        </div>
      </div>

      <div className="g2">
        <div className="card">
          <div className="ch"><div className="ct">Insight Otomatis</div></div>
          <div className="cb">
            {insights.map((it, i) => (
              <div className="ins" key={i}>
                <div className="ins-ico">{it.ico}</div>
                <div>
                  <div className="ins-txt">{it.txt}</div>
                  {it.btn && <button className="btn btn-p btn-sm" style={{ marginTop: 8 }} onClick={() => toast('📱 Pengingat WhatsApp dikirim ke penghuni yang menunggak.')}>{it.btn}</button>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="ch"><div className="ct">Prediksi Risiko Kamar Kosong</div></div>
          <div className="cb">
            {preds.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 0', borderBottom: i < preds.length - 1 ? '1px solid var(--bdr)' : 'none' }}>
                <span className="badge b-neu">{p.room}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--t2)' }}>{p.desc}</div>
                </div>
                <span className="badge" style={{ background: `${toVar(p.col)}22`, color: toVar(p.col), border: `1px solid ${toVar(p.col)}55` }}>{p.risk}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
