// Email notifications, sent through Resend's HTTP API (no extra dependency).
// Set RESEND_API_KEY to turn them on; without it, notifications are skipped
// and the in-app activity log still works.

export interface Mail {
  to: string;
  subject: string;
  lines: string[];
  /** Where the "Open RepMinder" button goes. */
  link?: string;
}

export type Mailer = (mail: Mail) => Promise<void>;

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function renderMail({ subject, lines, link }: Pick<Mail, 'subject' | 'lines' | 'link'>): { html: string; text: string } {
  const body = lines.map((l) => `<p style="margin:6px 0;color:#333">${esc(l)}</p>`).join('');
  const button = link ? `<p style="margin-top:20px"><a href="${esc(link)}" style="background:#111;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open RepMinder</a></p>` : '';
  return {
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #eee;border-radius:12px"><h2 style="margin:0 0 12px">${esc(subject)}</h2>${body}${button}</div>`,
    text: [subject, '', ...lines, ...(link ? ['', link] : [])].join('\n'),
  };
}

/** A mailer backed by Resend, or undefined when RESEND_API_KEY isn't set. */
export function resendMailer(env: NodeJS.ProcessEnv = process.env): Mailer | undefined {
  const key = env.RESEND_API_KEY;
  if (!key) return undefined;
  const from = env.NOTIFY_FROM || 'RepMinder <onboarding@resend.dev>';
  return async (mail) => {
    const { html, text } = renderMail(mail);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from, to: [mail.to], subject: mail.subject.slice(0, 200), html, text }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  };
}
