import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const SettingsCtx = createContext({ settings: null, kosName: 'InDeKos', reload: () => {} });

export function useSettings() {
  return useContext(SettingsCtx);
}

// Loads kos settings once and exposes them app-wide so a custom
// kos name (and other config) updates the whole UI live after saving.
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(null);

  const reload = useCallback(() => {
    api.settings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const kosName = settings?.namaKos || 'InDeKos';

  return (
    <SettingsCtx.Provider value={{ settings, kosName, reload }}>
      {children}
    </SettingsCtx.Provider>
  );
}
