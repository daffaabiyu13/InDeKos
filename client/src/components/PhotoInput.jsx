import { useRef, useState } from 'react';
import { compressImage } from '../helpers.js';
import { Icons } from './icons.jsx';

// Image picker with preview. On phones `capture` opens the camera
// directly (front camera for selfies, back camera for KTP/struk).
export default function PhotoInput({ label, hint, value, onChange, capture, required, maxDim = 1280 }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');

  async function pick(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr('');
    try {
      onChange(await compressImage(file, maxDim));
    } catch (e2) {
      setErr(e2.message);
    }
  }

  return (
    <div className="fg">
      <label className="fl">{label} {required && <span className="req">*</span>}</label>
      <div className={`photo-in${value ? ' has' : ''}`} onClick={() => ref.current?.click()} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}>
        {value ? <img src={value} alt={label} /> : (
          <div className="photo-empty">
            <Icons.camera />
            <span>{hint || 'Ketuk untuk ambil / pilih foto'}</span>
          </div>
        )}
      </div>
      {value && <button type="button" className="btn btn-g btn-sm" style={{ marginTop: 6 }} onClick={() => ref.current?.click()}>Ganti foto</button>}
      {err && <div className="field-err">{err}</div>}
      <input ref={ref} type="file" accept="image/*" capture={capture} hidden onChange={pick} />
    </div>
  );
}
