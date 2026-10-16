import type { Client, DB, Exercise, Food, Product, Program, Settings } from './types';
import { addDays, startOfWeek } from './utils';
import { bookClient, completeAppointment, createAppointments, markInvoicePaid, sellPackage } from './logic';

export const DEFAULT_SETTINGS: Settings = {
  businessName: 'Peak Performance PT',
  trainerName: 'Alex Morgan',
  brandColor: '#0f8b8d',
  currency: 'GBP',
  taxRatePct: 0,
  lateCancelHours: 24,
  defaultSessionMin: 60,
  dayStartHour: 6,
  dayEndHour: 21,
};

export function emptyDB(): DB {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    clients: [],
    products: [],
    clientPackages: [],
    appointments: [],
    exercises: [],
    programs: [],
    assignments: [],
    workoutLogs: [],
    foods: [],
    mealPlans: [],
    assessments: [],
    invoices: [],
    nextInvoiceNumber: 1001,
  };
}

const ex = (id: string, name: string, category: string, equipment: string, instructions: string): Exercise => ({ id, name, category, equipment, instructions });

const EXERCISES: Exercise[] = [
  ex('ex-squat', 'Back Squat', 'Legs', 'Barbell', 'Bar on upper back, brace, sit hips back and down until thighs are parallel, drive up through mid-foot.'),
  ex('ex-gsquat', 'Goblet Squat', 'Legs', 'Kettlebell', 'Hold bell at chest, elbows inside knees at the bottom, keep chest tall.'),
  ex('ex-rdl', 'Romanian Deadlift', 'Legs', 'Barbell', 'Soft knees, hinge at the hips keeping the bar close until a hamstring stretch, squeeze glutes to stand.'),
  ex('ex-deadlift', 'Deadlift', 'Back', 'Barbell', 'Bar over mid-foot, flat back, push the floor away and lock out hips and knees together.'),
  ex('ex-lunge', 'Walking Lunge', 'Legs', 'Dumbbells', 'Long stride, back knee kisses the floor, front shin vertical.'),
  ex('ex-hipthrust', 'Hip Thrust', 'Glutes', 'Barbell', 'Upper back on bench, bar over hips, drive up to full hip extension with chin tucked.'),
  ex('ex-bench', 'Bench Press', 'Chest', 'Barbell', 'Shoulder blades pinned, lower to lower chest, press up and slightly back.'),
  ex('ex-pushup', 'Push-up', 'Chest', 'Bodyweight', 'Rigid plank, elbows ~45°, chest to floor.'),
  ex('ex-dbpress', 'Dumbbell Shoulder Press', 'Shoulders', 'Dumbbells', 'Seated or standing, press overhead without arching the lower back.'),
  ex('ex-row', 'Bent-over Row', 'Back', 'Barbell', 'Hinge to ~45°, pull bar to lower ribs, control down.'),
  ex('ex-pullup', 'Pull-up', 'Back', 'Bodyweight', 'Dead hang, pull chest to bar, full range each rep.'),
  ex('ex-latpd', 'Lat Pulldown', 'Back', 'Cable', 'Pull the bar to upper chest leading with elbows, avoid leaning back excessively.'),
  ex('ex-plank', 'Plank', 'Core', 'Bodyweight', 'Forearms under shoulders, squeeze glutes, ribs down, breathe.'),
  ex('ex-deadbug', 'Dead Bug', 'Core', 'Bodyweight', 'Lower back pressed down, extend opposite arm and leg slowly.'),
  ex('ex-swing', 'Kettlebell Swing', 'Conditioning', 'Kettlebell', 'Explosive hip hinge, bell floats to chest height, arms are ropes.'),
  ex('ex-row-erg', 'Rowing Machine', 'Conditioning', 'Rower', 'Legs, body, arms on the drive; arms, body, legs on the recovery.'),
  ex('ex-bike', 'Assault Bike Sprint', 'Conditioning', 'Air bike', 'All-out effort for the work interval, easy spin during rest.'),
  ex('ex-curl', 'Biceps Curl', 'Arms', 'Dumbbells', 'Elbows fixed at sides, full range, no swinging.'),
  ex('ex-tripush', 'Triceps Pushdown', 'Arms', 'Cable', 'Elbows tucked, extend fully, slow return.'),
  ex('ex-facepull', 'Face Pull', 'Shoulders', 'Cable', 'Rope to forehead, elbows high, squeeze rear delts.'),
];

