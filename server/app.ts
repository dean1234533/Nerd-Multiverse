import express, { type NextFunction, type Request, type Response } from 'express';
import { createHash, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { DatabaseSync } from 'node:sqlite';
import type { ActivityRow, InviteKind, InviteRow, Role, UserRow, WorkspaceRow } from './db';
import type { DB } from '../src/types';
import { starterDB } from '../src/seed';
import { applyPortalAction, scopeForClient, type PortalAction } from '../src/portalScope';
import { addDays, startOfWeek } from '../src/utils';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

const SESSION_COOKIE = 'rm_session';
const SESSION_DAYS = 30;
const INVITE_DAYS = 14;
const MAX_MESSAGES = 20;

export interface AppOptions {
  /** Mark cookies Secure (set in production behind HTTPS). */
  secureCookies?: boolean;
  /** Directory of the built web app to serve, if any. */
  staticDir?: string;
  now?: () => Date;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// ---------- helpers ----------

const token = () => randomBytes(24).toString('base64url');
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, saltB64, keyB64] = stored.split('$');
  if (algo !== 'scrypt' || !saltB64 || !keyB64) return false;
  const key = Buffer.from(keyB64, 'base64');
  const test = await scrypt(pw, Buffer.from(saltB64, 'base64'), key.length);
  return timingSafeEqual(key, test);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
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

function isDB(v: unknown): v is DB {
  const d = v as DB;
  return (
    !!d &&
    d.version === 1 &&
    typeof d.settings === 'object' &&
    ['clients', 'products', 'clientPackages', 'appointments', 'exercises', 'programs', 'assignments', 'workoutLogs', 'foods', 'mealPlans', 'assessments', 'invoices'].every((k) =>
      Array.isArray((d as unknown as Record<string, unknown>)[k]),
    )
  );
}

export function publicUser(u: UserRow) {
  return { id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.created_at, disabled: !!u.disabled_at, lastSeenAt: u.last_seen_at };
}

// ---------- app ----------

export function createApp(db: DatabaseSync, opts: AppOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8mb' }));

  // --- data access ---
  const getUser = (id: string) => db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  const getUserByEmail = (email: string) => db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  const getWorkspace = (id: string) => db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id) as WorkspaceRow | undefined;
  const getWorkspaceForUser = (userId: string) => db.prepare('SELECT * FROM workspaces WHERE user_id = ?').get(userId) as WorkspaceRow | undefined;
  const ownerExists = () => !!db.prepare("SELECT 1 FROM users WHERE role = 'owner'").get();

  const logActivity = (workspaceId: string, actorName: string, actorRole: string, message: string) =>
    db.prepare('INSERT INTO activity (workspace_id, actor_name, actor_role, message, created_at) VALUES (?, ?, ?, ?, ?)').run(workspaceId, actorName, actorRole, message.slice(0, 500), iso());

  const createUser = async (role: Role, name: string, email: string, password: string) => {
    if (getUserByEmail(email)) throw new HttpError(409, 'An account with that email already exists');
    const id = randomUUID();
    const t = iso();
    db.prepare('INSERT INTO users (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, email, name, role, await hashPassword(password), t);
    const wsId = randomUUID();
    db.prepare('INSERT INTO workspaces (id, user_id, data, version, updated_at) VALUES (?, ?, ?, 1, ?)').run(wsId, id, JSON.stringify(starterDB(name)), t);
    logActivity(wsId, name, role, role === 'owner' ? 'Owner account created' : 'Joined via invite link');
    return getUser(id)!;
  };

  const startSession = (res: Response, userId: string) => {
    const t = token();
    const expires = addDays(now(), SESSION_DAYS);
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(t), userId, expires.toISOString());
    res.cookie(SESSION_COOKIE, t, { httpOnly: true, sameSite: 'lax', secure: !!opts.secureCookies, expires, path: '/' });
  };

  const createInvite = (kind: InviteKind, fields: { name?: string; email?: string; userId?: string }) => {
    const t = token();
    db.prepare('INSERT INTO invites (token, kind, name, email, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      t,
      kind,
      fields.name ?? '',
      fields.email ?? '',
      fields.userId ?? null,
      iso(),
      addDays(now(), INVITE_DAYS).toISOString(),
    );
    return t;
  };

  const liveInvite = (t: string) => {
    const inv = db.prepare('SELECT * FROM invites WHERE token = ?').get(t) as InviteRow | undefined;
    if (!inv || inv.used_at || new Date(inv.expires_at) < now()) throw new HttpError(404, 'This link has expired or already been used. Ask for a new one.');
    return inv;
  };

  // --- auth middleware ---
  type Authed = Request & { user: UserRow };
  const auth = (req: Request, _res: Response, next: NextFunction) => {
    const t = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (!t) return next(new HttpError(401, 'Please sign in'));
    const s = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(t)) as { user_id: string; expires_at: string } | undefined;
    if (!s || new Date(s.expires_at) < now()) return next(new HttpError(401, 'Your session has expired. Please sign in again.'));
    const u = getUser(s.user_id);
    if (!u || u.disabled_at) return next(new HttpError(401, 'This account has been disabled'));
    db.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').run(iso(), u.id);
    (req as Authed).user = u;
    next();
  };
  const ownerOnly = (req: Request, _res: Response, next: NextFunction) =>
    (req as Authed).user.role === 'owner' ? next() : next(new HttpError(403, 'Only the account owner can do that'));

  /** The workspace the signed-in user may access: their own, or any if owner. */
  const accessibleWorkspace = (req: Request) => {
    const u = (req as Authed).user;
    const ws = getWorkspace(String(req.params.id));
    if (!ws || (u.role !== 'owner' && ws.user_id !== u.id)) throw new HttpError(404, 'Workspace not found');
    return ws;
  };

  const wrap =
    (fn: (req: Request, res: Response) => unknown | Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) =>
      Promise.resolve()
        .then(() => fn(req, res))
        .then((body) => {
          if (!res.headersSent) res.json(body ?? { ok: true });
        })
        .catch(next);

  // Login rate limiting: 10 attempts per 15 minutes per IP + email.
  const attempts = new Map<string, { n: number; reset: number }>();
  const checkRate = (key: string) => {
    const t = now().getTime();
    if (attempts.size > 10_000) for (const [k, v] of attempts) if (v.reset < t) attempts.delete(k);
    const a = attempts.get(key);
    if (!a || a.reset < t) attempts.set(key, { n: 1, reset: t + 15 * 60_000 });
    else if (++a.n > 10) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  };

  const api = express.Router();

  // ----- setup & auth -----
  api.get('/status', wrap(() => ({ needsSetup: !ownerExists() })));

  api.post(
    '/setup',
    wrap(async (req, res) => {
      if (ownerExists()) throw new HttpError(409, 'The owner account already exists');
      const inv = liveInvite(str(req.body.token, 'Setup code'));
      if (inv.kind !== 'setup') throw new HttpError(404, 'Invalid setup link');
      const u = await createUser('owner', str(req.body.name, 'Name'), validEmail(req.body.email), validPassword(req.body.password));
      db.prepare('UPDATE invites SET used_at = ? WHERE token = ?').run(iso(), inv.token);
      startSession(res, u.id);
      return { user: publicUser(u) };
    }),
  );

  api.post(
    '/login',
    wrap(async (req, res) => {
      const email = validEmail(req.body.email);
      checkRate(`${req.ip}|${email}`);
      const u = getUserByEmail(email);
      const ok = u ? await verifyPassword(String(req.body.password ?? ''), u.password_hash) : false;
      if (!u || !ok) throw new HttpError(401, 'Wrong email or password');
      if (u.disabled_at) throw new HttpError(403, 'This account has been disabled. Contact the owner.');
      startSession(res, u.id);
      return { user: publicUser(u) };
    }),
  );

  api.post(
    '/logout',
    wrap((req, res) => {
      const t = parseCookies(req.headers.cookie)[SESSION_COOKIE];
      if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(t));
      res.clearCookie(SESSION_COOKIE, { path: '/' });
    }),
  );

  api.get(
    '/me',
    auth,
    wrap((req) => {
      const u = (req as Authed).user;
      return { user: publicUser(u), workspaceId: getWorkspaceForUser(u.id)?.id };
    }),
  );

  // ----- invites (also used for password resets) -----
  api.get(
    '/invites/:token',
    wrap((req) => {
      const inv = liveInvite(String(req.params.token));
      if (inv.kind === 'setup') throw new HttpError(404, 'Invalid link');
      const u = inv.user_id ? getUser(inv.user_id) : undefined;
      return { kind: inv.kind, name: u?.name ?? inv.name, email: u?.email ?? inv.email };
    }),
  );

  api.post(
    '/invites/:token/accept',
    wrap(async (req, res) => {
      const inv = liveInvite(String(req.params.token));
      let user: UserRow;
      if (inv.kind === 'invite') {
        user = await createUser('trainer', str(req.body.name, 'Name'), validEmail(req.body.email), validPassword(req.body.password));
      } else if (inv.kind === 'reset' && inv.user_id) {
        const u = getUser(inv.user_id);
        if (!u || u.disabled_at) throw new HttpError(404, 'Account not found');
        db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(validPassword(req.body.password)), u.id);
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
        user = u;
      } else throw new HttpError(404, 'Invalid link');
      db.prepare('UPDATE invites SET used_at = ? WHERE token = ?').run(iso(), inv.token);
      startSession(res, user.id);
      return { user: publicUser(user) };
    }),
  );

  // ----- owner: team management -----
  api.get(
    '/team',
    auth,
    ownerOnly,
    wrap(() => {
      const users = db.prepare('SELECT * FROM users ORDER BY role DESC, name').all() as unknown as UserRow[];
      const weekStart = startOfWeek(now());
      const weekEnd = addDays(weekStart, 7);
      const trainers = users.map((u) => {
        const ws = getWorkspaceForUser(u.id);
        let stats = { clients: 0, activeClients: 0, sessionsThisWeek: 0, completedThisWeek: 0, workoutsLogged: 0 };
        if (ws) {
          const d = JSON.parse(ws.data) as DB;
          const week = d.appointments.filter((a) => a.status !== 'cancelled' && new Date(a.start) >= weekStart && new Date(a.start) < weekEnd);
          stats = {
            clients: d.clients.length,
            activeClients: d.clients.filter((c) => c.status === 'active').length,
            sessionsThisWeek: week.length,
            completedThisWeek: week.filter((a) => a.status === 'completed').length,
            workoutsLogged: d.workoutLogs.length,
          };
        }
        const last = ws ? (db.prepare('SELECT created_at FROM activity WHERE workspace_id = ? ORDER BY id DESC LIMIT 1').get(ws.id) as { created_at: string } | undefined) : undefined;
        return { ...publicUser(u), workspaceId: ws?.id, businessName: ws ? (JSON.parse(ws.data) as DB).settings.businessName : '', lastActivityAt: last?.created_at ?? null, stats };
      });
      const invites = (db.prepare("SELECT * FROM invites WHERE kind = 'invite' AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC").all(iso()) as unknown as InviteRow[]).map(
        (i) => ({ token: i.token, name: i.name, email: i.email, createdAt: i.created_at, expiresAt: i.expires_at }),
      );
      return { trainers, invites };
    }),
  );

  api.post(
    '/invites',
    auth,
    ownerOnly,
    wrap((req) => {
      const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 120) : '';
      const email = typeof req.body.email === 'string' && req.body.email.trim() ? validEmail(req.body.email) : '';
      if (email && getUserByEmail(email)) throw new HttpError(409, 'That person already has an account');
      return { token: createInvite('invite', { name, email }) };
    }),
  );

  api.delete(
    '/invites/:token',
    auth,
    ownerOnly,
    wrap((req) => void db.prepare("DELETE FROM invites WHERE token = ? AND kind = 'invite'").run(String(req.params.token))),
  );

  api.patch(
    '/users/:id',
    auth,
    ownerOnly,
    wrap((req) => {
      const u = getUser(String(req.params.id));
      if (!u) throw new HttpError(404, 'User not found');
      if (u.role === 'owner') throw new HttpError(400, 'The owner account cannot be disabled');
      const disabled = !!req.body.disabled;
      db.prepare('UPDATE users SET disabled_at = ? WHERE id = ?').run(disabled ? iso() : null, u.id);
      if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
      return { user: publicUser(getUser(u.id)!) };
    }),
  );

  api.post(
    '/users/:id/reset',
    auth,
    ownerOnly,
    wrap((req) => {
      const u = getUser(String(req.params.id));
      if (!u) throw new HttpError(404, 'User not found');
      return { token: createInvite('reset', { userId: u.id }) };
    }),
  );

  api.get(
    '/activity',
    auth,
    ownerOnly,
    wrap((req) => {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
      const ws = typeof req.query.workspace === 'string' && req.query.workspace ? req.query.workspace : null;
      const before = Number(req.query.before) || Number.MAX_SAFE_INTEGER;
      const rows = (
        ws
          ? db.prepare('SELECT * FROM activity WHERE workspace_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(ws, before, limit)
          : db.prepare('SELECT * FROM activity WHERE id < ? ORDER BY id DESC LIMIT ?').all(before, limit)
      ) as unknown as ActivityRow[];
      return {
        items: rows.map((r) => ({ id: r.id, workspaceId: r.workspace_id, actorName: r.actor_name, actorRole: r.actor_role, message: r.message, createdAt: r.created_at })),
      };
    }),
  );

  // ----- workspaces -----
  api.get(
    '/workspaces/:id',
    auth,
    wrap((req) => {
      const ws = accessibleWorkspace(req);
      const owner = getUser(ws.user_id)!;
      return { id: ws.id, version: ws.version, updatedAt: ws.updated_at, trainer: publicUser(owner), db: JSON.parse(ws.data) };
    }),
  );

  api.put(
    '/workspaces/:id',
    auth,
    wrap((req, res) => {
      const ws = accessibleWorkspace(req);
      const u = (req as Authed).user;
      if (req.body.baseVersion !== ws.version) {
        res.status(409).json({ error: 'This workspace was changed elsewhere', version: ws.version, db: JSON.parse(ws.data) });
        return;
      }
      if (!isDB(req.body.db)) throw new HttpError(400, 'Invalid workspace data');
      const version = ws.version + 1;
      db.prepare('UPDATE workspaces SET data = ?, version = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(req.body.db), version, iso(), ws.id);
      const messages: unknown[] = Array.isArray(req.body.messages) ? req.body.messages.slice(0, MAX_MESSAGES) : [];
      const actor = ws.user_id === u.id ? u.name : `${u.name} (owner)`;
      for (const m of messages) if (typeof m === 'string' && m.trim()) logActivity(ws.id, actor, u.role, m.trim());
      return { version };
    }),
  );

  // ----- client portal links -----
  api.post(
    '/workspaces/:id/portal-links',
    auth,
    wrap((req) => {
      const ws = accessibleWorkspace(req);
      const clientId = str(req.body.clientId, 'Client');
      const d = JSON.parse(ws.data) as DB;
      if (!d.clients.some((c) => c.id === clientId)) throw new HttpError(404, 'Client not found');
      const existing = db.prepare('SELECT token FROM portal_links WHERE workspace_id = ? AND client_id = ? AND revoked_at IS NULL').get(ws.id, clientId) as { token: string } | undefined;
      if (existing && !req.body.regenerate) return { token: existing.token };
      if (existing) db.prepare('UPDATE portal_links SET revoked_at = ? WHERE token = ?').run(iso(), existing.token);
      const t = token();
      db.prepare('INSERT INTO portal_links (token, workspace_id, client_id, created_at) VALUES (?, ?, ?, ?)').run(t, ws.id, clientId, iso());
      return { token: t };
    }),
  );

  const portalTarget = (t: string) => {
    const link = db.prepare('SELECT * FROM portal_links WHERE token = ? AND revoked_at IS NULL').get(t) as { workspace_id: string; client_id: string } | undefined;
    const ws = link && getWorkspace(link.workspace_id);
    const trainer = ws && getUser(ws.user_id);
    if (!link || !ws || !trainer || trainer.disabled_at) throw new HttpError(404, 'This link is no longer active. Ask your trainer for a new one.');
    const d = JSON.parse(ws.data) as DB;
    if (!d.clients.some((c) => c.id === link.client_id)) throw new HttpError(404, 'This link is no longer active. Ask your trainer for a new one.');
    return { ws, clientId: link.client_id, data: d };
  };

  api.get(
    '/portal/:token',
    wrap((req) => {
      const { clientId, data } = portalTarget(String(req.params.token));
      return { clientId, db: scopeForClient(data, clientId, now()) };
    }),
  );

  api.post(
    '/portal/:token/actions',
    wrap((req) => {
      const { ws, clientId, data } = portalTarget(String(req.params.token));
      let message: string;
      try {
        message = applyPortalAction(data, clientId, req.body as PortalAction, now());
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : 'Action failed');
      }
      db.prepare('UPDATE workspaces SET data = ?, version = version + 1, updated_at = ? WHERE id = ?').run(JSON.stringify(data), iso(), ws.id);
      const c = data.clients.find((x) => x.id === clientId)!;
      logActivity(ws.id, `${c.firstName} ${c.lastName}`, 'client', message);
      return { clientId, db: scopeForClient(data, clientId, now()) };
    }),
  );

  app.use('/api', api);
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found')));

  if (opts.staticDir) {
    const dir = opts.staticDir;
    // The service worker must never be served stale.
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile('sw.js', { root: dir });
    });
    app.use('/assets', express.static(`${dir}/assets`, { immutable: true, maxAge: '1y' }));
    app.use(express.static(dir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile('index.html', { root: dir });
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if ((err as { type?: string }).type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large' });
    if ((err as { type?: string }).type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  /** Ensure there's a way to create the owner account. Returns a setup token if one is needed. */
  const bootstrap = async (env: { email?: string; password?: string; name?: string }) => {
    if (ownerExists()) return null;
    if (env.email && env.password) {
      await createUser('owner', env.name || 'Owner', validEmail(env.email), validPassword(env.password));
      return null;
    }
    const existing = db.prepare("SELECT token FROM invites WHERE kind = 'setup' AND used_at IS NULL AND expires_at > ?").get(iso()) as { token: string } | undefined;
    return existing?.token ?? createInvite('setup', {});
  };

  return { app, bootstrap };
}
