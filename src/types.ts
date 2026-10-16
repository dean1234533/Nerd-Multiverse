export type ID = string;

export type ClientStatus = 'active' | 'lead' | 'inactive';

export interface Client {
  id: ID;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob?: string;
  goals: string;
  notes: string;
  injuries: string;
  status: ClientStatus;
  createdAt: string;
}

/** A session package for sale, e.g. "10 x 1-hour PT sessions". */
export interface Product {
  id: ID;
  name: string;
  sessions: number;
  price: number;
  validDays: number;
  description: string;
}

/** A package a client has bought, holding their session credits. */
export interface ClientPackage {
  id: ID;
  clientId: ID;
  productId: ID;
  name: string;
  sessionsTotal: number;
  sessionsUsed: number;
  purchasedAt: string;
  expiresAt: string;
  invoiceId?: ID;
}

export type AppointmentType = 'pt' | 'class' | 'consult';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled';
export type Attendance = 'booked' | 'attended' | 'no-show' | 'late-cancel';

export interface Booking {
  clientId: ID;
  attendance: Attendance;
  /** The client package a credit was taken from, if any. */
  creditPackageId?: ID;
}

export interface Appointment {
  id: ID;
  title: string;
  type: AppointmentType;
  start: string;
  durationMin: number;
  location: string;
  capacity: number;
  status: AppointmentStatus;
  bookings: Booking[];
  notes: string;
  /** Appointments created together as a weekly series share this id. */
  seriesId?: ID;
}

export interface Exercise {
  id: ID;
  name: string;
  category: string;
  equipment: string;
  instructions: string;
}

export interface ProgramItem {
  id: ID;
  exerciseId: ID;
  sets: number;
  reps: string;
  rest: string;
  notes: string;
}

export interface ProgramDay {
  id: ID;
  name: string;
  items: ProgramItem[];
}

export interface Program {
  id: ID;
  name: string;
  description: string;
  days: ProgramDay[];
}

export interface ProgramAssignment {
  id: ID;
  clientId: ID;
  programId: ID;
  assignedAt: string;
}

export interface WorkoutLog {
  id: ID;
  clientId: ID;
  programId: ID;
  dayId: ID;
  date: string;
  notes: string;
  entries: { itemId: ID; weight: string; reps: string; done: boolean }[];
}

export interface Food {
  id: ID;
  name: string;
  serving: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealItem {
  id: ID;
  foodId: ID;
  qty: number;
}

export interface Meal {
  id: ID;
  name: string;
  items: MealItem[];
}

export interface MealPlan {
  id: ID;
  name: string;
  clientId?: ID;
  targetCalories: number;
  meals: Meal[];
}

export interface Assessment {
  id: ID;
  clientId: ID;
  date: string;
  weightKg?: number;
  bodyFatPct?: number;
  waistCm?: number;
  hipsCm?: number;
  chestCm?: number;
  armCm?: number;
  thighCm?: number;
  restingHr?: number;
  notes: string;
}

export interface InvoiceLine {
  description: string;
  qty: number;
  unitPrice: number;
  /** When set, paying the invoice issues this product to the client. */
  productId?: ID;
}

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'void';

export interface Invoice {
  id: ID;
  number: number;
  clientId: ID;
  issuedAt: string;
  dueAt: string;
  lines: InvoiceLine[];
  status: InvoiceStatus;
  paidAt?: string;
  method?: string;
}

export interface Settings {
  businessName: string;
  trainerName: string;
  brandColor: string;
  currency: string;
  taxRatePct: number;
  lateCancelHours: number;
  defaultSessionMin: number;
  dayStartHour: number;
  dayEndHour: number;
}

export interface DB {
  version: 1;
  settings: Settings;
  clients: Client[];
  products: Product[];
  clientPackages: ClientPackage[];
  appointments: Appointment[];
  exercises: Exercise[];
  programs: Program[];
  assignments: ProgramAssignment[];
  workoutLogs: WorkoutLog[];
  foods: Food[];
  mealPlans: MealPlan[];
  assessments: Assessment[];
  invoices: Invoice[];
  nextInvoiceNumber: number;
}
