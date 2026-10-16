import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { Exercise } from '../types';
import { uid } from '../utils';
import { Badge, Empty, Field, Modal, Tabs } from '../components/ui';

function ExerciseModal({ initial, onClose }: { initial?: Exercise; onClose: () => void }) {
  const { db, update } = useStore();
  const [e, setE] = useState<Exercise>(initial ?? { id: uid(), name: '', category: 'Legs', equipment: 'Bodyweight', instructions: '' });
  const categories = [...new Set(db.exercises.map((x) => x.category))].sort();
  return (
    <Modal title={initial ? 'Edit exercise' : 'New exercise'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(ev) => {
          ev.preventDefault();
          const ok = update((d) => {
            const i = d.exercises.findIndex((x) => x.id === e.id);
            if (i >= 0) d.exercises[i] = e;
            else d.exercises.push(e);
          }, 'Exercise saved');
          if (ok) onClose();
        }}
      >
        <Field label="Name">
          <input required autoFocus value={e.name} onChange={(ev) => setE({ ...e, name: ev.target.value })} />
        </Field>
        <div className="row">
          <Field label="Category">
            <input list="ex-categories" value={e.category} onChange={(ev) => setE({ ...e, category: ev.target.value })} />
            <datalist id="ex-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Equipment">
            <input value={e.equipment} onChange={(ev) => setE({ ...e, equipment: ev.target.value })} />
          </Field>
        </div>
        <Field label="Coaching cues / instructions">
          <textarea rows={4} value={e.instructions} onChange={(ev) => setE({ ...e, instructions: ev.target.value })} />
        </Field>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary">Save</button>
        </div>
      </form>
    </Modal>
  );
}

export default function Workouts() {
  const { db, update } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<'programs' | 'library'>('programs');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [editing, setEditing] = useState<Exercise | 'new' | null>(null);

  const categories = [...new Set(db.exercises.map((x) => x.category))].sort();
  const exercises = db.exercises
    .filter((e) => (cat === 'all' || e.category === cat) && `${e.name} ${e.equipment}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const newProgram = () => {
    const id = uid();
    update((d) => void d.programs.push({ id, name: 'New program', description: '', days: [{ id: uid(), name: 'Day 1', items: [] }] }));
    nav(`/workouts/${id}`);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>Workouts</h1>
        {tab === 'programs' ? (
          <button className="btn primary" onClick={newProgram}>
            + New program
          </button>
        ) : (
          <button className="btn primary" onClick={() => setEditing('new')}>
            + New exercise
          </button>
        )}
      </header>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['programs', `Programs (${db.programs.length})`],
          ['library', `Exercise library (${db.exercises.length})`],
        ]}
      />

      {tab === 'programs' &&
        (db.programs.length === 0 ? (
          <Empty>No programs yet.</Empty>
        ) : (
          <div className="cards">
            {db.programs.map((p) => {
              const clients = db.assignments.filter((a) => a.programId === p.id).length;
              const exCount = p.days.reduce((n, d) => n + d.items.length, 0);
              return (
                <Link key={p.id} to={`/workouts/${p.id}`} className="card tile">
                  <h3>{p.name}</h3>
                  <p className="muted small clamp">{p.description || 'No description'}</p>
                  <div className="tile-foot">
                    <Badge>
                      {p.days.length} day{p.days.length === 1 ? '' : 's'}
                    </Badge>
                    <Badge>{exCount} exercises</Badge>
                    <Badge tone="brand">
                      {clients} client{clients === 1 ? '' : 's'}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

      {tab === 'library' && (
        <>
          <div className="toolbar">
            <input type="search" placeholder="Search exercises…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          {exercises.length === 0 ? (
            <Empty>No exercises match.</Empty>
          ) : (
            <div className="card table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Exercise</th>
                    <th>Category</th>
                    <th>Equipment</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {exercises.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.name}</strong>
                        <div className="muted small clamp">{e.instructions}</div>
                      </td>
                      <td>
                        <Badge>{e.category}</Badge>
                      </td>
                      <td className="small">{e.equipment}</td>
                      <td className="nowrap">
                        <button className="btn small ghost" onClick={() => setEditing(e)}>
                          Edit
                        </button>
                        <button
                          className="btn small ghost danger"
                          onClick={() => {
                            const used = db.programs.some((p) => p.days.some((d) => d.items.some((i) => i.exerciseId === e.id)));
                            if (used) return alert('This exercise is used in a program. Remove it from programs first.');
                            if (confirm(`Delete ${e.name}?`)) update((d) => void (d.exercises = d.exercises.filter((x) => x.id !== e.id)), 'Exercise deleted');
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {editing && <ExerciseModal initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
