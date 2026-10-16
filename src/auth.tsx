import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, firebaseConfigured, firestore } from './firebase';
import { api, type User } from './api';
import type { UserDoc } from './firestoreModel';

interface Auth {
  user: User | null;
  /** The signed-in user's own workspace (workspaces are keyed by uid). */
  homeWorkspaceId: string | null;
  loading: boolean;
  needsSetup: boolean;
  /** Why the last session ended, e.g. a disabled account. */
  notice: string;
  logout: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Auth, 'logout'>>({ user: null, homeWorkspaceId: null, loading: true, needsSetup: false, notice: '' });

  useEffect(() => {
    if (!firebaseConfigured) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) {
        const needsSetup = await api<{ needsSetup: boolean }>('GET', '/status').then((r) => r.needsSetup, () => false);
        setState((s) => ({ ...s, user: null, homeWorkspaceId: null, loading: false, needsSetup }));
        return;
      }
      setState((s) => ({ ...s, loading: true }));
      try {
        const snap = await getDoc(doc(firestore, 'users', fbUser.uid));
        const u = snap.data() as UserDoc | undefined;
        if (!u || u.disabled) throw new Error('This account has been disabled. Contact the owner.');
        const lastSeenAt = new Date().toISOString();
        void updateDoc(doc(firestore, 'users', fbUser.uid), { lastSeenAt }).catch(() => undefined);
        setState({
          user: { id: fbUser.uid, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, disabled: false, lastSeenAt },
          homeWorkspaceId: fbUser.uid,
          loading: false,
          needsSetup: false,
          notice: '',
        });
      } catch (e) {
        await signOut(auth);
        setState({ user: null, homeWorkspaceId: null, loading: false, needsSetup: false, notice: e instanceof Error ? e.message : String(e) });
      }
    });
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
    window.location.hash = '#/';
  }, []);

  return <Ctx.Provider value={{ ...state, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth must be used inside AuthProvider');
  return a;
}
