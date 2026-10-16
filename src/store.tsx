import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { DB } from './types';
import { emptyDB, seedDB } from './seed';

const KEY = 'repminder-db-v1';

function load(): DB {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed && parsed.version === 1) return { ...emptyDB(), ...parsed, settings: { ...emptyDB().settings, ...parsed.settings } };
    }
  } catch {
    // Corrupt or unavailable storage: fall through to demo data.
  }
  return seedDB();
}

interface Store {
  db: DB;
  /**
   * Apply a change to a copy of the database. If `fn` throws, nothing is
   * saved and the error message is shown as a toast.
   */
  update: (fn: (draft: DB) => void, success?: string) => boolean;
  replace: (db: DB) => void;
  toast: (msg: string, kind?: 'ok' | 'error') => void;
}

const Ctx = createContext<Store | null>(null);

interface Toast {
  id: number;
  msg: string;
  kind: 'ok' | 'error';
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(load);
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(db));
    } catch {
      // Storage full or disabled; the app keeps working in memory.
    }
  }, [db]);

  useEffect(() => {
    document.documentElement.style.setProperty('--brand', db.settings.brandColor);
  }, [db.settings.brandColor]);

  const toast = useCallback((msg: string, kind: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);

  const update = useCallback(
    (fn: (draft: DB) => void, success?: string) => {
      const draft = structuredClone(db);
      try {
        fn(draft);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
      setDb(draft);
      if (success) toast(success);
      return true;
    },
    [db, toast],
  );

  const value = useMemo(() => ({ db, update, replace: setDb, toast }), [db, update, toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