const f = (id: string, name: string, serving: string, calories: number, protein: number, carbs: number, fat: number): Food => ({ id, name, serving, calories, protein, carbs, fat });

const FOODS: Food[] = [
  f('fd-oats', 'Rolled oats', '50 g', 190, 6.5, 32, 3.5),
  f('fd-milk', 'Semi-skimmed milk', '200 ml', 98, 7, 9.6, 3.6),
  f('fd-banana', 'Banana', '1 medium', 105, 1.3, 27, 0.4),
  f('fd-egg', 'Egg', '1 large', 72, 6.3, 0.4, 4.8),
  f('fd-toast', 'Wholemeal toast', '1 slice', 95, 4, 16, 1.2),
  f('fd-chicken', 'Chicken breast', '150 g', 248, 46, 0, 5.4),
  f('fd-rice', 'Basmati rice (cooked)', '150 g', 195, 4, 42, 0.5),
  f('fd-broccoli', 'Broccoli', '80 g', 27, 2.3, 2.2, 0.5),
  f('fd-salmon', 'Salmon fillet', '120 g', 250, 25, 0, 16),
  f('fd-sweetpot', 'Sweet potato', '150 g', 129, 2.4, 30, 0.1),
  f('fd-yog', 'Greek yoghurt (0%)', '170 g', 100, 17, 6, 0.7),
  f('fd-berries', 'Mixed berries', '80 g', 40, 0.8, 9, 0.2),
  f('fd-whey', 'Whey protein', '30 g scoop', 120, 24, 3, 1.5),
  f('fd-almonds', 'Almonds', '25 g', 145, 5.3, 2.2, 12.5),
  f('fd-avocado', 'Avocado', '½ fruit', 120, 1.5, 6, 11),
  f('fd-wrap', 'Wholemeal wrap', '1 wrap', 170, 5, 28, 4),
  f('fd-tuna', 'Tuna (canned, drained)', '100 g', 110, 25, 0, 1),
  f('fd-pasta', 'Pasta (cooked)', '180 g', 284, 10, 56, 1.6),
];

const PRODUCTS: Product[] = [
  { id: 'pr-single', name: 'Single PT session', sessions: 1, price: 45, validDays: 30, description: 'Pay-as-you-go one-to-one session.' },
  { id: 'pr-10', name: '10 PT sessions', sessions: 10, price: 400, validDays: 120, description: 'Save £50 with a 10-pack.' },
  { id: 'pr-20', name: '20 PT sessions', sessions: 20, price: 760, validDays: 210, description: 'Best value for committed clients.' },
  { id: 'pr-class8', name: 'Group class 8-pass', sessions: 8, price: 80, validDays: 60, description: 'Eight small-group classes.' },
];

const item = (id: string, exerciseId: string, sets: number, reps: string, rest = '90s', notes = '') => ({ id, exerciseId, sets, reps, rest, notes });

