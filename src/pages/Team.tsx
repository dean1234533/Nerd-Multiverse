import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, appLink, shareLink, type User } from '../api';
import { useAuth } from '../auth';
import { useToast } from '../store';
import { useWorkspaceNav } from '../workspace';
import { fmtDate, fmtDateTime } from '../utils';
import { Avatar, Badge, Empty, Field, Modal, Stat } from '../components/ui';

interface Trainer extends User {
  workspaceId: string;
  businessName: string;
  lastActivityAt: string | null;
  stats: { clients: number; activeClients: number; sessionsThisWeek: number; completedThisWeek: number; workoutsLogged: number };
}

interface Invite {
  token: string;
  name: string;
  email: string;
  createdAt: string;
  expiresAt: string;
}

interface Activity {
  id: number;
  workspaceId: string;
  actorName: string;
  actorRole: string;
  message: string;
  createdAt: string;
}

function ago(iso: string | null): string {
  if (!iso) return 'never';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return fmtDate(iso);
}

/** Shows a freshly created link with copy / share / email options. */
function LinkModal({ title, url, email, intro, onClose }: { title: string; url: string; email?: string; intro: string; onClose: () => void }) {
  const toast = useToast();
  const subject = encodeURIComponent(title);
  const body = encodeURIComponent(`${intro}\n\n${url}\n\nThe link works once and expires in 14 days.`);
  return (
    <Modal title={title} onClose={onClose}>
      <p className="muted">Send this link to them. It works once and expires in 14 days.</p>
      <div className="link-box">
        <input readOnly value={url} onFocus={(e) => e.target.select()} aria-label="Link" />
      </div>
      <div className="actions wrap">
        <a className="btn ghost" href={`mailto:${email ?? ''}?subject=${subject}&body=${body}`}>
          Email
        </a>
        <a className="btn ghost" href={`sms:?&body=${encodeURIComponent(`${intro} ${url}`)}`}>
          Text message
        </a>
        <button
          className="btn primary"
          onClick={async () => {
            const r = await shareLink(url, title, intro);
            if (r === 'copied') toast('Link copied');
          }}
        >
          Copy / share link
        </button>
      </div>
    </Modal>
  );
}

