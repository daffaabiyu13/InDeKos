import { useState } from 'react';
import { fileUrl } from '../api.js';
import { compareFaces } from '../faceVerify.js';

export function FaceBadge({ score, match }) {
  if (score === null || score === undefined) return <span className="badge b-neu">Belum diverifikasi</span>;
  const pct = Math.round(score * 100);
  const ok = match ?? score >= 0.58;
  return <span className={`badge ${ok ? 'b-ok' : 'b-err'}`}>{ok ? '✓ Wajah cocok' : '✗ Wajah tidak cocok'} · {pct}%</span>;
}

// Staff-side view: KTP vs selfie + re-run verification in this browser.
// The score submitted by the public form is computed on the applicant's
// device, so staff can re-check it here before approving.
export default function FaceCheck({ ktp, selfie, storedScore, storedMatch }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const ktpUrl = fileUrl(ktp);
  const selfieUrl = fileUrl(selfie);

  async function run() {
    setBusy(true);
    setRes(null);
    try { setRes(await compareFaces(ktpUrl, selfieUrl)); } finally { setBusy(false); }
  }

  if (!ktp && !selfie) return <div className="tm">Belum ada foto KTP / selfie.</div>;

  return (
    <div>
      <div className="face-pair">
        <figure>{ktp ? <a href={ktpUrl} target="_blank" rel="noreferrer"><img src={ktpUrl} alt="Foto KTP" /></a> : <div className="photo-missing">Tidak ada</div>}<figcaption>Foto KTP</figcaption></figure>
        <figure>{selfie ? <a href={selfieUrl} target="_blank" rel="noreferrer"><img src={selfieUrl} alt="Foto selfie" /></a> : <div className="photo-missing">Tidak ada</div>}<figcaption>Selfie</figcaption></figure>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
        <span className="tm">Hasil form:</span> <FaceBadge score={storedScore} match={storedMatch} />
        {ktp && selfie && <button className="btn btn-g btn-sm" onClick={run} disabled={busy}>{busy ? 'Memeriksa wajah…' : 'Cek ulang di perangkat ini'}</button>}
      </div>
      {res && (
        <div style={{ marginTop: 8 }}>
          {res.ok ? <><span className="tm">Hasil cek ulang:</span> <FaceBadge score={res.score} match={res.match} /></> : <div className="field-err">{res.reason}</div>}
        </div>
      )}
      <div className="field-hint" style={{ marginTop: 8 }}>Verifikasi otomatis bersifat bantuan (screening). Keputusan akhir tetap oleh admin dengan membandingkan kedua foto.</div>
    </div>
  );
}
