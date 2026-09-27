import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const SettingsCtx = createContext({ info: null, kosName: 'InDeKos', reload: () => {} });

export function useSettings() {
  return useContext(SettingsCtx);
}

// Public kos info (name, address, room types) — available before login
// and on the tenant-facing pages. Full settings are loaded by Pengaturan.
export function SettingsProvider({ children }) {
  const [info, setInfo] = useState(null);

  const reload = useCallback(() => {
    api.publicInfo().then(setInfo).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return (
    <SettingsCtx.Provider value={{ info, kosName: info?.namaKos || 'InDeKos', reload }}>
      {children}
    </SettingsCtx.Provider>
  );
}
