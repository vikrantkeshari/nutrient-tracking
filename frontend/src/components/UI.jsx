import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

/* ---- Toast ---- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null);
  const timer = useRef();
  const show = (m) => {
    setMsg(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 2600);
  };
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </ToastCtx.Provider>
  );
}

/* ---- Stepper: − [value] + (typing works too — clamps on blur, not per keystroke) ---- */
export function Stepper({ label, value, onChange, min = 0, max = 9999, step = 1, unit }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    const v = clamp(Number.isNaN(n) ? value : n);
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <div className="field">
      <label className="lab">{label}</label>
      <div className="num">
        <button aria-label={`less ${label}`} onClick={() => onChange(clamp((Number(value) || 0) - step))}>−</button>
        <input
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        />
        <button aria-label={`more ${label}`} onClick={() => onChange(clamp((Number(value) || 0) + step))}>+</button>
      </div>
      {unit && <div className="note" style={{ marginTop: 8 }}>{unit}</div>}
    </div>
  );
}

/* ---- NumberField: free-text numeric entry, clamped to [min, max] on blur ---- */
export function NumberField({ label, value, onChange, min, max, unit, placeholder }) {
  const [text, setText] = useState(value !== '' && value != null ? String(value) : '');
  useEffect(() => { setText(value !== '' && value != null ? String(value) : ''); }, [value]);
  const commit = () => {
    if (text === '') return;
    const n = parseInt(text, 10);
    if (Number.isNaN(n)) { setText(value !== '' && value != null ? String(value) : ''); return; }
    const clamped = Math.max(min, Math.min(max, n));
    setText(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <div className="field">
      <label className="lab">{label}</label>
      <input
        inputMode="numeric"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^0-9]/g, ''))}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      />
      {unit && <div className="note" style={{ marginTop: 8 }}>{unit}</div>}
    </div>
  );
}

/* ---- HeightField: free-text cm, with a cm / ft+in toggle ---- */
const CM_MIN = 30, CM_MAX = 250;
export function HeightField({ label = 'Your height', valueCm, onChange }) {
  const [unit, setUnit] = useState('cm');
  const [cmText, setCmText] = useState(valueCm ? String(valueCm) : '');
  const [ft, setFt] = useState('');
  const [inch, setInch] = useState('');

  useEffect(() => {
    setCmText(valueCm ? String(valueCm) : '');
    if (valueCm) {
      const totalIn = Math.round(valueCm / 2.54);
      setFt(String(Math.floor(totalIn / 12)));
      setInch(String(totalIn % 12));
    }
  }, [valueCm]);

  const commitCm = () => {
    if (cmText === '') return;
    const n = parseInt(cmText, 10);
    if (Number.isNaN(n)) { setCmText(valueCm ? String(valueCm) : ''); return; }
    const clamped = Math.max(CM_MIN, Math.min(CM_MAX, n));
    setCmText(String(clamped));
    if (clamped !== valueCm) onChange(clamped);
  };

  const commitFtIn = () => {
    const f = parseInt(ft, 10);
    const i = parseInt(inch, 10);
    if (Number.isNaN(f) && Number.isNaN(i)) return;
    const totalIn = (Number.isNaN(f) ? 0 : f) * 12 + (Number.isNaN(i) ? 0 : i);
    if (totalIn <= 0) return;
    const cm = Math.max(CM_MIN, Math.min(CM_MAX, Math.round(totalIn * 2.54)));
    if (cm !== valueCm) onChange(cm);
  };

  return (
    <div className="field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 9 }}>
        <label className="lab" style={{ marginBottom: 0 }}>{label}</label>
        <div className="segtoggle">
          <button type="button" className={unit === 'cm' ? 'on' : ''} onClick={() => setUnit('cm')}>cm</button>
          <button type="button" className={unit === 'ftin' ? 'on' : ''} onClick={() => setUnit('ftin')}>ft &amp; in</button>
        </div>
      </div>
      {unit === 'cm' ? (
        <input
          inputMode="numeric"
          placeholder="e.g. 165"
          value={cmText}
          onChange={(e) => setCmText(e.target.value.replace(/[^0-9]/g, ''))}
          onBlur={commitCm}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
        />
      ) : (
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            style={{ flex: 1 }}
            inputMode="numeric"
            placeholder="ft"
            value={ft}
            onChange={(e) => setFt(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitFtIn}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          />
          <input
            style={{ flex: 1 }}
            inputMode="numeric"
            placeholder="in"
            value={inch}
            onChange={(e) => setInch(e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={commitFtIn}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
          />
        </div>
      )}
      <div className="note" style={{ marginTop: 8 }}>{unit === 'cm' ? `${CM_MIN}–${CM_MAX} cm` : 'Feet and inches'}</div>
    </div>
  );
}

export const BackBtn = ({ onClick, label = 'Back' }) => (
  <button className="big alt small" onClick={onClick}>
    <ArrowLeft size={22} /> {label}
  </button>
);

export const StepBars = ({ n }) => (
  <div className="step">{[1, 2, 3].map((i) => <div key={i} className={i <= n ? 'on' : ''} />)}</div>
);

export const MacroBar = ({ label, value, goal, color, unit = 'g' }) => (
  <div className="mrow">
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: '1.12rem', fontWeight: 700, color }}>{label}</span>
      <span className="lab" style={{ margin: 0 }}>{value} of {goal}{unit}</span>
    </div>
    <div className="mbar">
      <div style={{ width: `${Math.min((value / Math.max(goal, 1)) * 100, 100)}%`, background: color }} />
    </div>
  </div>
);

export const Avatar = ({ name, size = 52, accent }) => (
  <span className={`av${accent ? ' acc' : ''}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
    {(name || '?')[0].toUpperCase()}
  </span>
);

export const PrivacyCard = ({ title = 'Photos stay private', text = 'Nobody here can see anyone’s meal photos. Only the numbers.' }) => (
  <div className="card privacy">
    <div style={{ fontSize: '1.08rem', fontWeight: 700, marginBottom: 5 }}>{title}</div>
    <div className="note">{text}</div>
  </div>
);

export const SHARE_OPTIONS = [
  { key: 'detailed', label: 'Every meal I eat', desc: 'They see each meal and its numbers' },
  { key: 'totals', label: 'Only my daily total', desc: 'One total per day, not each meal' },
  { key: 'none', label: 'Nothing at all', desc: 'They see my name only' },
];
