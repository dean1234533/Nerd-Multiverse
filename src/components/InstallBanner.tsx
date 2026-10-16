// "Install the app" popup shown after signing in. Uses the browser's own
// install prompt where it exists (Chrome, Edge, Android) and otherwise shows
// step-by-step instructions for the platform (iPhone/iPad, Safari, Firefox…).
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

/** Call once at startup: the browser fires this event early, often before React mounts. */
export function capturePromptEvent() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    remember(INSTALLED_KEY);
    listeners.forEach((l) => l());
  });
}

const DISMISS_KEY = 'repminder-install-dismissed';
const INSTALLED_KEY = 'repminder-installed';
const SNOOZE_DAYS = 7;

function remember(key: string) {
  try {
    localStorage.setItem(key, String(Date.now()));
  } catch {
    // Storage unavailable; the popup may show again next time.
  }
}

function recently(key: string, days: number): boolean {
  try {
    const v = Number(localStorage.getItem(key));
    return !!v && Date.now() - v < days * 86_400_000;
  } catch {
    return false;
  }
}

/** Signing in should always offer the app again, even if it was dismissed before. */
export function resetInstallSnooze() {
  try {
    localStorage.removeItem(DISMISS_KEY);
  } catch {
    // ignore
  }
}

export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

type Platform = 'ios' | 'ios-other' | 'android' | 'mac-safari' | 'firefox' | 'samsung' | 'desktop';

function detect(): Platform {
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (iOS) return /CriOS|FxiOS|EdgiOS/.test(ua) ? 'ios-other' : 'ios';
  if (/SamsungBrowser/.test(ua)) return 'samsung';
  if (/Android/.test(ua)) return 'android';
  if (/Firefox/.test(ua)) return 'firefox';
  if (/Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua)) return 'mac-safari';
  return 'desktop';
}

const ShareIcon = () => (
  <svg className="inline-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-label="Share">
    <path d="M12 3v12M8 7l4-4 4 4M5 11v9h14v-9" />
  </svg>
);

function Steps({ platform }: { platform: Platform }) {
  switch (platform) {
    case 'ios':
      return (
        <ol>
          <li>
            Tap the <strong>Share</strong> button <ShareIcon /> at the bottom of Safari (top-right on iPad).
          </li>
          <li>
            Scroll down and tap <strong>Add to Home Screen</strong>.
          </li>
          <li>
            Tap <strong>Add</strong>. RepMinder will appear on your home screen like any other app.
          </li>
        </ol>
      );
    case 'ios-other':
      return (
        <ol>
          <li>
            Tap the <strong>Share</strong> button <ShareIcon /> in the address bar (Chrome: the ⋯ menu first).
          </li>
          <li>
            Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
          </li>
          <li>If you don't see that option, open this page in Safari and follow the same steps.</li>
        </ol>
      );
    case 'android':
      return (
        <ol>
          <li>
            Tap the <strong>⋮</strong> menu in the top-right of Chrome.
          </li>
          <li>
            Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>).
          </li>
          <li>
            Tap <strong>Install</strong> to confirm.
          </li>
        </ol>
      );
    case 'samsung':
      return (
        <ol>
          <li>
            Tap the <strong>☰</strong> menu at the bottom.
          </li>
          <li>
            Tap <strong>Add page to</strong> → <strong>Home screen</strong>.
          </li>
        </ol>
      );
    case 'mac-safari':
      return (
        <ol>
          <li>
            In the menu bar, choose <strong>File → Add to Dock…</strong>
          </li>
          <li>
            Click <strong>Add</strong>. RepMinder opens in its own window from your Dock.
          </li>
        </ol>
      );
    case 'firefox':
      return (
        <ol>
          <li>Firefox on desktop can't install web apps yet.</li>
          <li>
            Open this page in <strong>Chrome</strong> or <strong>Edge</strong> and click the install icon in the address bar, or bookmark it for now.
          </li>
        </ol>
      );
    default:
      return (
        <ol>
          <li>
            Click the <strong>install icon</strong> (a screen with a down arrow) at the right of the address bar.
          </li>
          <li>
            Or open the browser menu <strong>⋮</strong> → <strong>Cast, save and share</strong> → <strong>Install page as app</strong>.
          </li>
        </ol>
      );
  }
}

export default function InstallBanner() {
  const [, force] = useState(0);
  const [open, setOpen] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const platform = detect();

  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // Short delay so it pops up just after the dashboard appears.
    const t = setTimeout(() => {
      if (!isStandalone() && !recently(DISMISS_KEY, SNOOZE_DAYS) && !recently(INSTALLED_KEY, 3650)) setOpen(true);
    }, 1200);
    return () => {
      listeners.delete(l);
      clearTimeout(t);
    };
  }, []);

  if (!open || isStandalone()) return null;

  const close = () => {
    remember(DISMISS_KEY);
    setOpen(false);
  };

  const install = async () => {
    if (!deferred) return setShowSteps(true);
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    deferred = null;
    if (outcome === 'accepted') {
      remember(INSTALLED_KEY);
      setOpen(false);
    }
  };

  const native = !!deferred;

  return (
    <div className="install-pop" role="dialog" aria-labelledby="install-title">
      <button className="icon-btn install-close" onClick={close} aria-label="Not now">
        ×
      </button>
      <div className="install-head">
        <img src="/icons/icon-192.png" alt="" width={48} height={48} />
        <div>
          <strong id="install-title">Get the RepMinder app</strong>
          <div className="muted small">Install it on your {platform.startsWith('ios') || platform === 'android' || platform === 'samsung' ? 'phone' : 'computer'}: it opens full-screen from your home screen, loads faster and is always one tap away.</div>
        </div>
      </div>
      {native && !showSteps ? null : <Steps platform={platform} />}
      <div className="actions">
        <button className="btn ghost" onClick={close}>
          Not now
        </button>
        {native ? (
          <button className="btn primary" onClick={() => void install()}>
            Install app
          </button>
        ) : (
          <button className="btn primary" onClick={close}>
            Got it
          </button>
        )}
      </div>
    </div>
  );
}
