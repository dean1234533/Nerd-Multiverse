# RepMinder

A personal-trainer business app modelled on **PTminder**. It covers scheduling, clients, session packages, workouts, nutrition, assessments, invoicing and a branded client portal.

It is a single-page React + TypeScript app (Vite). All data lives in the browser's `localStorage`, so there is no backend to run. Demo data loads on first visit.

## Features

| Area | What you can do |
| --- | --- |
| **Dashboard** | See today's and tomorrow's sessions, active clients, sessions this week, revenue this month and outstanding balances. A "needs attention" list flags clients low on credits, overdue invoices and new leads. |
| **Schedule** | Week calendar with PT sessions, group classes and consultations. Click a slot to book, set a weekly repeat, and set class capacity. Mark attendance (attended / no-show / late cancel), complete or cancel an appointment, copy reminder texts and get warned about clashes. |
| **Clients** | Search and filter by active / lead / inactive. Each profile has goals, injuries (PAR-Q notes), private notes, packages and credit usage, upcoming sessions and history, assigned programs, meal plans, measurements and invoices. |
| **Session packages** | Define products (e.g. "10 PT sessions, valid 120 days"). Selling one issues credits and raises an invoice. Booking uses a credit from the soonest-expiring package. Cancelling outside the late-cancel window refunds the credit, cancelling inside it keeps the credit. A cancelled appointment refunds everyone. |
| **Workouts** | Exercise library with coaching cues, and a program builder with days, sets, reps, rest and notes. Programs can be reordered, duplicated and assigned to clients. |
| **Nutrition** | Food library with macros, and a meal-plan builder with a live calorie and macro breakdown against a target. |
| **Progress** | Record weight, body fat and girth measurements, and chart the trends. |
| **Billing** | Invoices (custom or from packages) with tax, a printable / PDF view, payment recording, voiding and overdue tracking. Also package pricing and a 6-month revenue report. |
| **Client portal** | Branded client view at `#/portal/<clientId>`, opened from any client profile. Clients see their credits and bookings, book classes, cancel under the policy, follow and log workouts against their last numbers, and view their meal plan, progress and invoices. |
| **Settings** | Business name, trainer, brand colour (applied across the app and portal), currency, tax, cancellation policy and calendar hours. You can also export or import a JSON backup, reload the demo data or start fresh. |

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # business-rule unit tests (vitest)
npm run build      # typecheck + production build into dist/
```

## Code layout

- `src/types.ts`: data model
- `src/logic.ts`: business rules (credits, bookings, cancellation policy, invoices, macros), unit-tested in `src/logic.test.ts`
- `src/seed.ts`: demo business and the exercise and food libraries
- `src/store.tsx`: state, `localStorage` persistence and toasts
- `src/pages/*`: one file per screen
- `src/components/*`: shared UI (modal, chart, appointment dialogs)

## Limitations compared with the real product

There is no server, login, payment gateway or real SMS/email sending. Reminders are copied to the clipboard instead. To go multi-user, swap `store.tsx` for an API-backed store; the rules in `logic.ts` are framework-free and can move to a server unchanged.
