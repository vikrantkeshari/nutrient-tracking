# Backlog

Every known problem in the codebase, written so you can file it as a GitHub issue by copying the section — or just pick one and start.

These came from a full source review in August 2026 against commit `5be38e2`. Nothing here is speculative; each one names the file and line of code responsible.

**Difficulty is honest:** 🟢 good first issue · 🟡 needs some context · 🔴 needs the full backend running.

| # | Issue | Type | Difficulty |
|---|---|---|---|
| [1](#1--creating-a-group-fails-under-rls) | Creating a group fails under RLS | 🐛 bug | 🟡 |
| [2](#2--saving-a-meal-fails-silently) | Saving a meal fails silently | 🐛 bug | 🟢 |
| [3](#3--photos-are-stored-but-never-displayed) | Photos are stored but never displayed | 🐛 bug | 🟡 |
| [4](#4--deleting-a-meal-orphans-its-photo) | Deleting a meal orphans its photo | 🐛 bug | 🟢 |
| [5](#5--confirm-the-nightly-purge-actually-frees-storage) | Confirm the purge actually frees storage | 🔍 investigation | 🔴 |
| [6](#6--no-way-to-edit-a-logged-meal) | No way to edit a logged meal | ✨ feature | 🟡 |
| [7](#7--no-way-to-see-any-day-but-today) | No way to see any day but today | ✨ feature | 🟡 |
| [8](#8--no-way-to-update-age-weight-or-height) | No way to update age, weight or height | ✨ feature | 🟢 |
| [9](#9--group-admin-actions-exist-in-the-database-but-not-the-ui) | Group admin actions have no UI | ✨ feature | 🟡 |
| [10](#10--every-group-is-created-as-type-other) | Every group is created as type "other" | 🐛 bug | 🟢 |
| [11](#11--listgroups-makes-n1-queries) | `listGroups` makes N+1 queries | ⚡ perf | 🟡 |
| [12](#12--join_group_by_code-has-no-rate-limit) | `join_group_by_code` has no rate limit | 🔒 security | 🔴 |
| [13](#13--trends-screen-does-not-exist) | Trends screen does not exist | ✨ feature | 🔴 |
| [14](#14--ai-accuracy-dashboard) | AI accuracy dashboard | ✨ feature | 🟡 |
| [15](#15--sign-out-uses-a-blocking-confirm-dialog) | Sign out uses a blocking confirm dialog | 🎨 polish | 🟢 |
| [16](#16--no-tests-anywhere) | No tests anywhere | 🧪 infra | 🟡 |
| [17](#17--no-linter-and-no-ci-checks) | No linter and no CI checks | 🧪 infra | 🟢 |
| [18](#18--no-error-boundary) | No error boundary | 🧪 infra | 🟢 |
| [19](#19--quick-re-log-a-recent-meal) | Quick re-log a recent meal | ✨ feature | 🟡 |
| [20](#20--make-it-installable-pwa) | Make it installable (PWA) | ✨ feature | 🔴 |

---

## 1 · Creating a group fails under RLS

**Type:** bug · **Difficulty:** 🟡 · **Files:** `frontend/src/lib/repo.js`, `supabase/schema.sql`

**What happens.** `repo.createGroup` does:

```js
const { data: g, error } = await supabase.from('groups')
  .insert({ name, group_type: type, invite_code: code, created_by: userId })
  .select().single();
```

PostgREST issues `INSERT … RETURNING`, and returning a row requires the **SELECT** policy to pass on it. The only SELECT policy is `groups_select_member`, which calls `is_group_member(id)` — and at that instant you are not a member, because the `group_members` row is inserted on the *next* statement. Expect no row back or an RLS error, leaving an orphaned group nobody can see.

**Why it's never been reported:** the project's original Supabase backend was removed before anyone hit this in production. Demo mode doesn't exercise RLS at all.

**Suggested fix.** Mirror what `join_group_by_code` already does — a `security definer` function that creates the group and the owner membership in one transaction:

```sql
create or replace function public.create_group(gname text, gtype text, level text)
returns json language plpgsql security definer set search_path = public as $$
declare new_id uuid; code text;
begin
  if level not in ('detailed','totals','none') then raise exception 'invalid share level'; end if;
  if gtype not in ('family','gym','office','other') then raise exception 'invalid group type'; end if;
  code := 'GRP-' || upper(substr(md5(random()::text), 1, 6));
  insert into groups (name, group_type, invite_code, created_by)
    values (gname, gtype, code, auth.uid()) returning id into new_id;
  insert into group_members (group_id, user_id, role, share_level)
    values (new_id, auth.uid(), 'owner', level);
  return json_build_object('id', new_id, 'name', gname, 'code', code);
end $$;
```

Then `repo.createGroup` becomes an `.rpc('create_group', …)` call. This also moves invite-code generation server-side, where `md5(random())` beats the client's `Math.random()`.

**Verify.** Real Supabase project, fresh account, create a group, confirm it appears in Groups and the code works from a second account.

---

## 2 · Saving a meal fails silently

**Type:** bug · **Difficulty:** 🟢 **good first issue** · **File:** `frontend/src/screens/AddMeal.jsx`

**What happens.** `saveMeal()` awaits `repo.addMeal` with no `try/catch`. Any failure — RLS, network, expired session — becomes an unhandled promise rejection: no toast, no error state, and `onSaved()` never runs. The user is left on the review screen tapping a Save button that appears to do nothing, with no indication anything went wrong.

This is the exact silent-failure class the project already fixed everywhere else, reintroduced in the single most important flow.

**Suggested fix.**

```js
async function saveMeal() {
  if (!edit.name.trim()) { toast('Please give the meal a name'); return; }
  setSaving(true);
  try {
    await repo.addMeal(user.id, { /* … */ });
    toast(`Saved — ${edit.cal} calories added`);
    onSaved();
  } catch (e) {
    toast('We could not save that meal. Please try again.');
    console.error(e);
  } finally {
    setSaving(false);
  }
}
```

Add a `saving` state and disable the Save button while it's true — double-tapping currently inserts the meal twice.

**Verify.** In demo mode, temporarily make `demoRepo.addMeal` throw. You should get a toast and stay on the screen, not a dead button.

---

## 3 · Photos are stored but never displayed

**Type:** bug · **Difficulty:** 🟡 · **Files:** `frontend/src/utils/supabase.js`, `screens/Today.jsx`, `lib/repo.js`

**What happens.** Every meal photo is captured, compressed, uploaded to private storage, and recorded as `thumbnail_path`. Then nothing reads it. `signedThumbUrl()` has **zero call sites**; `rowToMeal` maps `thumbnailPath` onto every meal object and no component touches it.

So each photo costs an upload, a storage row, and 30 days of quota, for no user-visible benefit whatsoever — and the private bucket plus signed-URL machinery, which is the whole architectural point, is untested in practice.

**Suggested fix.** Render thumbnails in the Today meal list. Resolve URLs in a batch after meals load (signed URLs last 60 minutes), not per row:

```js
const [thumbs, setThumbs] = useState({});
useEffect(() => {
  const withPhotos = meals.filter(m => m.thumbnailPath);
  if (!withPhotos.length) return;
  Promise.all(withPhotos.map(async m => [m.id, await signedThumbUrl(m.thumbnailPath)]))
    .then(pairs => setThumbs(Object.fromEntries(pairs.filter(([, u]) => u))));
}, [meals]);
```

A 52px rounded square on the left of each `.item`, falling back to the existing layout when there's no photo. **Demo mode has no photos — make sure the fallback is the normal case, not an error state.**

The alternative resolution, if nobody wants to build this, is to stop uploading photos entirely and delete the storage line from the cost model. Say which you're doing in the PR.

---

## 4 · Deleting a meal orphans its photo

**Type:** bug · **Difficulty:** 🟢 **good first issue** · **File:** `frontend/src/lib/repo.js`

**What happens.** `repo.deleteMeal` deletes the `macro_logs` row and never calls `storage.remove()`. The photo stays in the bucket — and the nightly purge matches files by joining against `macro_logs.thumbnail_path`, which is now gone. **The orphan is never collected.** Storage leaks, slowly and permanently.

**Suggested fix.** Fetch the path before deleting, then remove both:

```js
async deleteMeal(userId, mealId) {
  const { data: row } = await supabase.from('macro_logs')
    .select('thumbnail_path').eq('id', mealId).eq('user_id', userId).single();
  const { error } = await supabase.from('macro_logs')
    .delete().eq('id', mealId).eq('user_id', userId);
  if (error) throw error;
  if (row?.thumbnail_path) {
    await supabase.storage.from('thumbnails').remove([row.thumbnail_path]);
  }
}
```

Order matters: delete the row first, so a storage failure doesn't leave a meal pointing at a file that's gone. Add a matching no-op to `demoRepo` so the interface stays symmetrical.

Worth pairing with a one-off cleanup query for orphans already in the bucket.

---

## 5 · Confirm the nightly purge actually frees storage

**Type:** investigation · **Difficulty:** 🔴 · **File:** `supabase/schema.sql`

**What happens.** `purge_old_thumbnails()` removes rows from `storage.objects` with plain SQL. In Supabase, deleting that row does not reliably delete the underlying object from the storage backend — the documented path is the Storage API. If that's true here, the job clears references nightly while the bytes accumulate forever, and the 1 GB headroom in the cost model is fiction.

**How to check.** Upload a file, note bucket usage in the dashboard, delete its `storage.objects` row by SQL, wait for the usage figure to refresh, and see whether it drops.

**If it doesn't free space,** replace the SQL delete with a scheduled call to the Storage API — `pg_net` from within the cron job, or an external scheduled job. Either way the fix belongs in `schema.sql` next to the existing function, and the cost model in [ARCHITECTURE](ARCHITECTURE.md#cost-model) needs a note.

Please post findings on the issue even if the answer is "it works fine" — that's a useful result.

---

## 6 · No way to edit a logged meal

**Type:** feature · **Difficulty:** 🟡 · **Files:** `lib/repo.js`, `screens/Today.jsx`, new edit screen

**What happens.** Delete is the only correction path. Log 450 calories instead of 540 and you must remove the meal and start over — re-photographing or retyping it.

The RLS policy `logs_update_own` already exists and permits updates. Nothing else does.

**Suggested fix.**

1. `repo.updateMeal(userId, mealId, fields)` — **in both implementations**
2. Tap a meal in Today's list to open an edit sheet reusing `<Stepper>`, same layout as the "Is this right?" review screen
3. Leave `is_edited` and `original_*` alone — they record the AI's estimate versus the user's *first* correction. A later edit shouldn't overwrite that history

Design is in [mockups.html](mockups.html) under "Designed, not built".

---

## 7 · No way to see any day but today

**Type:** feature · **Difficulty:** 🟡 · **Files:** `lib/repo.js`, `App.jsx`, `screens/Today.jsx`

**What happens.** `repo.listMeals(userId, todayISO())` is the only read path. There is no date picker, no history, no way to check what you ate yesterday. Every log you've ever saved is in the database and unreachable through the UI.

**Suggested fix.** `listMeals` already takes a date parameter — the plumbing is done. What's missing is the UI: a date strip or `‹ Today ›` stepper at the top of the Today screen, with the rings, bars, and meal list all recomputing for the selected day. The `(user_id, logged_date)` index makes it cheap.

Keep it to one screen rather than a new tab — the app's four-tab structure is deliberate.

---

## 8 · No way to update age, weight or height

**Type:** feature · **Difficulty:** 🟢 **good first issue** · **Files:** `screens/Me.jsx`, `lib/repo.js`

**What happens.** Age, weight, and height are collected once during signup and are editable nowhere. "Suggest goals for me" recomputes Mifflin-St Jeor from whatever you typed months ago — so for a tracker, the single input most likely to change is the one you can't change.

**Suggested fix.** An "About me" card on the Me screen reusing `<NumberField>` and `<HeightField>` from `components/UI.jsx` (both already built for onboarding), plus `repo.updateProfile(userId, { age, weight, height })` on both implementations. After saving, re-run `suggestGoals()` and offer the new numbers rather than applying them silently.

---

## 9 · Group admin actions exist in the database but not the UI

**Type:** feature · **Difficulty:** 🟡 · **Files:** `screens/Groups.jsx`, `lib/repo.js`

**What happens.** Two owner capabilities are fully implemented server-side and completely unreachable:

- `rotate_invite_code(gid)` — verifies ownership, issues a new code
- The `gm_delete` policy already lets an owner remove another member

Neither has a repo method or a button. So an invite code shared in the wrong WhatsApp group can never be revoked.

**Suggested fix.** In the group detail screen, when `g.myRole === 'owner'`, show a "Manage group" section: the current code with a **Make a new code** button (`.rpc('rotate_invite_code', { gid })`), and a remove control on each member row. Use the app's existing confirm-then-toast pattern, and plain-language copy — "Anyone using the old code will need the new one."

Design is in [mockups.html](mockups.html).

---

## 10 · Every group is created as type "other"

**Type:** bug · **Difficulty:** 🟢 **good first issue** · **Files:** `screens/Groups.jsx`, `screens/Onboarding.jsx`

**What happens.** The schema constrains `group_type` to `family | gym | office | other`, and `repo.createGroup` accepts a `type` argument — but no caller ever passes one, so every real group is `'other'`. The distinction exists only in demo seed data.

**Suggested fix.** Add a type picker to the create-group screen, using the existing `.choice` button style: Family · Gym · Office · Something else. Pass it through to `createGroup`. Optionally show a small icon per type in the group list, which is presumably why the column exists.

---

## 11 · `listGroups` makes N+1 queries

**Type:** performance · **Difficulty:** 🟡 · **File:** `frontend/src/lib/repo.js`

**What happens.** After fetching memberships, the function loops over groups and issues a separate `group_members` query for each one — on every refresh, and refresh runs after every save, delete, join, leave, and share-level change.

Three groups means four round trips where one would do. Harmless at household scale; wasteful and easy to fix.

**Suggested fix.** Collect the group IDs and fetch all members in a single `.in('group_id', ids)` query, then group in memory. Watch out for the `.neq('user_id', userId)` filter — keep excluding yourself, since the UI renders "You" separately from the member list.

---

## 12 · `join_group_by_code` has no rate limit

**Type:** security hardening · **Difficulty:** 🔴 · **File:** `supabase/schema.sql`

**What happens.** Invite codes are six base-36 characters (~2.2 billion combinations). Enumeration through `SELECT` is properly blocked — there's no open read policy on `groups`. But `join_group_by_code` can be called as fast as the network allows, so brute force is theoretically open.

Blast radius is genuinely limited: joining reveals only what members chose to share, and never photos. Worth fixing, not worth panicking about.

**Suggested fix.** Add an attempt log and check it inside the function:

```sql
create table public.join_attempts (
  user_id uuid not null, attempted_at timestamptz not null default now()
);
create index on public.join_attempts (user_id, attempted_at);
-- inside join_group_by_code, before resolving the code:
--   count attempts by auth.uid() in the last hour; if > 10, raise exception
```

Ten failed attempts an hour is far beyond honest use and makes brute force pointless. Add a cleanup to the existing nightly cron job so the table doesn't grow forever.

---

## 13 · Trends screen does not exist

**Type:** feature · **Difficulty:** 🔴 · **Files:** new screen, `lib/repo.js`, `App.jsx`

**Background.** An earlier version had a trends chart — filled with `Math.random()` data, in production, rendering as though it were real. It was correctly deleted rather than fixed. Nothing replaced it, so this is a from-scratch build, not a data swap.

**What to build.** A personal chart over `logged_date` with the goal line overlaid, switchable across calories and the three macros; and a group comparison for members sharing `detailed` or `totals`. `shared_daily_totals` already aggregates exactly what's needed.

**Constraints.** No chart library — hand-rolled SVG, consistent with the rest of the app. Use the macro tokens (`--cal`, `--pro`, `--carb`, `--fat`) so colours stay consistent with the bars. **Show an empty state when there's no data. Never render a placeholder that could be mistaken for real numbers** — that's exactly what went wrong last time.

Design is in [mockups.html](mockups.html).

---

## 14 · AI accuracy dashboard

**Type:** feature · **Difficulty:** 🟡 · **Files:** new screen or a Me section, `lib/repo.js`

**What happens.** Every meal already stores `ai_confidence`, `is_edited`, and the model's original four macro values alongside the user's corrections. **Nothing reads any of it.** There is a real accuracy dataset accumulating in the database with no consumer.

**What to build.** Correction rate (what share of estimates got edited), mean absolute error per macro on the edited ones, and confidence calibration — does the model's self-reported confidence actually predict when it's wrong?

This turns "which vision model should we use?" from an argument into a measurement, which was the whole reason those columns exist.

---

## 15 · Sign out uses a blocking confirm dialog

**Type:** polish · **Difficulty:** 🟢 **good first issue** · **File:** `frontend/src/screens/Me.jsx`

**What happens.** `window.confirm('Sign out?')` blocks the whole browser and looks nothing like the rest of the app. Signing out isn't destructive — nothing is lost — so it doesn't warrant a confirmation at all.

**Suggested fix.** Drop the confirm; sign out directly and show the toast. (The other two `window.confirm` calls — deleting a meal and leaving a group — guard genuinely destructive actions and can stay until someone builds a proper in-app confirmation sheet. That'd be a nice follow-up.)

---

## 16 · No tests anywhere

**Type:** infrastructure · **Difficulty:** 🟡 · **Files:** new `frontend/src/**/*.test.js`, `package.json`, `.github/workflows/`

**What happens.** No test runner, no test files, no assertions. CI builds and deploys; nothing verifies anything is correct. Every bug in this backlog was found by reading code, which is not a sustainable strategy.

**Where to start.** Three pure functions with real logic and zero setup cost:

| Target | Why it matters |
|---|---|
| `suggestGoals()` in `lib/goals.js` | Mifflin-St Jeor arithmetic, plus the null guard when metrics are missing |
| `todayISO()` in `lib/goals.js` | Device-local date, zero-padding, month boundaries — this is the whole timezone story |
| The edit-diff in `AddMeal.saveMeal` | Decides `is_edited`; needs extracting to a pure function first, which is itself a good change |
| `compressImage()` in `utils/compressor.js` | Recursion terminates, output respects the 50 KB cap |

**Suggested setup.** Vitest (it shares Vite's config, so this is nearly zero configuration), plus `@testing-library/react` when component tests start. Add `"test": "vitest run"` to `package.json` and a step to `deploy.yml` so a red test blocks deployment.

Taking this issue makes every other issue easier. It's the highest-leverage thing on the list.

---

## 17 · No linter and no CI checks

**Type:** infrastructure · **Difficulty:** 🟢 **good first issue** · **Files:** `frontend/package.json`, `.github/workflows/deploy.yml`

**What happens.** No ESLint, no formatter. Style is consistent only because one person wrote everything — which stops being true the moment this repo has contributors.

**Suggested fix.** ESLint with `eslint-plugin-react-hooks` (it would have caught the existing `exhaustive-deps` suppression in `App.jsx`), plus Prettier for formatting. Add a lint step to the workflow before the build.

**Please fix existing violations in a separate commit from adding the config** — a single commit that both adds ESLint and reformats every file is unreviewable.

---

## 18 · No error boundary

**Type:** infrastructure · **Difficulty:** 🟢 **good first issue** · **File:** `frontend/src/App.jsx`

**What happens.** Any render-time exception unmounts the entire app and leaves a blank white screen with no explanation and no way back except a page refresh.

**Suggested fix.** A small class component wrapping `<Shell />` inside `<ToastProvider>`, rendering a plain-language recovery screen in the app's own style — "Something went wrong. Tap below to start again." — with a reload button. Log the error to the console for developers. Match the existing visual language; use the `.logo` and `.big` classes rather than inventing new ones.

---

## 19 · Quick re-log a recent meal

**Type:** feature · **Difficulty:** 🟡 · **Files:** `screens/AddMeal.jsx`, `lib/repo.js`

**Why.** Most people eat roughly the same twenty things. Photographing the same breakfast every morning is friction the product exists to remove — and it also burns AI quota re-analyzing a meal we already have exact numbers for.

**What to build.** On the "Add a meal" screen, a third option: **Something I eat often**, listing recent distinct meals by name with their macros. One tap logs it again with today's date and no AI call. `is_edited` and `ai_confidence` should be null for these — they aren't estimates.

Needs a `repo.listFrequentMeals(userId)` doing a distinct-on by `meal_name` ordered by recency, in both implementations.

---

## 20 · Make it installable (PWA)

**Type:** feature · **Difficulty:** 🔴 · **Files:** `frontend/public/manifest.json`, service worker, `vite.config.js`

**Why.** Offline logging was deferred as needing a packaged app, but a PWA is the middle path: a manifest plus a service worker makes the existing site installable to a phone home screen, with offline queueing of logs — no app store, no native rewrite, no cost.

**What to build.** A web app manifest with icons and `display: standalone`; a service worker caching the app shell; and an offline queue that stores pending logs in IndexedDB and flushes them when connectivity returns.

**The hard part is the queue, not the manifest.** A meal logged offline still needs its device-local `logged_date` stamped at capture time, not at flush time, or a breakfast logged on a plane lands on the wrong day. Discuss the approach on the issue before building.

---

## Already fixed — don't re-report

These appear in older project notes and are resolved as of `5be38e2`:

- Decommissioned vision model → now Gemini Flash with `gpt-4o-mini` failover
- Group totals always zero → now read from `shared_daily_totals`
- Public storage bucket → now private with owner-only policies
- Fabricated `Math.random()` chart data → removed (see [#13](#13--trends-screen-does-not-exist))
- Open CORS on the Worker → locked to `ALLOWED_ORIGINS`
- Single-group schema → migrated to `groups` + `group_members`
- Client-side 90-day photo purge → server-side `pg_cron` at 30 days (but see [#5](#5--confirm-the-nightly-purge-actually-frees-storage))
- 1,712-line `App.jsx` → split into screens; `App.jsx` is now 119 lines
- `alert()` everywhere → toast system and inline error states
- Implicit timezone handling → explicit `logged_date` stamped device-side

**Not a vulnerability:** the Supabase anon key is present in the git history and in the deployed bundle. It's public by design — [SECURITY.md](../SECURITY.md) explains why RLS is the actual boundary.
