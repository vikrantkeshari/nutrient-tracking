import React, { useState } from 'react';
import { ChevronRight, Lock } from 'lucide-react';
import { repo } from '../lib/repo';
import { BackBtn, Avatar, PrivacyCard, SHARE_OPTIONS } from '../components/UI';
import { useToast } from '../components/UI';

/* Group tab. Routing rule (user decision):
   0 groups -> join/create screen | 1 group -> straight into it | 2+ -> picker */
export default function Groups({ user, groups, view, setView, activeId, setActiveId, refresh, onGoMe, todayCal }) {
  const toast = useToast();
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = groups.find((g) => g.id === activeId);

  async function completeJoin(level) {
    setBusy(true); setErr('');
    try {
      const g = pending.mode === 'join'
        ? await repo.joinGroup(user.id, { code: pending.code, level })
        : await repo.createGroup(user.id, { name: pending.name, level });
      await refresh();
      setActiveId(g.id); setView('detail'); setPending(null); setCode(''); setName('');
      toast(`You joined ${g.name}`);
    } catch (e) { setErr(e.message); setView(pending.mode); }
    finally { setBusy(false); }
  }

  /* ---- join / create / sharing sub-screens ---- */
  if (view === 'join') return (
    <div className="fade">
      <div className="pad"><BackBtn onClick={() => { setErr(''); setView('auto'); }} />
        <h1>Join a group</h1><div className="day">Type the code you were given</div></div>
      <div className="stack">
        {err && <div className="err">{err}</div>}
        <div className="card"><label className="lab">Group code</label>
          <input placeholder="FAM-7K2X9M" value={code} onChange={(e) => setCode(e.target.value)}
            style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '.06em', textTransform: 'uppercase' }} />
          <div className="note" style={{ marginTop: 14 }}>Ask whoever set up the group to send you the code.</div></div>
        <button className="big" onClick={() => { setPending({ mode: 'join', code }); setView('sharing'); }}>Join</button>
      </div>
    </div>
  );

  if (view === 'create') return (
    <div className="fade">
      <div className="pad"><BackBtn onClick={() => setView('auto')} />
        <h1>New group</h1><div className="day">Give it a name your people will recognise</div></div>
      <div className="stack">
        <div className="card"><label className="lab">Group name</label>
          <input placeholder="e.g. Family" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="note" style={{ marginTop: 14 }}>You will get a code to share with them.</div></div>
        <button className="big" onClick={() => { setPending({ mode: 'create', name: name || 'My group' }); setView('sharing'); }}>Create group</button>
      </div>
    </div>
  );

  if (view === 'sharing') return (
    <div className="fade">
      <div className="pad">
        <h1>What can {pending?.name || 'they'} see?</h1>
        <div className="day">You choose. You can change it later.</div>
      </div>
      <div className="stack">
        {SHARE_OPTIONS.map((o) => (
          <button key={o.key} className="choice" style={{ minHeight: 100 }} disabled={busy}
            onClick={() => completeJoin(o.key)}>{o.label}<span>{o.desc}</span></button>
        ))}
        <PrivacyCard title="Your photos are never shared" text="Whichever you pick, nobody can see your meal photos." />
      </div>
    </div>
  );

  /* ---- routing: 0 / 1 / many ---- */
  if (groups.length === 0) return (
    <div className="fade">
      <div className="pad"><h1>Groups</h1><div className="day">Share your progress with family or friends</div></div>
      <div className="stack">
        <button className="choice" style={{ minHeight: 100 }} onClick={() => setView('join')}>Join a group<span>Someone gave you a code</span></button>
        <button className="choice" style={{ minHeight: 100 }} onClick={() => setView('create')}>Start a new group<span>Invite your family or friends</span></button>
      </div>
    </div>
  );

  const showDetail = view === 'detail' || groups.length === 1;
  if (!showDetail) return (
    <div className="fade">
      <div className="pad"><h1>Groups</h1><div className="day">Tap a group to see it</div></div>
      <div className="stack">
        {groups.map((g) => (
          <button key={g.id} className="choice" style={{ minHeight: 94 }}
            onClick={() => { setActiveId(g.id); setView('detail'); }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%' }}>
              <Avatar name={g.name} accent />
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '1.25rem' }}>{g.name}</span>
                <span style={{ fontSize: '.98rem', color: 'var(--t2)', fontWeight: 600 }}>{g.members.length + 1} people</span>
              </span>
              <ChevronRight size={26} style={{ color: 'var(--t2)' }} />
            </span>
          </button>
        ))}
        <button className="big alt" onClick={() => setView('join')}>Join a group</button>
        <button className="big alt" onClick={() => setView('create')}>Start a new group</button>
      </div>
    </div>
  );

  /* ---- detail ---- */
  const g = active ?? groups[0];
  const meals = g.members.filter((m) => m.lvl === 'detailed');
  const tot = g.members.filter((m) => m.lvl === 'totals');
  const non = g.members.filter((m) => m.lvl === 'none');
  const mineLbl = {
    detailed: 'They see every meal you eat',
    totals: 'They see only your daily total',
    none: 'They see nothing from you',
  }[g.mine];

  return (
    <div className="fade">
      <div className="pad">
        {groups.length > 1 && <BackBtn label="All groups" onClick={() => setView('picker')} />}
        <h1>{g.name}</h1>
        <div className="day">{g.members.length + 1} people · code {g.code}</div>
      </div>
      <div className="stack">
        <div className="card" style={{ borderColor: 'rgba(167,139,250,.35)' }}>
          <div className="person">
            <Avatar name={user.name} accent />
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '1.2rem', fontWeight: 700 }}>You</span>
              <span style={{ display: 'block', fontSize: '.98rem', color: 'var(--t2)', fontWeight: 600 }}>{mineLbl}</span>
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--cal)' }}>
              {g.mine === 'none' ? '—' : `${todayCal} kcal`}
            </span>
          </div>
          <button className="big plain" style={{ marginTop: 6, minHeight: 44, justifyContent: 'flex-start', padding: 0 }} onClick={onGoMe}>
            Change what they see →
          </button>
        </div>

        {meals.map((m) => (
          <div key={m.id} className="card">
            <div className="person" style={{ marginBottom: 16 }}>
              <Avatar name={m.name} />
              <span>
                <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 700 }}>{m.name}</span>
                <span style={{ display: 'block', fontSize: '1rem', color: 'var(--t2)', fontWeight: 600 }}>{m.cal} calories today</span>
              </span>
            </div>
            {m.meals.map((x, i) => (
              <div className="item" key={i}>
                <div style={{ flex: 1 }}>
                  <div className="name">{x.name}</div>
                  <div className="meta">{x.time} · {x.cal} calories</div>
                </div>
              </div>
            ))}
          </div>
        ))}

        {tot.map((m) => (
          <div key={m.id} className="card">
            <div className="person" style={{ marginBottom: 16 }}>
              <Avatar name={m.name} />
              <span>
                <span style={{ display: 'block', fontSize: '1.25rem', fontWeight: 700 }}>{m.name}</span>
                <span style={{ display: 'block', fontSize: '1rem', color: 'var(--t2)', fontWeight: 600 }}>Shares totals only</span>
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <span className="lab" style={{ margin: 0 }}>Calories</span>
              <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--cal)' }}>{m.cal}</span>
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              {[['Protein', m.pro, 'var(--pro)'], ['Carbs', m.carb, 'var(--carb)'], ['Fat', m.fat, 'var(--fat)']].map(([l, v, c]) => (
                <div key={l} style={{ flex: 1 }}>
                  <div style={{ fontSize: '.98rem', color: 'var(--t2)', fontWeight: 600 }}>{l}</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 800, color: c }}>{v}g</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {non.length > 0 && (
          <div className="card">
            {non.map((m) => (
              <div className="person" key={m.id} style={{ padding: '8px 0' }}>
                <span style={{ opacity: 0.55 }}><Avatar name={m.name} /></span>
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontSize: '1.12rem', fontWeight: 700 }}>{m.name}</span>
                  <span style={{ display: 'block', fontSize: '.98rem', color: 'var(--t2)', fontWeight: 600 }}>Not sharing</span>
                </span>
                <Lock size={24} style={{ color: 'var(--t2)' }} />
              </div>
            ))}
          </div>
        )}

        <PrivacyCard />

        <button className="big alt" onClick={() => setView('join')}>Join or start another group</button>
        <button className="big danger" onClick={async () => {
          if (!window.confirm(`Leave ${g.name}? They will no longer see anything from you.`)) return;
          await repo.leaveGroup(user.id, g.id);
          await refresh();
          setView('auto');
          toast(`You left ${g.name}`);
        }}>Leave this group</button>
      </div>
    </div>
  );
}
