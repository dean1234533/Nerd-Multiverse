// Business rules. Every mutating function takes a DB draft (a clone the
// store hands it) and changes it in place; they throw Error with a
// user-facing message when an action isn't allowed.
import type {
  Appointment,
  AppointmentType,
  ClientPackage,
  DB,
  ID,
  Invoice,
  InvoiceLine,
  MealPlan,
} from './types';
import { addDays, uid } from './utils';

export const TYPE_LABELS: Record<AppointmentType, string> = {
  pt: 'PT session',
  class: 'Group class',
  consult: 'Consultation',
};

/** Consultations are free; everything else uses a session credit. */
export function usesCredit(type: AppointmentType): boolean {
  return type !== 'consult';
}

export function clientName(db: DB, id: ID): string {
  const c = db.clients.find((x) => x.id === id);
  return c ? `${c.firstName} ${c.lastName}` : 'Unknown client';
}

// ---------- Packages & credits ----------

export function packageRemaining(p: ClientPackage): number {
  return Math.max(0, p.sessionsTotal - p.sessionsUsed);
}

export function isPackageActive(p: ClientPackage, at: Date): boolean {
  return new Date(p.expiresAt) >= at && packageRemaining(p) > 0;
}

/** Usable packages for a client, soonest-expiring first. */
export function activePackages(db: DB, clientId: ID, at: Date): ClientPackage[] {
  return db.clientPackages
    .filter((p) => p.clientId === clientId && isPackageActive(p, at))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
}

export function creditsRemaining(db: DB, clientId: ID, at: Date): number {
  return activePackages(db, clientId, at).reduce((n, p) => n + packageRemaining(p), 0);
}

function takeCredit(db: DB, clientId: ID, at: Date): ID | undefined {
  const pkg = activePackages(db, clientId, at)[0];
  if (!pkg) return undefined;
  pkg.sessionsUsed += 1;
  return pkg.id;
}

function refundCredit(db: DB, packageId: ID | undefined) {
  if (!packageId) return;
  const pkg = db.clientPackages.find((p) => p.id === packageId);
  if (pkg && pkg.sessionsUsed > 0) pkg.sessionsUsed -= 1;
}

// ---------- Appointments ----------

export interface NewAppointment {
  title: string;
  type: AppointmentType;
  start: string;
  durationMin: number;
  location: string;
  capacity: number;
  notes: string;
  clientIds: ID[];
  repeatWeeks: number;
}

export function createAppointments(db: DB, input: NewAppointment): Appointment[] {
  const count = Math.max(1, Math.floor(input.repeatWeeks) || 1);
  const seriesId = count > 1 ? uid() : undefined;
  const created: Appointment[] = [];
  for (let i = 0; i < count; i++) {
    const appt: Appointment = {
      id: uid(),
      title: input.title.trim() || TYPE_LABELS[input.type],
      type: input.type,
      start: addDays(new Date(input.start), i * 7).toISOString(),
      durationMin: input.durationMin,
      location: input.location,
      capacity: Math.max(1, input.capacity),
      status: 'scheduled',
      bookings: [],
      notes: input.notes,
      seriesId,
    };
    db.appointments.push(appt);
    for (const cid of input.clientIds) bookClient(db, appt.id, cid);
    created.push(appt);
  }
  return created;
}

function getAppt(db: DB, id: ID): Appointment {
  const a = db.appointments.find((x) => x.id === id);
  if (!a) throw new Error('Appointment not found');
  return a;
}

/** Scheduled appointments the client is already booked into that overlap the given slot. */
export function clientConflicts(db: DB, clientId: ID, start: Date, durationMin: number, ignoreId?: ID): Appointment[] {
  const s = start.getTime();
  const e = s + durationMin * 60_000;
  return db.appointments.filter((a) => {
    if (a.id === ignoreId || a.status !== 'scheduled') return false;
    if (!a.bookings.some((b) => b.clientId === clientId && b.attendance === 'booked')) return false;
    const as = new Date(a.start).getTime();
    return as < e && as + a.durationMin * 60_000 > s;
  });
}

export function spacesLeft(a: Appointment): number {
  const taken = a.bookings.filter((b) => b.attendance !== 'late-cancel').length;
  return Math.max(0, a.capacity - taken);
}

/**
 * Book a client in, taking a session credit when the appointment type uses
 * one. Clients without credits can still be booked; the booking is simply
 * left unpaid so the trainer can chase it.
 */
