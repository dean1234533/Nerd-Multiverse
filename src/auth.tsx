import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from './api';

interface Auth {
  user: User | null;
  /** The signed-in user's own workspace. */
  homeWorkspaceId: string | null;
  loading: boolean;
  needsSetup: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Auth, 'refresh' | 'logout'>>({ user: null, homeWorkspaceId: null, loading: true, needsSetup: false });

  const refresh = useCallback(async () => {
    try {
      const me = await api<{ user: User; workspaceId: string }>('GET', '/me');
      setState({ user: me.user, homeWorkspaceId: me.workspaceId, loading: false, needsSetup: false });
    } catch (e) {
      let needsSetup = false;
      if (e instanceof ApiError && e.status === 401) {
        needsSetup = await api<{ needsSetup: boolean }>('GET', '/status').then((s) => s.needsSetup, () => false);
      }
      setState({ user: null, homeWorkspaceId: null, loading: false, needsSetup });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api('POST', '/logout').catch(() => undefined);
    setState({ user: null, homeWorkspaceId: null, loading: false, needsSetup: false });
    window.location.hash = '#/';
  }, []);

  return <Ctx.Provider value={{ ...state, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const a = useContext(Ctx);
  if (!a) throw new Error('useAuth must be used inside AuthProvider');
  return a;
}
