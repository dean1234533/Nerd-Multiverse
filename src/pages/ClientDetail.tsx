import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import { appLink, shareLink } from '../api';
import { portalLinkToken } from '../portalLinks';
import { friendlyError } from '../firebase';
import type { Assessment, ID } from '../types';
import {
  clientName,
  creditsRemaining,
  deleteClient,
  invoiceTotals,
  isOverdue,
  markInvoicePaid,
  mealPlanMacros,
  outstanding,
  packageRemaining,
  sellPackage,
  TYPE_LABELS,
  upcomingFor,
} from '../logic';
import { age, fmtDate, fmtDateTime, fmtMoney, toDateInput, uid } from '../utils';
import { AppointmentModal, NewAppointmentModal } from '../components/AppointmentModal';
import { Avatar, Badge, Empty, Field, LineChart, Modal, Stat, Tabs } from '../components/ui';
import { ClientForm, STATUS_TONE } from './Clients';

type Tab = 'overview' | 'sessions' | 'programs' | 'progress' | 'billing';

const METRICS: [keyof Assessment, string, string][] = [
  ['weightKg', 'Weight', 'kg'],
  ['bodyFatPct', 'Body fat', '%'],
  ['waistCm', 'Waist', 'cm'],
  ['hipsCm', 'Hips', 'cm'],
  ['chestCm', 'Chest', 'cm'],
  ['armCm', 'Arm', 'cm'],
  ['thighCm', 'Thigh', 'cm'],
  ['restingHr', 'Resting HR', 'bpm'],
];

