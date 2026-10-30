# RepMinder

A personal-trainer business app modelled on **PTminder**. It covers scheduling, clients, session packages, workouts, nutrition, assessments, invoicing and a branded client portal.

It is a React + TypeScript app (Vite), **hosted on Vercel** with **Firebase** as the backend: Firebase Authentication for sign-in and Cloud Firestore for data. It installs on phones and computers as an app (PWA).

## Accounts and sharing

- **Owner login (just you).** Nobody can sign up on their own. The first time you open the app, you create the owner account using the secret `SETUP_CODE` you set in Vercel. This works only once.
- **Invite links for trainers.** Go to **Team & activity → Invite trainer** and send the link by email, text or copy/share. The trainer picks their own password and gets their own workspace (their own clients, calendar, programs and billing). Links work once and expire after 14 days.
- **See and edit everything.** The Team page lists every trainer with their active clients, sessions this week and last activity. It also has a live activity log of what everyone does, including clients booking, cancelling or logging workouts. **View & edit** (or the workspace switcher in the sidebar) opens any trainer's workspace. Your changes are saved to their account and recorded in the log as "Your name (owner)".
- **Managing trainers.** From the Team page you can create password-reset links and disable or re-enable a trainer. Anyone can also use **Forgot password?** on the sign-in screen to get a reset email from Firebase. Disabling signs them out and deactivates their clients' portal links; their data is kept.
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

## Setting it up (Firebase + Vercel)

You need a free Firebase project and a free Vercel account. Everything below runs on Firebase's free **Spark** plan; Cloud Functions aren't used.

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**.
2. **Build → Authentication → Get started → Sign-in method**: enable **Email/Password**.
3. **Build → Firestore Database → Create database**: production mode, in a location near you.
4. **Project settings (⚙) → General → Your apps → Web (`</>`)**: register an app and copy the config values `apiKey`, `authDomain`, `projectId` and `appId`.
5. **Project settings → Service accounts → Generate new private key**: download the JSON file and keep it secret.
6. Deploy the security rules and indexes from this repo (one-off, and again whenever `firestore.rules` changes):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:rules,firestore:indexes --project <your-project-id>
   ```
   If you'd rather not use the command line, paste the contents of `firestore.rules` into **Firestore → Rules → Publish**. The indexes are created automatically the first time Firestore asks for them, via a link in the browser console.

### 2. Deploy to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repository. Vercel detects Vite automatically; `vercel.json` sets the rest up.
2. Under **Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `VITE_FIREBASE_API_KEY` | `apiKey` from step 1.4 |
   | `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain` |
   | `VITE_FIREBASE_PROJECT_ID` | `projectId` |
   | `VITE_FIREBASE_APP_ID` | `appId` |
   | `FIREBASE_SERVICE_ACCOUNT` | The whole service-account JSON from step 1.5, pasted as is |
   | `SETUP_CODE` | A long secret phrase (12+ characters) that you'll type once to create your owner account |

3. Click **Deploy**.
4. In Firebase, go to **Authentication → Settings → Authorized domains** and add your Vercel domain (e.g. `your-app.vercel.app`). This is needed for password-reset emails.
5. Open your Vercel URL, click **Create owner account**, enter your `SETUP_CODE` and your details. That's your private login. Invite trainers from **Team & activity**.

If you change environment variables later, redeploy so the app picks them up.

## Running it locally

```bash
npm install
cp .env.example .env.local   # fill in the same values as on Vercel
npm run dev                  # app on http://localhost:5173 (the API runs on :8787 behind it)
```

To try it without a real Firebase project, start the emulators with `npx firebase-tools emulators:start --project demo-repminder --only auth,firestore`. Then uncomment the emulator lines in `.env.local`, set `VITE_FIREBASE_PROJECT_ID=demo-repminder`, give `VITE_FIREBASE_API_KEY` any value, and run `npm run dev`.

```bash
npm test               # business-logic unit tests
npm run test:firebase  # security rules + API tests against the Firebase emulators (needs Java)
npm run build          # typecheck + production build
```

## How the backend fits together

- **Firebase Auth** holds the owner and trainer accounts.
- **Firestore** holds the data:
  - `users/{uid}`: name and role
  - `workspaces/{uid}`: each trainer's business, saved as one document
  - `activity`: the activity log
  - `invites` and `portalLinks`: the secret links
- **`firestore.rules`** enforce who can do what:
  - Trainers can only touch their own workspace; the owner can touch all of them.
  - Every save must increase a version number, so two people editing at once can't overwrite each other.
  - Activity entries must be in the writer's real name.
  - Disabled accounts are locked out immediately.
- **One Vercel function** (`api/index.ts` → `server/api.ts`, using the Firebase Admin SDK) does the few things a browser must not do itself: creating the owner account, accepting invite and reset links, disabling trainers, and serving the client portal, which needs no login and only ever reveals that one client's data.
- The app listens to its workspace live, so changes from the owner, the trainer's other devices or client bookings show up within a second or two.

**Size limit:** Firestore documents max out at 1 MB, which is roughly several thousand appointments plus clients, programs and logs per trainer. The app warns at 80% and stops saving at the limit, so it never loses data silently.

## Code layout

- `api/index.ts`, `server/api.ts`: the Vercel serverless function (Firebase Admin)
- `firestore.rules`, `firestore.indexes.json`, `firebase.json`: Firestore security rules, indexes and emulator config; tests in `tests/`
- `src/firebase.ts`, `src/firestoreModel.ts`: Firebase client setup and document shapes
- `src/types.ts`: data model
- `src/logic.ts`: business rules (credits, bookings, cancellation policy, invoices, macros), unit-tested in `src/logic.test.ts`
- `src/portalScope.ts`: what a client may see and do through their portal link
- `src/store.tsx`: subscribes to a workspace in Firestore and auto-saves changes, with conflict detection and offline retry
- `src/auth.tsx`, `src/pages/Auth.tsx`: sign-in, owner setup, invites and password resets
- `src/pages/Team.tsx`: the owner's team, invite and activity page
- `src/components/InstallBanner.tsx`, `public/manifest.webmanifest`, `public/sw.js`: PWA
- `src/seed.ts`: demo business and the exercise and food libraries

## Limitations compared with the real product

There is no payment gateway and no automatic SMS/email sending. Links and reminders are shared through your own email, messages or the share sheet.

## Push notifications

The owner (admin) is pushed when a trainer signs up, resets a password, saves a change, or a client updates their portal. Trainers are pushed when the owner edits their dashboard or a client updates their portal, and see the same changes in the bell in the sidebar.

Setup: run `npx web-push generate-vapid-keys`, then set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `APP_URL` in Vercel (see `.env.example`) and redeploy. Each person opens the bell and taps **Turn on push alerts** on every device they want alerts on. On iPhone/iPad the app must be added to the Home Screen first.
