import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

const env = import.meta.env;

export const firebaseConfigured = !!(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID);

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'missing',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-repminder',
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const firestore = getFirestore(app);

if (env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
}

/** Unguessable id for invite and portal links (the document id is the secret). */
export function secretToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Wrong email or password',
  'auth/wrong-password': 'Wrong email or password',
  'auth/user-not-found': 'Wrong email or password',
  'auth/invalid-email': 'Enter a valid email address',
  'auth/user-disabled': 'This account has been disabled. Contact the owner.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': "Can't reach the server. Check your connection.",
  'permission-denied': "You don't have permission to do that.",
  unavailable: "Can't reach the server. Check your connection.",
};

export function friendlyError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  return e instanceof Error ? e.message : String(e);
}
