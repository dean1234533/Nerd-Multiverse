// Push notifications, sent with standard Web Push (VAPID). Works in Chrome,
// Edge, Firefox, Android, and Safari on iPhone/iPad once the app is added to
// the Home Screen. Set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY to turn it on;
// without them, nothing is pushed and the in-app activity log still works.
import webpush from 'web-push';

export interface PushPayload {
  title: string;
  body: string;
  /** Opened when the notification is tapped. */
  url?: string;
}

export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Rejects with an error carrying `statusCode` (404/410 means the subscription is gone). */
export type PushSender = (sub: PushSub, payload: PushPayload) => Promise<void>;

export interface PushService {
  publicKey: string;
  send: PushSender;
}

export function webPushService(env: NodeJS.ProcessEnv = process.env): PushService | undefined {
  const publicKey = env.VAPID_PUBLIC_KEY;
  const privateKey = env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return undefined;
  const subject = env.VAPID_SUBJECT || 'mailto:admin@example.com';
  return {
    publicKey,
    send: async (sub, payload) => {
      await webpush.sendNotification(sub, JSON.stringify(payload), { vapidDetails: { subject, publicKey, privateKey }, TTL: 86_400, urgency: 'high' });
    },
  };
}
