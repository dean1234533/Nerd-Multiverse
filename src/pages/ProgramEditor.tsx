import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import type { Program, ProgramDay, ProgramItem } from '../types';
import { clientName } from '../logic';
import { uid } from '../utils';
import { Empty } from '../components/ui';

export default function ProgramEditor() {
  const { id } = useParams();
  const { db, update } = useStore();
  const nav = useNavigate();
  const p = db.programs.find((x) => x.id === id);
  if (!p) return <div className="page"><Empty>Program not found. <Link to="/workouts">Back</Link></Empty></div>;

  const edit = (fn: (p: Program) => void) =>
    update((d) => {
      const prog = d.programs.find((x) => x.id === p.id);
      if (prog) fn(prog);
    });
  const editDay = (dayId: string, fn: (d: ProgramDay) => void) => edit((prog) => fn(prog.days.find((x) => x.id === dayId)!));
  const editItem = (dayId: string, itemId: string, patch: Partial<ProgramItem>) =>
    editDay(dayId, (d) => Object.assign(d.items.find((x) => x.id === itemId)!, patch));

  const exercises = [...db.exercises].sort((a, b) => a.name.localeCompare(b.name));
  const assigned = db.assignments.filter((a) => a.programId === p.id);

  return (
    <div className="page">
      <Link to="/workouts" className="back">
        ← Workouts
      </Link>
      <header className="page-head">
        <input className="title-input" value={p.name} onChange={(e) => edit((x) => void (x.name = e.target.value))} aria-label="Program name" />
        <div className="actions">
          <button
            className="btn ghost"
            onClick={() => {
              const copy: Program = structuredClone(p);
              copy.id = uid();
              copy.name = `${p.name} (copy)`;
              copy.days.forEach((d) => {
                d.id = uid();
                d.items.forEach((i) => (i.id = uid()));
              });
              update((d) => void d.programs.push(copy), 'Program duplicated');
              nav(`/workouts/${copy.id}`);
            }}
          >
            Duplicate
          </button>
          <button
            className="btn ghost danger"
            onClick={() => {
              if (!confirm(`Delete "${p.name}"? It will be unassigned from ${assigned.length} client(s).`)) return;
              update((d) => {
                d.programs = d.programs.filter((x) => x.id !== p.id);
                d.assignments = d.assignments.filter((x) => x.programId !== p.id);
              }, 'Program deleted');
              nav('/workouts');
            }}
          >
            Delete
          </button>
        </div>
      </header>
      <textarea className="desc-input" rows={2} placeholder="Description, progression notes…" value={p.description} onChange={(e) => edit((x) => void (x.description = e.target.value))} />
      <p className="muted small">
        Changes save automatically.{' '}
        {assigned.length > 0 && (
          <>
            Assigned to:{' '}
            {assigned.map((a, i) => (
              <span key={a.id}>
                {i > 0 && ', '}
                <Link to={`/clients/${a.clientId}`}>{clientName(db, a.clientId)}</Link>
              </span>
            ))}
          </>
        )}
      </p>

      {p.days.map((day, di) => (
        <section key={day.id} className="card day">
          <div className="card-head">
            <input className="day-name" value={day.name} onChange={(e) => editDay(day.id, (d) => void (d.name = e.target.value))} aria-label="Day name" />
            <div className="actions">
              <button className="btn small ghost" disabled={di === 0} onClick={() => edit((x) => void x.days.splice(di - 1, 0, x.days.splice(di, 1)[0]))} aria-label="Move day up">
                ↑
              </button>
              <button className="btn small ghost" disabled={di === p.days.length - 1} onClick={() => edit((x) => void x.days.splice(di + 1, 0, x.days.splice(di, 1)[0]))} aria-label="Move day down">
                ↓
              </button>
              <button className="btn small ghost danger" onClick={() => confirm(`Remove ${day.name}?`) && edit((x) => void (x.days = x.days.filter((d) => d.id !== day.id)))}>
                Remove day
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table program">
              <thead>
                <tr>
                  <th>Exercise</th>
                  <th>Sets</th>
                  <th>Reps</th>
                  <th>Rest</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {day.items.map((it, ii) => (
                  <tr key={it.id}>
                    <td>
                      <select value={it.exerciseId} onChange={(e) => editItem(day.id, it.id, { exerciseId: e.target.value })}>
                        {exercises.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input type="number" min={1} className="narrow" value={it.sets} onChange={(e) => editItem(day.id, it.id, { sets: +e.target.value })} />
                    </td>
                    <td>
                      <input className="narrow" value={it.reps} onChange={(e) => editItem(day.id, it.id, { reps: e.target.value })} />
                    </td>
                    <td>
                      <input className="narrow" value={it.rest} onChange={(e) => editItem(day.id, it.id, { rest: e.target.value })} />
                    </td>
                    <td>
                      <input value={it.notes} onChange={(e) => editItem(day.id, it.id, { notes: e.target.value })} placeholder="Tempo, load…" />
                    </td>
                    <td className="nowrap">
                      <button className="icon-btn" disabled={ii === 0} onClick={() => editDay(day.id, (d) => void d.items.splice(ii - 1, 0, d.items.splice(ii, 1)[0]))} aria-label="Move up">
                        ↑
                      </button>
                      <button className="icon-btn" onClick={() => editDay(day.id, (d) => void (d.items = d.items.filter((x) => x.id !== it.id)))} aria-label="Remove exercise">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {exercises.length > 0 && (
            <button
              className="btn small ghost"
              onClick={() => editDay(day.id, (d) => void d.items.push({ id: uid(), exerciseId: exercises[0].id, sets: 3, reps: '10', rest: '90s', notes: '' }))}
            >
              + Add exercise
            </button>
          )}
        </section>
      ))}
      <button className="btn ghost" onClick={() => edit((x) => void x.days.push({ id: uid(), name: `Day ${x.days.length + 1}`, items: [] }))}>
        + Add day
      </button>
    </div>
  );
}
