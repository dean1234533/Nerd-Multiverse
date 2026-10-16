import { createContext, useContext } from 'react';

export interface WorkspaceNav {
  /** Workspace currently open in the app. */
  current: string;
  /** The signed-in user's own workspace. */
  home: string;
  open: (workspaceId: string) => void;
}

export const WorkspaceCtx = createContext<WorkspaceNav | null>(null);

export function useWorkspaceNav(): WorkspaceNav {
  const w = useContext(WorkspaceCtx);
  if (!w) throw new Error('useWorkspaceNav must be used inside the app shell');
  return w;
}
