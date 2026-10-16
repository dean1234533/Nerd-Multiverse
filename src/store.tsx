import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DB } from './types';
import { emptyDB } from './seed';
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { firestore, friendlyError } from './firebase';
import { useAuth } from './auth';
import type { User } from './api';
import { MAX_WORKSPACE_BYTES, type ActivityDoc, type UserDoc, type WorkspaceDoc } from './firestoreModel';

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
   * Apply a change to a copy of the data and save it. If `fn` throws,
   * nothing changes and the message is shown as an error. The success
   * message is shown as a toast and recorded in the activity log.
   */
  update: (fn: (draft: DB) => void, success?: string) => boolean;
  replace: (db: DB, message: string) => void;
  toast: ToastFn;
}

const Ctx = createContext<Store | null>(null);

const SAVE_DELAY = 600;

class Conflict extends Error {
  constructor(public latest: WorkspaceDoc) {
    super('conflict');
  }
}

function normalise(d: DB): DB {
  const base = emptyDB();
  return { ...base, ...d, settings: { ...base.settings, ...d.settings } };
}

export function StoreProvider({ workspaceId, onNotFound, children }: { workspaceId: string; onNotFound?: () => void; children: ReactNode }) {
  const toast = useToast();
  const { user } = useAuth();
  const [loaded, setLoaded] = useState<{ db: DB; trainer: User } | null>(null);
  const [error, setError] = useState('');
  const [sync, setSync] = useState<SyncState>('saved');

  const dbRef = useRef<DB | null>(null);
  const version = useRef(0);
  const pending = useRef<string[]>([]);
  const dirty = useRef(false);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const sizeWarned = useRef(false);

  const apply = useCallback((db: DB, trainer?: User) => {
    dbRef.current = db;
    setLoaded((cur) => ({ db, trainer: trainer ?? cur!.trainer }));
  }, []);

  // Live subscription: picks up changes by the owner, the trainer on another
  // device, or clients booking through their portal.
  useEffect(() => {
    setLoaded(null);
    setError('');
    dirty.current = false;
    pending.current = [];
    let first = true;
    const ref = doc(firestore, 'workspaces', workspaceId);
    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (!snap.exists()) {
          if (onNotFound) onNotFound();
          else setError('Workspace not found');
          return;
        }
        const ws = snap.data() as WorkspaceDoc;
        if (first) {
          first = false;
          const profile = (await getDoc(doc(firestore, 'users', workspaceId))).data() as UserDoc | undefined;
          const trainer: User = {
            id: workspaceId,
            name: profile?.name ?? 'Unknown',
            email: profile?.email ?? '',
            role: profile?.role ?? 'trainer',
            createdAt: profile?.createdAt ?? '',
            disabled: !!profile?.disabled,
            lastSeenAt: profile?.lastSeenAt ?? null,
          };
          version.current = ws.version;
          apply(normalise(JSON.parse(ws.data) as DB), trainer);
        } else if (!snap.metadata.hasPendingWrites && ws.version > version.current && !dirty.current && !inFlight.current) {
          version.current = ws.version;
          apply(normalise(JSON.parse(ws.data) as DB));
        }
      },
      (e) => {
        if ((e as { code?: string }).code === 'permission-denied' && onNotFound && workspaceId !== user?.id) onNotFound();
        else setError(friendlyError(e));
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, apply]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (inFlight.current || !dirty.current || !dbRef.current || !user) return;
    const json = JSON.stringify(dbRef.current);
    if (json.length > MAX_WORKSPACE_BYTES) {
      setSync('offline');
      toast('This workspace has reached the storage limit, so the latest change was not saved. Delete old data or ask the owner for help.', 'error');
      return;
    }
    if (json.length > MAX_WORKSPACE_BYTES * 0.8 && !sizeWarned.current) {
      sizeWarned.current = true;
      toast('This workspace is over 80% of its storage limit. Consider deleting old clients or appointments.', 'error');
    }
    inFlight.current = true;
    dirty.current = false;
    const messages = pending.current.splice(0);
    const base = version.current;
    setSync('saving');
    let offline = false;
    try {
      const ref = doc(firestore, 'workspaces', workspaceId);
      await runTransaction(firestore, async (tx) => {
        const cur = await tx.get(ref);
        const ws = cur.data() as WorkspaceDoc;
        if (ws.version !== base) throw new Conflict(ws);
        tx.update(ref, { data: json, version: base + 1, updatedAt: serverTimestamp(), updatedBy: user.id });
        for (const message of messages) {
          tx.set(doc(collection(firestore, 'activity')), {
            workspaceId,
            actorUid: user.id,
            actorName: user.name,
            actorRole: user.role,
            message: message.slice(0, 500),
            createdAt: serverTimestamp(),
          } satisfies ActivityDoc);
        }
      });
      version.current = base + 1;
      setSync('saved');
    } catch (e) {
      if (e instanceof Conflict) {
        version.current = e.latest.version;
        apply(normalise(JSON.parse(e.latest.data) as DB));
        setSync('saved');
        toast('Someone else changed this workspace at the same time. You are now seeing the latest version, so please check your last change.', 'error');
      } else if ((e as { code?: string }).code === 'permission-denied') {
        setSync('offline');
        toast("You don't have permission to change this workspace any more.", 'error');
      } else {
        // Keep the change and retry (e.g. offline).
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
  }, [workspaceId, apply, toast, user]);

  const schedule = useCallback(() => {
    dirty.current = true;
    setSync('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY);
  }, [flush]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

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
