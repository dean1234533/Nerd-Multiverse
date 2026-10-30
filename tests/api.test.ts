// Serverless API tests against the Auth + Firestore emulators. Run with `npm run test:firebase`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Mail } from '../server/notify';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:http';
import { Timestamp } from 'firebase-admin/firestore';
import { admin } from '../server/firebaseAdmin';
import { createApi } from '../server/api';
import type { DB } from '../src/types';
import type { WorkspaceDoc } from '../src/firestoreModel';
import { createAppointments } from '../src/logic';
import { addDays } from '../src/utils';

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-repminder';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const SETUP_CODE = 'correct-horse-battery';

const { auth, db } = admin();
let server: Server;
let base = '';
const sent: Mail[] = [];
const ADMIN = 'admin@example.com';

beforeAll(async () => {
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
  server = createServer(createApi({
    auth,
    db,
    setupCode: SETUP_CODE,
    adminEmail: ADMIN,
    mailer: async (m) => void sent.push(m),
  })).listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

/** Sign in through the Auth emulator and return an ID token. */
async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const j = (await res.json()) as { idToken?: string; error?: { message: string } };
  if (!j.idToken) throw new Error(j.error?.message ?? 'sign-in failed');
  return j.idToken;
}

const makeInvite = async (kind: 'invite' | 'reset', fields: { userId?: string } = {}) => {
  const token = `t-${Math.random().toString(36).slice(2)}-${'x'.repeat(30)}`;
  await db.collection('invites').doc(token).set({
    kind,
    name: 'Jo Smith',
    email: '',
    userId: fields.userId ?? null,
    createdBy: 'owner',
    createdAt: Timestamp.now(),
    expiresAt: Timestamp.fromDate(addDays(new Date(), 14)),
    used: false,
  });
  return token;
};

let ownerToken = '';
let joUid = '';

describe('owner setup', () => {
  it('reports setup is needed', async () => {
    expect((await call('GET', '/status')).body).toMatchObject({ needsSetup: true, setupEnabled: true });
  });

  it('rejects a wrong setup code', async () => {
    const r = await call('POST', '/setup', { code: 'nope', name: 'Dean', email: 'dean@example.com', password: 'supersecret' });
    expect(r.status).toBe(403);
  });

  it('creates the owner once', async () => {
    const r = await call('POST', '/setup', { code: SETUP_CODE, name: 'Dean', email: 'dean@example.com', password: 'supersecret' });
    expect(r.status).toBe(200);
    ownerToken = await signIn('dean@example.com', 'supersecret');
    const { uid } = await auth.verifyIdToken(ownerToken);
    expect((await db.doc(`users/${uid}`).get()).data()).toMatchObject({ role: 'owner', disabled: false });
    expect((await db.doc(`workspaces/${uid}`).get()).data()?.version).toBe(1);
    expect((await call('POST', '/setup', { code: SETUP_CODE, name: 'X', email: 'x@example.com', password: 'supersecret' })).status).toBe(409);
    expect((await call('GET', '/status')).body.needsSetup).toBe(false);
  });
});

describe('invite links', () => {
  it('a trainer signs up through an invite, which then stops working', async () => {
    const token = await makeInvite('invite');
    expect((await call('GET', `/invites/${token}`)).body).toMatchObject({ kind: 'invite', name: 'Jo Smith' });
    const r = await call('POST', `/invites/${token}/accept`, { name: 'Jo Smith', email: 'jo@example.com', password: 'jo-password' });
    expect(r.status).toBe(200);
    joUid = (await auth.getUserByEmail('jo@example.com')).uid;
    expect((await db.doc(`users/${joUid}`).get()).data()).toMatchObject({ role: 'trainer', name: 'Jo Smith' });
    expect(JSON.parse((await db.doc(`workspaces/${joUid}`).get()).data()!.data).exercises.length).toBeGreaterThan(0);
    expect((await call('POST', `/invites/${token}/accept`, { name: 'Eve', email: 'eve@example.com', password: 'eve-password' })).status).toBe(404);
  });

  it('emails the admin when a trainer signs up', () => {
    const mail = sent.find((m) => m.subject.includes('New trainer signed up'));
    expect(mail).toMatchObject({ to: ADMIN });
    expect(mail!.lines.join(' ')).toContain('jo@example.com');
  });

  it('a failed sign-up leaves the link usable', async () => {
    const token = await makeInvite('invite');
    expect((await call('POST', `/invites/${token}/accept`, { name: 'Dup', email: 'jo@example.com', password: 'jo-password' })).status).toBe(409);
    expect((await call('POST', `/invites/${token}/accept`, { name: 'Kim', email: 'kim@example.com', password: 'short' })).status).toBe(400);
    expect((await call('POST', `/invites/${token}/accept`, { name: 'Kim', email: 'kim@example.com', password: 'kim-password' })).status).toBe(200);
  });

  it('reset links set a new password', async () => {
    const token = await makeInvite('reset', { userId: joUid });
    expect((await call('GET', `/invites/${token}`)).body).toMatchObject({ kind: 'reset', email: 'jo@example.com' });
    expect((await call('POST', `/invites/${token}/accept`, { password: 'new-jo-password' })).status).toBe(200);
    await expect(signIn('jo@example.com', 'jo-password')).rejects.toThrow();
    await signIn('jo@example.com', 'new-jo-password');
  });

  it('expired links are refused', async () => {
    const token = await makeInvite('invite');
    await db.doc(`invites/${token}`).update({ expiresAt: Timestamp.fromDate(addDays(new Date(), -1)) });
    expect((await call('GET', `/invites/${token}`)).status).toBe(404);
  });
});

describe('disabling trainers', () => {
  it('only the owner can disable, and the trainer can no longer sign in', async () => {
    const joToken = await signIn('jo@example.com', 'new-jo-password');
    expect((await call('POST', `/users/${joUid}/disabled`, { disabled: true }, joToken)).status).toBe(403);
    expect((await call('POST', `/users/${joUid}/disabled`, { disabled: true })).status).toBe(401);
    expect((await call('POST', `/users/${joUid}/disabled`, { disabled: true }, ownerToken)).status).toBe(200);
    expect((await db.doc(`users/${joUid}`).get()).data()?.disabled).toBe(true);
    await expect(signIn('jo@example.com', 'new-jo-password')).rejects.toThrow(/USER_DISABLED/);
    expect((await call('POST', `/users/${joUid}/disabled`, { disabled: false }, ownerToken)).status).toBe(200);
    await signIn('jo@example.com', 'new-jo-password');
  });

  it('the owner cannot be disabled', async () => {
    const { uid } = await auth.verifyIdToken(ownerToken);
    expect((await call('POST', `/users/${uid}/disabled`, { disabled: true }, ownerToken)).status).toBe(400);
  });
});

describe('client portal', () => {
  it('shows only that client and lets them book a class, logging it', async () => {
    const ref = db.doc(`workspaces/${joUid}`);
    const ws = (await ref.get()).data() as WorkspaceDoc;
    const data = JSON.parse(ws.data) as DB;
    const person = (id: string, firstName: string, notes = '') => ({ id, firstName, lastName: 'Test', email: '', phone: '', goals: '', notes, injuries: '', status: 'active' as const, createdAt: '' });
    data.clients.push(person('c1', 'Amy'), person('c2', 'Other', 'secret note'));
    const [cls] = createAppointments(data, { title: 'Bootcamp', type: 'class', start: addDays(new Date(), 2).toISOString(), durationMin: 45, location: '', capacity: 5, notes: '', clientIds: ['c2'], repeatWeeks: 1 });
    await ref.update({ data: JSON.stringify(data), version: ws.version + 1 });
    const token = 'p'.repeat(32);
    await db.doc(`portalLinks/${token}`).set({ workspaceId: joUid, clientId: 'c1', createdAt: Timestamp.now(), revoked: false });

    const view = await call('GET', `/portal/${token}`);
    expect(view.status).toBe(200);
    expect(view.body.db.clients.map((c: { id: string }) => c.id)).toEqual(['c1']);
    expect(JSON.stringify(view.body.db)).not.toContain('secret note');
    expect(JSON.stringify(view.body.db)).not.toContain('"c2"');

    const booked = await call('POST', `/portal/${token}/actions`, { type: 'book', appointmentId: cls.id });
    expect(booked.status).toBe(200);
    const after = (await ref.get()).data() as WorkspaceDoc;
    expect(after.version).toBe(ws.version + 2);
    expect(JSON.parse(after.data).appointments[0].bookings.map((b: { clientId: string }) => b.clientId)).toEqual(['c2', 'c1']);
    const log = await db.collection('activity').where('workspaceId', '==', joUid).where('actorRole', '==', 'client').get();
    expect(log.docs[0].data().message).toMatch(/Amy Test booked into Bootcamp/);

    expect((await call('POST', `/portal/${token}/actions`, { type: 'book', appointmentId: cls.id })).status).toBe(400);
  });

  it('revoked links and disabled trainers turn the portal off', async () => {
    const token = 'p'.repeat(32);
    await call('POST', `/users/${joUid}/disabled`, { disabled: true }, ownerToken);
    expect((await call('GET', `/portal/${token}`)).status).toBe(404);
    await call('POST', `/users/${joUid}/disabled`, { disabled: false }, ownerToken);
    await db.doc(`portalLinks/${token}`).update({ revoked: true });
    expect((await call('GET', `/portal/${token}`)).status).toBe(404);
    expect((await call('GET', '/portal/nope')).status).toBe(404);
  });
});

describe('change notifications', () => {
  it('a trainer saving changes emails the admin, not themselves', async () => {
    const joToken = await signIn('jo@example.com', 'new-jo-password');
    sent.length = 0;
    const r = await call('POST', '/notify', { messages: ['Added client Pat Lee', 'Settings saved'] }, joToken);
    expect(r.body).toMatchObject({ sent: 2 });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: ADMIN });
    expect(sent[0].subject).toContain('Jo Smith');
    expect(sent[0].lines.join('\n')).toContain('Added client Pat Lee');
  });

  it('the owner editing a trainer workspace emails that trainer', async () => {
    sent.length = 0;
    const r = await call('POST', '/notify', { workspaceId: joUid, messages: ['Created a new program'] }, ownerToken);
    expect(r.status).toBe(200);
    expect(sent).toEqual([expect.objectContaining({ to: 'jo@example.com' })]);
  });

  it('the owner editing their own workspace sends nothing', async () => {
    sent.length = 0;
    await call('POST', '/notify', { messages: ['Settings saved'] }, ownerToken);
    expect(sent).toHaveLength(0);
  });

  it('a trainer cannot notify about someone else’s workspace, and anonymous calls are refused', async () => {
    const joToken = await signIn('jo@example.com', 'new-jo-password');
    const { uid: ownerUid } = await auth.verifyIdToken(ownerToken);
    sent.length = 0;
    expect((await call('POST', '/notify', { workspaceId: ownerUid, messages: ['x'] }, joToken)).status).toBe(403);
    expect((await call('POST', '/notify', { messages: ['x'] })).status).toBe(401);
    expect(sent).toHaveLength(0);
  });
});
