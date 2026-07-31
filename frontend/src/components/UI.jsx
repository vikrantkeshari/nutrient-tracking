import React, { createContext, useContext, useRef, useState } from 'react';
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

/* ---- Stepper: − [value] + (no keyboard needed) ---- */
export function Stepper({ label, value, onChange, min = 0, max = 9999, step = 1, unit }) {
  const clamp = (v) => Math.max(min, Math.min(max, v));
  return (
    <div className="field">
      <label className="lab">{label}</label>
      <div className="num">
        <button aria-label={`less ${label}`} onClick={() => onChange(clamp((Number(value) || 0) - step))}>−</button>
        <input
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(clamp(parseInt(e.target.value) || 0))}
        />
        <button aria-label={`more ${label}`} onClick={() => onChange(clamp((Number(value) || 0) + step))}>+</button>
      </div>
      {unit && <div className="note" style={{ marginTop: 8 }}>{unit}</div>}
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
