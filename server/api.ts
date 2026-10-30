// The few operations that need Firebase Admin rights, served as one Vercel
// function (see api/index.ts). Everything else the web app does directly
// against Firestore, guarded by firestore.rules.
import express, { type NextFunction, type Request, type Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp, type Firestore, type Transaction } from 'firebase-admin/firestore';
import type { Auth } from 'firebase-admin/auth';
import type { DB } from '../src/types.js';
import type { ActivityDoc, InviteDoc, PortalLinkDoc, UserDoc, WorkspaceDoc } from '../src/firestoreModel.js';
import { MAX_WORKSPACE_BYTES } from '../src/firestoreModel.js';
import { starterDB } from '../src/seed.js';
import type { Mailer } from './notify.js';
import { applyPortalAction, scopeForClient, type PortalAction } from '../src/portalScope.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiDeps {
  auth: Auth;
  db: Firestore;
  /** Code required to create the owner account (env SETUP_CODE). */
  setupCode?: string;
  /** Sends notification emails; omit to disable them. */
  mailer?: Mailer;
  /** Where admin emails go. Defaults to the owner account's email. */
  adminEmail?: string;
  /** Public URL of the app, used for the "Open RepMinder" link. */
  appUrl?: string;
  now?: () => Date;
}

function str(v: unknown, field: string, max = 200): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `${field} is required`);
  return v.trim().slice(0, max);
}

