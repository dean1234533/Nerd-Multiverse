# RepMinder

A personal-trainer business app modelled on **PTminder**. It covers scheduling, clients, session packages, workouts, nutrition, assessments, invoicing and a branded client portal.

It is a React + TypeScript app (Vite) with a small Node server and a SQLite database. It installs on phones and computers as an app (PWA).

## Accounts and sharing

- **Owner login (just you).** Nobody can sign up on their own. On first start the server prints a one-time setup link in its log, which you use to create your owner account. Alternatively, set `OWNER_EMAIL` and `OWNER_PASSWORD` before the first start.
- **Invite links for trainers.** Go to **Team & activity → Invite trainer** and send the link by email, text or copy/share. The trainer picks their own password and gets their own workspace (their own clients, calendar, programs and billing). Links work once and expire after 14 days.
- **See and edit everything.** The Team page lists every trainer with their active clients, sessions this week and last activity. It also has a live activity log of what everyone does, including clients booking, cancelling or logging workouts. **View & edit** (or the workspace switcher in the sidebar) opens any trainer's workspace. Your changes are saved to their account and recorded in the log as "Your name (owner)".
- **Managing trainers.** From the Team page you can create password-reset links and disable or re-enable a trainer. Disabling signs them out and deactivates their clients' portal links; their data is kept.
- **Client portal links.** On a client's profile, **Send portal link** gives that client a private link with no password. Through it they see their credits and bookings, book or cancel classes, follow and log their workouts, and view their meal plan, progress and invoices. They see nothing about other clients. **Replace link** stops the old link working.

## Installing as an app (PWA)

After every sign-in, a popup explains how to install the app on the device being used:
- **Chrome, Edge, Android:** a one-tap **Install app** button.
- **iPhone/iPad (Safari):** Share → Add to Home Screen, with the steps shown.
- **Mac Safari:** File → Add to Dock.

Once installed, the app opens full-screen from the home screen or dock. "Not now" hides the popup for a week, or until the next sign-in. Installation needs the app to be served over HTTPS, which every host below provides.

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
| **Client portal** | Branded client view, reached by the private link above. Trainers can preview it from any client profile. |
| **Settings** | Business name, trainer, brand colour (applied across the app and portal), currency, tax, cancellation policy and calendar hours. You can also download or restore a JSON backup, load demo data or start fresh. |

## Running it locally

```bash
npm install
npm run dev        # app on http://localhost:5173, API on :8787
```

The terminal prints a one-time setup link (`http://localhost:5173/#/setup/…`). Open it to create your owner account. Data is stored in `data/repminder.sqlite`.

```bash
npm test           # business-rule and API tests (vitest)
npm run build      # typecheck + build the web app (dist/) and server (dist-server/)
npm start          # run the production build on http://localhost:8787
```

## Putting it online

The app is a single Node server that needs **one persistent disk** for its database. Any host that runs Docker or Node 22 works, for example Render, Railway or Fly.io:

1. Create a new web service from this repository. With Docker, it uses the included `Dockerfile`. Without Docker, the build command is `npm ci && npm run build` and the start command is `npm start`.
2. Attach a persistent disk/volume and set `DATA_DIR` to its mount path (the Docker image uses `/data`).
3. Optionally set `APP_URL` to your site's address, so the setup link in the log is clickable.
4. Deploy, open the setup link from the log (or set `OWNER_EMAIL` / `OWNER_PASSWORD` beforehand), and sign in.

| Variable | Purpose |
| --- | --- |
| `PORT` | Port to listen on (default 8787; 8080 in Docker). |
| `DATA_DIR` | Folder for the SQLite database. **It must be persistent.** |
| `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME` | Create the owner account on first start instead of using the setup link. |
| `APP_URL` | Public address, used only to print the setup link. |
| `INSECURE_COOKIES=1` | Allow sign-in over plain HTTP in production. Use this only for testing without HTTPS. |

Back up the `DATA_DIR` folder to back up everything. Each trainer can also download a JSON backup of their own workspace from Settings.

## Code layout

- `server/`: Express API (`app.ts`), SQLite schema (`db.ts`) and API tests
- `src/types.ts`: data model
- `src/logic.ts`: business rules (credits, bookings, cancellation policy, invoices, macros), unit-tested in `src/logic.test.ts`
- `src/portalScope.ts`: what a client may see and do through their portal link
- `src/store.tsx`: loads a workspace from the server and auto-saves changes, with conflict detection and offline retry
- `src/auth.tsx`, `src/pages/Auth.tsx`: sign-in, owner setup, invites and password resets
- `src/pages/Team.tsx`: the owner's team, invite and activity page
- `src/components/InstallBanner.tsx`, `public/manifest.webmanifest`, `public/sw.js`: PWA
- `src/seed.ts`: demo business and the exercise and food libraries

## Limitations compared with the real product

There is no payment gateway and no automatic SMS/email sending. Links and reminders are shared through your own email, messages or the share sheet.
