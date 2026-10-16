import { describe, expect, it } from 'vitest';
import {
  bookClient,
  cancelAppointment,
  clientConflicts,
  cancelBooking,
  completeAppointment,
  createAppointments,
  creditsRemaining,
  deleteClient,
  invoiceTotals,
  markInvoicePaid,
  mealPlanMacros,
  outstanding,
  sellPackage,
  voidInvoice,
} from './logic';
import { emptyDB, seedDB } from './seed';
import type { DB } from './types';
import { addDays } from './utils';

const NOW = new Date('2026-03-02T09:00:00');

function setup(): DB {
  const db = emptyDB();
  db.clients.push({ id: 'c1', firstName: 'Ann', lastName: 'Lee', email: '', phone: '', goals: '', notes: '', injuries: '', status: 'active', createdAt: NOW.toISOString() });
  db.clients.push({ id: 'c2', firstName: 'Bo', lastName: 'Kim', email: '', phone: '', goals: '', notes: '', injuries: '', status: 'active', createdAt: NOW.toISOString() });
  db.products.push({ id: 'p5', name: '5 sessions', sessions: 5, price: 200, validDays: 60, description: '' });
  return db;
}

const at = (days: number, hour = 10) => {
  const d = addDays(NOW, days);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};

const appt = (db: DB, start: string, opts: Partial<Parameters<typeof createAppointments>[1]> = {}) =>
  createAppointments(db, { title: '', type: 'pt', start, durationMin: 60, location: '', capacity: 1, notes: '', clientIds: [], repeatWeeks: 1, ...opts });

describe('packages & credits', () => {
  it('selling a package issues credits and an invoice', () => {
    const db = setup();
    sellPackage(db, 'c1', 'p5', NOW);
    expect(creditsRemaining(db, 'c1', NOW)).toBe(5);
    expect(db.invoices).toHaveLength(1);
    expect(outstanding(db, 'c1')).toBe(200);
  });

  it('paying the invoice clears the balance', () => {
    const db = setup();
    const pkg = sellPackage(db, 'c1', 'p5', NOW);
    markInvoicePaid(db, pkg.invoiceId!, 'Card', NOW);
    expect(outstanding(db, 'c1')).toBe(0);
  });

  it('expired packages do not count', () => {
    const db = setup();
    sellPackage(db, 'c1', 'p5', NOW);
    expect(creditsRemaining(db, 'c1', addDays(NOW, 61))).toBe(0);
  });

  it('uses the soonest-expiring package first', () => {
    const db = setup();
    db.products.push({ id: 'p1', name: 'Single', sessions: 1, price: 45, validDays: 10, description: '' });
    const big = sellPackage(db, 'c1', 'p5', NOW);
    const single = sellPackage(db, 'c1', 'p1', NOW);
    const [a] = appt(db, at(1));
    bookClient(db, a.id, 'c1');
    expect(db.clientPackages.find((p) => p.id === single.id)!.sessionsUsed).toBe(1);
    expect(db.clientPackages.find((p) => p.id === big.id)!.sessionsUsed).toBe(0);
  });

  it('voiding an unused package invoice withdraws the credits', () => {
    const db = setup();
    const pkg = sellPackage(db, 'c1', 'p5', NOW);
    voidInvoice(db, pkg.invoiceId!);
    expect(creditsRemaining(db, 'c1', NOW)).toBe(0);
    expect(outstanding(db)).toBe(0);
  });

  it('refuses to void when credits have been used', () => {
    const db = setup();
    const pkg = sellPackage(db, 'c1', 'p5', NOW);
    const [a] = appt(db, at(1));
    bookClient(db, a.id, 'c1');
    expect(() => voidInvoice(db, pkg.invoiceId!)).toThrow(/already been used/);
  });
});

describe('booking', () => {
  it('booking takes a credit; consultations are free', () => {
    const db = setup();
    sellPackage(db, 'c1', 'p5', NOW);
    const [pt] = appt(db, at(1));
    const [consult] = appt(db, at(2), { type: 'consult' });
    bookClient(db, pt.id, 'c1');
    bookClient(db, consult.id, 'c1');
    expect(creditsRemaining(db, 'c1', NOW)).toBe(4);
  });

  it('allows booking without credits but leaves it unpaid', () => {
    const db = setup();
    const [a] = appt(db, at(1));
    bookClient(db, a.id, 'c1');
    expect(db.appointments[0].bookings[0].creditPackageId).toBeUndefined();
  });

  it('enforces capacity and no double booking', () => {
    const db = setup();
    const [a] = appt(db, at(1));
    bookClient(db, a.id, 'c1');
    expect(() => bookClient(db, a.id, 'c1')).toThrow(/already booked/);
    expect(() => bookClient(db, a.id, 'c2')).toThrow(/full/);
  });

  it('detects overlapping bookings for a client', () => {
    const db = setup();
    appt(db, at(1, 10), { clientIds: ['c1'] });
    const half = new Date(at(1, 10));
    half.setMinutes(30);
    expect(clientConflicts(db, 'c1', half, 60)).toHaveLength(1);
    expect(clientConflicts(db, 'c1', new Date(at(1, 11)), 60)).toHaveLength(0);
    expect(clientConflicts(db, 'c2', half, 60)).toHaveLength(0);
  });

  it('creates a weekly series', () => {
    const db = setup();
    const made = appt(db, at(1), { repeatWeeks: 4 });
    expect(made).toHaveLength(4);
    expect(new Set(made.map((m) => m.seriesId)).size).toBe(1);
    expect(new Date(made[3].start).getTime() - new Date(made[0].start).getTime()).toBe(21 * 86_400_000);
  });
});