export function SellPackageModal({ clientId, onClose }: { clientId: ID; onClose: () => void }) {
  const { db, update } = useStore();
  const [productId, setProductId] = useState(db.products[0]?.id ?? '');
  const [paid, setPaid] = useState('Card');
  return (
    <Modal title="Sell a package" onClose={onClose}>
      {db.products.length === 0 ? (
        <Empty>
          Create packages under <Link to="/billing">Billing</Link> first.
        </Empty>
      ) : (
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (update((d) => void sellPackage(d, clientId, productId, new Date(), paid || undefined), `Sold ${db.products.find((p) => p.id === productId)?.name} to ${clientName(db, clientId)}${paid ? ` (paid by ${paid.toLowerCase()})` : ' (invoiced)'}`)) onClose();
          }}
        >
          <div className="options">
            {db.products.map((p) => (
              <label key={p.id} className={`option ${productId === p.id ? 'active' : ''}`}>
                <input type="radio" name="product" checked={productId === p.id} onChange={() => setProductId(p.id)} />
                <span className="grow">
                  <strong>{p.name}</strong>
                  <span className="muted small"> · {p.sessions} sessions · valid {p.validDays} days</span>
                </span>
                <strong>{fmtMoney(p.price, db.settings.currency)}</strong>
              </label>
            ))}
          </div>
          <Field label="Payment">
            <select value={paid} onChange={(e) => setPaid(e.target.value)}>
              <option value="Card">Paid now – card</option>
              <option value="Cash">Paid now – cash</option>
              <option value="Bank transfer">Paid now – bank transfer</option>
              <option value="">Not paid yet – send invoice</option>
            </select>
          </Field>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn primary">Add package</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function AssessmentModal({ clientId, onClose }: { clientId: ID; onClose: () => void }) {
  const { db, update } = useStore();
  const [date, setDate] = useState(toDateInput(new Date()));
  const [vals, setVals] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  return (
    <Modal title="Record measurements" onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const a: Assessment = { id: uid(), clientId, date: new Date(date + 'T12:00').toISOString(), notes };
          for (const [k] of METRICS) {
            const v = parseFloat(vals[k as string]);
            if (!Number.isNaN(v)) (a as unknown as Record<string, number>)[k as string] = v;
          }
          if (update((d) => void d.assessments.push(a), `Recorded measurements for ${clientName(db, clientId)}${a.weightKg !== undefined ? ` (weight ${a.weightKg} kg)` : ''}`)) onClose();
        }}
      >
        <Field label="Date">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <div className="grid-4">
          {METRICS.map(([k, label, unit]) => (
            <Field key={k} label={`${label} (${unit})`}>
              <input type="number" step="0.1" value={vals[k as string] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const { db, update, toast, workspaceId } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>('overview');
  const [portalUrl, setPortalUrl] = useState('');
  const [modal, setModal] = useState<'edit' | 'book' | 'sell' | 'measure' | null>(null);
  const [openAppt, setOpenAppt] = useState<ID | null>(null);
  const [metric, setMetric] = useState<keyof Assessment>('weightKg');
  const [assignPick, setAssignPick] = useState('');

  const c = db.clients.find((x) => x.id === id);
  if (!c) return <div className="page"><Empty>Client not found. <Link to="/clients">Back to clients</Link></Empty></div>;

  const sendPortalLink = async (regenerate: boolean) => {
    if (regenerate && !confirm('Create a new link? The old link will stop working.')) return;
    try {
      setPortalUrl(appLink(`/p/${await portalLinkToken(workspaceId, c.id, regenerate)}`));
      if (regenerate) toast('New link created; the old one no longer works');
    } catch (e) {
      toast(friendlyError(e), 'error');
    }
  };

  const now = new Date();
  const cur = db.settings.currency;
  const credits = creditsRemaining(db, c.id, now);
  const packages = db.clientPackages.filter((p) => p.clientId === c.id).sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt));
  const upcoming = upcomingFor(db, c.id, now);
  const history = db.appointments
    .filter((a) => a.bookings.some((b) => b.clientId === c.id) && (new Date(a.start) < now || a.status !== 'scheduled'))
    .sort((a, b) => b.start.localeCompare(a.start));
  const attended = history.filter((a) => a.bookings.find((b) => b.clientId === c.id)?.attendance === 'attended').length;
  const assessments = db.assessments.filter((a) => a.clientId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  const assignments = db.assignments.filter((a) => a.clientId === c.id);
  const invoices = db.invoices.filter((i) => i.clientId === c.id).sort((a, b) => b.number - a.number);
  const plans = db.mealPlans.filter((m) => m.clientId === c.id);
  const latest = assessments[assessments.length - 1];
  const first = assessments[0];

  return (
    <div className="page">
      <Link to="/clients" className="back">
        ← Clients
      </Link>
      <header className="page-head client-head">
        <div className="who">
          <Avatar first={c.firstName} last={c.lastName} size={56} />
          <div>
            <h1>
              {c.firstName} {c.lastName} <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>
            </h1>
            <p className="muted">
              {[c.email, c.phone, age(c.dob) !== undefined ? `${age(c.dob)} yrs` : '', `client since ${fmtDate(c.createdAt)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        <div className="actions wrap">
          <Link className="btn ghost" to={`/portal/${c.id}`}>
            Preview portal
          </Link>
          <button className="btn ghost" onClick={() => void sendPortalLink(false)}>
            Send portal link
          </button>
          <button className="btn ghost" onClick={() => setModal('edit')}>
            Edit
          </button>
          <button className="btn ghost" onClick={() => setModal('sell')}>
            Sell package
          </button>
          <button className="btn primary" onClick={() => setModal('book')}>
            Book session
          </button>
        </div>
      </header>

      <div className="stats">
        <Stat label="Credits remaining" value={credits} sub={packages.length ? `${packages.length} package${packages.length > 1 ? 's' : ''} bought` : 'No packages'} />
        <Stat label="Sessions attended" value={attended} sub={`${history.filter((a) => a.bookings.find((b) => b.clientId === c.id)?.attendance === 'no-show').length} no-shows`} />
        <Stat label="Next session" value={upcoming[0] ? fmtDateTime(upcoming[0].start) : '—'} sub={`${upcoming.length} upcoming`} />
        <Stat
          label="Weight change"
          value={latest?.weightKg !== undefined && first?.weightKg !== undefined && latest !== first ? `${(latest.weightKg - first.weightKg > 0 ? '+' : '') + (latest.weightKg - first.weightKg).toFixed(1)} kg` : '—'}
          sub={latest ? `Last measured ${fmtDate(latest.date)}` : 'No measurements'}
        />
      </div>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          ['overview', 'Overview'],
          ['sessions', 'Sessions'],
          ['programs', 'Programs & nutrition'],
          ['progress', 'Progress'],
          ['billing', 'Billing'],
        ]}
      />

      {tab === 'overview' && (
        <div className="grid-2">
          <section className="card">
            <h2>Profile</h2>
            <dl className="dl">
              <dt>Goals</dt>
              <dd>{c.goals || <span className="muted">—</span>}</dd>
              <dt>Injuries / medical</dt>
              <dd>{c.injuries || <span className="muted">—</span>}</dd>
              <dt>Notes</dt>
              <dd>{c.notes || <span className="muted">—</span>}</dd>
            </dl>
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Packages</h2>
              <button className="btn small ghost" onClick={() => setModal('sell')}>
                + Sell
              </button>
            </div>
            {packages.length === 0 ? (
              <Empty>No packages yet.</Empty>
            ) : (
              <ul className="list">
                {packages.map((p) => {
                  const expired = new Date(p.expiresAt) < now;
                  const pct = (p.sessionsUsed / p.sessionsTotal) * 100;
                  return (
                    <li key={p.id} className="pkg">
                      <div className="list-row">
                        <strong className="grow">{p.name}</strong>
                        {expired ? <Badge tone="bad">expired</Badge> : packageRemaining(p) === 0 ? <Badge>used up</Badge> : <Badge tone="good">{packageRemaining(p)} left</Badge>}
                      </div>
                      <div className="bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                      <div className="muted small">
                        {p.sessionsUsed}/{p.sessionsTotal} used · bought {fmtDate(p.purchasedAt)} · expires {fmtDate(p.expiresAt)}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'sessions' && (
        <div className="grid-2">
          <section className="card">
            <h2>Upcoming</h2>
            {upcoming.length === 0 ? (
              <Empty>Nothing booked.</Empty>
            ) : (
              <ul className="list">
                {upcoming.map((a) => (
                  <li key={a.id} className="list-row clickable" onClick={() => setOpenAppt(a.id)}>
                    <span className="grow">
                      <strong>{fmtDateTime(a.start)}</strong> · {a.title}
                    </span>
                    <Badge>{TYPE_LABELS[a.type]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card">
            <h2>History</h2>
            {history.length === 0 ? (
              <Empty>No past sessions.</Empty>
            ) : (
              <ul className="list">
                {history.map((a) => {
                  const b = a.bookings.find((x) => x.clientId === c.id)!;
                  return (
                    <li key={a.id} className="list-row clickable" onClick={() => setOpenAppt(a.id)}>
                      <span className="grow">
                        {fmtDateTime(a.start)} · {a.title}
                      </span>
                      {a.status === 'cancelled' ? (
                        <Badge tone="bad">cancelled</Badge>
                      ) : (
                        <Badge tone={b.attendance === 'attended' ? 'good' : b.attendance === 'booked' ? 'neutral' : 'bad'}>{b.attendance}</Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'programs' && (
        <div className="grid-2">
          <section className="card">
            <div className="card-head">
              <h2>Workout programs</h2>
              <select
                value={assignPick}
                onChange={(e) => {
                  const pid = e.target.value;
                  setAssignPick('');
                  if (pid) update((d) => void d.assignments.push({ id: uid(), clientId: c.id, programId: pid, assignedAt: new Date().toISOString() }), `Assigned ${db.programs.find((p) => p.id === pid)?.name} to ${c.firstName} ${c.lastName}`);
                }}
              >
                <option value="">+ Assign program…</option>
                {db.programs
                  .filter((p) => !assignments.some((a) => a.programId === p.id))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </div>
            {assignments.length === 0 ? (
              <Empty>No programs assigned.</Empty>
            ) : (
              <ul className="list">
                {assignments.map((as) => {
                  const p = db.programs.find((x) => x.id === as.programId);
                  const logs = db.workoutLogs.filter((l) => l.clientId === c.id && l.programId === as.programId).length;
                  return (
                    <li key={as.id} className="list-row">
                      <Link to={`/workouts/${as.programId}`} className="grow">
                        {p?.name ?? 'Deleted program'}
                      </Link>
                      <span className="muted small">
                        assigned {fmtDate(as.assignedAt)} · {logs} workout{logs === 1 ? '' : 's'} logged
                      </span>
                      <button className="btn small ghost danger" onClick={() => update((d) => void (d.assignments = d.assignments.filter((x) => x.id !== as.id)), `Unassigned ${p?.name ?? 'program'} from ${c.firstName} ${c.lastName}`)}>
                        Unassign
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="card">
            <div className="card-head">
              <h2>Meal plans</h2>
              <Link to="/nutrition">Nutrition →</Link>
            </div>
            {plans.length === 0 ? (
              <Empty>No meal plans for this client.</Empty>
            ) : (
              <ul className="list">
                {plans.map((m) => {
                  const mac = mealPlanMacros(db, m);
                  return (
                    <li key={m.id} className="list-row">
                      <Link to={`/nutrition/${m.id}`} className="grow">
                        {m.name}
                      </Link>
                      <span className="muted small">
                        {Math.round(mac.calories)} kcal · P {Math.round(mac.protein)}g · C {Math.round(mac.carbs)}g · F {Math.round(mac.fat)}g
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === 'progress' && (
        <section className="card">
          <div className="card-head">
            <h2>Measurements</h2>
            <button className="btn small primary" onClick={() => setModal('measure')}>
              + Record
            </button>
          </div>
          <div className="seg">
            {METRICS.map(([k, label]) => (
              <button key={k} className={metric === k ? 'active' : ''} onClick={() => setMetric(k)}>
                {label}
              </button>
            ))}
          </div>
          <LineChart
            unit={METRICS.find((m) => m[0] === metric)![2]}
            points={assessments.filter((a) => typeof a[metric] === 'number').map((a) => ({ x: new Date(a.date), y: a[metric] as number }))}
          />
          {assessments.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    {METRICS.map(([k, l, u]) => (
                      <th key={k} className="num">
                        {l} ({u})
                      </th>
                    ))}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...assessments].reverse().map((a) => (
                    <tr key={a.id}>
                      <td>{fmtDate(a.date)}</td>
                      {METRICS.map(([k]) => (
                        <td key={k} className="num">
                          {(a[k] as number | undefined) ?? <span className="muted">—</span>}
                        </td>
                      ))}
                      <td>
                        <button className="icon-btn" aria-label="Delete measurement" onClick={() => confirm('Delete these measurements?') && update((d) => void (d.assessments = d.assessments.filter((x) => x.id !== a.id)))}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'billing' && (
        <section className="card">
          <div className="card-head">
            <h2>Invoices</h2>
            <span className="muted">Outstanding {fmtMoney(outstanding(db, c.id), cur)}</span>
          </div>
          {invoices.length === 0 ? (
            <Empty>No invoices.</Empty>
          ) : (
            <ul className="list">
              {invoices.map((i) => (
                <li key={i.id} className="list-row">
                  <span className="grow">
                    #{i.number} · {i.lines.map((l) => l.description).join(', ')} · <span className="muted small">{fmtDate(i.issuedAt)}</span>
                  </span>
                  <strong>{fmtMoney(invoiceTotals(i, db.settings.taxRatePct).total, cur)}</strong>
                  <Badge tone={i.status === 'paid' ? 'good' : isOverdue(i, now) ? 'bad' : i.status === 'void' ? 'neutral' : 'warn'}>{isOverdue(i, now) ? 'overdue' : i.status}</Badge>
                  {i.status === 'sent' && (
                    <button className="btn small ghost" onClick={() => update((d) => markInvoicePaid(d, i.id, 'Card', new Date()), `Recorded payment for invoice #${i.number} (${c.firstName} ${c.lastName})`)}>
                      Mark paid
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="danger-zone">
        <button
          className="btn ghost danger"
          onClick={() => {
            if (confirm(`Delete ${c.firstName} ${c.lastName} and all their bookings, packages, invoices and measurements?`)) {
              update((d) => deleteClient(d, c.id), `Deleted client ${c.firstName} ${c.lastName}`);
              nav('/clients');
            }
          }}
        >
          Delete client
        </button>
      </div>

      {modal === 'edit' && (
        <Modal title="Edit client" onClose={() => setModal(null)}>
          <ClientForm
            initial={c}
            onCancel={() => setModal(null)}
            onSave={(nc) => {
              update((d) => void (d.clients = d.clients.map((x) => (x.id === nc.id ? nc : x))), `Updated ${nc.firstName} ${nc.lastName}'s profile`);
              setModal(null);
            }}
          />
        </Modal>
      )}
      {modal === 'book' && (
        <NewAppointmentModal
          clientId={c.id}
          start={(() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setHours(9, 0, 0, 0);
            return d;
          })()}
          onClose={() => setModal(null)}
        />
      )}
      {portalUrl && (
        <Modal title={`${c.firstName}'s portal link`} onClose={() => setPortalUrl('')}>
          <p className="muted">
            {c.firstName} can use this link to see their bookings and credits, book classes, follow their programs and log workouts. No password is needed, so only send it to them.
          </p>
          <div className="link-box">
            <input readOnly value={portalUrl} onFocus={(e) => e.target.select()} aria-label="Portal link" />
          </div>
          <div className="actions wrap">
            <button className="btn ghost danger" onClick={() => void sendPortalLink(true)}>
              Replace link
            </button>
            {c.email && (
              <a
                className="btn ghost"
                href={`mailto:${c.email}?subject=${encodeURIComponent(`Your ${db.settings.businessName} client portal`)}&body=${encodeURIComponent(`Hi ${c.firstName},\n\nHere's your personal link to book sessions, see your program and track your progress:\n\n${portalUrl}\n\n${db.settings.trainerName}`)}`}
              >
                Email
              </a>
            )}
            <a className="btn ghost" href={`sms:${c.phone.replace(/\s/g, '')}?&body=${encodeURIComponent(`Hi ${c.firstName}, here's your ${db.settings.businessName} client portal: ${portalUrl}`)}`}>
              Text message
            </a>
            <button
              className="btn primary"
              onClick={async () => {
                const r = await shareLink(portalUrl, `${db.settings.businessName} client portal`, `Hi ${c.firstName}, here's your client portal:`);
                if (r === 'copied') toast('Link copied');
              }}
            >
              Copy / share
            </button>
          </div>
        </Modal>
      )}
      {modal === 'sell' && <SellPackageModal clientId={c.id} onClose={() => setModal(null)} />}
      {modal === 'measure' && <AssessmentModal clientId={c.id} onClose={() => setModal(null)} />}
      {openAppt && <AppointmentModal id={openAppt} onClose={() => setOpenAppt(null)} />}
    </div>
  );
}