export function bookClient(db: DB, apptId: ID, clientId: ID) {
  const a = getAppt(db, apptId);
  if (a.status === 'cancelled') throw new Error('This appointment is cancelled');
  if (a.bookings.some((b) => b.clientId === clientId)) throw new Error('Client is already booked in');
  if (spacesLeft(a) <= 0) throw new Error('This appointment is full');
  const creditPackageId = usesCredit(a.type) ? takeCredit(db, clientId, new Date(a.start)) : undefined;
  a.bookings.push({ clientId, attendance: 'booked', creditPackageId });
}

/**
 * Cancel a client's booking. Inside the late-cancellation window the booking
 * stays as a charged "late-cancel"; otherwise it's removed and the credit
 * goes back to the client.
 */
export function cancelBooking(db: DB, apptId: ID, clientId: ID, now: Date): 'refunded' | 'late-cancel' {
  const a = getAppt(db, apptId);
  const b = a.bookings.find((x) => x.clientId === clientId);
  if (!b) throw new Error('Client is not booked in');
  const hoursBefore = (new Date(a.start).getTime() - now.getTime()) / 3_600_000;
  if (hoursBefore < db.settings.lateCancelHours) {
    b.attendance = 'late-cancel';
    return 'late-cancel';
  }
  refundCredit(db, b.creditPackageId);
  a.bookings = a.bookings.filter((x) => x !== b);
  return 'refunded';
}

/** Trainer-side removal: always refunds, regardless of the window. */
export function removeBooking(db: DB, apptId: ID, clientId: ID) {
  const a = getAppt(db, apptId);
  const b = a.bookings.find((x) => x.clientId === clientId);
  if (!b) return;
  refundCredit(db, b.creditPackageId);
  a.bookings = a.bookings.filter((x) => x !== b);
}

export function setAttendance(db: DB, apptId: ID, clientId: ID, attendance: Appointment['bookings'][number]['attendance']) {
  const a = getAppt(db, apptId);
  const b = a.bookings.find((x) => x.clientId === clientId);
  if (!b) throw new Error('Client is not booked in');
  b.attendance = attendance;
}

/** Mark everyone still "booked" as attended and close the appointment. */
export function completeAppointment(db: DB, apptId: ID) {
  const a = getAppt(db, apptId);
  if (a.status === 'cancelled') throw new Error('This appointment is cancelled');
  for (const b of a.bookings) if (b.attendance === 'booked') b.attendance = 'attended';
  a.status = 'completed';
}

/** Trainer cancels the whole appointment: every credit is refunded. */
export function cancelAppointment(db: DB, apptId: ID) {
  const a = getAppt(db, apptId);
  for (const b of a.bookings) {
    refundCredit(db, b.creditPackageId);
    b.creditPackageId = undefined;
  }
  a.status = 'cancelled';
}

export function deleteAppointment(db: DB, apptId: ID) {
  const a = getAppt(db, apptId);
  if (a.status !== 'cancelled') cancelAppointment(db, apptId);
  db.appointments = db.appointments.filter((x) => x.id !== apptId);
}

export function updateAppointment(db: DB, apptId: ID, patch: Partial<Pick<Appointment, 'title' | 'start' | 'durationMin' | 'location' | 'capacity' | 'notes'>>) {
  const a = getAppt(db, apptId);
  Object.assign(a, patch);
}

// ---------- Invoices ----------

export function invoiceTotals(inv: Invoice, taxRatePct: number) {
  const subtotal = inv.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
  const tax = Math.round(subtotal * taxRatePct) / 100;
  return { subtotal, tax, total: subtotal + tax };
}

export function isOverdue(inv: Invoice, now: Date): boolean {
  return inv.status === 'sent' && new Date(inv.dueAt) < now;
}

export function createInvoice(db: DB, clientId: ID, lines: InvoiceLine[], now: Date, dueDays = 7): Invoice {
  if (!lines.length) throw new Error('Add at least one line item');
  const inv: Invoice = {
    id: uid(),
    number: db.nextInvoiceNumber++,
    clientId,
    issuedAt: now.toISOString(),
    dueAt: addDays(now, dueDays).toISOString(),
    lines,
    status: 'sent',
  };
  db.invoices.push(inv);
  return inv;
}

/**
 * Sell a session package: issues the credits straight away and raises an
 * invoice for it (optionally already paid, e.g. card on the spot).
 */
