import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { Client, ClientStatus } from '../types';
import { creditsRemaining, outstanding, upcomingFor } from '../logic';
import { fmtDateTime, fmtMoney, uid } from '../utils';
import { Avatar, Badge, Empty, Field, Modal } from '../components/ui';

export const STATUS_TONE: Record<ClientStatus, 'good' | 'brand' | 'neutral'> = { active: 'good', lead: 'brand', inactive: 'neutral' };

export function ClientForm({ initial, onSave, onCancel }: { initial?: Client; onSave: (c: Client) => void; onCancel: () => void }) {
  const [c, setC] = useState<Client>(
    initial ?? { id: uid(), firstName: '', lastName: '', email: '', phone: '', dob: '', goals: '', notes: '', injuries: '', status: 'active', createdAt: new Date().toISOString() },
  );
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setC({ ...c, [k]: v });
  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...c, firstName: c.firstName.trim(), lastName: c.lastName.trim() });
      }}
    >
      <div className="row">
        <Field label="First name">
          <input required value={c.firstName} onChange={(e) => set('firstName', e.target.value)} autoFocus />
        </Field>
        <Field label="Last name">
          <input required value={c.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Email">
          <input type="email" value={c.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field label="Phone">
          <input type="tel" value={c.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
      </div>
      <div className="row">
        <Field label="Date of birth">
          <input type="date" value={c.dob ?? ''} onChange={(e) => set('dob', e.target.value)} />
        </Field>
        <Field label="Status">
          <select value={c.status} onChange={(e) => set('status', e.target.value as ClientStatus)}>
            <option value="active">Active</option>
            <option value="lead">Lead</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
      </div>
      <Field label="Goals">
        <textarea rows={2} value={c.goals} onChange={(e) => set('goals', e.target.value)} />
      </Field>
      <Field label="Injuries / medical (PAR-Q notes)">
        <textarea rows={2} value={c.injuries} onChange={(e) => set('injuries', e.target.value)} />
      </Field>
      <Field label="Private notes">
        <textarea rows={2} value={c.notes} onChange={(e) => set('notes', e.target.value)} />
      </Field>
      <div className="actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn primary">Save</button>
      </div>
    </form>
  );
}

export default function Clients() {
  const { db, update } = useStore();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ClientStatus | 'all'>('active');
  const [adding, setAdding] = useState(false);
  const now = new Date();

  const list = db.clients
    .filter((c) => status === 'all' || c.status === status)
    .filter((c) => `${c.firstName} ${c.lastName} ${c.email} ${c.phone}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  const counts = (s: ClientStatus) => db.clients.filter((c) => c.status === s).length;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Clients</h1>
        <button className="btn primary" onClick={() => setAdding(true)}>
          + Add client
        </button>
      </header>
      <div className="toolbar">
        <input type="search" placeholder="Search name, email or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="seg">
          {(['active', 'lead', 'inactive', 'all'] as const).map((s) => (
            <button key={s} className={status === s ? 'active' : ''} onClick={() => setStatus(s)}>
              {s[0].toUpperCase() + s.slice(1)}
              {s !== 'all' && <small> {counts(s)}</small>}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Empty>No clients match.</Empty>
      ) : (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Credits</th>
                <th>Next session</th>
                <th className="num">Owes</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => {
                const credits = creditsRemaining(db, c.id, now);
                const next = upcomingFor(db, c.id, now)[0];
                const owes = outstanding(db, c.id);
                return (
                  <tr key={c.id} className="clickable" onClick={() => nav(`/clients/${c.id}`)}>
                    <td>
                      <div className="who">
                        <Avatar first={c.firstName} last={c.lastName} />
                        <div>
                          <Link to={`/clients/${c.id}`} onClick={(e) => e.stopPropagation()}>
                            {c.firstName} {c.lastName}
                          </Link>
                          <div className="muted small">{c.email || c.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td>
                      <Badge tone={credits === 0 ? 'bad' : credits <= 2 ? 'warn' : 'neutral'}>{credits}</Badge>
                    </td>
                    <td className="small">{next ? fmtDateTime(next.start) : <span className="muted">—</span>}</td>
                    <td className="num">{owes > 0 ? fmtMoney(owes, db.settings.currency) : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <Modal title="Add client" onClose={() => setAdding(false)}>
          <ClientForm
            onCancel={() => setAdding(false)}
            onSave={(c) => {
              update((d) => void d.clients.push(c), `Added client ${c.firstName} ${c.lastName}`);
              setAdding(false);
              nav(`/clients/${c.id}`);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
