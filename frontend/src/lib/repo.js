// Data layer. One interface, two implementations:
//  - supabaseRepo: real backend (schema v2)
//  - demoRepo: localStorage, zero setup
// Screens never branch on demo mode — they just call repo.* (kills PRD G15).
import { supabase, isSupabaseConfigured } from '../utils/supabase';
import { todayISO, DEFAULT_GOALS } from './goals';

/* ============================ Supabase ============================ */
const supabaseRepo = {
  demo: false,

  async getSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user ?? null;
  },
  onAuthChange(cb) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => cb(s?.user ?? null));
    return () => subscription.unsubscribe();
  },
  async signUp({ email, password, name, age, weight, height, goals }) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: {
        display_name: name, age, weight, height,
        goal_cal: goals?.cal, goal_pro: goals?.pro, goal_carb: goals?.carb, goal_fat: goals?.fat,
      }},
    });
    if (error) throw error;
    return data.user;
  },
  async signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  },
  async signOut() { await supabase.auth.signOut(); },
  async resetPassword(email) {
    await supabase.auth.resetPasswordForEmail(email);
  },

  async getProfile(userId) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error) throw error;
    return {
      id: data.id, name: data.display_name,
      age: data.age, weight: data.weight, height: data.height,
      goals: { cal: data.daily_calorie_goal, pro: data.daily_protein_goal, carb: data.daily_carb_goal, fat: data.daily_fat_goal },
    };
  },
  async updateGoals(userId, g) {
    const { error } = await supabase.from('profiles').update({
      daily_calorie_goal: g.cal, daily_protein_goal: g.pro, daily_carb_goal: g.carb, daily_fat_goal: g.fat,
    }).eq('id', userId);
    if (error) throw error;
  },

  async listMeals(userId, dateISO) {
    const { data, error } = await supabase.from('macro_logs').select('*')
      .eq('user_id', userId).eq('logged_date', dateISO)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(rowToMeal);
  },
  async addMeal(userId, m) {
    let thumbnail_path = null;
    if (m.imageBlob) {
      thumbnail_path = `${userId}/${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from('thumbnails')
        .upload(thumbnail_path, m.imageBlob, { contentType: 'image/jpeg' });
      if (upErr) thumbnail_path = null; // photo is optional; never block the log
    }
    const { data, error } = await supabase.from('macro_logs').insert({
      user_id: userId, meal_name: m.name,
      calories: m.cal, protein_g: m.pro, carbs_g: m.carb, fat_g: m.fat,
      thumbnail_path, logged_date: todayISO(),
      ai_confidence: m.aiConfidence ?? null, is_edited: m.isEdited ?? false,
      original_calories: m.original?.cal ?? null, original_protein_g: m.original?.pro ?? null,
      original_carbs_g: m.original?.carb ?? null, original_fat_g: m.original?.fat ?? null,
    }).select().single();
    if (error) throw error;
    return rowToMeal(data);
  },
  async deleteMeal(userId, mealId) {
    const { error } = await supabase.from('macro_logs').delete().eq('id', mealId).eq('user_id', userId);
    if (error) throw error;
  },

  async listGroups(userId) {
    const { data: memberships, error } = await supabase.from('group_members')
      .select('group_id, share_level, role, groups(id, name, group_type, invite_code)')
      .eq('user_id', userId);
    if (error) throw error;

    const today = todayISO();
    const [{ data: totals }, { data: sharedMeals }] = await Promise.all([
      supabase.from('shared_daily_totals').select('*').eq('logged_date', today),
      supabase.from('shared_meal_logs').select('*').eq('logged_date', today).order('created_at', { ascending: false }),
    ]);

    const groups = [];
    for (const ms of memberships) {
      const g = ms.groups;
      const { data: members } = await supabase.from('group_members')
        .select('user_id, share_level, role, profiles(display_name)')
        .eq('group_id', g.id).neq('user_id', userId);
      groups.push({
        id: g.id, name: g.name, type: g.group_type, code: g.invite_code,
        mine: ms.share_level, myRole: ms.role,
        members: (members ?? []).map((m) => {
          const t = (totals ?? []).find((x) => x.user_id === m.user_id);
          return {
            id: m.user_id, name: m.profiles?.display_name ?? 'Member', lvl: m.share_level,
            cal: t?.calories ?? 0, pro: t?.protein_g ?? 0, carb: t?.carbs_g ?? 0, fat: t?.fat_g ?? 0,
            meals: m.share_level === 'detailed'
              ? (sharedMeals ?? []).filter((x) => x.user_id === m.user_id)
                  .map((x) => ({ name: x.meal_name, cal: x.calories, time: fmtTime(x.created_at) }))
              : [],
          };
        }),
      });
    }
    return groups;
  },
  async createGroup(userId, { name, type = 'other', level }) {
    const code = 'GRP-' + Math.random().toString(36).slice(2, 8).toUpperCase();
    const { data: g, error } = await supabase.from('groups')
      .insert({ name, group_type: type, invite_code: code, created_by: userId })
      .select().single();
    if (error) throw error;
    const { error: mErr } = await supabase.from('group_members')
      .insert({ group_id: g.id, user_id: userId, role: 'owner', share_level: level });
    if (mErr) throw mErr;
    return { id: g.id, name: g.name, code: g.invite_code };
  },
  async joinGroup(_userId, { code, level }) {
    const { data, error } = await supabase.rpc('join_group_by_code', { code, level });
    if (error) throw error;
    if (!data.ok) throw new Error(data.error === 'already_member'
      ? 'You are already in that group.'
      : 'We could not find that code. Please check and try again.');
    return { id: data.group_id, name: data.name };
  },
  async leaveGroup(userId, groupId) {
    const { error } = await supabase.from('group_members').delete()
      .eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
  },
  async setShareLevel(userId, groupId, level) {
    const { error } = await supabase.from('group_members').update({ share_level: level })
      .eq('group_id', groupId).eq('user_id', userId);
    if (error) throw error;
  },
};

const rowToMeal = (r) => ({
  id: r.id, name: r.meal_name, cal: r.calories, pro: r.protein_g, carb: r.carbs_g, fat: r.fat_g,
  time: fmtTime(r.created_at), thumbnailPath: r.thumbnail_path,
});
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/* ============================ Demo ============================ */
const DKEY = 'nt_demo_v2';
const DEMO_GROUPS = {
  'FAM-7K2X9M': { name: 'Family', type: 'family', members: [
    { id: 'p1', name: 'Priya', lvl: 'detailed', cal: 1180, pro: 72, carb: 120, fat: 41,
      meals: [{ name: 'Paneer Salad', cal: 410, time: '1:40 PM' }, { name: 'Poha & Chai', cal: 340, time: '8:30 AM' }] },
    { id: 'p2', name: 'Dad', lvl: 'totals', cal: 1890, pro: 104, carb: 210, fat: 62, meals: [] },
    { id: 'p3', name: 'Liam', lvl: 'none', cal: 0, meals: [] } ] },
  'GYM-4B8QZ1': { name: 'Gym Friends', type: 'gym', members: [
    { id: 'p4', name: 'Rahul', lvl: 'totals', cal: 2640, pro: 198, carb: 242, fat: 78, meals: [] },
    { id: 'p5', name: 'Sneha', lvl: 'totals', cal: 1720, pro: 141, carb: 150, fat: 52, meals: [] } ] },
  'OFF-9W3RT6': { name: 'Office', type: 'office', members: [
    { id: 'p6', name: 'Meera', lvl: 'totals', cal: 1540, pro: 88, carb: 168, fat: 49, meals: [] },
    { id: 'p7', name: 'Tom', lvl: 'none', cal: 0, meals: [] } ] },
};
const dload = () => { try { return JSON.parse(localStorage.getItem(DKEY)) ?? {}; } catch { return {}; } };
const dsave = (d) => localStorage.setItem(DKEY, JSON.stringify(d));

const demoRepo = {
  demo: true,
  async getSession() { const d = dload(); return d.user ?? null; },
  onAuthChange() { return () => {}; },
  async signUp({ email, name, age, weight, height, goals }) {
    const d = dload();
    d.user = { id: 'demo-user', email };
    d.profile = { id: 'demo-user', name: name || email.split('@')[0], age, weight, height, goals: goals ?? { ...DEFAULT_GOALS } };
    d.meals = d.meals ?? []; d.groups = d.groups ?? [];
    dsave(d); return d.user;
  },
  async signIn({ email, password }) {
    if (!email || !password) throw new Error("That email and password don't match. Please try again.");
    const d = dload();
    d.user = { id: 'demo-user', email };
    d.profile = d.profile ?? { id: 'demo-user', name: email.split('@')[0], goals: { ...DEFAULT_GOALS } };
    dsave(d); return d.user;
  },
  async signOut() { const d = dload(); delete d.user; dsave(d); },
  async resetPassword() {},
  async getProfile() { return dload().profile; },
  async updateGoals(_u, goals) { const d = dload(); d.profile.goals = goals; dsave(d); },
  async listMeals(_u, dateISO) {
    return (dload().meals ?? []).filter((m) => m.date === dateISO);
  },
  async addMeal(_u, m) {
    const d = dload();
    const meal = { id: String(Date.now()), name: m.name, cal: m.cal, pro: m.pro, carb: m.carb, fat: m.fat,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), date: todayISO() };
    d.meals = [meal, ...(d.meals ?? [])]; dsave(d);
    return meal;
  },
  async deleteMeal(_u, id) { const d = dload(); d.meals = d.meals.filter((m) => m.id !== id); dsave(d); },
  async listGroups() { return dload().groups ?? []; },
  async createGroup(_u, { name, type = 'other', level }) {
    const d = dload();
    const g = { id: String(Date.now()), name, type, code: 'GRP-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      mine: level, myRole: 'owner', members: [] };
    d.groups = [...(d.groups ?? []), g]; dsave(d);
    return g;
  },
  async joinGroup(_u, { code, level }) {
    const d = dload();
    const known = DEMO_GROUPS[code.toUpperCase().trim()];
    if (!known) throw new Error('We could not find that code. Please check and try again.');
    if ((d.groups ?? []).some((g) => g.code === code.toUpperCase().trim()))
      throw new Error('You are already in that group.');
    const g = { id: String(Date.now()), name: known.name, type: known.type, code: code.toUpperCase().trim(),
      mine: level, myRole: 'member', members: JSON.parse(JSON.stringify(known.members)) };
    d.groups = [...(d.groups ?? []), g]; dsave(d);
    return g;
  },
  async leaveGroup(_u, groupId) {
    const d = dload(); d.groups = d.groups.filter((g) => g.id !== groupId); dsave(d);
  },
  async setShareLevel(_u, groupId, level) {
    const d = dload();
    d.groups = d.groups.map((g) => (g.id === groupId ? { ...g, mine: level } : g));
    dsave(d);
  },
};

export const repo = isSupabaseConfigured() ? supabaseRepo : demoRepo;
