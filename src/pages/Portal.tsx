// What a client sees when they log in: their bookings and credits, open
// classes to book, assigned workouts (with logging), meal plan, progress
// and invoices — branded with the trainer's business.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useStore } from '../store';
import type { ID, WorkoutLog } from '../types';
import {
  activePackages,
  bookClient,
  cancelBooking,
  creditsRemaining,
  invoiceTotals,
  isOverdue,
  mealPlanMacros,
  spacesLeft,
  TYPE_LABELS,
  upcomingFor,
} from '../logic';
import { addDays, fmtDate, fmtDateTime, fmtMoney, uid } from '../utils';
import { Badge, Empty, LineChart, Modal, Tabs } from '../components/ui';

type Tab = 'bookings' | 'workouts' | 'nutrition' | 'progress' | 'payments';

function LogWorkoutModal({ clientId, programId, dayId, onClose }: { clientId: ID; programId: ID; dayId: ID; onClose: () => void }) {
  const { db, update } = useStore();
  const day = db.programs.find((p) => p.id === programId)?.days.find((d) => d.id === dayId);
  const last = db.workoutLogs.filter((l) => l.clientId === clientId && l.dayId === dayId).sort((a, b) => b.date.localeCompare(a.date))[0];
  const [entries, setEntries] = useState<WorkoutLog['entries']>(() => day?.items.map((it) => ({ itemId: it.id, weight: '', reps: '', done: false })) ?? []);
  const [notes, setNotes] = useState('');
  if (!day) return null;
  const set = (i: number, patch: Partial<WorkoutLog['entries'][number]>) => setEntries(entries.map((e, j) => (i === j ? { ...e, ...patch } : e)));
  return (
    <Modal title={`Log: ${day.name}`} onClose={onClose} wide>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = update((d) => void d.workoutLogs.push({ id: uid(), clientId, programId, dayId, date: new Date().toISOString(), notes, entries }), 'Workout logged – nice work!');
          if (ok) onClose();
        }}
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Done</th>
                <th>Exercise</th>
                <th>Target</th>
                <th>Weight</th>
                <th>Reps</th>
              </tr>
            </thead>
            <tbody>
              {day.items.map((it, i) => {
                const ex = db.exercises.find((x) => x.id === it.exerciseId);
                const prev = last?.entries.find((x) => x.itemId === it.id);
                return (
                  <tr key={it.id}>
                    <td>
                      <input type="checkbox" checked={entries[i]?.done ?? false} onChange={(e) => set(i, { done: e.target.checked })} aria-label="Done" />
                    </td>
                    <td>
                      <strong>{ex?.name}</strong>
                      {prev?.weight && <div className="muted small">last time: {prev.weight} × {prev.reps}</div>}
                    </td>
                    <td className="small">
                      {it.sets} × {it.reps}
                    </td>
                    <td>
                      <input className="narrow" placeholder="kg" value={entries[i]?.weight ?? ''} onChange={(e) => set(i, { weight: e.target.value })} />
                    </td>
                    <td>
                      <input className="narrow" value={entries[i]?.reps ?? ''} onChange={(e) => set(i, { reps: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <textarea rows={2} placeholder="How did it feel?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save workout</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Portal() {
  const { clientId } = useParams();
  const { db, update, toast } = useStore();
  const [tab, setTab] = useState<Tab>('bookings');
  const [logging, setLogging] = useState<{ programId: ID; dayId: ID } | null>(null);
  const c = db.clients.find((x) => x.id === clientId);
  if (!c) return <div className="page"><Empty>Account not found. <Link to="/">Back</Link></Empty></div>;

  const now = new Date();
  const cur = db.settings.currency;
  const credits = creditsRemaining(db, c.id, now);
  const nextExpiry = activePackages(db, c.id, now)[0];
  const upcoming = upcomingFor(db, c.id, now);
  const classes = db.appointments
    .filter((a) => a.type === 'class' && a.status === 'scheduled' && new Date(a.start) > now && new Date(a.start) < addDays(now, 14) && !a.bookings.some((b) => b.clientId === c.id))
    .sort((a, b) => a.start.localeCompare(b.start));
  const programs = db.assignments.filter((a) => a.clientId === c.id).map((a) => db.programs.find((p) => p.id === a.programId)!).filter(Boolean);
  const plans = db.mealPlans.filter((m) => m.clientId === c.id);
  const weights = db.assessments
    .filter((a) => a.clientId === c.id && a.weightKg !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({ x: new Date(a.date), y: a.weightKg! }));
  const logs = db.workoutLogs.filter((l) => l.clientId === c.id).sort((a, b) => b.date.localeCompare(a.date));
  const invoices = db.invoices.filter((i) => i.clientId === c.id && i.status !== 'void').sort((a, b) => b.number - a.number);

  const cancel = (apptId: ID) => {
    const a = db.appointments.find((x) => x.id === apptId)!;
    const hours = (new Date(a.start).getTime() - now.getTime()) / 3_600_000;
    const late = hours < db.settings.lateCancelHours;
    const msg = late
      ? `This is within the ${db.settings.lateCancelHours}-hour cancellation window, so the session will still be charged. Cancel anyway?`
      : 'Cancel this booking? Your credit will be returned.';
    if (!confirm(msg)) return;
    let result = '';
    if (!update((d) => void (result = cancelBooking(d, apptId, c.id, new Date())))) return;
    toast(result === 'late-cancel' ? 'Cancelled (late – credit used)' : 'Cancelled – credit returned');
  };

  return (
    <div className="portal">
      <div className="portal-banner">
        Previewing the client portal as {c.firstName}. <Link to={`/clients/${c.id}`}>Back to trainer view</Link>
      </div>
      <header className="portal-head">
        <div className="brand">
          <span className="brand-mark">{db.settings.businessName.slice(0, 1)}</span>
          <div className="brand-name">{db.settings.businessName}</div>
        </div>
        <h1>Hi {c.firstName} 👋</h1>
        <div className="portal-stats">
          <div>
            <strong>{credits}</strong>
            <span>sessions left</span>
          </div>
          <div>
            <strong>{upcoming.length}</strong>
            <span>booked</span>
          </div>
          <div>
            <strong>{logs.length}</strong>
            <span>workouts logged</span>
          </div>
        </div>
        {nextExpiry && <p className="small">Your {nextExpiry.name} expires {fmtDate(nextExpiry.expiresAt)}.</p>}
      </header>

      <div className="page">
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            ['bookings', 'Bookings'],
            ['workouts', 'Workouts'],
            ['nutrition', 'Nutrition'],
            ['progress', 'Progress'],
            ['payments', 'Payments'],
          ]}
        />

        {tab === 'bookings' && (
          <>
            <section className="card">
              <h2>Your upcoming sessions</h2>
              {upcoming.length === 0 ? (
                <Empty>Nothing booked yet.</Empty>
              ) : (
                <ul className="list">
                  {upcoming.map((a) => (
                    <li key={a.id} className="list-row">
                      <span className="grow">
                        <strong>{fmtDateTime(a.start)}</strong> · {a.title}
                        {a.location && <span className="muted small"> · {a.location}</span>}
                      </span>
                      <button className="btn small ghost danger" onClick={() => cancel(a.id)}>
                        Cancel
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <h2>Book a class</h2>
              {classes.length === 0 ? (
                <Empty>No classes with spaces in the next two weeks.</Empty>
              ) : (
                <ul className="list">
                  {classes.map((a) => {
                    const left = spacesLeft(a);
                    return (
                      <li key={a.id} className="list-row">
                        <span className="grow">
                          <strong>{fmtDateTime(a.start)}</strong> · {a.title} <span className="muted small">· {a.durationMin} min · {a.location}</span>
                        </span>
                        <Badge tone={left === 0 ? 'bad' : left <= 2 ? 'warn' : 'good'}>{left === 0 ? 'Full' : `${left} space${left === 1 ? '' : 's'}`}</Badge>
                        <button
                          className="btn small primary"
                          disabled={left === 0}
                          onClick={() => {
                            if (credits === 0 && !confirm("You have no credits left — you'll be invoiced for this class. Book anyway?")) return;
                            update((d) => bookClient(d, a.id, c.id), `Booked into ${a.title}`);
                          }}
                        >
                          Book
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="muted small">
                Cancellations within {db.settings.lateCancelHours} hours are charged. {TYPE_LABELS.pt}s are booked with your trainer.
              </p>
            </section>
          </>
        )}

        {tab === 'workouts' && (
          <>
            {programs.length === 0 && <Empty>Your trainer hasn't assigned a program yet.</Empty>}
            {programs.map((p) => (
              <section key={p.id} className="card">
                <h2>{p.name}</h2>
                {p.description && <p className="muted">{p.description}</p>}
                {p.days.map((d) => (
                  <div key={d.id} className="day">
                    <div className="card-head">
                      <h3>{d.name}</h3>
                      <button className="btn small primary" onClick={() => setLogging({ programId: p.id, dayId: d.id })}>
                        Start & log
                      </button>
                    </div>
                    <ol className="ex-list">
                      {d.items.map((it) => {
                        const ex = db.exercises.find((x) => x.id === it.exerciseId);
                        return (
                          <li key={it.id}>
                            <strong>{ex?.name}</strong> — {it.sets} × {it.reps}, rest {it.rest}
                            {it.notes && <span className="muted"> · {it.notes}</span>}
                            {ex?.instructions && <div className="muted small">{ex.instructions}</div>}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                ))}
              </section>
            ))}
            {logs.length > 0 && (
              <section className="card">
                <h2>Workout history</h2>
                <ul className="list">
                  {logs.slice(0, 10).map((l) => {
                    const p = db.programs.find((x) => x.id === l.programId);
                    return (
                      <li key={l.id} className="list-row">
                        <span className="grow">
                          {fmtDate(l.date)} · {p?.name} – {p?.days.find((d) => d.id === l.dayId)?.name}
                        </span>
                        <span className="muted small">
                          {l.entries.filter((e) => e.done).length}/{l.entries.length} done
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === 'nutrition' &&
          (plans.length === 0 ? (
            <Empty>No meal plan yet.</Empty>
          ) : (
            plans.map((m) => {
              const mac = mealPlanMacros(db, m);
              return (
                <section key={m.id} className="card">
                  <h2>{m.name}</h2>
                  <p>
                    <strong>{Math.round(mac.calories)} kcal</strong> · Protein {Math.round(mac.protein)}g · Carbs {Math.round(mac.carbs)}g · Fat {Math.round(mac.fat)}g
                  </p>
                  {m.meals.map((meal, i) => (
                    <div key={meal.id} className="day">
                      <h3>
                        {meal.name} <span className="muted small">{Math.round(mac.perMeal[i].calories)} kcal</span>
                      </h3>
                      <ul className="ex-list">
                        {meal.items.map((it) => {
                          const f = db.foods.find((x) => x.id === it.foodId);
                          return (
                            <li key={it.id}>
                              {it.qty !== 1 && `${it.qty} × `}
                              {f?.name} <span className="muted small">({f?.serving})</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </section>
              );
            })
          ))}

        {tab === 'progress' && (
          <section className="card">
            <h2>Weight</h2>
            <LineChart points={weights} unit="kg" />
            {weights.length >= 2 && (
              <p>
                {weights[weights.length - 1].y - weights[0].y <= 0 ? 'Down' : 'Up'} <strong>{Math.abs(weights[weights.length - 1].y - weights[0].y).toFixed(1)} kg</strong> since {fmtDate(weights[0].x)}.
              </p>
            )}
          </section>
        )}

        {tab === 'payments' && (
          <section className="card">
            <h2>Invoices</h2>
            {invoices.length === 0 ? (
              <Empty>No invoices.</Empty>
            ) : (
              <ul className="list">
                {invoices.map((i) => (
                  <li key={i.id} className="list-row">
                    <span className="grow">
                      #{i.number} · {i.lines.map((l) => l.description).join(', ')} <span className="muted small">· due {fmtDate(i.dueAt)}</span>
                    </span>
                    <strong>{fmtMoney(invoiceTotals(i, db.settings.taxRatePct).total, cur)}</strong>
                    <Badge tone={i.status === 'paid' ? 'good' : isOverdue(i, now) ? 'bad' : 'warn'}>{i.status === 'paid' ? 'paid' : isOverdue(i, now) ? 'overdue' : 'due'}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
      {logging && <LogWorkoutModal clientId={c.id} {...logging} onClose={() => setLogging(null)} />}
    </div>
  );
}
