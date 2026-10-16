import { useRef, useState } from 'react';
import { useStore } from '../store';
import type { DB, Settings as S } from '../types';
import { emptyDB, seedDB } from '../seed';
import { Field } from '../components/ui';

export default function Settings() {
  const { db, update, replace, toast } = useStore();
  const [s, setS] = useState<S>(db.settings);
  const file = useRef<HTMLInputElement>(null);
  const set = <K extends keyof S>(k: K, v: S[K]) => setS({ ...s, [k]: v });

  const exportData = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `repminder-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importData = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as DB;
      if (data?.version !== 1 || !Array.isArray(data.clients)) throw new Error('bad file');
      replace({ ...emptyDB(), ...data }, 'Restored a backup');
      setS({ ...emptyDB().settings, ...data.settings });
      toast('Backup restored');
    } catch {
      toast('That file is not a RepMinder backup', 'error');
    }
  };

  return (
    <div className="page narrow-page">
      <header className="page-head">
        <h1>Settings</h1>
      </header>
      <form
        className="card form"
        onSubmit={(e) => {
          e.preventDefault();
          if (s.dayEndHour <= s.dayStartHour) return toast('Calendar end must be after start', 'error');
          update((d) => void (d.settings = s), 'Settings saved');
        }}
      >
        <h2>Business & branding</h2>
        <div className="row">
          <Field label="Business name">
            <input value={s.businessName} onChange={(e) => set('businessName', e.target.value)} />
          </Field>
          <Field label="Trainer name">
            <input value={s.trainerName} onChange={(e) => set('trainerName', e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Brand colour" hint="Used across the app and the client portal">
            <input type="color" value={s.brandColor} onChange={(e) => set('brandColor', e.target.value)} />
          </Field>
          <Field label="Currency">
            <select value={s.currency} onChange={(e) => set('currency', e.target.value)}>
              {['GBP', 'USD', 'EUR', 'AUD', 'NZD', 'CAD', 'ZAR'].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Tax rate (%)">
            <input type="number" min={0} step="0.1" value={s.taxRatePct} onChange={(e) => set('taxRatePct', +e.target.value)} />
          </Field>
        </div>
        <h2>Booking policy</h2>
        <div className="row">
          <Field label="Late cancellation window (hours)" hint="Cancelling inside this window still uses a credit">
            <input type="number" min={0} value={s.lateCancelHours} onChange={(e) => set('lateCancelHours', +e.target.value)} />
          </Field>
          <Field label="Default session length (min)">
            <input type="number" min={5} step={5} value={s.defaultSessionMin} onChange={(e) => set('defaultSessionMin', +e.target.value)} />
          </Field>
        </div>
        <div className="row">
          <Field label="Calendar starts (hour)">
            <input type="number" min={0} max={23} value={s.dayStartHour} onChange={(e) => set('dayStartHour', +e.target.value)} />
          </Field>
          <Field label="Calendar ends (hour)">
            <input type="number" min={1} max={24} value={s.dayEndHour} onChange={(e) => set('dayEndHour', +e.target.value)} />
          </Field>
        </div>
        <div className="actions">
          <button className="btn primary">Save settings</button>
        </div>
      </form>

      <section className="card">
        <h2>Your data</h2>
        <p className="muted">Everything is saved to your account automatically. You can also download a backup file, or restore one.</p>
        <div className="actions wrap">
          <button className="btn ghost" onClick={exportData}>
            Export backup
          </button>
          <button className="btn ghost" onClick={() => file.current?.click()}>
            Import backup
          </button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && importData(e.target.files[0])} />
          <button
            className="btn ghost"
            onClick={() => {
              if (!confirm('Replace all data with the demo business?')) return;
              const d = seedDB();
              replace(d, 'Replaced all data with the demo business');
              setS(d.settings);
              toast('Demo data loaded');
            }}
          >
            Load demo data
          </button>
          <button
            className="btn ghost danger"
            onClick={() => {
              if (!confirm('Erase everything and start with an empty account? This cannot be undone.')) return;
              const demo = seedDB();
              const d = { ...emptyDB(), exercises: demo.exercises, foods: demo.foods, products: demo.products };
              replace(d, 'Erased all data and started fresh');
              setS(d.settings);
              toast('Started fresh (exercise and food libraries kept)');
            }}
          >
            Start fresh
          </button>
        </div>
      </section>
    </div>
  );
}
