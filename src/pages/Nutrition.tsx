import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { Food } from '../types';
import { clientName, mealPlanMacros } from '../logic';
import { uid } from '../utils';
import { Badge, Empty, Field, Modal, Tabs } from '../components/ui';

function FoodModal({ initial, onClose }: { initial?: Food; onClose: () => void }) {
  const { update } = useStore();
  const [f, setF] = useState<Food>(initial ?? { id: uid(), name: '', serving: '100 g', calories: 0, protein: 0, carbs: 0, fat: 0 });
  const num = (k: 'calories' | 'protein' | 'carbs' | 'fat') => (
    <Field label={k === 'calories' ? 'Calories (kcal)' : `${k[0].toUpperCase() + k.slice(1)} (g)`}>
      <input type="number" min={0} step="0.1" value={f[k]} onChange={(e) => setF({ ...f, [k]: +e.target.value })} />
    </Field>
  );
  return (
    <Modal title={initial ? 'Edit food' : 'New food'} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const ok = update((d) => {
            const i = d.foods.findIndex((x) => x.id === f.id);
            if (i >= 0) d.foods[i] = f;
            else d.foods.push(f);
          }, 'Food saved');
          if (ok) onClose();
        }}
      >
        <div className="row">
          <Field label="Name">
            <input required autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          </Field>
          <Field label="Serving">
            <input value={f.serving} onChange={(e) => setF({ ...f, serving: e.target.value })} />
          </Field>
        </div>
        <div className="grid-4">
          {num('calories')}
          {num('protein')}
          {num('carbs')}
          {num('fat')}
        </div>
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

export default function Nutrition() {
  const { db, update } = useStore();
  const nav = useNavigate();
  const [tab, setTab] = useState<'plans' | 'foods'>('plans');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Food | 'new' | null>(null);

  const newPlan = () => {
    const id = uid();
    update((d) =>
      void d.mealPlans.push({
        id,
        name: 'New meal plan',
        targetCalories: 2000,
        meals: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'].map((name) => ({ id: uid(), name, items: [] })),
      }),
      'Created a new meal plan',
    );
    nav(`/nutrition/${id}`);
  };

  const foods = db.foods.filter((f) => f.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Nutrition</h1>
        {tab === 'plans' ? (
          <button className="btn primary" onClick={newPlan}>
            + New meal plan
          </button>
        ) : (
          <button className="btn primary" onClick={() => setEditing('new')}>
            + New food
          </button>
        )}
      </header>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ['plans', `Meal plans (${db.mealPlans.length})`],
          ['foods', `Food library (${db.foods.length})`],
        ]}
      />

      {tab === 'plans' &&
        (db.mealPlans.length === 0 ? (
          <Empty>No meal plans yet.</Empty>
        ) : (
          <div className="cards">
            {db.mealPlans.map((m) => {
              const mac = mealPlanMacros(db, m);
              const pct = Math.min(100, (mac.calories / (m.targetCalories || 1)) * 100);
              return (
                <Link to={`/nutrition/${m.id}`} key={m.id} className="card tile">
                  <h3>{m.name}</h3>
                  <p className="muted small">{m.clientId ? clientName(db, m.clientId) : 'Template (no client)'}</p>
                  <div className="bar">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="small">
                    {Math.round(mac.calories)} / {m.targetCalories} kcal
                  </div>
                  <div className="tile-foot">
                    <Badge>P {Math.round(mac.protein)}g</Badge>
                    <Badge>C {Math.round(mac.carbs)}g</Badge>
                    <Badge>F {Math.round(mac.fat)}g</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}

      {tab === 'foods' && (
        <>
          <div className="toolbar">
            <input type="search" placeholder="Search foods…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Food</th>
                  <th>Serving</th>
                  <th className="num">kcal</th>
                  <th className="num">Protein</th>
                  <th className="num">Carbs</th>
                  <th className="num">Fat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {foods.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <strong>{f.name}</strong>
                    </td>
                    <td className="small">{f.serving}</td>
                    <td className="num">{f.calories}</td>
                    <td className="num">{f.protein}g</td>
                    <td className="num">{f.carbs}g</td>
                    <td className="num">{f.fat}g</td>
                    <td className="nowrap">
                      <button className="btn small ghost" onClick={() => setEditing(f)}>
                        Edit
                      </button>
                      <button
                        className="btn small ghost danger"
                        onClick={() => {
                          if (db.mealPlans.some((m) => m.meals.some((ml) => ml.items.some((i) => i.foodId === f.id)))) return alert('This food is used in a meal plan.');
                          if (confirm(`Delete ${f.name}?`)) update((d) => void (d.foods = d.foods.filter((x) => x.id !== f.id)), 'Food deleted');
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
        </>
      )}
      {editing && <FoodModal initial={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
