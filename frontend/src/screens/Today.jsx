import React from 'react';
import { ChevronRight, Trash2 } from 'lucide-react';
import { MacroBar } from '../components/UI';

export default function Today({ profile, meals, groups, onDeleteMeal, onOpenGroup }) {
  const g = profile.goals;
  const t = meals.reduce(
    (a, m) => ({ cal: a.cal + m.cal, pro: a.pro + m.pro, carb: a.carb + m.carb, fat: a.fat + m.fat }),
    { cal: 0, pro: 0, carb: 0, fat: 0 }
  );
  const left = Math.max(g.cal - t.cal, 0);
  const over = t.cal > g.cal;

  return (
    <div className="fade">
      <div className="pad">
        <h1>Hello, {profile.name || 'there'}</h1>
        <div className="day">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
      </div>
      <div className="stack">
        <div className="card" style={{ textAlign: 'center', padding: '26px 22px' }}>
          <div className="lab" style={{ margin: 0 }}>You have eaten</div>
          <div style={{ fontSize: '3.7rem', fontWeight: 800, color: 'var(--cal)', lineHeight: 1.15, margin: '4px 0' }}>{t.cal}</div>
          <div className="lab" style={{ marginBottom: 18 }}>of {g.cal} calories</div>
          <div className="bigbar">
            <div style={{ width: `${Math.min((t.cal / Math.max(g.cal, 1)) * 100, 100)}%`, background: 'var(--cal)' }} />
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: 16, color: over ? 'var(--carb)' : 'var(--pro)' }}>
            {over ? `${t.cal - g.cal} over your goal` : `${left} calories left today`}
          </div>
        </div>

        <div className="card">
          <h2>Protein, carbs and fat</h2>
          <MacroBar label="Protein" value={t.pro} goal={g.pro} color="var(--pro)" />
          <MacroBar label="Carbs" value={t.carb} goal={g.carb} color="var(--carb)" />
          <MacroBar label="Fat" value={t.fat} goal={g.fat} color="var(--fat)" />
        </div>

        <div className="card">
          <h2>What you ate today</h2>
          {meals.length === 0 ? (
            <div className="note" style={{ textAlign: 'center', padding: '14px 0' }}>
              Nothing yet today.<br /><b>Tap the big + below to add your first meal.</b>
            </div>
          ) : meals.map((m) => (
            <div className="item" key={m.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="name">{m.name}</div>
                <div className="meta">{m.time} · {m.cal} calories</div>
              </div>
              <button className="del" aria-label={`delete ${m.name}`} onClick={() => onDeleteMeal(m)}>
                <Trash2 size={22} />
              </button>
            </div>
          ))}
        </div>

        {groups.map((gr) => {
          const vis = gr.members.filter((x) => x.lvl !== 'none');
          if (!vis.length) return null;
          return (
            <div key={gr.id} className="card" style={{ cursor: 'pointer' }} onClick={() => onOpenGroup(gr.id)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ margin: 0 }}>{gr.name}</h2>
                <ChevronRight size={24} style={{ color: 'var(--t2)' }} />
              </div>
              {vis.map((x) => (
                <div key={x.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0' }}>
                  <span style={{ fontSize: '1.08rem', fontWeight: 600 }}>{x.name}</span>
                  <span style={{ fontSize: '1.08rem', fontWeight: 800, color: 'var(--cal)' }}>{x.cal} kcal</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
