import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth';
import { api } from '../api';
import { useAuth } from '../auth';
import { auth, friendlyError } from '../firebase';
import { Field } from '../components/ui';
import { resetInstallSnooze } from '../components/InstallBanner';

function AuthCard({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card card">
        <div className="brand auth-brand">
          <img src="/icons/icon-192.png" alt="" width={40} height={40} className="brand-logo" />
          <div className="brand-name">RepMinder</div>
        </div>
        <h1>{title}</h1>
        {sub && <p className="muted">{sub}</p>}
        {children}
      </div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function Login() {
  const { notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sent, setSent] = useState('');
  const { busy, error, run } = useSubmit();
  return (
    <AuthCard title="Sign in" sub="This app is private. Accounts are created by invitation only.">
      {notice && <p className="error">{notice}</p>}
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            resetInstallSnooze();
            await signInWithEmailAndPassword(auth, email.trim(), password);
          });
        }}
      >
        <Field label="Email">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        {sent ? (
          <p className="muted small center">{sent}</p>
        ) : (
          <button
            type="button"
            className="link-btn"
            onClick={() => {
              if (!email.trim()) return void run(async () => Promise.reject(new Error('Enter your email first, then tap "Forgot password?"')));
              void run(async () => {
                await sendPasswordResetEmail(auth, email.trim()).catch((e) => {
                  if ((e as { code?: string }).code !== 'auth/user-not-found') throw e;
                });
                setSent(`If ${email.trim()} has an account, a reset email is on its way. Check your spam folder too.`);
              });
            }}
          >
            Forgot password?
          </button>
        )}
      </form>
    </AuthCard>
  );
}

function PasswordFields({ password, setPassword }: { password: string; setPassword: (s: string) => void }) {
  const [confirm, setConfirm] = useState('');
  return (
    <>
      <Field label="Password" hint="At least 8 characters">
        <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Confirm password">
        <input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            e.target.setCustomValidity(e.target.value === password ? '' : 'Passwords do not match');
          }}
        />
      </Field>
    </>
  );
}

export function Setup() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();
  useEffect(() => {
    if (user) nav('/', { replace: true });
  }, [user, nav]);
  return (
    <AuthCard title="Create your owner account" sub="This is your private login. You'll invite trainers from the Team page afterwards. This can only be done once.">
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api<{ email: string }>('POST', '/setup', { code, name, email, password });
            resetInstallSnooze();
            await signInWithEmailAndPassword(auth, r.email, password);
            nav('/', { replace: true });
          });
        }}
      >
        <Field label="Setup code" hint="The SETUP_CODE you set in Vercel">
          <input required value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" />
        </Field>
        <Field label="Your name">
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <PasswordFields password={password} setPassword={setPassword} />
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          Create account
        </button>
      </form>
    </AuthCard>
  );
}

export function AcceptInvite() {
  const { token } = useParams();
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [invite, setInvite] = useState<{ kind: 'invite' | 'reset'; name: string; email: string } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useSubmit();

  useEffect(() => {
    api<{ kind: 'invite' | 'reset'; name: string; email: string }>('GET', `/invites/${token}`)
      .then((i) => {
        setInvite(i);
        setName(i.name);
        setEmail(i.email);
      })
      .catch((e) => setLoadError(e.message));
  }, [token]);

  if (loadError) return <AuthCard title="Link not valid" sub={loadError}>{null}</AuthCard>;
  if (!invite) return <div className="splash">Loading…</div>;
  if (user)
    return (
      <AuthCard title="You're already signed in" sub={`Signed in as ${user.email}. Sign out first to use this link.`}>
        <button className="btn primary block" onClick={() => void logout().then(() => nav(`/invite/${token}`))}>
          Sign out
        </button>
      </AuthCard>
    );

  const reset = invite.kind === 'reset';
  return (
    <AuthCard title={reset ? 'Choose a new password' : "You're invited to RepMinder"} sub={reset ? `For ${invite.email}` : 'Set up your trainer account to manage your clients, sessions and programs.'}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await api<{ email: string }>('POST', `/invites/${token}/accept`, reset ? { password } : { name, email, password });
            resetInstallSnooze();
            await signInWithEmailAndPassword(auth, r.email, password);
            nav('/', { replace: true });
          });
        }}
      >
        {!reset && (
          <>
            <Field label="Your name">
              <input required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Email">
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
          </>
        )}
        <PasswordFields password={password} setPassword={setPassword} />
        {error && <p className="error">{error}</p>}
        <button className="btn primary block" disabled={busy}>
          {reset ? 'Save password' : 'Create my account'}
        </button>
      </form>
    </AuthCard>
  );
}
