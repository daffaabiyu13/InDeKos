import { useEffect } from 'react';
import { Icons } from './icons.jsx';
import { useScrollLock } from '../responsive.js';

export default function Modal({ title, onClose, children, footer, width = 520 }) {
  useScrollLock();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mo open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="mh">
          <div className="mt">{title}</div>
          <button className="mc" onClick={onClose} aria-label="Tutup"><Icons.close /></button>
        </div>
        <div className="mb2">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}