export function sellPackage(db: DB, clientId: ID, productId: ID, now: Date, paidMethod?: string): ClientPackage {
  const product = db.products.find((p) => p.id === productId);
  if (!product) throw new Error('Package not found');
  const inv = createInvoice(db, clientId, [{ description: product.name, qty: 1, unitPrice: product.price, productId }], now);
  if (paidMethod) markInvoicePaid(db, inv.id, paidMethod, now);
  const pkg: ClientPackage = {
    id: uid(),
    clientId,
    productId,
    name: product.name,
    sessionsTotal: product.sessions,
    sessionsUsed: 0,
    purchasedAt: now.toISOString(),
    expiresAt: addDays(now, product.validDays).toISOString(),
    invoiceId: inv.id,
  };
  db.clientPackages.push(pkg);
  return pkg;
}

export function markInvoicePaid(db: DB, invoiceId: ID, method: string, now: Date) {
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === 'void') throw new Error('Cannot pay a void invoice');
  inv.status = 'paid';
  inv.paidAt = now.toISOString();
  inv.method = method;
}

/** Void an unpaid invoice, withdrawing any package it issued that hasn't been used. */
export function voidInvoice(db: DB, invoiceId: ID) {
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new Error('Invoice not found');
  if (inv.status === 'paid') throw new Error('Paid invoices cannot be voided');
  const pkgs = db.clientPackages.filter((p) => p.invoiceId === invoiceId);
  if (pkgs.some((p) => p.sessionsUsed > 0)) throw new Error('Sessions from this package have already been used');
  db.clientPackages = db.clientPackages.filter((p) => p.invoiceId !== invoiceId);
  inv.status = 'void';
}

export function outstanding(db: DB, clientId?: ID): number {
  return db.invoices
    .filter((i) => i.status === 'sent' && (!clientId || i.clientId === clientId))
    .reduce((s, i) => s + invoiceTotals(i, db.settings.taxRatePct).total, 0);
}

// ---------- Clients ----------

/** Delete a client and everything that belongs only to them. */
export function deleteClient(db: DB, clientId: ID) {
  for (const a of db.appointments) a.bookings = a.bookings.filter((b) => b.clientId !== clientId);
  db.clients = db.clients.filter((c) => c.id !== clientId);
  db.clientPackages = db.clientPackages.filter((p) => p.clientId !== clientId);
  db.assignments = db.assignments.filter((p) => p.clientId !== clientId);
  db.workoutLogs = db.workoutLogs.filter((p) => p.clientId !== clientId);
  db.assessments = db.assessments.filter((p) => p.clientId !== clientId);
  db.invoices = db.invoices.filter((p) => p.clientId !== clientId);
  for (const m of db.mealPlans) if (m.clientId === clientId) m.clientId = undefined;
}

// ---------- Nutrition ----------

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export function mealPlanMacros(db: DB, plan: MealPlan): Macros & { perMeal: Macros[] } {
  const perMeal = plan.meals.map((m) =>
    m.items.reduce<Macros>(
      (acc, it) => {
        const f = db.foods.find((x) => x.id === it.foodId);
        if (!f) return acc;
        return {
          calories: acc.calories + f.calories * it.qty,
          protein: acc.protein + f.protein * it.qty,
          carbs: acc.carbs + f.carbs * it.qty,
          fat: acc.fat + f.fat * it.qty,
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    ),
  );
  const total = perMeal.reduce(
    (a, m) => ({ calories: a.calories + m.calories, protein: a.protein + m.protein, carbs: a.carbs + m.carbs, fat: a.fat + m.fat }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  return { ...total, perMeal };
}

// ---------- Reporting ----------

export function upcomingFor(db: DB, clientId: ID, now: Date): Appointment[] {
  return db.appointments
    .filter((a) => a.status === 'scheduled' && new Date(a.start) >= now && a.bookings.some((b) => b.clientId === clientId && b.attendance === 'booked'))
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function revenueBetween(db: DB, from: Date, to: Date): number {
  return db.invoices
    .filter((i) => i.status === 'paid' && i.paidAt && new Date(i.paidAt) >= from && new Date(i.paidAt) < to)
    .reduce((s, i) => s + invoiceTotals(i, db.settings.taxRatePct).total, 0);
}

/** Text for a session reminder the trainer can paste into SMS / email. */
export function reminderText(db: DB, a: Appointment, clientId: ID): string {
  const c = db.clients.find((x) => x.id === clientId);
  const when = new Date(a.start).toLocaleString(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
  return `Hi ${c?.firstName ?? 'there'}, a reminder of your ${a.title} on ${when}${a.location ? ` at ${a.location}` : ''}. ` +
    `Please let us know at least ${db.settings.lateCancelHours} hours in advance if you can't make it. – ${db.settings.trainerName}, ${db.settings.businessName}`;
}
