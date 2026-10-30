import { useEffect, useRef, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { firestore } from '../firebase';
import { useAuth } from '../auth';
import { useToast } from '../store';
import type { ActivityDoc } from '../firestoreModel';

interface Item extends Omit<ActivityDoc, 'createdAt'> {
  id: string;
  at: Date | null;
}

const seenKey = (uid: string) => `repminder-notif-seen-${uid}`;

function ago(d: Date | null): string {
  if (!d) return 'just now';
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * The signed-in user's own workspace feed. Changes made by someone else
 * (the owner, or a client through their portal) count as unread and pop up
 * as a toast the moment they happen.
 */
export default function NotificationBell({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const first = useRef(true);
  const uid = user?.id ?? '';

  useEffect(() => {
    try {
      setSeen(Number(localStorage.getItem(seenKey(uid))) || 0);
    } catch {
      setSeen(0);
    }
  }, [uid]);

  useEffect(() => {
    first.current = true;
    const q = query(collection(firestore, 'activity'), where('workspaceId', '==', workspaceId), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(
      q,
      (snap) => {
        if (!first.current) {
          for (const c of snap.docChanges()) {
            const a = c.doc.data({ serverTimestamps: 'estimate' }) as ActivityDoc;
            if (c.type === 'added' && a.actorUid !== uid) toast(`${a.actorName}: ${a.message}`);
          }
        }
        first.current = false;
        setItems(
          snap.docs.map((d) => {
            const a = d.data({ serverTimestamps: 'estimate' }) as ActivityDoc;
            return { ...a, id: d.id, at: (a.createdAt as Timestamp | null)?.toDate() ?? null };
          }),
        );
      },
      () => undefined,
    );
  }, [workspaceId, uid, toast]);

  const unread = items.filter((i) => i.actorUid !== uid && (i.at?.getTime() ?? Date.now()) > seen).length;

  const toggle = () => {
    if (!open) return setOpen(true);
    const now = Date.now();
    setSeen(now);
    try {
      localStorage.setItem(seenKey(uid), String(now));
    } catch {
      // Unread state just won't persist; fine.
    }
    setOpen(false);
  };

  return (
    <div className="notif">
      <button className="btn small ghost notif-btn" onClick={toggle} aria-expanded={open} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
        🔔{unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel card" role="dialog" aria-label="Notifications">
          <strong>Recent changes</strong>
          {items.length === 0 ? (
            <p className="muted small">Nothing yet. Changes to your dashboard will show here.</p>
          ) : (
            <ul className="list">
              {items.map((i) => (
                <li key={i.id} className={i.actorUid !== uid && (i.at?.getTime() ?? Date.now()) > seen ? 'notif-unread' : ''}>
                  <div className="small">
                    <strong>{i.actorUid === uid ? 'You' : i.actorName}</strong> · {i.message}
                  </div>
                  <div className="muted small">{ago(i.at)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
