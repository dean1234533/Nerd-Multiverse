// Security-rule tests. Run with `npm run test:firebase` (starts the emulators).
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';

let env: RulesTestEnvironment;

const OWNER = 'owner-uid';
const JO = 'jo-uid';
const SAM = 'sam-uid';
const TOKEN = 'x'.repeat(32);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-repminder',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const user = (name: string, role: string, disabled = false) => ({ name, email: `${name}@x.com`, role, disabled, createdAt: '2026-01-01' });
    await setDoc(doc(db, 'users', OWNER), user('Dean', 'owner'));
    await setDoc(doc(db, 'users', JO), user('Jo', 'trainer'));
    await setDoc(doc(db, 'users', SAM), user('Sam', 'trainer', true));
    for (const id of [OWNER, JO, SAM]) await setDoc(doc(db, 'workspaces', id), { data: '{}', version: 3, updatedAt: Timestamp.now(), updatedBy: id });
    await setDoc(doc(db, 'portalLinks', TOKEN), { workspaceId: JO, clientId: 'c1', createdAt: Timestamp.now(), revoked: false });
    await setDoc(doc(db, 'meta', 'setup'), { ownerUid: OWNER });
  });
});

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
const save = (version: number, by: string) => ({ data: '{"x":1}', version, updatedAt: serverTimestamp(), updatedBy: by });
const act = (workspaceId: string, actorUid: string, actorName: string, actorRole: string) => ({
  workspaceId,
  actorUid,
  actorName,
  actorRole,
  message: 'Did a thing',
  createdAt: serverTimestamp(),
});
const invite = (by: string) => ({ kind: 'invite', name: '', email: '', userId: null, createdBy: by, createdAt: serverTimestamp(), expiresAt: Timestamp.now(), used: false });

describe('workspaces', () => {
  it('trainers read and save only their own workspace', async () => {
    await assertSucceeds(getDoc(doc(as(JO), 'workspaces', JO)));
    await assertFails(getDoc(doc(as(JO), 'workspaces', OWNER)));
    await assertSucceeds(updateDoc(doc(as(JO), 'workspaces', JO), save(4, JO)));
    await assertFails(updateDoc(doc(as(JO), 'workspaces', OWNER), save(4, JO)));
  });

  it('the owner can read, list and edit every workspace', async () => {
    await assertSucceeds(getDoc(doc(as(OWNER), 'workspaces', JO)));
    await assertSucceeds(getDocs(collection(as(OWNER), 'workspaces')));
    await assertSucceeds(updateDoc(doc(as(OWNER), 'workspaces', JO), save(4, OWNER)));
    await assertFails(getDocs(collection(as(JO), 'workspaces')));
  });

  it('a save must bump the version by one and name the writer', async () => {
    await assertFails(updateDoc(doc(as(JO), 'workspaces', JO), save(3, JO)));
    await assertFails(updateDoc(doc(as(JO), 'workspaces', JO), save(9, JO)));
    await assertFails(updateDoc(doc(as(JO), 'workspaces', JO), save(4, OWNER)));
    await assertFails(updateDoc(doc(as(JO), 'workspaces', JO), { ...save(4, JO), extra: true }));
  });

  it('nobody can create or delete workspaces from the app', async () => {
    await assertFails(setDoc(doc(as(OWNER), 'workspaces', 'new'), save(1, OWNER)));
    await assertFails(deleteDoc(doc(as(OWNER), 'workspaces', JO)));
  });

  it('disabled and signed-out users get nothing', async () => {
    await assertFails(getDoc(doc(as(SAM), 'workspaces', SAM)));
    await assertFails(updateDoc(doc(as(SAM), 'workspaces', SAM), save(4, SAM)));
    await assertFails(getDoc(doc(as(null), 'workspaces', JO)));
  });
});

describe('users', () => {
  it('people can read their own profile; only the owner lists everyone', async () => {
    await assertSucceeds(getDoc(doc(as(JO), 'users', JO)));
    await assertFails(getDoc(doc(as(JO), 'users', OWNER)));
    await assertFails(getDocs(collection(as(JO), 'users')));
    await assertSucceeds(getDocs(collection(as(OWNER), 'users')));
  });

  it('users may only update their last-seen time', async () => {
    await assertSucceeds(updateDoc(doc(as(JO), 'users', JO), { lastSeenAt: new Date().toISOString() }));
    await assertFails(updateDoc(doc(as(JO), 'users', JO), { role: 'owner' }));
    await assertFails(updateDoc(doc(as(JO), 'users', JO), { name: 'Someone else', lastSeenAt: 'x' }));
    await assertFails(updateDoc(doc(as(OWNER), 'users', JO), { disabled: true }));
    await assertFails(setDoc(doc(as(JO), 'users', 'someone-new'), { name: 'X', role: 'owner' }));
  });
});

