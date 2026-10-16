import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB } from './types';
import { emptyDB } from './seed';
import { api, ApiError, type User } from './api';

// ---------- Toasts ----------

type ToastFn = (msg: string, kind?: 'ok' | 'error') => void;
const ToastCtx = createContext<ToastFn>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; kind: 'ok' | 'error' }[]>([]);
  const toast = useCallback<ToastFn>((msg, kind = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

// ---------- Workspace store ----------

export type SyncState = 'saved' | 'saving' | 'offline';

interface Store {
  db: DB;
  workspaceId: string;
  /** The trainer this workspace belongs to. */
  trainer: User;
  sync: SyncState;
  /**
   * Apply a change to a copy of the data and save it to the server. If `fn`
   * throws, nothing changes and the message is shown as an error. The
   * success message is shown as a toast and recorded in the activity log.
   */
  update: (fn: (draft: DB) => void, success?: string) => boolean;
  replace: (db: DB, message: string) => void;
  toast: ToastFn;
}

const Ctx = createContext<Store | null>(null);

const SAVE_DELAY = 600;
const POLL_MS = 30_000;

function normalise(d: DB): DB {
  const base = emptyDB();
  return { ...base, ...d, settings: { ...base.settings, ...d.settings } };
}

export function StoreProvider({ workspaceId, onNotFound, children }: { workspaceId: string; onNotFound?: () => void; children: ReactNode }) {
  const toast = useToast();
  const [loaded, setLoaded] = useState<{ db: DB; trainer: User } | null>(null);
  const [error, setError] = useState('');
  const [sync, setSync] = useState<SyncState>('saved');

  const dbRef = useRef<DB | null>(null);
  const version = useRef(0);
  const pending = useRef<string[]>([]);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const apply = useCallback((db: DB, trainer?: User) => {
    dbRef.current = db;
    setLoaded((cur) => ({ db, trainer: trainer ?? cur!.trainer }));
  }, []);

  const load = useCallback(async () => {
    const r = await api<{ db: DB; version: number; trainer: User }>('GET', `/workspaces/${workspaceId}`);
    version.current = r.version;
    apply(normalise(r.db), r.trainer);
    return r;
  }, [workspaceId, apply]);

  useEffect(() => {
    setLoaded(null);
    setError('');
    dirty.current = false;
    pending.current = [];
    load().catch((e) => {
      if (e instanceof ApiError && e.status === 404 && onNotFound) onNotFound();
      else setError(e instanceof Error ? e.message : String(e));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || !dirty.current || !dbRef.current) return;
    inFlight.current = true;
    dirty.current = false;
    const messages = pending.current.splice(0);
    setSync('saving');
    let offline = false;
    try {
      const r = await api<{ version: number }>('PUT', `/workspaces/${workspaceId}`, { db: dbRef.current, baseVersion: version.current, messages });
      version.current = r.version;
      setSync('saved');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body.db) {
        version.current = e.body.version as number;
        apply(normalise(e.body.db as DB));
        setSync('saved');
        toast('Someone else changed this workspace at the same time. You are now seeing the latest version, so please check your last change.', 'error');
      } else if (e instanceof ApiError && e.status === 401) {
        window.location.reload();
      } else {
        // Keep the change and retry.
        pending.current.unshift(...messages);
        dirty.current = true;
        offline = true;
        setSync('offline');
        timer.current = setTimeout(() => void flush(), 5000);
      }
    } finally {
      inFlight.current = false;
      if (dirty.current && !offline) timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    }
  }, [workspaceId, apply, toast]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSync('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush]);

  // Pick up changes made elsewhere (the owner, the trainer on another device, client bookings).
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== 'visible' || dirty.current || inFlight.current || !dbRef.current) return;
      api<{ db: DB; version: number }>('GET', `/workspaces/${workspaceId}`)
        .then((r) => {
          if (r.version > version.current && !dirty.current && !inFlight.current) {
            version.current = r.version;
            apply(normalise(r.db));
          }
        })
        .catch(() => undefined);
    };
    const id = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', poll);
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', poll);
      window.removeEventListener('beforeunload', warn);
    };
  }, [workspaceId, apply]);

  useEffect(() => {
    if (loaded) document.documentElement.style.setProperty('--brand', loaded.db.settings.brandColor);
  }, [loaded?.db.settings.brandColor]);

  const update = useCallback(
    (fn: (draft: DB) => void, success?: string) => {
      if (!dbRef.current) return false;
      const draft = structuredClone(dbRef.current);
      try {
        fn(draft);
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), 'error');
        return false;
      }
      apply(draft);
      if (success) {
        pending.current.push(success);
        toast(success);
      }
      schedule();
      return true;
    },
    [apply, schedule, toast],
  );

  const replace = useCallback(
    (db: DB, message: string) => {
      apply(normalise(db));
      pending.current.push(message);
      schedule();
    },
    [apply, schedule],
  );

  const value = useMemo(
    () => (loaded ? { db: loaded.db, trainer: loaded.trainer, workspaceId, sync, update, replace, toast } : null),
    [loaded, workspaceId, sync, update, replace, toast],
  );

  if (error) return <div className="splash error">Couldn't load this workspace: {error}</div>;
  if (!value) return <div className="splash">Loading…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

/** Store for an optional context, e.g. pages that also render in the public portal. */
export function useMaybeStore(): Store | null {
  return useContext(Ctx);
}
