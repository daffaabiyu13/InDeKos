// ─────────────────────────────────────────────────────────────
// AI di setiap menu:
// • <AIProvider>  status AI + riwayat chat per menu + buka/tutup chat
// • <AIPanel>     kartu insight menu aktif (di atas konten halaman)
// • <AIChat>      panel tanya jawab (samping di desktop, bottom sheet di HP)
// • <AIFab>       tombol mengambang "Tanya AI"
// ─────────────────────────────────────────────────────────────
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import { Icons } from './icons.jsx';
import Md from './Md.jsx';
import { useToast } from './Toast.jsx';
import { PHONE, useMediaQuery, useScrollLock } from '../responsive.js';

const TITLES = {
  dashboard: 'Dashboard', penghuni: 'Penghuni', resident: 'Detail Penghuni', kamar: 'Kamar', pembayaran: 'Pembayaran',
  keuangan: 'Keuangan', pengeluaran: 'Pengeluaran', pendaftaran: 'Pendaftaran', keluar: 'Pengajuan Keluar',
  pelanggaran: 'Pelanggaran', mantan: 'Mantan Penghuni', pengaturan: 'Pengaturan', akun: 'Akun', ai: 'AI Analisa',
};
const ROUTES = {
  '/': 'dashboard', '/penghuni': 'penghuni', '/kamar': 'kamar', '/pembayaran': 'pembayaran', '/keuangan': 'keuangan',
  '/pengeluaran': 'pengeluaran', '/pendaftaran': 'pendaftaran', '/pengajuan-keluar': 'keluar', '/pelanggaran': 'pelanggaran',
  '/mantan': 'mantan', '/pengaturan': 'pengaturan', '/akun': 'akun', '/ai': 'ai',
};

// Menu aktif → { scope, id } (id hanya untuk detail penghuni).
export function scopeFor(pathname) {
  const m = pathname.match(/^\/penghuni\/(\d+)/);
  if (m) return { scope: 'resident', id: m[1] };
  const scope = ROUTES[pathname.replace(/\/+$/, '') || '/'];
  return scope ? { scope, id: undefined } : null;
}
const keyOf = ({ scope, id }) => (id ? `${scope}:${id}` : scope);

const AICtx = createContext(null);
export const useAI = () => useContext(AICtx);

export function AIProvider({ version, children }) {
  const { pathname } = useLocation();
  const [status, setStatus] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [threads, setThreads] = useState({}); // key → [{ role, text, notice? }]
  const threadsRef = useRef({}); // salinan sinkron untuk membaca riwayat saat mengirim
  const [busy, setBusy] = useState({});
  const push = useCallback((key, msg) => {
    threadsRef.current = { ...threadsRef.current, [key]: [...(threadsRef.current[key] || []), msg] };
    setThreads(threadsRef.current);
  }, []);
  const current = useMemo(() => scopeFor(pathname), [pathname]);

  useEffect(() => { api.aiStatus().then(setStatus).catch(() => setStatus(null)); }, [version]);
  useEffect(() => { setChatOpen(false); }, [pathname]);

  const ask = useCallback(async (target, question) => {
    const q = String(question || '').trim();
    if (!q || !target) return;
    const key = keyOf(target);
    // Riwayat dikirim tanpa pesan error agar AI tidak mengulang kegagalan.
    const history = (threadsRef.current[key] || []).filter((m) => !m.error).map(({ role, text }) => ({ role, text }));
    push(key, { role: 'user', text: q });
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const d = await api.aiChat({ scope: target.scope, id: target.id, message: q, history });
      push(key, { role: 'assistant', text: d.reply, notice: d.notice, source: d.source });
    } catch (e) {
      push(key, { role: 'assistant', text: `⚠️ ${e.message}`, error: true });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  }, [push]);

  const clear = useCallback((target) => {
    threadsRef.current = { ...threadsRef.current, [keyOf(target)]: [] };
    setThreads(threadsRef.current);
  }, []);
  const openChat = useCallback((question) => {
    setChatOpen(true);
    if (question && current) ask(current, question);
  }, [ask, current]);

  const value = {
    status, enabled: status?.enabled !== false && status !== null, mode: status?.mode || 'lokal',
    current, chatOpen, setChatOpen, openChat, ask, clear, threads, busy,
  };
  return <AICtx.Provider value={value}>{children}</AICtx.Provider>;
}