const PROGRAMS: Program[] = [
  {
    id: 'pg-fb',
    name: 'Beginner Full Body (3×/week)',
    description: 'Foundational strength across all major movement patterns. Add weight when all sets hit the top of the rep range.',
    days: [
      { id: 'pd-a', name: 'Day A', items: [item('pi-1', 'ex-gsquat', 3, '10-12'), item('pi-2', 'ex-pushup', 3, '8-12'), item('pi-3', 'ex-latpd', 3, '10-12'), item('pi-4', 'ex-plank', 3, '30s', '60s')] },
      { id: 'pd-b', name: 'Day B', items: [item('pi-5', 'ex-rdl', 3, '8-10'), item('pi-6', 'ex-dbpress', 3, '10-12'), item('pi-7', 'ex-row', 3, '10-12'), item('pi-8', 'ex-deadbug', 3, '10/side', '60s')] },
    ],
  },
  {
    id: 'pg-ul',
    name: 'Upper / Lower Strength',
    description: '4-day split for intermediate lifters chasing strength on the big lifts.',
    days: [
      { id: 'pd-u', name: 'Upper', items: [item('pi-9', 'ex-bench', 4, '5', '3 min'), item('pi-10', 'ex-pullup', 4, '6-8', '2 min'), item('pi-11', 'ex-dbpress', 3, '8-10'), item('pi-12', 'ex-facepull', 3, '15', '60s'), item('pi-13', 'ex-curl', 2, '12', '60s')] },
      { id: 'pd-l', name: 'Lower', items: [item('pi-14', 'ex-squat', 4, '5', '3 min'), item('pi-15', 'ex-rdl', 3, '8', '2 min'), item('pi-16', 'ex-lunge', 3, '10/leg'), item('pi-17', 'ex-hipthrust', 3, '10')] },
    ],
  },
  {
    id: 'pg-hiit',
    name: 'Fat-loss Conditioning Circuit',
    description: 'Run as a circuit, 40s work / 20s rest, 4 rounds.',
    days: [
      { id: 'pd-c', name: 'Circuit', items: [item('pi-18', 'ex-swing', 4, '40s', '20s'), item('pi-19', 'ex-bike', 4, '40s', '20s'), item('pi-20', 'ex-gsquat', 4, '40s', '20s'), item('pi-21', 'ex-row-erg', 4, '40s', '20s'), item('pi-22', 'ex-plank', 4, '40s', '20s')] },
    ],
  },
];

const c = (id: string, firstName: string, lastName: string, extra: Partial<Client>): Client => ({
  id,
  firstName,
  lastName,
  email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
  phone: '07700 900' + String(100 + id.length * 37).slice(0, 3),
  goals: '',
  notes: '',
  injuries: '',
  status: 'active',
  createdAt: new Date().toISOString(),
  ...extra,
});

/**
 * A brand-new trainer's workspace: no clients yet, but with the exercise
 * and food libraries and some starter packages so they can get going.
 */
export function starterDB(trainerName: string): DB {
  const db = emptyDB();
  db.settings = { ...db.settings, trainerName, businessName: `${trainerName.split(' ')[0]}'s Training` };
  db.exercises = EXERCISES.map((e) => ({ ...e }));
  db.foods = FOODS.map((x) => ({ ...x }));
  db.products = PRODUCTS.map((p) => ({ ...p }));
  return db;
}

