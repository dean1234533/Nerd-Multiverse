import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { openDatabase } from './db';
import { createApp } from './app';
import type { DB } from '../src/types';
import { createAppointments } from '../src/logic';

let server: Server;
let base = '';

beforeAll(async () => {
  const { app, bootstrap } = createApp(openDatabase(':memory:'));
  setupToken = (await bootstrap({}))!;
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

let setupToken = '';

/** Minimal cookie-jar client. */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
}

const owner = client();
const trainer = client();
const anon = client();

describe('owner setup and auth', () => {
  it('reports that setup is needed', async () => {
    expect((await anon('GET', '/status')).body.needsSetup).toBe(true);
  });

  it('rejects setup without the token', async () => {
    const r = await anon('POST', '/setup', { token: 'nope', name: 'Dean', email: 'dean@example.com', password: 'longpassword' });
    expect(r.status).toBe(404);
  });

  it('creates the owner with the setup link, once', async () => {
    const r = await owner('POST', '/setup', { token: setupToken, name: 'Dean', email: 'dean@example.com', password: 'longpassword' });
    expect(r.status).toBe(200);
    expect(r.body.user.role).toBe('owner');
    const again = await anon('POST', '/setup', { token: setupToken, name: 'X', email: 'x@example.com', password: 'longpassword' });
    expect(again.status).toBe(409);
  });

  it('logs in only with the right password', async () => {
    expect((await anon('POST', '/login', { email: 'dean@example.com', password: 'wrongpassword' })).status).toBe(401);
    const c = client();
    expect((await c('POST', '/login', { email: 'DEAN@example.com', password: 'longpassword' })).status).toBe(200);
    expect((await c('GET', '/me')).body.user.name).toBe('Dean');
  });

  it('blocks protected routes when signed out', async () => {
    expect((await anon('GET', '/me')).status).toBe(401);
    expect((await anon('GET', '/team')).status).toBe(401);
  });
});

describe('invites, workspaces and oversight', () => {
  let trainerWs = '';
  let trainerId = '';

  it('owner invites a trainer who signs up through the link', async () => {
    const inv = await owner('POST', '/invites', { name: 'Jo Trainer' });
    expect(inv.status).toBe(200);
    expect((await anon('GET', `/invites/${inv.body.token}`)).body).toMatchObject({ kind: 'invite', name: 'Jo Trainer' });
    const r = await trainer('POST', `/invites/${inv.body.token}/accept`, { name: 'Jo Trainer', email: 'jo@example.com', password: 'jo-password' });
    expect(r.body.user.role).toBe('trainer');
    expect((await anon('POST', `/invites/${inv.body.token}/accept`, { name: 'Eve', email: 'eve@example.com', password: 'eve-password' })).status).toBe(404);
    const me = await trainer('GET', '/me');
    trainerWs = me.body.workspaceId;
    trainerId = me.body.user.id;
  });

  it('trainers cannot use owner-only routes or other workspaces', async () => {
    expect((await trainer('GET', '/team')).status).toBe(403);
    expect((await trainer('POST', '/invites', {})).status).toBe(403);
    const ownerWs = (await owner('GET', '/me')).body.workspaceId;
    expect((await trainer('GET', `/workspaces/${ownerWs}`)).status).toBe(404);
  });

  it('saves trainer changes with versioning and logs activity', async () => {
    const ws = await trainer('GET', `/workspaces/${trainerWs}`);
    const db = ws.body.db as DB;
    db.clients.push({ id: 'c1', firstName: 'Sam', lastName: 'Lee', email: '', phone: '', goals: '', notes: '', injuries: '', status: 'active', createdAt: new Date().toISOString() });
    const saved = await trainer('PUT', `/workspaces/${trainerWs}`, { db, baseVersion: ws.body.version, messages: ['Added client Sam Lee'] });
    expect(saved.body.version).toBe(ws.body.version + 1);
    const stale = await trainer('PUT', `/workspaces/${trainerWs}`, { db, baseVersion: ws.body.version, messages: [] });
    expect(stale.status).toBe(409);
    expect(stale.body.db.clients).toHaveLength(1);
  });

  it('owner sees every trainer, their stats and their activity, and can edit their data', async () => {
    const team = await owner('GET', '/team');
    const jo = team.body.trainers.find((t: { email: string }) => t.email === 'jo@example.com');
    expect(jo.stats.clients).toBe(1);
    const act = await owner('GET', `/activity?workspace=${trainerWs}`);
    expect(act.body.items[0]).toMatchObject({ actorName: 'Jo Trainer', message: 'Added client Sam Lee' });

    const ws = await owner('GET', `/workspaces/${trainerWs}`);
    ws.body.db.clients[0].notes = 'Checked by owner';
    const saved = await owner('PUT', `/workspaces/${trainerWs}`, { db: ws.body.db, baseVersion: ws.body.version, messages: ['Updated Sam Lee'] });
    expect(saved.status).toBe(200);
    const act2 = await owner('GET', `/activity?workspace=${trainerWs}`);
    expect(act2.body.items[0].actorName).toBe('Dean (owner)');
  });

  it('disabling a trainer signs them out and blocks login', async () => {
    await owner('PATCH', `/users/${trainerId}`, { disabled: true });
    expect((await trainer('GET', '/me')).status).toBe(401);
    expect((await anon('POST', '/login', { email: 'jo@example.com', password: 'jo-password' })).status).toBe(403);
    await owner('PATCH', `/users/${trainerId}`, { disabled: false });
  });

  it('reset links let a trainer set a new password', async () => {
    const r = await owner('POST', `/users/${trainerId}/reset`, {});
    const c = client();
    expect((await c('POST', `/invites/${r.body.token}/accept`, { password: 'new-password' })).status).toBe(200);
    expect((await anon('POST', '/login', { email: 'jo@example.com', password: 'new-password' })).status).toBe(200);
  });

  it('client portal links expose only that client and allow booking classes', async () => {
    const ws = await owner('GET', `/workspaces/${trainerWs}`);
    const db = ws.body.db as DB;
    db.clients.push({ id: 'c2', firstName: 'Other', lastName: 'Person', email: '', phone: '', goals: '', notes: 'secret', injuries: '', status: 'active', createdAt: '' });
    const start = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const [cls] = createAppointments(db, { title: 'Bootcamp', type: 'class', start, durationMin: 45, location: '', capacity: 5, notes: '', clientIds: ['c2'], repeatWeeks: 1 });
    await owner('PUT', `/workspaces/${trainerWs}`, { db, baseVersion: ws.body.version, messages: [] });

    const link = await owner('POST', `/workspaces/${trainerWs}/portal-links`, { clientId: 'c1' });
    const p = await anon('GET', `/portal/${link.body.token}`);
    expect(p.body.db.clients.map((c: { id: string }) => c.id)).toEqual(['c1']);
    expect(JSON.stringify(p.body.db)).not.toContain('secret');
    expect(JSON.stringify(p.body.db)).not.toContain('"c2"');

    const booked = await anon('POST', `/portal/${link.body.token}/actions`, { type: 'book', appointmentId: cls.id });
    expect(booked.status).toBe(200);
    const act = await owner('GET', `/activity?workspace=${trainerWs}`);
    expect(act.body.items[0].message).toMatch(/Sam Lee booked into Bootcamp/);
    expect((await anon('GET', '/portal/not-a-token')).status).toBe(404);
  });
});
