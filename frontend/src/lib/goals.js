// Mifflin-St Jeor BMR -> TDEE (light activity 1.4) -> macro split.
// Offered as a suggestion the user can accept or override (PRD #22).
export function suggestGoals({ age, weight, height }) {
  if (!age || !weight || !height) return null;
  const bmr = 10 * weight + 6.25 * height - 5 * age + 5;
  const tdee = Math.round((bmr * 1.4) / 10) * 10;
  return {
    cal: tdee,
    pro: Math.round(weight * 1.6),
    carb: Math.round((tdee * 0.45) / 4),
    fat: Math.round((tdee * 0.28) / 9),
  };
}

export const DEFAULT_GOALS = { cal: 2000, pro: 150, carb: 200, fat: 70 };

export const todayISO = () => {
  // device-local calendar date (PRD: time comes from the device)
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
