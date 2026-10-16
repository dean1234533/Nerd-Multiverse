// Builds the slice of a trainer's workspace one client may see through
// their portal link, and applies the few actions a client may take.
// Runs on the server; the result is a valid DB so the portal UI can reuse
// the normal business-logic helpers.
import type { DB, ID, WorkoutLog } from './types.js';
import { bookClient, cancelBooking } from './logic.js';
import { addDays, uid } from './utils.js';

/** Placeholder id for other clients' bookings, so capacity still adds up. */
export const OTHER_CLIENT = '__other__';

export function scopeForClient(db: DB, clientId: ID, now: Date): DB {
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) throw new Error('Client not found');
  const horizon = addDays(now, 14);
  const assignments = db.assignments.filter((a) => a.clientId === clientId);
  const programs = db.programs.filter((p) => assignments.some((a) => a.programId === p.id));
  const exerciseIds = new Set(programs.flatMap((p) => p.days.flatMap((d) => d.items.map((i) => i.exerciseId))));
  const mealPlans = db.mealPlans.filter((m) => m.clientId === clientId);
  const foodIds = new Set(mealPlans.flatMap((m) => m.meals.flatMap((ml) => ml.items.map((i) => i.foodId))));
  const appointments = db.appointments
    .filter((a) => {
      if (a.bookings.some((b) => b.clientId === clientId)) return true;
      const start = new Date(a.start);
      return a.type === 'class' && a.status === 'scheduled' && start > now && start < horizon;
    })
    .map((a) => ({
      ...a,
      notes: '',
      bookings: a.bookings.map((b) => (b.clientId === clientId ? b : { clientId: OTHER_CLIENT, attendance: b.attendance })),
    }));
  return {
    version: 1,
    settings: db.settings,
    clients: [{ ...client, notes: '' }],
    products: [],
    clientPackages: db.clientPackages.filter((p) => p.clientId === clientId),
    appointments,
    exercises: db.exercises.filter((e) => exerciseIds.has(e.id)),
    programs,
    assignments,
    workoutLogs: db.workoutLogs.filter((l) => l.clientId === clientId),
    foods: db.foods.filter((f) => foodIds.has(f.id)),
    mealPlans,
    assessments: db.assessments.filter((a) => a.clientId === clientId),
    invoices: db.invoices.filter((i) => i.clientId === clientId && i.status !== 'void'),
    nextInvoiceNumber: 0,
  };
}

export type PortalAction =
  | { type: 'book'; appointmentId: ID }
  | { type: 'cancel'; appointmentId: ID }
  | { type: 'log'; programId: ID; dayId: ID; notes: string; entries: WorkoutLog['entries'] };

/** Apply a client's action to the full workspace. Returns an activity message. */
export function applyPortalAction(db: DB, clientId: ID, action: PortalAction, now: Date): string {
  const client = db.clients.find((c) => c.id === clientId);
  if (!client) throw new Error('Client not found');
  const who = `${client.firstName} ${client.lastName}`;
  switch (action.type) {
    case 'book': {
      const a = db.appointments.find((x) => x.id === action.appointmentId);
      if (!a || a.type !== 'class' || a.status !== 'scheduled' || new Date(a.start) <= now) throw new Error('This class can no longer be booked');
      bookClient(db, a.id, clientId);
      return `${who} booked into ${a.title} (${new Date(a.start).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}) via the client portal`;
    }
    case 'cancel': {
      const a = db.appointments.find((x) => x.id === action.appointmentId);
      if (!a || a.status !== 'scheduled' || new Date(a.start) <= now) throw new Error('This session can no longer be cancelled');
      const result = cancelBooking(db, a.id, clientId, now);
      return `${who} cancelled ${a.title}${result === 'late-cancel' ? ' (late – credit kept)' : ''} via the client portal`;
    }
    case 'log': {
      if (!db.assignments.some((x) => x.clientId === clientId && x.programId === action.programId)) throw new Error('Program not assigned');
      const prog = db.programs.find((p) => p.id === action.programId);
      const day = prog?.days.find((d) => d.id === action.dayId);
      if (!prog || !day) throw new Error('Workout not found');
      const itemIds = new Set(day.items.map((i) => i.id));
      const entries = (Array.isArray(action.entries) ? action.entries : [])
        .filter((e) => itemIds.has(e.itemId))
        .map((e) => ({ itemId: e.itemId, weight: String(e.weight ?? '').slice(0, 20), reps: String(e.reps ?? '').slice(0, 20), done: !!e.done }));
      db.workoutLogs.push({ id: uid(), clientId, programId: prog.id, dayId: day.id, date: now.toISOString(), notes: String(action.notes ?? '').slice(0, 2000), entries });
      return `${who} logged ${prog.name} – ${day.name} (${entries.filter((e) => e.done).length}/${entries.length} exercises done)`;
    }
    default:
      throw new Error('Unknown action');
  }
}
