import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Appointment, ID } from '../types';
import { addDays, fmtTime, sameDay, startOfWeek } from '../utils';
import { AppointmentModal, NewAppointmentModal } from '../components/AppointmentModal';

const HOUR_PX = 52;

/** Assign side-by-side lanes to overlapping appointments within one day. */
function layoutDay(appts: Appointment[]) {
  const sorted = [...appts].sort((a, b) => a.start.localeCompare(b.start));
  const lanesEnd: number[] = [];
  const placed = sorted.map((a) => {
    const s = new Date(a.start).getTime();
    const e = s + a.durationMin * 60_000;
    let lane = lanesEnd.findIndex((end) => end <= s);
    if (lane === -1) lane = lanesEnd.length;
    lanesEnd[lane] = e;
    return { a, lane };
  });
  const lanes = Math.max(1, lanesEnd.length);
  return placed.map((p) => ({ ...p, lanes }));
}

export default function Schedule() {
  const { db } = useStore();
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [open, setOpen] = useState<ID | null>(null);
  const [creating, setCreating] = useState<Date | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const { dayStartHour: h0, dayEndHour: h1 } = db.settings;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const today = new Date();

  const visible = db.appointments.filter((a) => showCancelled || a.status !== 'cancelled');

  const onGridClick = (day: Date, e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const y = e.nativeEvent.offsetY;
    const minutes = Math.round(((y / HOUR_PX) * 60) / 15) * 15;
    const d = new Date(day);
    d.setHours(h0, minutes, 0, 0);
    setCreating(d);
  };

  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const weekLabel = `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="page">
      <header className="page-head">
        <h1>Schedule</h1>
        <div className="actions">
          <label className="check">
            <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Show cancelled
          </label>
          <button className="btn ghost" onClick={() => setWeek(addDays(week, -7))} aria-label="Previous week">
            ‹
          </button>
          <button className="btn ghost" onClick={() => setWeek(startOfWeek(new Date()))}>
            Today
          </button>
          <button className="btn ghost" onClick={() => setWeek(addDays(week, 7))} aria-label="Next week">
            ›
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const d = new Date();
              d.setMinutes(0, 0, 0);
              d.setHours(d.getHours() + 1);
              setCreating(d);
            }}
          >
            + New
          </button>
        </div>
      </header>
      <p className="muted">{weekLabel} · click an empty slot to book</p>

      <div className="calendar card">
        <div className="cal-head">
          <div />
          {days.map((d) => (
            <div key={d.toISOString()} className={`cal-day-head ${sameDay(d, today) ? 'today' : ''}`}>
              <span>{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <strong>{d.getDate()}</strong>
            </div>
          ))}
        </div>
        <div className="cal-body" style={{ height: hours.length * HOUR_PX }}>
          <div className="cal-hours">
            {hours.map((h) => (
              <div key={h} style={{ height: HOUR_PX }}>
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {days.map((day) => {
            const items = layoutDay(visible.filter((a) => sameDay(new Date(a.start), day)));
            return (
              <div key={day.toISOString()} className={`cal-col ${sameDay(day, today) ? 'today' : ''}`} onClick={(e) => onGridClick(day, e)} style={{ backgroundSize: `100% ${HOUR_PX}px` }}>
                {items.map(({ a, lane, lanes }) => {
                  const s = new Date(a.start);
                  const top = ((s.getHours() - h0) * 60 + s.getMinutes()) * (HOUR_PX / 60);
                  const height = Math.max(20, a.durationMin * (HOUR_PX / 60) - 2);
                  const names = a.bookings.map((b) => db.clients.find((c) => c.id === b.clientId)?.firstName).filter(Boolean);
                  return (
                    <button
                      key={a.id}
                      className={`cal-event ${a.type} ${a.status} ${height < 40 ? 'short' : ''}`}
                      style={{ top, height, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` }}
                      onClick={() => setOpen(a.id)}
                      title={`${a.title} · ${fmtTime(a.start)}`}
                    >
                      <strong>{a.title}</strong>
                      <span>
                        {fmtTime(a.start)}
                        {a.type === 'class' ? ` · ${a.bookings.length}/${a.capacity}` : names.length && !a.title.includes(names[0]!) ? ` · ${names.join(', ')}` : ''}
                      </span>
                    </button>
                  );
                })}
                {sameDay(day, today) && today.getHours() >= h0 && today.getHours() < h1 && (
                  <div className="now-line" style={{ top: ((today.getHours() - h0) * 60 + today.getMinutes()) * (HOUR_PX / 60) }} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="legend">
        <span className="cal-event pt">PT session</span>
        <span className="cal-event class">Group class</span>
        <span className="cal-event consult">Consultation</span>
        <span className="cal-event pt completed">Completed</span>
      </div>

      {open && <AppointmentModal id={open} onClose={() => setOpen(null)} />}
      {creating && <NewAppointmentModal start={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}
