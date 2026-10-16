import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import type { Meal, MealPlan } from '../types';
import { mealPlanMacros } from '../logic';
import { round, uid } from '../utils';
import { Empty, Field } from '../components/ui';

export default function MealPlanEditor() {
  const { id } = useParams();
  const { db, update } = useStore();
  const nav = useNavigate();
  const m = db.mealPlans.find((x) => x.id === id);
  if (!m) return <div className="page"><Empty>Meal plan not found. <Link to="/nutrition">Back</Link></Empty></div>;

  const edit = (fn: (p: MealPlan) => void) =>
    update((d) => {
      const p = d.mealPlans.find((x) => x.id === m.id);
      if (p) fn(p);
    });
  const editMeal = (mealId: string, fn: (ml: Meal) => void) => edit((p) => fn(p.meals.find((x) => x.id === mealId)!));

  const mac = mealPlanMacros(db, m);
  const foods = [...db.foods].sort((a, b) => a.name.localeCompare(b.name));
  const kcalFromMacros = mac.protein * 4 + mac.carbs * 4 + mac.fat * 9 || 1;

  return (
    <div className="page">
      <Link to="/nutrition" className="back">
        ← Nutrition
      </Link>
      <header className="page-head">
        <input className="title-input" value={m.name} onChange={(e) => edit((p) => void (p.name = e.target.value))} aria-label="Plan name" />
        <div className="actions">
          <button
            className="btn ghost"
            onClick={() => {
              const copy = structuredClone(m);
              copy.id = uid();
              copy.name = `${m.name} (copy)`;
              copy.clientId = undefined;
              update((d) => void d.mealPlans.push(copy), 'Plan duplicated');
              nav(`/nutrition/${copy.id}`);
            }}
          >
            Duplicate
          </button>
          <button
            className="btn ghost danger"
            onClick={() => {
              if (!confirm(`Delete "${m.name}"?`)) return;
              update((d) => void (d.mealPlans = d.mealPlans.filter((x) => x.id !== m.id)), 'Plan deleted');
              nav('/nutrition');
            }}
          >
            Delete
          </button>
        </div>
      </header>

      <div className="row">
        <Field label="Client">
          <select value={m.clientId ?? ''} onChange={(e) => edit((p) => void (p.clientId = e.target.value || undefined))}>
            <option value="">— Template (no client) —</option>
            {db.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Daily calorie target">
          <input type="number" min={0} step={50} value={m.targetCalories} onChange={(e) => edit((p) => void (p.targetCalories = +e.target.value))} />
        </Field>
      </div>

      <div className="card macros">
        <div>
          <div className="stat-label">Calories</div>
          <div className="stat-value">
            {Math.round(mac.calories)} <small className="muted">/ {m.targetCalories}</small>
          </div>
          <div className="bar">
            <span style={{ width: `${Math.min(100, (mac.calories / (m.targetCalories || 1)) * 100)}%`, background: mac.calories > m.targetCalories * 1.05 ? 'var(--bad)' : undefined }} />
          </div>
        </div>
        {(
          [
            ['Protein', mac.protein, 4, 'var(--c1)'],
            ['Carbs', mac.carbs, 4, 'var(--c2)'],
            ['Fat', mac.fat, 9, 'var(--c3)'],
          ] as const
        ).map(([label, g, kcal, color]) => (
          <div key={label}>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{round(g)}g</div>
            <div className="muted small">
              <span className="dot-key" style={{ background: color }} /> {Math.round(((g * kcal) / kcalFromMacros) * 100)}% of kcal
            </div>
          </div>
        ))}
      </div>

      {m.meals.map((meal, mi) => {
        const mm = mac.perMeal[mi];
        return (
          <section key={meal.id} className="card day">
            <div className="card-head">
              <input className="day-name" value={meal.name} onChange={(e) => editMeal(meal.id, (x) => void (x.name = e.target.value))} aria-label="Meal name" />
              <span className="muted small">
                {Math.round(mm.calories)} kcal · P {round(mm.protein)} · C {round(mm.carbs)} · F {round(mm.fat)}
              </span>
              <button className="btn small ghost danger" onClick={() => edit((p) => void (p.meals = p.meals.filter((x) => x.id !== meal.id)))}>
                Remove
              </button>
            </div>
            <ul className="list">
              {meal.items.map((it) => {
                const f = db.foods.find((x) => x.id === it.foodId);
                return (
                  <li key={it.id} className="list-row">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className="narrow"
                      value={it.qty}
                      onChange={(e) => editMeal(meal.id, (x) => void (x.items.find((i) => i.id === it.id)!.qty = +e.target.value))}
                      aria-label="Servings"
                    />
                    <span className="muted small">×</span>
                    <span className="grow">
                      {f?.name ?? 'Deleted food'} <span className="muted small">({f?.serving})</span>
                    </span>
                    <span className="small">{f ? Math.round(f.calories * it.qty) : 0} kcal</span>
                    <button className="icon-btn" onClick={() => editMeal(meal.id, (x) => void (x.items = x.items.filter((i) => i.id !== it.id)))} aria-label="Remove food">
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
            <select
              value=""
              onChange={(e) => {
                const foodId = e.target.value;
                if (foodId) editMeal(meal.id, (x) => void x.items.push({ id: uid(), foodId, qty: 1 }));
              }}
            >
              <option value="">+ Add food…</option>
              {foods.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.serving}, {f.calories} kcal)
                </option>
              ))}
            </select>
          </section>
        );
      })}
      <button className="btn ghost" onClick={() => edit((p) => void p.meals.push({ id: uid(), name: `Meal ${p.meals.length + 1}`, items: [] }))}>
        + Add meal
      </button>
    </div>
  );
}