/** A realistic demo business, anchored to `now` so the calendar is populated. */
export function seedDB(now = new Date()): DB {
  const db = emptyDB();
  db.exercises = EXERCISES.map((e) => ({ ...e }));
  db.foods = FOODS.map((x) => ({ ...x }));
  db.programs = structuredClone(PROGRAMS);
  db.products = PRODUCTS.map((p) => ({ ...p }));

  const ago = (d: number) => addDays(now, -d).toISOString();
  db.clients = [
    c('cl-sarah', 'Sarah', 'Jenkins', { goals: 'Lose 6 kg before her wedding in spring; tone arms and core.', dob: '1992-04-11', createdAt: ago(80), injuries: 'None' }),
    c('cl-tom', 'Tom', 'Okafor', { goals: 'Hit a 140 kg squat and 100 kg bench.', dob: '1988-09-02', createdAt: ago(150), notes: 'Prefers early mornings.' }),
    c('cl-priya', 'Priya', 'Shah', { goals: 'Rebuild strength after a knee operation; run a 10k.', dob: '1979-12-20', createdAt: ago(45), injuries: 'Left ACL reconstruction (2024) — avoid deep loaded knee flexion for now.' }),
    c('cl-mike', 'Mike', 'Davies', { goals: 'General fitness, lower blood pressure.', dob: '1965-06-30', createdAt: ago(20) }),
    c('cl-emma', 'Emma', 'Clarke', { goals: 'Get into a regular routine.', createdAt: ago(3), status: 'lead', notes: 'Enquired via Instagram. Free consult booked.' }),
    c('cl-jay', 'Jay', 'Patel', { goals: 'Maintain fitness.', createdAt: ago(300), status: 'inactive', notes: 'Moved away in the summer.' }),
  ];

  // Packages: sold in the past so credits & revenue have history.
  const sellAt = (clientId: string, productId: string, daysAgo: number, paid: boolean) => {
    const at = addDays(now, -daysAgo);
    const pkg = sellPackage(db, clientId, productId, at);
    if (paid) markInvoicePaid(db, pkg.invoiceId!, 'Card', addDays(at, 1));
  };
  sellAt('cl-sarah', 'pr-20', 60, true);
  sellAt('cl-tom', 'pr-10', 30, true);
  sellAt('cl-priya', 'pr-10', 40, true);
  sellAt('cl-priya', 'pr-class8', 10, false);
  sellAt('cl-mike', 'pr-class8', 18, true);
  sellAt('cl-mike', 'pr-single', 2, false);
  sellAt('cl-tom', 'pr-single', 1, true);

  // Recurring weekly schedule across last week, this week and next.
  const monday = startOfWeek(now);
  const at = (weekOffset: number, dow: number, h: number, m = 0) => {
    const d = addDays(monday, weekOffset * 7 + dow);
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  };
  const base = { location: 'Studio 1', notes: '', repeatWeeks: 3 };
  createAppointments(db, { ...base, title: 'Sarah – PT', type: 'pt', start: at(-1, 0, 7), durationMin: 60, capacity: 1, clientIds: ['cl-sarah'] });
  createAppointments(db, { ...base, title: 'Sarah – PT', type: 'pt', start: at(-1, 3, 7), durationMin: 60, capacity: 1, clientIds: ['cl-sarah'] });
  createAppointments(db, { ...base, title: 'Tom – Strength', type: 'pt', start: at(-1, 1, 6), durationMin: 60, capacity: 1, clientIds: ['cl-tom'] });
  createAppointments(db, { ...base, title: 'Tom – Strength', type: 'pt', start: at(-1, 4, 6), durationMin: 60, capacity: 1, clientIds: ['cl-tom'] });
  createAppointments(db, { ...base, title: 'Priya – Rehab', type: 'pt', start: at(-1, 2, 10), durationMin: 45, capacity: 1, clientIds: ['cl-priya'] });
  createAppointments(db, { ...base, title: 'Bootcamp', type: 'class', start: at(-1, 5, 9), durationMin: 45, capacity: 10, location: 'The Park', clientIds: ['cl-mike', 'cl-priya'] });
  createAppointments(db, { ...base, title: 'Lunchtime HIIT', type: 'class', start: at(-1, 2, 12, 30), durationMin: 30, capacity: 8, clientIds: ['cl-mike'] });
  const [consult] = createAppointments(db, { ...base, repeatWeeks: 1, title: 'Emma – Free consult', type: 'consult', start: at(0, 4, 17), durationMin: 30, capacity: 1, location: 'Studio 1', clientIds: [] });
  bookClient(db, consult.id, 'cl-emma');

  // Close out everything in the past, with a realistic no-show.
  for (const a of db.appointments) {
    if (new Date(a.start) < now) completeAppointment(db, a.id);
  }
  const pastTom = db.appointments.filter((a) => a.title === 'Tom – Strength' && a.status === 'completed')[0];
  if (pastTom) pastTom.bookings[0].attendance = 'no-show';

  db.assignments = [
    { id: 'as-1', clientId: 'cl-sarah', programId: 'pg-hiit', assignedAt: ago(55) },
    { id: 'as-2', clientId: 'cl-sarah', programId: 'pg-fb', assignedAt: ago(55) },
    { id: 'as-3', clientId: 'cl-tom', programId: 'pg-ul', assignedAt: ago(28) },
    { id: 'as-4', clientId: 'cl-priya', programId: 'pg-fb', assignedAt: ago(38) },
  ];

  // Monthly-ish body measurements showing progress.
  const meas = (clientId: string, points: [number, number, number, number][]) =>
    points.forEach(([daysAgo, weightKg, bodyFatPct, waistCm], i) =>
      db.assessments.push({ id: `${clientId}-m${i}`, clientId, date: ago(daysAgo), weightKg, bodyFatPct, waistCm, notes: '' }),
    );
  meas('cl-sarah', [[60, 72.4, 31, 84], [45, 71.2, 30.2, 82.5], [30, 70.1, 29.1, 81], [15, 69.5, 28.4, 79.5], [1, 68.6, 27.8, 78]]);
  meas('cl-tom', [[28, 88.0, 18.5, 90], [14, 88.6, 18.2, 89.5], [0, 89.1, 17.9, 89]]);
  meas('cl-mike', [[19, 96.2, 29, 104], [5, 95.0, 28.4, 102.5]]);

  db.mealPlans = [
    {
      id: 'mp-sarah',
      name: 'Sarah – 1,600 kcal fat loss',
      clientId: 'cl-sarah',
      targetCalories: 1600,
      meals: [
        { id: 'ml-1', name: 'Breakfast', items: [{ id: 'mi-1', foodId: 'fd-oats', qty: 1 }, { id: 'mi-2', foodId: 'fd-milk', qty: 1 }, { id: 'mi-3', foodId: 'fd-berries', qty: 1 }] },
        { id: 'ml-2', name: 'Lunch', items: [{ id: 'mi-4', foodId: 'fd-wrap', qty: 1 }, { id: 'mi-5', foodId: 'fd-tuna', qty: 1 }, { id: 'mi-6', foodId: 'fd-avocado', qty: 0.5 }] },
        { id: 'ml-3', name: 'Snack', items: [{ id: 'mi-7', foodId: 'fd-yog', qty: 1 }, { id: 'mi-8', foodId: 'fd-almonds', qty: 0.5 }] },
        { id: 'ml-4', name: 'Dinner', items: [{ id: 'mi-9', foodId: 'fd-salmon', qty: 1 }, { id: 'mi-10', foodId: 'fd-sweetpot', qty: 1 }, { id: 'mi-11', foodId: 'fd-broccoli', qty: 1 }] },
      ],
    },
    {
      id: 'mp-tom',
      name: 'Tom – 3,000 kcal lean bulk',
      clientId: 'cl-tom',
      targetCalories: 3000,
      meals: [
        { id: 'ml-5', name: 'Breakfast', items: [{ id: 'mi-12', foodId: 'fd-oats', qty: 2 }, { id: 'mi-13', foodId: 'fd-milk', qty: 2 }, { id: 'mi-14', foodId: 'fd-banana', qty: 1 }, { id: 'mi-15', foodId: 'fd-whey', qty: 1 }] },
        { id: 'ml-6', name: 'Lunch', items: [{ id: 'mi-16', foodId: 'fd-chicken', qty: 1 }, { id: 'mi-17', foodId: 'fd-rice', qty: 2 }, { id: 'mi-18', foodId: 'fd-broccoli', qty: 1 }] },
        { id: 'ml-7', name: 'Dinner', items: [{ id: 'mi-19', foodId: 'fd-pasta', qty: 1.5 }, { id: 'mi-20', foodId: 'fd-chicken', qty: 1 }] },
        { id: 'ml-8', name: 'Snack', items: [{ id: 'mi-21', foodId: 'fd-egg', qty: 3 }, { id: 'mi-22', foodId: 'fd-toast', qty: 2 }] },
      ],
    },
  ];

  return db;
}
