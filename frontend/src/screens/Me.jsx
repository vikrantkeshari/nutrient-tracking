import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { repo } from '../lib/repo';
import { suggestGoals } from '../lib/goals';
import { Stepper, Avatar, useToast, SHARE_OPTIONS } from '../components/UI';

export default function Me({ user, profile, groups, refresh, onSignOut }) {
  const toast = useToast();
  const [goals, setGoals] = useState({ ...profile.goals });

  return (
    <div className="fade">
      <div className="pad"><h1>My settings</h1></div>
      <div className="stack">
        <div className="card person">
          <Avatar name={profile.name} size={62} accent />
          <span>
            <span style={{ display: 'block', fontSize: '1.3rem', fontWeight: 800 }}>{profile.name}</span>
            <span style={{ display: 'block', fontSize: '.98rem', color: 'var(--t2)', fontWeight: 600 }}>{user.email}</span>
          </span>
        </div>

        <div className="card">
          <h2>My daily goals</h2>
          <Stepper label="Calories" value={goals.cal} onChange={(v) => setGoals({ ...goals, cal: v })} min={800} max={5000} step={50} />
          <Stepper label="Protein (g)" value={goals.pro} onChange={(v) => setGoals({ ...goals, pro: v })} min={20} max={300} step={5} />
          <Stepper label="Carbs (g)" value={goals.carb} onChange={(v) => setGoals({ ...goals, carb: v })} min={20} max={600} step={5} />
          <Stepper label="Fat (g)" value={goals.fat} onChange={(v) => setGoals({ ...goals, fat: v })} min={10} max={200} step={5} />
          <button className="big" style={{ marginTop: 18 }} onClick={async () => {
            await repo.updateGoals(user.id, goals);
            await refresh();
            toast('Goals saved');
          }}>Save goals</button>
          <button className="big plain" onClick={async () => {
            const s = suggestGoals(profile);
            if (!s) { toast('Add your age, weight and height first'); return; }
            setGoals(s);
            await repo.updateGoals(user.id, s);
            await refresh();
            toast(`Suggested for you: ${s.cal} calories a day`);
          }}>Suggest goals for me</button>
        </div>

        {groups.map((g) => (
          <div key={g.id} className="card">
            <h2>What {g.name} can see</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {SHARE_OPTIONS.map((o) => (
                <button key={o.key} className={`choice ${g.mine === o.key ? 'on' : ''}`} style={{ minHeight: 84 }}
                  onClick={async () => {
                    await repo.setShareLevel(user.id, g.id, o.key);
                    await refresh();
                    toast(`Saved — ${g.name} now sees this`);
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                    <span style={{ flex: 1 }}>{o.label}</span>
                    {g.mine === o.key && <Check size={24} style={{ color: 'var(--accent)' }} />}
                  </span>
                  <span>{o.desc}</span>
                </button>
              ))}
            </div>
            <div className="note" style={{ marginTop: 14 }}>Photos are never shared, whichever you choose.</div>
          </div>
        ))}

        <div className="card">
          <h2>Photos</h2>
          <div className="note">Meal photos are deleted after 30 days. Your food history is kept.</div>
        </div>

        <button className="big alt" style={{ color: 'var(--fat)' }} onClick={() => {
          if (window.confirm('Sign out?')) onSignOut();
        }}>Sign out</button>
      </div>
    </div>
  );
}