export default function Team() {
  const { user } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const ws = useWorkspaceNav();
  const [team, setTeam] = useState<{ trainers: Trainer[]; invites: Invite[] } | null>(null);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [filter, setFilter] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inv, setInv] = useState({ name: '', email: '' });
  const [link, setLink] = useState<{ title: string; url: string; email?: string; intro: string } | null>(null);

  const loadTeam = useCallback(() => api<{ trainers: Trainer[]; invites: Invite[] }>('GET', '/team').then(setTeam, (e) => toast(e.message, 'error')), [toast]);
  const loadActivity = useCallback(
    (before?: number) =>
      api<{ items: Activity[] }>('GET', `/activity?limit=50${filter ? `&workspace=${filter}` : ''}${before ? `&before=${before}` : ''}`).then(
        (r) => {
          setActivity((cur) => (before ? [...cur, ...r.items] : r.items));
          setHasMore(r.items.length === 50);
        },
        (e) => toast(e.message, 'error'),
      ),
    [filter, toast],
  );

  useEffect(() => void loadTeam(), [loadTeam]);
  useEffect(() => {
    void loadActivity();
    const id = setInterval(() => void loadActivity(), 30_000);
    return () => clearInterval(id);
  }, [loadActivity]);

  if (user?.role !== 'owner') return <div className="page"><Empty>Only the account owner can see the team.</Empty></div>;
  if (!team) return <div className="splash">Loading…</div>;

  const trainers = team.trainers;
  const byWs = new Map(trainers.map((t) => [t.workspaceId, t]));
  const active = trainers.filter((t) => !t.disabled);
  const totals = active.reduce(
    (a, t) => ({ clients: a.clients + t.stats.activeClients, sessions: a.sessions + t.stats.sessionsThisWeek, workouts: a.workouts + t.stats.workoutsLogged }),
    { clients: 0, sessions: 0, workouts: 0 },
  );

  const openWorkspace = (id: string) => {
    ws.open(id);
    nav('/');
  };

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = await api<{ token: string }>('POST', '/invites', inv);
      setInviting(false);
      setLink({
        title: 'Your RepMinder invite',
        url: appLink(`/invite/${r.token}`),
        email: inv.email,
        intro: `Hi${inv.name ? ` ${inv.name.split(' ')[0]}` : ''}, ${user.name} has invited you to RepMinder. Set up your trainer account here:`,
      });
      setInv({ name: '', email: '' });
      void loadTeam();
    } catch (err) {
      toast(err instanceof Error ? err.message : String(err), 'error');
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Everyone who uses your app, what they're doing, and invite links.</p>
        </div>
        <button className="btn primary" onClick={() => setInviting(true)}>
          + Invite trainer
        </button>
      </header>

      <div className="stats">
        <Stat label="Trainers" value={active.length} sub={`${trainers.length - active.length} disabled · ${team.invites.length} invite${team.invites.length === 1 ? '' : 's'} pending`} />
        <Stat label="Active clients" value={totals.clients} sub="across all trainers" />
        <Stat label="Sessions this week" value={totals.sessions} sub="across all trainers" />
        <Stat label="Workouts logged" value={totals.workouts} sub="by clients, all time" />
      </div>

      <section className="card table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Trainer</th>
              <th className="num">Clients</th>
              <th className="num">Sessions this week</th>
              <th>Last activity</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {trainers.map((t) => (
              <tr key={t.id} className={t.disabled ? 'disabled-row' : ''}>
                <td>
                  <div className="who">
                    <Avatar first={t.name.split(' ')[0] ?? ''} last={t.name.split(' ')[1] ?? ''} />
                    <div>
                      <strong>{t.name}</strong> {t.role === 'owner' && <Badge tone="brand">you</Badge>} {t.disabled && <Badge tone="bad">disabled</Badge>}
                      <div className="muted small">
                        {t.email} · {t.businessName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="num">
                  {t.stats.activeClients}
                  <span className="muted small"> / {t.stats.clients}</span>
                </td>
                <td className="num">
                  {t.stats.sessionsThisWeek}
                  <span className="muted small"> ({t.stats.completedThisWeek} done)</span>
                </td>
                <td className="small">
                  {ago(t.lastActivityAt)}
                  <div className="muted small">seen {ago(t.lastSeenAt)}</div>
                </td>
                <td className="nowrap">
                  <button className="btn small primary" onClick={() => openWorkspace(t.workspaceId)}>
                    {t.workspaceId === ws.current ? 'Open' : t.role === 'owner' ? 'Open mine' : 'View & edit'}
                  </button>{' '}
                  <button className="btn small ghost" onClick={() => setFilter(t.workspaceId)}>
                    Activity
                  </button>{' '}
                  {t.role !== 'owner' && (
                    <>
                      <button
                        className="btn small ghost"
                        onClick={async () => {
                          const r = await api<{ token: string }>('POST', `/users/${t.id}/reset`, {}).catch((e) => toast(e.message, 'error'));
                          if (r)
                            setLink({ title: 'Reset your RepMinder password', url: appLink(`/invite/${r.token}`), email: t.email, intro: `Hi ${t.name.split(' ')[0]}, use this link to set a new RepMinder password:` });
                        }}
                      >
                        Reset password
                      </button>{' '}
                      <button
                        className={`btn small ghost ${t.disabled ? '' : 'danger'}`}
                        onClick={async () => {
                          if (!t.disabled && !confirm(`Disable ${t.name}? They'll be signed out and their client portal links will stop working. Their data is kept.`)) return;
                          await api('PATCH', `/users/${t.id}`, { disabled: !t.disabled }).then(
                            () => toast(t.disabled ? `${t.name} re-enabled` : `${t.name} disabled`),
                            (e) => toast(e.message, 'error'),
                          );
                          void loadTeam();
                        }}
                      >
                        {t.disabled ? 'Enable' : 'Disable'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {team.invites.length > 0 && (
        <section className="card">
          <h2>Pending invites</h2>
          <ul className="list">
            {team.invites.map((i) => (
              <li key={i.token} className="list-row">
                <span className="grow">
                  {i.name || i.email || 'Unnamed invite'} {i.email && i.name && <span className="muted small">· {i.email}</span>}
                  <span className="muted small"> · created {fmtDate(i.createdAt)}, expires {fmtDate(i.expiresAt)}</span>
                </span>
                <button
                  className="btn small ghost"
                  onClick={() =>
                    setLink({ title: 'Your RepMinder invite', url: appLink(`/invite/${i.token}`), email: i.email, intro: `Hi${i.name ? ` ${i.name.split(' ')[0]}` : ''}, ${user.name} has invited you to RepMinder. Set up your trainer account here:` })
                  }
                >
                  Show link
                </button>
                <button className="btn small ghost danger" onClick={() => api('DELETE', `/invites/${i.token}`).then(() => (toast('Invite revoked'), loadTeam()))}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <h2>Activity</h2>
          <select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by trainer">
            <option value="">All trainers</option>
            {trainers.map((t) => (
              <option key={t.workspaceId} value={t.workspaceId}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        {activity.length === 0 ? (
          <Empty>Nothing logged yet.</Empty>
        ) : (
          <ul className="list activity">
            {activity.map((a) => (
              <li key={a.id} className="list-row">
                <span className="time small" title={new Date(a.createdAt).toLocaleString()}>
                  {fmtDateTime(a.createdAt)}
                </span>
                <span className="grow">
                  <strong>{a.actorName}</strong> {a.actorRole === 'client' && <Badge tone="brand">client</Badge>} <span>{a.message}</span>
                </span>
                {!filter && byWs.get(a.workspaceId) && (
                  <button className="btn small ghost" onClick={() => openWorkspace(a.workspaceId)} title="Open this trainer's workspace">
                    {byWs.get(a.workspaceId)!.name} →
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <button className="btn ghost" onClick={() => void loadActivity(activity[activity.length - 1]?.id)}>
            Load more
          </button>
        )}
      </section>

      {inviting && (
        <Modal title="Invite a trainer" onClose={() => setInviting(false)}>
          <form className="form" onSubmit={createInvite}>
            <p className="muted">You'll get a link to send them. They choose their own password and get their own workspace, which you can always see and edit.</p>
            <Field label="Name (optional)">
              <input value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} autoFocus />
            </Field>
            <Field label="Email (optional)">
              <input type="email" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} />
            </Field>
            <div className="actions">
              <button type="button" className="btn ghost" onClick={() => setInviting(false)}>
                Cancel
              </button>
              <button className="btn primary">Create invite link</button>
            </div>
          </form>
        </Modal>
      )}
      {link && <LinkModal {...link} onClose={() => setLink(null)} />}
    </div>
  );
}
