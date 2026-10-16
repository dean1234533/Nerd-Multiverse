import { useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { useStore } from './store';
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
import Portal from './pages/Portal';

// 24×24 stroke icons, drawn as path data.
const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  schedule: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4',
  clients: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M17 3.5a4 4 0 0 1 0 7M22 21a7 7 0 0 0-4-6.3',
  workouts: 'M6 7v10M3 9.5v5M18 7v10M21 9.5v5M6 12h12',
  nutrition: 'M12 7c-3-2-8-1-8 5s4 9 6 9c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 6-3 6-9s-5-7-8-5zM12 7c0-2 1-4 3-4',
  billing: 'M2 6h20v12H2zM2 10h20M6 15h4',
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

export default function App() {
  const { db } = useStore();
  const [navOpen, setNavOpen] = useState(false);
  const loc = useLocation();

  if (loc.pathname.startsWith('/portal/')) {
    return (
      <Routes>
        <Route path="/portal/:clientId" element={<Portal />} />
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
        <nav onClick={() => setNavOpen(false)}>
          {NAV.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={ICONS[icon]} />
              </svg>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">RepMinder · data saved in this browser</div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} />
      <main className="main">
        <button className="menu-btn" onClick={() => setNavOpen(true)} aria-label="Open menu">
          ☰
        </button>
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
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </main>
    </div>
  );
}