export function ModeBadge({ mode }) {
  return mode === 'claude'
    ? <span className="ai-mode claude" title="Pertanyaan dijawab oleh Claude memakai data kos Anda">Claude</span>
    : <span className="ai-mode" title="Insight & jawaban dihitung langsung dari data kos (tanpa API key)">Lokal</span>;
}

// ═════════════ PANEL INSIGHT ═════════════
function readCollapsed() { try { return localStorage.getItem('indekos-aip') === '1'; } catch { return false; } }

export function AIPanel({ version }) {
  const ai = useAI();
  const { pathname } = useLocation();
  const phone = useMediaQuery(PHONE);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [showAll, setShowAll] = useState(false);
  const target = ai.current;

  useEffect(() => {
    if (!target || !ai.enabled) return undefined;
    let alive = true;
    setError('');
    api.aiInsights(target.scope, target.id)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) { setData(null); setError(e.message); } });
    return () => { alive = false; };
  }, [target?.scope, target?.id, version, ai.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setShowAll(false); }, [pathname]);

  if (!target || !ai.enabled || target.scope === 'ai') return null;
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem('indekos-aip', next ? '1' : '0'); } catch { /* ignore */ }
  };
  const list = data?.scope === target.scope ? data.insights : [];
  const urgent = list.filter((i) => i.tone === 'err' || i.tone === 'warn').length;
  const visible = phone || showAll ? list : list.slice(0, 3);

  return (
    <section className={`aip${collapsed ? ' closed' : ''}`} aria-label="AI Insight">
      <div className="aip-h">
        <button className="aip-t" onClick={toggle} aria-expanded={!collapsed}>
          <span className="aip-ico"><Icons.sparkle /></span>
          <span className="aip-name">AI Insight</span>
          <span className="aip-sub">{TITLES[target.scope]}</span>
          <ModeBadge mode={ai.mode} />
          {urgent > 0 && <span className="aip-count" title="Perlu perhatian">{urgent}</span>}
          <span className="aip-chev" aria-hidden="true">{collapsed ? '▾' : '▴'}</span>
        </button>
        <button className="btn btn-p btn-sm aip-ask" onClick={() => ai.openChat()}><Icons.sparkle /> Tanya AI</button>
      </div>
      {!collapsed && (
        <>
          {error && <div className="aip-err">⚠️ {error}</div>}
          {!data && !error && <div className="aip-grid"><div className="aic-card sk" /><div className="aic-card sk" /><div className="aic-card sk" /></div>}
          {list.length > 0 && (
            <div className="aip-grid">
              {visible.map((it, i) => (
                <article key={`${it.title}-${i}`} className={`aic-card t-${it.tone}`}>
                  <div className="aic-top"><span className="aic-ico" aria-hidden="true">{it.ico}</span><strong className="aic-title">{it.title}</strong></div>
                  <Md text={it.text} className="aic-text" />
                  {it.to && it.to !== pathname && <Link className="aic-link" to={it.to}>Buka →</Link>}
                </article>
              ))}
            </div>
          )}
          <div className="aip-foot">
            {!phone && list.length > 3 && (
              <button className="chip" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ringkas' : `Lihat semua (${list.length})`}</button>
            )}
            {(data?.suggestions || []).map((q) => (
              <button key={q} className="chip aip-q" onClick={() => ai.openChat(q)}>{q}</button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

// ═════════════ CHAT ═════════════
function Bubble({ m }) {
  const toast = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(m.text.replace(/\*\*/g, '')); toast('📋 Jawaban disalin.'); } catch { toast('⚠️ Tidak bisa menyalin.'); }
  }
  if (m.role === 'user') return <div className="msg u">{m.text}</div>;
  return (
    <div className={`msg a${m.error ? ' err' : ''}`}>
      {m.notice && <div className="msg-notice">{m.notice}</div>}
      <Md text={m.text} />
      {!m.error && <button className="msg-copy" onClick={copy} aria-label="Salin jawaban"><Icons.copy /> Salin</button>}
    </div>
  );
}

// Isi chat (dipakai di panel samping dan halaman AI Analisa).
export function AIChatBody({ target, suggestions = [], autoFocus = false }) {
  const ai = useAI();
  const [input, setInput] = useState('');
  const feed = useRef(null);
  const inp = useRef(null);
  const key = target ? keyOf(target) : '';
  const msgs = ai.threads[key] || [];
  const busy = Boolean(ai.busy[key]);

  useEffect(() => { if (feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [msgs.length, busy]);
  useEffect(() => { if (autoFocus) inp.current?.focus({ preventScroll: true }); }, [autoFocus]);

  function send(q = input) {
    if (!q.trim() || busy) return;
    ai.ask(target, q);
    setInput('');
  }

  return (
    <div className="aichat-body">
      <div className="aim" ref={feed} aria-live="polite">
        {msgs.length === 0 && (
          <div className="ai-intro">
            <div className="ai-intro-ico"><Icons.sparkle /></div>
            <div><strong>Tanya apa saja tentang {target?.scope && target.scope !== 'ai' ? `menu ${TITLES[target.scope]}` : 'kos Anda'}.</strong></div>
            <div className="tm">{ai.mode === 'claude' ? 'Dijawab oleh Claude berdasarkan data kos Anda.' : 'Mode lokal: jawaban dihitung langsung dari data kos Anda.'}</div>
            <div className="ai-sugg">
              {suggestions.map((q) => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => <Bubble key={i} m={m} />)}
        {busy && <div className="msg a typing" aria-label="AI sedang menjawab"><span /><span /><span /></div>}
      </div>
      {msgs.length > 0 && suggestions.length > 0 && !busy && (
        <div className="ai-sugg row">{suggestions.map((q) => <button key={q} className="chip" onClick={() => send(q)}>{q}</button>)}</div>
      )}
      <form className="ai-inp-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input ref={inp} className="ai-inp" placeholder="Tulis pertanyaan…" value={input} maxLength={2000}
          onChange={(e) => setInput(e.target.value)} enterKeyHint="send" aria-label="Pertanyaan untuk AI" />
        <button className="btn btn-p ai-send" type="submit" disabled={!input.trim() || busy} aria-label="Kirim"><Icons.send /></button>
      </form>
    </div>
  );
}

export function AIChat() {
  const ai = useAI();
  const phone = useMediaQuery(PHONE);
  const [suggestions, setSuggestions] = useState([]);
  const target = ai.current;
  const open = ai.chatOpen && ai.enabled && target;
  useScrollLock(Boolean(open && phone));

  useEffect(() => {
    if (!open) return undefined;
    api.aiInsights(target.scope, target.id).then((d) => setSuggestions(d.suggestions || [])).catch(() => setSuggestions([]));
    const onKey = (e) => { if (e.key === 'Escape') ai.setChatOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, target?.scope, target?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;
  const hasMsgs = (ai.threads[keyOf(target)] || []).length > 0;
  return (
    <>
      <div className="aichat-backdrop" onClick={() => ai.setChatOpen(false)} aria-hidden="true" />
      <aside className="aichat" role="dialog" aria-modal={phone ? 'true' : 'false'} aria-label="Tanya AI">
        <div className="aichat-h">
          <span className="aip-ico"><Icons.sparkle /></span>
          <div className="aichat-t">
            <strong>Tanya AI</strong>
            <span>{TITLES[target.scope]}</span>
          </div>
          <ModeBadge mode={ai.mode} />
          {hasMsgs && <button className="btn btn-g btn-sm" onClick={() => ai.clear(target)}>Bersihkan</button>}
          <button className="mc" onClick={() => ai.setChatOpen(false)} aria-label="Tutup"><Icons.close /></button>
        </div>
        <AIChatBody target={target} suggestions={suggestions} autoFocus={!phone} />
      </aside>
    </>
  );
}

export function AIFab() {
  const ai = useAI();
  if (!ai.enabled || !ai.current || ai.current.scope === 'ai' || ai.chatOpen) return null;
  return (
    <button className={`ai-fab${ai.current.scope === 'pengaturan' ? ' raise' : ''}`} onClick={() => ai.openChat()} aria-label="Tanya AI" title="Tanya AI">
      <Icons.sparkle />
    </button>
  );
}
