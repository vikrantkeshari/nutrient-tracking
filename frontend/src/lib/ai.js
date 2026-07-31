// AI meal analysis: real Worker call, or a small offline fake in demo mode.
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'http://localhost:8787/';

export async function analyzeMeal({ image, text }) {
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image, text }),
  });
  if (!res.ok) throw new Error(`Analysis failed (${res.status})`);
  return res.json(); // {food_item, calories, protein_g, carbs_g, fat_g, confidence, explanation}
}

// ---- Demo fallback (no worker needed) ----
const FOODS = [
  [/roti|chapati|dal|curd|sabzi/i, { food_item: 'Roti, Dal & Curd', calories: 430, protein_g: 18, carbs_g: 62, fat_g: 12, confidence: 0.86 }],
  [/rice|biryani|pulao/i, { food_item: 'Rice Bowl', calories: 520, protein_g: 14, carbs_g: 88, fat_g: 11, confidence: 0.84 }],
  [/egg|omelet/i, { food_item: 'Eggs & Toast', calories: 340, protein_g: 22, carbs_g: 24, fat_g: 16, confidence: 0.9 }],
  [/chicken/i, { food_item: 'Chicken & Vegetables', calories: 480, protein_g: 44, carbs_g: 26, fat_g: 18, confidence: 0.92 }],
  [/salad|paneer/i, { food_item: 'Paneer Salad', calories: 390, protein_g: 24, carbs_g: 22, fat_g: 22, confidence: 0.88 }],
  [/oats|porridge|poha|upma/i, { food_item: 'Oats Bowl', calories: 310, protein_g: 11, carbs_g: 52, fat_g: 7, confidence: 0.9 }],
  [/shake|smoothie|protein/i, { food_item: 'Protein Shake', calories: 220, protein_g: 30, carbs_g: 12, fat_g: 4, confidence: 0.95 }],
  [/tea|chai|coffee|biscuit/i, { food_item: 'Chai & Biscuits', calories: 180, protein_g: 4, carbs_g: 26, fat_g: 7, confidence: 0.8 }],
];
const DISHES = [
  { food_item: 'Grilled Chicken & Quinoa', calories: 520, protein_g: 48, carbs_g: 52, fat_g: 12, confidence: 0.94 },
  { food_item: 'Vegetable Thali', calories: 640, protein_g: 21, carbs_g: 92, fat_g: 20, confidence: 0.82 },
  { food_item: 'Masala Dosa', calories: 450, protein_g: 10, carbs_g: 68, fat_g: 16, confidence: 0.87 },
  { food_item: 'Fruit & Yogurt Bowl', calories: 260, protein_g: 12, carbs_g: 44, fat_g: 5, confidence: 0.91 },
];
let dishIdx = 0;

export function fakeAnalyze({ text }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (text) {
        for (const [re, f] of FOODS) if (re.test(text)) return resolve({ ...f });
        return resolve({
          food_item: text.length > 40 ? text.slice(0, 40) + '…' : text,
          calories: 400, protein_g: 18, carbs_g: 50, fat_g: 14, confidence: 0.6,
        });
      }
      resolve({ ...DISHES[dishIdx++ % DISHES.length] });
    }, 1200);
  });
}
