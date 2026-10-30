import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { useAuth } from './auth';
import { firebaseConfigured, firestore } from './firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { UserDoc } from './firestoreModel';
import { WorkspaceCtx, useWorkspaceNav } from './workspace';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Schedule from './pages/Schedule';
import Workouts from './pages/Workouts';
import ProgramEditor from './pages/ProgramEditor';
import Nutrition from './pages/Nutrition';
import MealPlanEditor from './pages/MealPlanEditor';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import Team from './pages/Team';
import PortalPreview, { PublicPortal } from './pages/Portal';
import { AcceptInvite, Login, Setup } from './pages/Auth';
import InstallBanner from './components/InstallBanner';
import NotificationBell from './components/NotificationBell';

// 24×24 stroke icons, drawn as path data.
const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  schedule: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  clients: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
  workouts: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  nutrition: 'M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5zM12 7c0-2 1-4 3-4',
  billing: 'M2 6h20v12H2zM2 10h20M6 15h4',
  team: 'M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6zM9 12l2 2 4-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

const NAV: [string, string, keyof typeof ICONS][] = [
  ['/', 'Dashboard', 'dashboard'],
  ['/schedule', 'Schedule', 'schedule'],
  ['/clients', 'Clients', 'clients'],
  ['/workouts', 'Workouts', 'workouts'],
  ['/nutrition', 'Nutrition', 'nutrition'],
  ['/billing', 'Billing', 'billing'],
  ['/settings', 'Settings', 'settings'],
];

const Icon = ({ name }: { name: keyof typeof ICONS }) => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={ICONS[name]} />
  </svg>
);

const WS_KEY = 'repminder-open-workspace';

export default function App() {
  const auth = useAuth();
  const loc = useLocation();

  // Public pages that work without signing in.
  if (loc.pathname.startsWith('/p/')) {
    return (
      <Routes>
        <Route path="/p/:token" element={<PublicPortal />} />
      </Routes>
    );
  }
  if (!firebaseConfigured)
    return (
      <div className="auth-wrap">
        <div className="auth-card card">
          <h1>Connect Firebase</h1>
          <p>
            This deployment has no Firebase settings yet. Add the <code>VITE_FIREBASE_*</code> environment variables in Vercel (see <code>.env.example</code> and the README), then redeploy.
          </p>
        </div>
      </div>
    );
  if (auth.loading) return <div className="splash">Loading…</div>;
  if (loc.pathname === '/setup' || loc.pathname.startsWith('/invite/')) {
    return (
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
      </Routes>
    );
  }
  if (!auth.user || !auth.homeWorkspaceId) {
    if (auth.needsSetup)
      return (
        <div className="auth-wrap">
          <div className="auth-card card">
            <h1>Welcome to RepMinder</h1>
            <p>No owner account exists yet. Create yours using the setup code you set in Vercel.</p>
            <a className="btn primary block" href="#/setup">
              Create owner account
            </a>
          </div>
        </div>
      );
    return <Login />;
  }
  return <SignedIn key={auth.user.id} home={auth.homeWorkspaceId} isOwner={auth.user.role === 'owner'} />;
}

function SignedIn({ home, isOwner }: { home: string; isOwner: boolean }) {
  const [current, setCurrent] = useState(() => {
    if (!isOwner) return home;
    try {
      return localStorage.getItem(WS_KEY) || home;
    } catch {
      return home;
    }
  });
  const open = (id: string) => {
    setCurrent(id);
    try {
      localStorage.setItem(WS_KEY, id);
    } catch {
      // Not remembered across reloads; fine.
    }
  };
  return (
    <WorkspaceCtx.Provider value={{ current, home, open }}>
      <StoreProvider key={current} workspaceId={current} onNotFound={() => open(home)}>
        <Shell />
      </StoreProvider>
    </WorkspaceCtx.Provider>
  );
}

function WorkspaceSwitcher() {
  const ws = useWorkspaceNav();
  const nav = useNavigate();
  const [list, setList] = useState<{ workspaceId: string; name: string; disabled: boolean; role: string }[]>([]);
  useEffect(() => {
    getDocs(collection(firestore, 'users')).then(
      (snap) =>
        setList(
          snap.docs
            .map((d) => ({ workspaceId: d.id, ...(d.data() as UserDoc) }))
            .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'owner' ? -1 : 1)),
        ),
      () => undefined,
    );
  }, [ws.current]);
  if (list.length < 2) return null;
  return (
    <label className="ws-switch">
      <span className="field-label">Workspace</span>
      <select
        value={ws.current}
        onChange={(e) => {
          ws.open(e.target.value);
          nav('/');
        }}
      >
        {list.map((t) => (
          <option key={t.workspaceId} value={t.workspaceId}>
            {t.role === 'owner' ? `${t.name} (me)` : t.name}
            {t.disabled ? ' – disabled' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function Shell() {
  const { db, trainer, sync } = useStore();
  const { user, logout } = useAuth();
  const ws = useWorkspaceNav();
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();
  const isOwner = user?.role === 'owner';
  const viewingOther = ws.current !== ws.home;

  if (loc.pathname.startsWith('/portal/')) {
    return (
      <Routes>
        <Route path="/portal/:clientId" element={<PortalPreview />} />
      </Routes>
    );
  }

  return (
    <div className={`shell ${navOpen ? 'nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">{db.settings.businessName.slice(0, 1)}</span>
          <div>
            <div className="brand-name">{db.settings.businessName}</div>
            <div className="brand-sub">{db.settings.trainerName}</div>
          </div>
        </div>
        {isOwner && <WorkspaceSwitcher />}
        <nav onClick={() => setNavOpen(false)}>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon name={icon} />
              {label}
            </NavLink>
          ))}
          {isOwner && (
            <NavLink to="/team" className="nav-team">
              <Icon name="team" />
              Team & activity
            </NavLink>
          )}
        </nav>
        <div className="sidebar-foot">
          <NotificationBell workspaceId={ws.home} />
          <div className={`sync ${sync}`}>{sync === 'saved' ? 'All changes saved' : sync === 'saving' ? 'Saving…' : 'Offline – will retry'}</div>
          <div className="me">
            <span className="grow">
              <strong>{user?.name}</strong>
              <span className="muted small"> · {user?.role}</span>
            </span>
            <button className="btn small ghost" onClick={() => void logout()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        <button className="menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
          ☰
        </button>
        {viewingOther && (
          <div className="viewing-banner">
            <span>
              You're viewing <strong>{trainer.name}</strong>'s workspace. Your changes are saved to their account and recorded in the activity log.
            </span>
            <button className="btn small" onClick={() => ws.open(ws.home)}>
              Back to mine
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/workouts/:id" element={<ProgramEditor />} />
          <Route path="/nutrition" element={<Nutrition />} />
          <Route path="/nutrition/:id" element={<MealPlanEditor />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/settings" element={<Settings />} />
          {isOwner && <Route path="/team" element={<Team />} />}
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
      <InstallBanner />
    </div>
  );
}
