import React, { useState } from 'react';
import { Mail, Check } from 'lucide-react';
import { repo } from '../lib/repo';
import { suggestGoals, DEFAULT_GOALS } from '../lib/goals';
import { BackBtn, StepBars, Stepper, SHARE_OPTIONS } from '../components/UI';

// Screens: welcome | signin | forgot | sent | signup | about | groupsetup | sharing
export default function Onboarding({ onDone }) {
  const [screen, setScreen] = useState('welcome');
  const [err, setErr] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [body, setBody] = useState({ age: 60, weight: 70, height: 165 });
  const [joinMode, setJoinMode] = useState(null); // null | 'join' | 'create'
  const [code, setCode] = useState('');
  const [groupName, setGroupName] = useState('');
  const [pending, setPending] = useState(null); // {mode:'join'|'create', code?|name?}

  const go = (s) => { setErr(''); setScreen(s); };
  const F = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function finishSignup(goals) {
    setBusy(true);
    try {
      await repo.signUp({ ...form, ...body, goals });
      return true;
    } catch (e) { setErr(e.message); return false; }
    finally { setBusy(false); }
  }

  async function completeSetup(level) {
    setBusy(true); setErr('');
    try {
      const user = await repo.getSession();
      if (pending?.mode === 'join') await repo.joinGroup(user?.id, { code: pending.code, level });
      if (pending?.mode === 'create') await repo.createGroup(user?.id, { name: pending.name, level });
      onDone();
    } catch (e) { setErr(e.message); setScreen('groupsetup'); setJoinMode(pending?.mode); }
    finally { setBusy(false); }
  }

  /* ---------- screens ---------- */
  if (screen === 'welcome') return (
    <div className="fade">
      <div className="pad" style={{ paddingTop: 64 }}>
        <div className="logo">🥗</div>
        <h1>Track what you eat</h1>
        <div className="day">Take a photo of your meal.<br />We work out the rest.</div>
      </div>
      <div className="stack" style={{ marginTop: 22 }}>
        <button className="big" onClick={() => go('signup')}>Create an account</button>
        <button className="big alt" onClick={() => go('signin')}>I already have an account</button>
      </div>
    </div>
  );

  if (screen === 'signin') return (
    <div className="fade">
      <div className="pad"><BackBtn onClick={() => go('welcome')} /><h1>Sign in</h1></div>
      <div className="stack">
        {err && <div className="err">{err}</div>}
        <div className="card">
          <div className="field"><label className="lab">Your email</label>
            <input type="email" placeholder="name@email.com" value={form.email} onChange={F('email')} autoComplete="email" /></div>
          <div className="field"><label className="lab">Password</label>
            <div className="pwwrap">
              <input type={showPw ? 'text' : 'password'} placeholder="Your password" value={form.password} onChange={F('password')} autoComplete="current-password" />
              <button className="show" onClick={() => setShowPw(!showPw)}>{showPw ? 'Hide' : 'Show'}</button>
            </div></div>
        </div>
        <button className="big" disabled={busy} onClick={async () => {
          setBusy(true); setErr('');
          try { await repo.signIn(form); onDone(); }
          catch { setErr("That email and password don't match. Please try again."); }
          finally { setBusy(false); }
        }}>Sign in</button>
        <button className="big plain" onClick={() => go('forgot')}>I forgot my password</button>
      </div>
    </div>
  );

  if (screen === 'forgot') return (
    <div className="fade">
      <div className="pad"><BackBtn onClick={() => go('signin')} /><h1>Forgot password</h1>
        <div className="day">We will email you a link to make a new one.</div></div>
      <div className="stack">
        <div className="card"><label className="lab">Your email</label>
          <input type="email" placeholder="name@email.com" value={form.email} onChange={F('email')} /></div>
        <button className="big" onClick={async () => { await repo.resetPassword(form.email); go('sent'); }}>Send me the link</button>
      </div>
    </div>
  );

  if (screen === 'sent') return (
    <div className="fade">
      <div className="pad" style={{ paddingTop: 70, textAlign: 'center' }}>
        <div className="logo ok" style={{ margin: '0 auto 24px' }}><Mail size={42} /></div>
        <h1>Check your email</h1>
        <div className="day">Open the link we sent to make a new password.</div>
      </div>
      <div className="stack" style={{ marginTop: 22 }}>
        <button className="big alt" onClick={() => go('signin')}>Back to sign in</button>
      </div>
    </div>
  );

  if (screen === 'signup') return (
    <div className="fade">
      <div className="pad"><BackBtn onClick={() => go('welcome')} /><StepBars n={1} />
        <h1>Create account</h1><div className="day">Step 1 of 3</div></div>
      <div className="stack">
        {err && <div className="err">{err}</div>}
        <div className="card">
          <div className="field"><label className="lab">Your name</label>
            <input placeholder="e.g. Sunita" value={form.name} onChange={F('name')} autoComplete="name" /></div>
          <div className="field"><label className="lab">Your email</label>
            <input type="email" placeholder="name@email.com" value={form.email} onChange={F('email')} autoComplete="email" /></div>
          <div className="field"><label className="lab">Make a password</label>
            <div className="pwwrap">
              <input type={showPw ? 'text' : 'password'} placeholder="At least 8 letters" value={form.password} onChange={F('password')} autoComplete="new-password" />
              <button className="show" onClick={() => setShowPw(!showPw)}>{showPw ? 'Hide' : 'Show'}</button>
            </div>
            <div className="note" style={{ marginTop: 12 }}>Tap <b>Show</b> to see what you typed.</div></div>
        </div>
        <button className="big" onClick={() => {
          if (!form.name.trim()) return setErr('Please type your name.');
          if (!form.email.includes('@')) return setErr('Please type a proper email address.');
          if (form.password.length < 8) return setErr('Your password needs at least 8 letters.');
          go('about');
        }}>Next</button>
      </div>
    </div>
  );

  if (screen === 'about') return (
    <div className="fade">
      <div className="pad"><BackBtn onClick={() => go('signup')} /><StepBars n={2} />
        <h1>About you</h1><div className="day">Step 2 of 3 — sets your daily goals</div></div>
      <div className="stack">
        {err && <div className="err">{err}</div>}
        <div className="card">
          <Stepper label="Your age" value={body.age} onChange={(v) => setBody({ ...body, age: v })} min={10} max={110} unit="In years" />
          <Stepper label="Your weight" value={body.weight} onChange={(v) => setBody({ ...body, weight: v })} min={30} max={200} unit="In kilograms" />
          <Stepper label="Your height" value={body.height} onChange={(v) => setBody({ ...body, height: v })} min={100} max={220} unit="In centimetres" />
        </div>
        <button className="big" disabled={busy} onClick={async () => {
          const goals = suggestGoals(body) ?? DEFAULT_GOALS;
          if (await finishSignup(goals)) go('groupsetup');
        }}>Next</button>
        <button className="big plain" disabled={busy} onClick={async () => {
          if (await finishSignup(DEFAULT_GOALS)) go('groupsetup');
        }}>Skip for now</button>
      </div>
    </div>
  );

  if (screen === 'groupsetup') {
    if (joinMode === 'join') return (
      <div className="fade">
        <div className="pad"><BackBtn onClick={() => { setJoinMode(null); setErr(''); }} />
          <h1>Join a group</h1><div className="day">Type the code you were given</div></div>
        <div className="stack">
          {err && <div className="err">{err}</div>}
          <div className="card"><label className="lab">Group code</label>
            <input placeholder="FAM-7K2X9M" value={code} onChange={(e) => setCode(e.target.value)}
              style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '.06em', textTransform: 'uppercase' }} />
            <div className="note" style={{ marginTop: 14 }}>Ask whoever set up the group to send you the code.</div></div>
          <button className="big" onClick={() => { setPending({ mode: 'join', code }); go('sharing'); }}>Join</button>
        </div>
      </div>
    );
    if (joinMode === 'create') return (
      <div className="fade">
        <div className="pad"><BackBtn onClick={() => setJoinMode(null)} />
          <h1>New group</h1><div className="day">Give it a name your people will recognise</div></div>
        <div className="stack">
          <div className="card"><label className="lab">Group name</label>
            <input placeholder="e.g. Family" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
            <div className="note" style={{ marginTop: 14 }}>You will get a code to share with them.</div></div>
          <button className="big" onClick={() => { setPending({ mode: 'create', name: groupName || 'My group' }); go('sharing'); }}>Create group</button>
        </div>
      </div>
    );
    return (
      <div className="fade">
        <div className="pad"><StepBars n={3} />
          <h1>Share with people</h1><div className="day">Step 3 of 3 — you can change this any time</div></div>
        <div className="stack">
          {err && <div className="err">{err}</div>}
          <button className="choice" onClick={() => setJoinMode('join')}>Join a group<span>Someone gave you a code</span></button>
          <button className="choice" onClick={() => setJoinMode('create')}>Start a new group<span>Invite your family or friends</span></button>
          <button className="choice" onClick={onDone}>Just me for now<span>Track on your own — nobody sees anything</span></button>
        </div>
      </div>
    );
  }

  if (screen === 'sharing') return (
    <div className="fade">
      <div className="pad">
        <h1>What can {pending?.name || 'they'} see?</h1>
        <div className="day">You choose. You can change it later.</div>
      </div>
      <div className="stack">
        {SHARE_OPTIONS.map((o) => (
          <button key={o.key} className="choice" style={{ minHeight: 100 }} disabled={busy}
            onClick={() => completeSetup(o.key)}>
            {o.label}<span>{o.desc}</span>
          </button>
        ))}
        <div className="card privacy">
          <div style={{ fontSize: '1.08rem', fontWeight: 700, marginBottom: 6 }}>Your photos are never shared</div>
          <div className="note">Whichever you pick, nobody can see your meal photos.</div>
        </div>
      </div>
    </div>
  );

  return null;
}
