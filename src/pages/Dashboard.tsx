import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { ID } from '../types';
import { activePackages, clientName, creditsRemaining, invoiceTotals, isOverdue, outstanding, revenueBetween, TYPE_LABELS } from '../logic';
import { addDays, fmtDate, fmtMoney, fmtTime, sameDay, startOfDay, startOfWeek } from '../utils';
import { AppointmentModal } from '../components/AppointmentModal';
import { Avatar, Badge, Empty, Stat } from '../components/ui';

export default function Dashboard() {
  const { db } = useStore();
  const [open, setOpen] = useState<ID | null>(null);
  const now = new Date();
  const cur = db.settings.currency;

  const today = db.appointments
    .filter((a) => a.status !== 'cancelled' && sameDay(new Date(a.start), now))
    .sort((a, b) => a.start.localeCompare(b.start));
  const tomorrow = db.appointments
    .filter((a) => a.status === 'scheduled' && sameDay(new Date(a.start), addDays(now, 1)))
    .sort((a, b) => a.start.localeCompare(b.start));

  const weekStart = startOfWeek(now);
  const weekSessions = db.appointments.filter((a) => a.status !== 'cancelled' && new Date(a.start) >= weekStart && new Date(a.start) < addDays(weekStart, 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const revenue = revenueBetween(db, monthStart, addDays(startOfDay(now), 1));
  const lastMonth = revenueBetween(db, new Date(now.getFullYear(), now.getMonth() - 1, 1), monthStart);

  const active = db.clients.filter((c) => c.status === 'active');
  const lowCredit = active
    .map((c) => ({ c, credits: creditsRemaining(db, c.id, now), next: activePackages(db, c.id, now)[0] }))
    .filter((x) => x.credits <= 2)
    .sort((a, b) => a.credits - b.credits);
  const overdue = db.invoices.filter((i) => isOverdue(i, now));
  const leads = db.clients.filter((c) => c.status === 'lead');

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Good {now.getHours() < 12 ? 'morning' : now.getHours() < 18 ? 'afternoon' : 'evening'}, {db.settings.trainerName.split(' ')[0]}</h1>
          <p className="muted">{now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
      </header>

      <div className="stats">
        <Stat label="Active clients" value={active.length} sub={`${leads.length} lead${leads.length === 1 ? '' : 's'}`} />
        <Stat label="Sessions this week" value={weekSessions.length} sub={`${weekSessions.filter((a) => a.status === 'completed').length} completed`} />
        <Stat label="Revenue this month" value={fmtMoney(revenue, cur)} sub={`Last month ${fmtMoney(lastMonth, cur)}`} />
        <Stat label="Outstanding" value={fmtMoney(outstanding(db), cur)} sub={overdue.length ? <span className="error">{overdue.length} overdue</span> : 'Nothing overdue'} />
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Today</h2>
            <Link to="/schedule">Open calendar →</Link>
          </div>
          {today.length === 0 ? (
            <Empty>No sessions today. Enjoy the rest day.</Empty>
          ) : (
            <ul className="list">
              {today.map((a) => (
                <li key={a.id} className="list-row clickable" onClick={() => setOpen(a.id)}>
                  <span className="time">{fmtTime(a.start)}</span>
                  <span className="grow">
                    <strong>{a.title}</strong>
                    <span className="muted small">
                      {' '}
                      · {TYPE_LABELS[a.type]} · {a.bookings.map((b) => clientName(db, b.clientId)).join(', ') || 'no bookings'}
                    </span>
                  </span>
                  <Badge tone={a.status === 'completed' ? 'good' : 'neutral'}>{a.status}</Badge>
                </li>
              ))}
            </ul>
          )}
          {tomorrow.length > 0 && (
            <>
              <h3>Tomorrow</h3>
              <ul className="list">
                {tomorrow.map((a) => (
                  <li key={a.id} className="list-row clickable" onClick={() => setOpen(a.id)}>
                    <span className="time">{fmtTime(a.start)}</span>
                    <span className="grow">{a.title}</span>
                    <span className="muted small">send reminders →</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>Needs attention</h2>
          </div>
          {lowCredit.length === 0 && overdue.length === 0 && leads.length === 0 && <Empty>All caught up.</Empty>}
          <ul className="list">
            {lowCredit.map(({ c, credits, next }) => (
              <li key={c.id} className="list-row">
                <Avatar first={c.firstName} last={c.lastName} size={28} />
                <Link to={`/clients/${c.id}`} className="grow">
                  {c.firstName} {c.lastName}
                </Link>
                <Badge tone={credits === 0 ? 'bad' : 'warn'}>{credits === 0 ? 'No credits left' : `${credits} credit${credits === 1 ? '' : 's'} left`}</Badge>
                {next && <span className="muted small">expires {fmtDate(next.expiresAt)}</span>}
              </li>
            ))}
            {overdue.map((i) => (
              <li key={i.id} className="list-row">
                <span className="grow">
                  Invoice #{i.number} · <Link to={`/clients/${i.clientId}`}>{clientName(db, i.clientId)}</Link>
                </span>
                <Badge tone="bad">Overdue {fmtMoney(invoiceTotals(i, db.settings.taxRatePct).total, cur)}</Badge>
              </li>
            ))}
            {leads.map((c) => (
              <li key={c.id} className="list-row">
                <Avatar first={c.firstName} last={c.lastName} size={28} />
                <Link to={`/clients/${c.id}`} className="grow">
                  {c.firstName} {c.lastName}
                </Link>
                <Badge tone="brand">New lead</Badge>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {open && <AppointmentModal id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
