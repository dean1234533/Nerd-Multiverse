import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * Credentials come from FIREBASE_SERVICE_ACCOUNT: the service-account JSON
 * from Firebase console → Project settings → Service accounts, pasted as
 * is or base64-encoded. With emulators running, only a project id is needed.
 */
function init(): App {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const sa = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
    return initializeApp({ credential: cert({ projectId: sa.project_id, clientEmail: sa.client_email, privateKey: sa.private_key }), projectId: sa.project_id });
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return initializeApp({ projectId: process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'demo-repminder' });
  }
  throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
}

export function admin() {
  const app = init();
  return { auth: getAuth(app), db: getFirestore(app) };
}
