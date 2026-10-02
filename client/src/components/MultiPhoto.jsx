// Banyak foto sekaligus: ambil dari kamera atau pilih beberapa dari galeri,
// dikompres di browser, tiap foto bisa diberi keterangan.
// Juga galeri + lightbox untuk menampilkan foto yang sudah tersimpan.
import { useEffect, useRef, useState } from 'react';
import { compressImage } from '../helpers.js';
import { Icons } from './icons.jsx';

const CAPTION_HINTS = ['Kasur', 'Lemari', 'Meja & kursi', 'Kamar mandi', 'Dinding & plafon', 'Lantai', 'Pintu & kunci', 'Jendela', 'AC / kipas', 'Meteran listrik'];

export function MultiPhotoInput({ value, onChange, max = 12, captions = true, label, hint, idPrefix = 'mp' }) {
  const cam = useRef(null);
  const gallery = useRef(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const left = max - value.length;

  async function pick(e) {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setErr('');
    if (files.length > left) setErr(`Maksimal ${max} foto — ${files.length - left} foto tidak ditambahkan.`);
    setBusy(true);
    const out = [];
    for (const f of files.slice(0, Math.max(0, left))) {
      try { out.push({ data: await compressImage(f, 1280), caption: '' }); } catch (e2) { setErr(e2.message); }
    }
    setBusy(false);
    if (out.length) onChange([...value, ...out]);
  }
  const setCaption = (i, caption) => onChange(value.map((p, j) => (j === i ? { ...p, caption } : p)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));

  return (
    <div className="fg mp">
      {label && <label className="fl">{label}</label>}
      {value.length > 0 && (
        <div className="mp-grid">
          {value.map((p, i) => (
            <div className="mp-item" key={i}>
              <div className="mp-thumb">
                <img src={p.data} alt={p.caption || `Foto ${i + 1}`} />
                <button type="button" className="mp-del" onClick={() => remove(i)} aria-label={`Hapus foto ${i + 1}`}>✕</button>
              </div>
              {captions && <input className="fi mp-cap" list={`${idPrefix}-hints`} placeholder="Keterangan (mis. Kasur)" maxLength={120} value={p.caption} onChange={(e) => setCaption(i, e.target.value)} />}
            </div>
          ))}
        </div>
      )}
      {left > 0 && (
        <div className="mp-actions">
          <button type="button" className="btn btn-g btn-sm" onClick={() => cam.current?.click()} disabled={busy}><Icons.camera /> Ambil Foto</button>
          <button type="button" className="btn btn-g btn-sm" onClick={() => gallery.current?.click()} disabled={busy}>🖼️ Pilih dari Galeri</button>
          <span className="tm">{busy ? 'Memproses foto…' : `${value.length}/${max} foto`}</span>
        </div>
      )}
      {hint && <div className="field-hint">{hint}</div>}
      {err && <div className="field-err">{err}</div>}
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={pick} />
      {captions && <datalist id={`${idPrefix}-hints`}>{CAPTION_HINTS.map((c) => <option key={c} value={c} />)}</datalist>}
    </div>
  );
}

// photos: [{ key, url, caption, sub }]
export function PhotoGallery({ photos, onDelete, empty = 'Belum ada foto.' }) {
  const [open, setOpen] = useState(-1);
  if (!photos.length) return empty ? <div className="tm" style={{ padding: '6px 0' }}>{empty}</div> : null;
  return (
    <>
      <div className="pg-grid">
        {photos.map((p, i) => (
          <figure className="pg-item" key={p.key}>
            <button type="button" className="pg-thumb" onClick={() => setOpen(i)} aria-label={`Lihat ${p.caption || `foto ${i + 1}`}`}>
              <img src={p.url} alt={p.caption || `Foto ${i + 1}`} loading="lazy" />
            </button>
            {onDelete && <button type="button" className="mp-del" onClick={() => onDelete(p)} aria-label={`Hapus ${p.caption || `foto ${i + 1}`}`}>✕</button>}
            {(p.caption || p.sub) && <figcaption>{p.caption}{p.sub && <span>{p.sub}</span>}</figcaption>}
          </figure>
        ))}
      </div>
      {open >= 0 && photos[open] && <Lightbox photos={photos} index={open} onIndex={setOpen} onClose={() => setOpen(-1)} />}
    </>
  );
}

function Lightbox({ photos, index, onIndex, onClose }) {
  const p = photos[index];
  const go = (d) => onIndex((index + d + photos.length) % photos.length);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose}>
      <div className="lb-inner" onClick={(e) => e.stopPropagation()}>
        <img src={p.url} alt={p.caption || 'Foto'} />
        <div className="lb-bar">
          <span>{p.caption || 'Foto'}{p.sub ? ` · ${p.sub}` : ''} <span className="lb-n">{index + 1}/{photos.length}</span></span>
          <a className="btn btn-g btn-sm" href={p.url} target="_blank" rel="noreferrer">Buka asli</a>
        </div>
      </div>
      {photos.length > 1 && <>
        <button type="button" className="lb-nav prev" onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Sebelumnya">‹</button>
        <button type="button" className="lb-nav next" onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Berikutnya">›</button>
      </>}
      <button type="button" className="lb-close" onClick={onClose} aria-label="Tutup">✕</button>
    </div>
  );
}