describe('activity log', () => {
  it('entries must be in the writer’s own name and only the owner can read them', async () => {
    await assertSucceeds(addDoc(collection(as(JO), 'activity'), act(JO, JO, 'Jo', 'trainer')));
    await assertSucceeds(addDoc(collection(as(OWNER), 'activity'), act(JO, OWNER, 'Dean', 'owner')));
    await assertFails(addDoc(collection(as(JO), 'activity'), act(JO, JO, 'Dean', 'trainer')));
    await assertFails(addDoc(collection(as(JO), 'activity'), act(JO, JO, 'Jo', 'owner')));
    await assertFails(addDoc(collection(as(JO), 'activity'), act(JO, OWNER, 'Jo', 'trainer')));
    await assertFails(addDoc(collection(as(JO), 'activity'), act(OWNER, JO, 'Jo', 'trainer')));
    await assertFails(getDocs(collection(as(JO), 'activity')));
    await assertSucceeds(getDocs(collection(as(OWNER), 'activity')));
    // Push subscriptions are server-only.
    await assertFails(getDocs(collection(as(OWNER), 'pushSubscriptions')));
    // A trainer can read their own workspace's log (the notification bell), not anyone else's.
    await assertSucceeds(getDocs(query(collection(as(JO), 'activity'), where('workspaceId', '==', JO))));
    await assertFails(getDocs(query(collection(as(JO), 'activity'), where('workspaceId', '==', OWNER))));
    await assertFails(getDocs(query(collection(as(SAM), 'activity'), where('workspaceId', '==', SAM))));
  });
});

describe('invites', () => {
  it('only the owner can create, read and revoke invite links', async () => {
    await assertSucceeds(setDoc(doc(as(OWNER), 'invites', TOKEN), invite(OWNER)));
    await assertSucceeds(getDoc(doc(as(OWNER), 'invites', TOKEN)));
    await assertFails(getDoc(doc(as(JO), 'invites', TOKEN)));
    await assertFails(setDoc(doc(as(JO), 'invites', 'y'.repeat(32)), invite(JO)));
    await assertFails(getDoc(doc(as(null), 'invites', TOKEN)));
    await assertFails(setDoc(doc(as(OWNER), 'invites', 'short'), invite(OWNER)));
    await assertFails(setDoc(doc(as(OWNER), 'invites', 'z'.repeat(32)), { ...invite(OWNER), used: true }));
    await assertSucceeds(deleteDoc(doc(as(OWNER), 'invites', TOKEN)));
  });
});

describe('portal links', () => {
  const link = (workspaceId: string) => ({ workspaceId, clientId: 'c9', createdAt: serverTimestamp(), revoked: false });

  it('trainers manage links for their own clients only', async () => {
    await assertSucceeds(setDoc(doc(as(JO), 'portalLinks', 'a'.repeat(32)), link(JO)));
    await assertFails(setDoc(doc(as(JO), 'portalLinks', 'b'.repeat(32)), link(OWNER)));
    await assertSucceeds(setDoc(doc(as(OWNER), 'portalLinks', 'c'.repeat(32)), link(JO)));
    await assertSucceeds(getDocs(query(collection(as(JO), 'portalLinks'), where('workspaceId', '==', JO), where('clientId', '==', 'c1'), where('revoked', '==', false))));
    await assertFails(getDocs(query(collection(as(JO), 'portalLinks'), where('workspaceId', '==', OWNER))));
    await assertSucceeds(updateDoc(doc(as(JO), 'portalLinks', TOKEN), { revoked: true }));
  });

  it('links cannot be re-pointed or read without signing in', async () => {
    await assertFails(updateDoc(doc(as(JO), 'portalLinks', TOKEN), { clientId: 'c2' }));
    await assertFails(getDoc(doc(as(null), 'portalLinks', TOKEN)));
  });
});

describe('server-only data', () => {
  it('meta documents are off-limits', async () => {
    await assertFails(getDoc(doc(as(OWNER), 'meta', 'setup')));
    await assertFails(setDoc(doc(as(OWNER), 'meta', 'setup'), { ownerUid: JO }));
  });
});
