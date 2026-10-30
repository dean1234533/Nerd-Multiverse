// Browser side of push notifications: ask permission, subscribe this device
// through the service worker, and register the subscription with the server.
import { api } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'off' | 'on' | 'unavailable';

const isIos = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyBytes(b64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  return Promise.race([navigator.serviceWorker.ready, new Promise<undefined>((r) => setTimeout(() => r(undefined), 4000))]);
}

export async function pushState(): Promise<PushState> {
  // iPhone/iPad only allow push for apps added to the Home Screen.
  if (isIos() && !standalone()) return 'needs-install';
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await registration();
  if (!reg) return 'unavailable'; // service worker only runs in the production build
  return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off';
}

async function send(sub: PushSubscription) {
  await api('POST', '/push/subscribe', sub.toJSON());
}

/** Ask permission (must be called from a click) and subscribe this device. */
export async function enablePush(): Promise<PushState> {
  const { publicKey } = await api<{ publicKey: string | null }>('GET', '/push/key');
  if (!publicKey) throw new Error('Push notifications are not set up on the server yet (missing VAPID keys).');
  if ((await Notification.requestPermission()) !== 'granted') return pushState();
  const reg = await registration();
  if (!reg) throw new Error('Push needs the installed app build. Try again on the live site.');
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await send(sub);
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) {
    await api('POST', '/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return pushState();
}

/** On sign-in, re-register this device for whoever is signed in now (a shared browser may change hands). */
export async function syncPush(): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const sub = await (await registration())?.pushManager.getSubscription();
  if (sub) await send(sub).catch(() => undefined);
}