describe('cancellation policy', () => {
  it('early cancellation refunds the credit', () => {
    const db = setup();
    sellPackage(db, 'c1', 'p5', NOW);
    const [a] = appt(db, at(3));
    bookClient(db, a.id, 'c1');
    expect(cancelBooking(db, a.id, 'c1', NOW)).toBe('refunded');
    expect(creditsRemaining(db, 'c1', NOW)).toBe(5);
    expect(db.appointments[0].bookings).toHaveLength(0);
  });

  it('late cancellation keeps the credit and frees the space', () => {
    const db = setup();
    sellPackage(db, 'c1', 'p5', NOW);
    const [a] = appt(db, new Date(NOW.getTime() + 2 * 3_600_000).toISOString());
    bookClient(db, a.id, 'c1');
    expect(cancelBooking(db, a.id, 'c1', NOW)).toBe('late-cancel');
    expect(creditsRemaining(db, 'c1', NOW)).toBe(4);
    bookClient(db, a.id, 'c2');
    expect(db.appointments[0].bookings.map((b) => b.attendance)).toEqual(['late-cancel', 'booked']);
  });

  it('trainer cancelling an appointment refunds everyone', () => {
    const db = setup();
    sellPackage(db, 'c1', 'p5', NOW);
    sellPackage(db, 'c2', 'p5', NOW);
    const [a] = appt(db, at(1), { type: 'class', capacity: 5 });
    bookClient(db, a.id, 'c1');
    bookClient(db, a.id, 'c2');
    cancelAppointment(db, a.id);
    expect(creditsRemaining(db, 'c1', NOW)).toBe(5);
    expect(creditsRemaining(db, 'c2', NOW)).toBe(5);
    expect(() => bookClient(db, a.id, 'c1')).toThrow(/cancelled/);
  });

  it('completing marks booked clients as attended', () => {
    const db = setup();
    const [a] = appt(db, at(-1), { type: 'class', capacity: 5, clientIds: ['c1', 'c2'] });
    db.appointments[0].bookings[1].attendance = 'no-show';
    completeAppointment(db, a.id);
    expect(db.appointments[0].bookings.map((b) => b.attendance)).toEqual(['attended', 'no-show']);
    expect(db.appointments[0].status).toBe('completed');
  });
});

describe('misc', () => {
  it('applies tax to invoice totals', () => {
    const t = invoiceTotals({ id: 'i', number: 1, clientId: 'c1', issuedAt: '', dueAt: '', status: 'sent', lines: [{ description: 'x', qty: 2, unitPrice: 50 }] }, 20);
    expect(t).toEqual({ subtotal: 100, tax: 20, total: 120 });
  });

  it('sums meal plan macros', () => {
    const db = seedDB(NOW);
    const plan = db.mealPlans[0];
    const m = mealPlanMacros(db, plan);
    expect(m.perMeal).toHaveLength(plan.meals.length);
    expect(Math.round(m.calories)).toBe(Math.round(m.perMeal.reduce((s, x) => s + x.calories, 0)));
    expect(m.calories).toBeGreaterThan(1000);
  });

  it('deleting a client removes their bookings and records', () => {
    const db = seedDB(NOW);
    deleteClient(db, 'cl-sarah');
    expect(db.clients.some((c) => c.id === 'cl-sarah')).toBe(false);
    expect(db.appointments.some((a) => a.bookings.some((b) => b.clientId === 'cl-sarah'))).toBe(false);
    expect(db.invoices.some((i) => i.clientId === 'cl-sarah')).toBe(false);
    expect(db.mealPlans.find((m) => m.id === 'mp-sarah')?.clientId).toBeUndefined();
  });

  it('demo data is internally consistent', () => {
    const db = seedDB(NOW);
    for (const p of db.clientPackages) expect(p.sessionsUsed).toBeLessThanOrEqual(p.sessionsTotal);
    for (const a of db.appointments) expect(a.bookings.length).toBeLessThanOrEqual(a.capacity);
    expect(db.appointments.some((a) => a.status === 'scheduled')).toBe(true);
  });
});
