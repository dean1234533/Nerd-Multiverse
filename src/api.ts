export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T = Record<string, unknown>>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection.");
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, typeof data.error === 'string' ? data.error : `Request failed (${res.status})`, data);
  return data as T;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'owner' | 'trainer';
  createdAt: string;
  disabled: boolean;
  lastSeenAt: string | null;
}

/** Absolute link into the app for sharing (hash routes). */
export const appLink = (path: string) => `${window.location.origin}/#${path}`;

/** Share via the OS share sheet when available, otherwise copy. Returns what happened. */
export async function shareLink(url: string, title: string, text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    try {
      await navigator.share({ url, title, text });
      return 'shared';
    } catch {
      // Cancelled; fall back to copying.
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    window.prompt('Copy this link:', url);
    return 'failed';
  }
}