function validPassword(v: unknown): string {
  if (typeof v !== 'string' || v.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');
  if (v.length > 200) throw new HttpError(400, 'Password is too long');
  return v;
}

function validEmail(v: unknown): string {
  const e = str(v, 'Email', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new HttpError(400, 'Enter a valid email address');
  return e;
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

const authErrors: Record<string, [number, string]> = {
  'auth/email-already-exists': [409, 'An account with that email already exists'],
  'auth/invalid-email': [400, 'Enter a valid email address'],
  'auth/invalid-password': [400, 'Password must be at least 8 characters'],
};

export function createApi({ auth, db, setupCode, mailer, adminEmail, appUrl, now = () => new Date() }: ApiDeps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  const wrap =
    (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve()
        .then(() => fn(req, res))
        .then((body) => {
          if (!res.headersSent) res.json(body ?? { ok: true });
        })
        .catch(next);

  const userRef = (uid: string) => db.collection('users').doc(uid);
  const wsRef = (uid: string) => db.collection('workspaces').doc(uid);
  const setupRef = db.collection('meta').doc('setup');

  const activity = (workspaceId: string, actorUid: string, actorName: string, actorRole: ActivityDoc['actorRole'], message: string): ActivityDoc => ({
    workspaceId,
    actorUid,
    actorName,
    actorRole,
    message: message.slice(0, 500),
    createdAt: FieldValue.serverTimestamp(),
  });

  /** Email the admin (the owner, or ADMIN_EMAIL). Never throws: a mail failure must not break the action. */
  const emailAdmin = async (subject: string, lines: string[]) => {
    let to = adminEmail;
    if (!to) {
      const ownerUid = ((await setupRef.get()).data() as { ownerUid?: string } | undefined)?.ownerUid;
      to = ownerUid ? ((await userRef(ownerUid).get()).data() as UserDoc | undefined)?.email : undefined;
    }
    await emailTo(to, subject, lines);
  };

  const emailTo = async (to: string | undefined, subject: string, lines: string[]) => {
    if (!mailer || !to) return;
    try {
      await mailer({ to, subject, lines, link: appUrl });
    } catch (e) {
      console.error('Notification email failed:', e instanceof Error ? e.message : e);
    }
  };

  /** Create the Auth user plus their profile and starter workspace. */
  const createAccount = async (role: UserDoc['role'], name: string, email: string, password: string, extra?: (tx: Transaction, uid: string) => void) => {
    let uid: string;
    try {
      uid = (await auth.createUser({ email, password, displayName: name })).uid;
    } catch (e) {
      const mapped = authErrors[(e as { code?: string }).code ?? ''];
      if (mapped) throw new HttpError(...mapped);
      throw e;
    }
    try {
      await db.runTransaction(async (tx) => {
        extra?.(tx, uid);
        const at = now().toISOString();
        tx.create(userRef(uid), { name, email, role, disabled: false, createdAt: at } satisfies UserDoc);
        tx.create(wsRef(uid), { data: JSON.stringify(starterDB(name)), version: 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: uid } satisfies WorkspaceDoc);
        tx.create(db.collection('activity').doc(), activity(uid, uid, name, role, role === 'owner' ? 'Owner account created' : 'Joined via invite link'));
      });
    } catch (e) {
      await auth.deleteUser(uid).catch(() => undefined);
      throw e;
    }
    return uid;
  };

  /** Verify the caller's Firebase ID token and load their profile. */
  const caller = async (req: Request) => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!m) throw new HttpError(401, 'Please sign in');
    let uid: string;
    try {
      uid = (await auth.verifyIdToken(m[1], true)).uid;
    } catch {
      throw new HttpError(401, 'Your session has expired. Please sign in again.');
    }
    const u = (await userRef(uid).get()).data() as UserDoc | undefined;
    if (!u || u.disabled) throw new HttpError(403, 'This account has been disabled');
    return { uid, ...u };
  };

  const liveInvite = async (token: string) => {
    const snap = await db.collection('invites').doc(token).get();
    const inv = snap.data() as InviteDoc | undefined;
    if (!inv || inv.used || (inv.expiresAt as Timestamp).toDate() < now()) throw new HttpError(404, 'This link has expired or already been used. Ask for a new one.');
    return inv;
  };

  const r = express.Router();

  // ----- owner setup -----
  r.get(
    '/status',
    wrap(async () => ({ needsSetup: !(await setupRef.get()).exists, setupEnabled: !!setupCode && setupCode.length >= 12 })),
  );

  r.post(
    '/setup',
    wrap(async (req) => {
      if (!setupCode || setupCode.length < 12) throw new HttpError(503, 'Set a SETUP_CODE of at least 12 characters in your Vercel environment variables first.');
      if (!sameSecret(String(req.body.code ?? ''), setupCode)) throw new HttpError(403, 'That setup code is not right');
      if ((await setupRef.get()).exists) throw new HttpError(409, 'The owner account already exists');
      const name = str(req.body.name, 'Name', 120);
      const email = validEmail(req.body.email);
      const password = validPassword(req.body.password);
      // tx.create on meta/setup fails if two setups race, so only one owner can exist.
      await createAccount('owner', name, email, password, (tx, uid) => tx.create(setupRef, { ownerUid: uid, createdAt: now().toISOString() }));
      return { email };
    }),
  );

  // ----- invite & reset links -----
  r.get(
    '/invites/:token',
    wrap(async (req) => {
      const inv = await liveInvite(String(req.params.token));
      if (inv.kind === 'reset' && inv.userId) {
        const u = (await userRef(inv.userId).get()).data() as UserDoc | undefined;
        return { kind: inv.kind, name: u?.name ?? '', email: u?.email ?? '' };
      }
      return { kind: inv.kind, name: inv.name, email: inv.email };
    }),
  );

  r.post(
    '/invites/:token/accept',
    wrap(async (req) => {
      const ref = db.collection('invites').doc(String(req.params.token));
      // Claim the link first so it can only ever be used once.
      const inv = await db.runTransaction(async (tx) => {
        const d = (await tx.get(ref)).data() as InviteDoc | undefined;
        if (!d || d.used || (d.expiresAt as Timestamp).toDate() < now()) throw new HttpError(404, 'This link has expired or already been used. Ask for a new one.');
        tx.update(ref, { used: true, usedAt: now().toISOString() });
        return d;
      });
      try {
        if (inv.kind === 'invite') {
          const email = validEmail(req.body.email);
          const name = str(req.body.name, 'Name', 120);
          await createAccount('trainer', name, email, validPassword(req.body.password));
          await emailAdmin(`New trainer signed up: ${name}`, [`${name} (${email}) accepted their invite and created a trainer account.`, `Time: ${now().toISOString()}`]);
          return { email };
        }
        if (inv.kind === 'reset' && inv.userId) {
          const u = (await userRef(inv.userId).get()).data() as UserDoc | undefined;
          if (!u || u.disabled) throw new HttpError(404, 'Account not found');
          await auth.updateUser(inv.userId, { password: validPassword(req.body.password) });
          await auth.revokeRefreshTokens(inv.userId);
          await emailAdmin(`Password reset completed: ${u.name}`, [`${u.name} (${u.email}) set a new password using a reset link.`]);
          return { email: u.email };
        }
        throw new HttpError(404, 'Invalid link');
      } catch (e) {
        await ref.update({ used: false, usedAt: FieldValue.delete() }); // let them try again
        throw e;
      }
    }),
  );

  // ----- owner: disable / enable trainers -----
  r.post(
    '/users/:uid/disabled',
    wrap(async (req) => {
      const me = await caller(req);
      if (me.role !== 'owner') throw new HttpError(403, 'Only the account owner can do that');
      const uid = String(req.params.uid);
      const target = (await userRef(uid).get()).data() as UserDoc | undefined;
      if (!target) throw new HttpError(404, 'User not found');
      if (target.role === 'owner') throw new HttpError(400, 'The owner account cannot be disabled');
      const disabled = !!req.body.disabled;
      await auth.updateUser(uid, { disabled });
      if (disabled) await auth.revokeRefreshTokens(uid);
      await userRef(uid).update({ disabled });
      await emailTo(target.email, disabled ? 'Your RepMinder account was disabled' : 'Your RepMinder account was re-enabled', [
        disabled ? 'The account owner has disabled your access. Contact them if this is unexpected.' : 'The account owner has re-enabled your access. You can sign in again.',
      ]);
      return { disabled };
    }),
  );

  // ----- change notifications -----
  // The web app saves straight to Firestore, so after each save it tells us
  // what changed and we email the right people. The messages are the same
  // ones written to the activity log.
  r.post(
    '/notify',
    wrap(async (req) => {
      const me = await caller(req);
      const workspaceId = typeof req.body.workspaceId === 'string' && req.body.workspaceId ? req.body.workspaceId : me.uid;
      if (workspaceId !== me.uid && me.role !== 'owner') throw new HttpError(403, 'Not allowed');
      const raw: unknown = req.body.messages;
      const messages = (Array.isArray(raw) ? raw : [])
        .filter((m): m is string => typeof m === 'string' && !!m.trim())
        .slice(0, 20)
        .map((m) => m.trim().slice(0, 500));
      if (!messages.length) return { sent: 0 };

      const owner = (await userRef(workspaceId).get()).data() as UserDoc | undefined;
      if (!owner) throw new HttpError(404, 'Workspace not found');
      const lines = [...messages.map((m) => `• ${m}`), `By: ${me.name} (${me.role})`, `Time: ${now().toISOString()}`];
      const subject = messages.length === 1 ? messages[0] : `${messages.length} changes`;

      if (me.uid === workspaceId && me.role === 'trainer') {
        await emailAdmin(`[${me.name}] ${subject}`, lines);
      } else if (me.uid !== workspaceId) {
        // The owner changed a trainer's dashboard: tell the trainer.
        await emailTo(owner.email, `Your dashboard was updated: ${subject}`, lines);
      }
      // The owner changing their own workspace needs no email.
      return { sent: messages.length };
    }),
  );

  // ----- client portal (no login; the link token is the key) -----
  const portalTarget = async (token: string) => {
    const link = (await db.collection('portalLinks').doc(token).get()).data() as PortalLinkDoc | undefined;
    const gone = new HttpError(404, 'This link is no longer active. Ask your trainer for a new one.');
    if (!link || link.revoked) throw gone;
    const trainer = (await userRef(link.workspaceId).get()).data() as UserDoc | undefined;
    if (!trainer || trainer.disabled) throw gone;
    return { link, gone };
  };

  r.get(
    '/portal/:token',
    wrap(async (req) => {
      const { link, gone } = await portalTarget(String(req.params.token));
      const ws = (await wsRef(link.workspaceId).get()).data() as WorkspaceDoc | undefined;
      const data = ws && (JSON.parse(ws.data) as DB);
      if (!data?.clients.some((c) => c.id === link.clientId)) throw gone;
      return { clientId: link.clientId, db: scopeForClient(data, link.clientId, now()) };
    }),
  );

  r.post(
    '/portal/:token/actions',
    wrap(async (req) => {
      const { link, gone } = await portalTarget(String(req.params.token));
      const ref = wsRef(link.workspaceId);
      let portalMessage = '';
      let clientName = '';
      const data = await db.runTransaction(async (tx) => {
        const ws = (await tx.get(ref)).data() as WorkspaceDoc | undefined;
        const d = ws && (JSON.parse(ws.data) as DB);
        const client = d?.clients.find((c) => c.id === link.clientId);
        if (!ws || !d || !client) throw gone;
        let message: string;
        try {
          message = applyPortalAction(d, link.clientId, req.body as PortalAction, now());
        } catch (e) {
          throw new HttpError(400, e instanceof Error ? e.message : 'Action failed');
        }
        const json = JSON.stringify(d);
        if (json.length > MAX_WORKSPACE_BYTES) throw new HttpError(507, "Your trainer's account is full. Please let them know.");
        tx.update(ref, { data: json, version: ws.version + 1, updatedAt: FieldValue.serverTimestamp(), updatedBy: `portal:${link.clientId}` });
        tx.create(db.collection('activity').doc(), activity(link.workspaceId, `portal:${link.clientId}`, `${client.firstName} ${client.lastName}`, 'client', message));
        portalMessage = message;
        clientName = `${client.firstName} ${client.lastName}`;
        return d;
      });
      const trainer = (await userRef(link.workspaceId).get()).data() as UserDoc | undefined;
      const lines = [`${clientName}: ${portalMessage}`, `Time: ${now().toISOString()}`];
      await emailTo(trainer?.email, `${clientName} updated their portal`, lines);
      await emailAdmin(`[${trainer?.name ?? 'Trainer'}] ${clientName} updated their portal`, lines);
      return { clientId: link.clientId, db: scopeForClient(data, link.clientId, now()) };
    }),
  );

  app.use('/api', r);
  app.use((_req, _res, next) => next(new HttpError(404, 'Not found')));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if ((err as { type?: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
