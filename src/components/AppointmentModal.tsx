import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store';
import type { AppointmentType, Attendance, ID } from '../types';
import {
  bookClient,
  cancelAppointment,
  clientConflicts,
  clientName,
  completeAppointment,
  createAppointments,
  creditsRemaining,
  deleteAppointment,
  reminderText,
  removeBooking,
  setAttendance,
  spacesLeft,
  TYPE_LABELS,
  updateAppointment,
  usesCredit,
} from '../logic';
import { fmtDateTime, fmtTime, toDateTimeInput } from '../utils';
import { Badge, Field, Modal } from './ui';

const ATTENDANCE: [Attendance, string][] = [
  ['booked', 'Booked'],
  ['attended', 'Attended'],
  ['no-show', 'No-show'],
  ['late-cancel', 'Late cancel'],
];

export function NewAppointmentModal({ start, clientId, onClose }: { start: Date; clientId?: ID; onClose: () => void }) {
  const { db, update } = useStore();
  const [type, setType] = useState<AppointmentType>('pt');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(toDateTimeInput(start));
  const [duration, setDuration] = useState(db.settings.defaultSessionMin);
  const [location, setLocation] = useState('Studio 1');
  const [capacity, setCapacity] = useState(1);
  const [repeat, setRepeat] = useState(1);
  const [notes, setNotes] = useState('');
  const [clientIds, setClientIds] = useState<ID[]>(clientId ? [clientId] : []);
  const [pick, setPick] = useState('');

  const clients = db.clients.filter((c) => c.status !== 'inactive');

  const changeType = (t: AppointmentType) => {
    setType(t);
    setCapacity(t === 'class' ? 10 : 1);
    if (t === 'consult') setDuration(30);
  };

  const add = (id: string) => {
    if (id && !clientIds.includes(id)) setClientIds([...clientIds, id]);
    setPick('');
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (clientIds.length > capacity) return;
    const clashes = clientIds.filter((id) => clientConflicts(db, id, new Date(when), duration).length > 0);
    if (clashes.length && !confirm(`${clashes.map((id) => clientName(db, id)).join(', ')} already ${clashes.length > 1 ? 'have' : 'has'} a session at this time. Book anyway?`)) return;
    const autoTitle = title.trim() || (type !== 'class' && clientIds.length === 1 ? `${clientName(db, clientIds[0]).split(' ')[0]} – ${TYPE_LABELS[type]}` : '');
    const ok = update(
      (d) => createAppointments(d, { title: autoTitle, type, start: new Date(when).toISOString(), durationMin: duration, location, capacity, notes, clientIds, repeatWeeks: repeat }),
      repeat > 1 ? `${repeat} weekly appointments created` : 'Appointment created',
    );
    if (ok) onClose();
  };

  return (
    <Modal title="New appointment" onClose={onClose}>
      <form onSubmit={save} className="form">
        <div className="seg">
          {(Object.keys(TYPE_LABELS) as AppointmentType[]).map((t) => (
            <button type="button" key={t} className={t === type ? 'active' : ''} onClick={() => changeType(t)}>
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <Field label="Title" hint="Leave blank to name it after the client">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'class' ? 'e.g. Bootcamp' : 'e.g. Sarah – PT'} />
        </Field>
        <div className="row">
          <Field label="Start">
            <input type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Field label="Duration (min)">
            <input type="number" min={5} step={5} value={duration} onChange={(e) => setDuration(+e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Location">
            <input value={location} onChange={(e) => setLocation(e.target.value)} />
          </Field>
          <Field label="Capacity">
            <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(+e.target.value)} />
          </Field>
          <Field label="Repeat weekly" hint="Number of weeks">
            <input type="number" min={1} max={52} value={repeat} onChange={(e) => setRepeat(+e.target.value)} />
          </Field>
        </div>
        <Field label="Clients">
          <div className="chips">
            {clientIds.map((id) => (
              <span key={id} className="chip">
                {clientName(db, id)}
                {usesCredit(type) && <small> · {creditsRemaining(db, id, new Date(when))} credits</small>}
                <button type="button" onClick={() => setClientIds(clientIds.filter((x) => x !== id))} aria-label="Remove">
                  ×
                </button>
              </span>
            ))}
            {clientIds.length < capacity && (
              <select value={pick} onChange={(e) => add(e.target.value)}>
                <option value="">+ Add client…</option>
                {clients
                  .filter((c) => !clientIds.includes(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </Field>
        {clientIds.length > capacity && <p className="error">More clients than capacity.</p>}
        <Field label="Notes">
          <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Create</button>
        </div>
      </form>
    </Modal>
  );
}

export function AppointmentModal({ id, onClose }: { id: ID; onClose: () => void }) {
  const { db, update, toast } = useStore();
  const a = db.appointments.find((x) => x.id === id);
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState('');
  const [form, setForm] = useState(() =>
    a ? { title: a.title, start: toDateTimeInput(new Date(a.start)), durationMin: a.durationMin, location: a.location, capacity: a.capacity, notes: a.notes } : null,
  );
  if (!a || !form) return null;

  const end = new Date(new Date(a.start).getTime() + a.durationMin * 60_000);
  const bookable = db.clients.filter((c) => c.status !== 'inactive' && !a.bookings.some((b) => b.clientId === c.id));

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.capacity < a.bookings.length) return toast('Capacity is below the number of bookings', 'error');
    if (update((d) => updateAppointment(d, a.id, { ...form, start: new Date(form.start).toISOString() }), 'Appointment updated')) setEditing(false);
  };

  const copyReminder = async (clientId: ID) => {
    const text = reminderText(db, a, clientId);
    try {
      await navigator.clipboard.writeText(text);
      toast('Reminder copied to clipboard');
    } catch {
      window.prompt('Copy this reminder:', text);
    }
  };

  return (
    <Modal title={a.title} onClose={onClose} wide>
      {editing ? (
        <form className="form" onSubmit={saveEdit}>
          <Field label="Title">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="row">
            <Field label="Start">
              <input type="datetime-local" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            </Field>
            <Field label="Duration (min)">
              <input type="number" min={5} step={5} value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: +e.target.value })} />
            </Field>
          </div>
          <div className="row">
            <Field label="Location">
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Capacity">
              <input type="number" min={1} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: +e.target.value })} />
            </Field>
          </div>
          <Field label="Notes">
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="actions">
            <button type="button" className="btn ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="btn primary">Save</button>
          </div>
        </form>
      ) : (
        <>
          <div className="appt-meta">
            <Badge tone={a.type === 'class' ? 'brand' : a.type === 'consult' ? 'warn' : 'neutral'}>{TYPE_LABELS[a.type]}</Badge>
            <Badge tone={a.status === 'completed' ? 'good' : a.status === 'cancelled' ? 'bad' : 'neutral'}>{a.status}</Badge>
            <span>
              {fmtDateTime(a.start)} – {fmtTime(end)}
            </span>
            {a.location && <span>· {a.location}</span>}
            <span>
              · {a.bookings.length}/{a.capacity} booked
            </span>
          </div>
          {a.notes && <p className="muted">{a.notes}</p>}

          <h3>Attendees</h3>
          {a.bookings.length === 0 && <p className="muted">Nobody booked yet.</p>}
          <ul className="list">
            {a.bookings.map((b) => {
              const c = db.clients.find((x) => x.id === b.clientId);
              return (
                <li key={b.clientId} className="list-row">
                  <Link to={`/clients/${b.clientId}`} onClick={onClose} className="grow">
                    {c ? `${c.firstName} ${c.lastName}` : 'Unknown'}
                  </Link>
                  {usesCredit(a.type) && (b.creditPackageId ? <Badge tone="good">credit used</Badge> : a.status !== 'cancelled' && <Badge tone="bad">no credit – unpaid</Badge>)}
                  {a.status !== 'cancelled' && (
                    <>
                      <select value={b.attendance} onChange={(e) => update((d) => setAttendance(d, a.id, b.clientId, e.target.value as Attendance))} aria-label="Attendance">
                        {ATTENDANCE.map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                      {a.status === 'scheduled' && (
                        <>
                          <button className="btn small ghost" onClick={() => copyReminder(b.clientId)} title="Copy a reminder message">
                            Reminder
                          </button>
                          <button className="btn small ghost danger" onClick={() => update((d) => removeBooking(d, a.id, b.clientId), 'Removed and credit refunded')}>
                            Remove
                          </button>
                        </>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
          {a.status === 'scheduled' && spacesLeft(a) > 0 && (
            <select
              value={pick}
              onChange={(e) => {
                const cid = e.target.value;
                setPick('');
                if (cid) update((d) => bookClient(d, a.id, cid), `${clientName(db, cid)} booked`);
              }}
            >
              <option value="">+ Book a client…</option>
              {bookable.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                  {usesCredit(a.type) ? ` (${creditsRemaining(db, c.id, new Date(a.start))} credits)` : ''}
                </option>
              ))}
            </select>
          )}

          <div className="actions spread">
            <button
              className="btn ghost danger"
              onClick={() => {
                if (confirm('Delete this appointment? Any credits used will be refunded.')) {
                  if (update((d) => deleteAppointment(d, a.id), 'Appointment deleted')) onClose();
                }
              }}
            >
              Delete
            </button>
            <div className="actions">
              {a.status === 'scheduled' && (
                <>
                  <button className="btn ghost" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  <button className="btn ghost" onClick={() => confirm('Cancel this appointment for everyone? Credits will be refunded.') && update((d) => cancelAppointment(d, a.id), 'Appointment cancelled')}>
                    Cancel appointment
                  </button>
                  <button className="btn primary" onClick={() => update((d) => completeAppointment(d, a.id), 'Marked complete')}>
                    Mark complete
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
