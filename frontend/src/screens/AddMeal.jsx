import React, { useEffect, useRef, useState } from 'react';
import { Camera, Type, Check } from 'lucide-react';
import { repo } from '../lib/repo';
import { analyzeMeal, fakeAnalyze } from '../lib/ai';
import { compressImage } from '../utils/compressor';
import { BackBtn, Stepper, useToast } from '../components/UI';

/* Flow: pick -> shot (camera|text) -> wait -> check -> save */
export default function AddMeal({ user, onSaved }) {
  const toast = useToast();
  const [step, setStep] = useState('pick');
  const [mode, setMode] = useState('photo');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null); // base64 data URL
  const [blob, setBlob] = useState(null);
  const [est, setEst] = useState(null);   // AI estimate (original)
  const [edit, setEdit] = useState(null); // user-adjusted values
  const [warnLowConf, setWarnLowConf] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => () => stopCam(), []);

  async function startCam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      toast('Camera not available — you can choose a photo instead');
      fileRef.current?.click();
    }
  }
  function stopCam() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { toast('Camera is still starting — one moment'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0);
    stopCam();
    canvas.toBlob(async (b) => {
      const c = await compressImage(b);
      setBlob(c.blob); setPreview(c.base64);
      runAnalysis({ image: c.base64 });
    }, 'image/jpeg');
  }

  async function onFile(e) {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const c = await compressImage(f);
      setBlob(c.blob); setPreview(c.base64);
      runAnalysis({ image: c.base64 });
    } catch { toast('That photo could not be read. Try another one.'); }
  }

  async function runAnalysis(payload) {
    setStep('wait');
    try {
      const r = repo.demo ? await fakeAnalyze(payload) : await analyzeMeal(payload);
      setEst(r);
      setEdit({ name: r.food_item, cal: r.calories, pro: r.protein_g, carb: r.carbs_g, fat: r.fat_g });
      setWarnLowConf((r.confidence ?? 0) < 0.7);
      setStep('check');
    } catch {
      // AI down -> manual entry, never block logging
      setEst({ food_item: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, confidence: 0 });
      setEdit({ name: '', cal: 0, pro: 0, carb: 0, fat: 0 });
      setWarnLowConf(false);
      toast('We could not analyze that — please fill the numbers in');
      setStep('check');
    }
  }

  async function saveMeal() {
    if (!edit.name.trim()) { toast('Please give the meal a name'); return; }
    const isEdited =
      edit.name !== est.food_item || edit.cal !== est.calories ||
      edit.pro !== est.protein_g || edit.carb !== est.carbs_g || edit.fat !== est.fat_g;
    await repo.addMeal(user.id, {
      ...edit, imageBlob: blob,
      aiConfidence: est.confidence, isEdited,
      original: { cal: est.calories, pro: est.protein_g, carb: est.carbs_g, fat: est.fat_g },
    });
    toast(`Saved — ${edit.cal} calories added`);
    onSaved();
  }

  /* ---------- render ---------- */
  if (step === 'wait') return (
    <div className="fade" style={{ padding: '110px 30px', textAlign: 'center' }}>
      <div className="spinner" />
      <div style={{ fontSize: '1.45rem', fontWeight: 800 }}>Looking at your food…</div>
      <div className="note" style={{ marginTop: 10, fontSize: '1.08rem' }}>This takes a few seconds</div>
    </div>
  );

  if (step === 'check') return (
    <div className="fade">
      <div className="pad"><h1>Is this right?</h1><div className="day">Change anything that looks wrong</div></div>
      <div className="stack">
        {warnLowConf && <div className="warn-box">We are not very sure about this one — please check the numbers.</div>}
        {preview && <div className="camwrap" style={{ maxHeight: 220 }}><img src={preview} alt="Your meal" /></div>}
        <div className="card">
          <label className="lab">We think this is</label>
          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} style={{ fontSize: '1.15rem' }} />
          <Stepper label="Calories" value={edit.cal} onChange={(v) => setEdit({ ...edit, cal: v })} max={4000} step={10} />
          <Stepper label="Protein (g)" value={edit.pro} onChange={(v) => setEdit({ ...edit, pro: v })} max={300} />
          <Stepper label="Carbs (g)" value={edit.carb} onChange={(v) => setEdit({ ...edit, carb: v })} max={500} />
          <Stepper label="Fat (g)" value={edit.fat} onChange={(v) => setEdit({ ...edit, fat: v })} max={200} />
        </div>
        <button className="big" style={{ minHeight: 76 }} onClick={saveMeal}><Check size={26} /> Save</button>
        <button className="big alt" onClick={() => { setStep('pick'); setEst(null); setPreview(null); setBlob(null); }}>Start over</button>
      </div>
    </div>
  );

  if (step === 'shot') return (
    <div className="fade">
      <div className="pad">
        <BackBtn onClick={() => { stopCam(); setStep('pick'); }} />
        <h1>{mode === 'photo' ? 'Take a photo' : 'Type what you ate'}</h1>
      </div>
      <div className="stack">
        {mode === 'photo' ? (
          <>
            <div className="camwrap">
              <video ref={videoRef} autoPlay playsInline muted />
            </div>
            <button className="big" style={{ minHeight: 76 }} onClick={capture}>Take photo</button>
            <button className="big plain" onClick={() => fileRef.current?.click()}>Choose a photo instead</button>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
          </>
        ) : (
          <>
            <div className="card">
              <textarea rows={5} placeholder="Two rotis, dal and a bowl of curd"
                value={text} onChange={(e) => setText(e.target.value)} />
              <div className="note" style={{ marginTop: 14 }}>Write it the way you would say it.</div>
            </div>
            <button className="big" style={{ minHeight: 76 }} onClick={() => {
              if (!text.trim()) { toast('Please type what you ate first'); return; }
              runAnalysis({ text });
            }}>Done</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="fade">
      <div className="pad"><h1>Add a meal</h1><div className="day">Choose one</div></div>
      <div className="stack">
        <button className="big" style={{ minHeight: 145, flexDirection: 'column', gap: 13, fontSize: '1.45rem' }}
          onClick={() => { setMode('photo'); setStep('shot'); setTimeout(startCam, 50); }}>
          <Camera size={50} /> Take a photo
        </button>
        <button className="big alt" style={{ minHeight: 145, flexDirection: 'column', gap: 13, fontSize: '1.45rem' }}
          onClick={() => { setMode('text'); setStep('shot'); }}>
          <Type size={50} /> Type what you ate
        </button>
      </div>
    </div>
  );
}
