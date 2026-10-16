import { useEffect, type ReactNode } from 'react';
import { initials } from '../utils';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function Avatar({ first, last, size = 36 }: { first: string; last: string; size?: number }) {
  // Stable hue per name so each client keeps their colour.
  const hue = [...(first + last)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 7);
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 55% 88%)`, color: `hsl(${hue} 50% 28%)` }}>
      {initials(first, last)}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'brand' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: [T, string][] }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label]) => (
        <button key={k} role="tab" aria-selected={value === k} className={value === k ? 'active' : ''} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Small dependency-free line chart for measurement trends. */
export function LineChart({ points, unit, height = 160 }: { points: { x: Date; y: number }[]; unit: string; height?: number }) {
  if (points.length < 2) return <Empty>Need at least two measurements to chart a trend.</Empty>;
  const w = 760;
  const pad = { l: 40, r: 12, t: 12, b: 24 };
  const xs = points.map((p) => p.x.getTime());
  const ys = points.map((p) => p.y);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  let [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  if (y0 === y1) [y0, y1] = [y0 - 1, y1 + 1];
  const span = y1 - y0;
  y0 -= span * 0.1;
  y1 += span * 0.1;
  const sx = (x: number) => pad.l + ((x - x0) / (x1 - x0 || 1)) * (w - pad.l - pad.r);
  const sy = (y: number) => pad.t + (1 - (y - y0) / (y1 - y0)) * (height - pad.t - pad.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x.getTime()).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const ticks = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1];
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`Trend in ${unit}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={sy(t)} y2={sy(t)} className="grid" />
          <text x={pad.l - 6} y={sy(t) + 4} textAnchor="end" className="axis">
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <text x={pad.l} y={height - 6} className="axis">
        {points[0].x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
      </text>
      <text x={w - pad.r} y={height - 6} textAnchor="end" className="axis">
        {points[points.length - 1].x.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
      </text>
      <path d={d} className="line" />
      {points.map((p) => (
        <circle key={p.x.getTime()} cx={sx(p.x.getTime())} cy={sy(p.y)} r={3.5} className="dot">
          <title>
            {p.x.toLocaleDateString()}: {p.y} {unit}
          </title>
        </circle>
      ))}
    </svg>
  );
}
