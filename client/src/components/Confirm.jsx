import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Icons } from './icons.jsx';
import { useScrollLock } from '../responsive.js';

const ConfirmCtx = createContext(() => Promise.resolve(false));

export function useConfirm() {
  return useContext(ConfirmCtx);
}

// Promise-based confirmation dialog styled with the app's modal/palette.
// Usage:  const ok = await confirm({ title, message, confirmText, danger });
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { opts, resolve }
  useScrollLock(Boolean(state));

  const confirm = useCallback((opts) => {
    const normalized = typeof opts === 'string' ? { message: opts } : opts || {};
    return new Promise((resolve) => setState({ opts: normalized, resolve }));
  }, []);

  const close = useCallback(
    (result) => {
      setState((s) => {
        if (s) s.resolve(result);
        return null;
      });
    },
    [],
  );

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, close]);

  const o = state?.opts || {};

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div className="mo open" onClick={(e) => e.target === e.currentTarget && close(false)}>
          <div className="modal confirm-modal">
            <div className="mh">
              <div className="mt">{o.title || 'Konfirmasi'}</div>
              <button className="mc" onClick={() => close(false)}><Icons.close /></button>
            </div>
            <div className="mb2">
              <div className="confirm-body">
                <div className={`confirm-icon${o.danger ? ' danger' : ''}`}>{o.icon || (o.danger ? '⚠️' : '❓')}</div>
                <p className="confirm-msg">{o.message}</p>
              </div>
            </div>
            <div className="mf">
              <button className="btn btn-g" onClick={() => close(false)}>{o.cancelText || 'Batal'}</button>
              <button className={`btn ${o.danger ? 'btn-d' : 'btn-p'}`} onClick={() => close(true)} autoFocus>
                {o.confirmText || 'Ya, Lanjutkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
