# PRD vs. Code — Reconciliation

**Checked against:** commit `5be38e2` ("v2: multi-group sharing schema, Gemini worker, frontend rebuilt per new design"), Aug 2026
**PRD reviewed:** v1.1 (July 2026), written against commit `829dbc2`
**Method:** read every source file, the schema, the Worker, the workflow, and git history.

---

## 0. The headline

**The PRD is one commit out of date, and that commit did most of the work.** `5be38e2` shipped all five Phase 1 items, the entire Phase 2 migration, most of Phase 3, and the Phase 4 refactor. Nine of sixteen gaps are closed outright.

**But there is a P0 the PRD cannot know about, because it postdates it:**

> ### The Supabase project no longer exists.
> `pafomkjovzjfkblideof.supabase.co` returns NXDOMAIN. `supabase.co` itself resolves fine, so this is not a DNS problem on your end — that project subdomain is gone. Your own `.env` comment already records this ("this project's host no longer resolves"). Free-tier projects pause after a week of inactivity and are removed after 90 days; two months of not touching it fits.
>
> **What that means:** `supabase/schema.sql` — the v2 multi-group schema, the RLS, the views, the cron job — has nowhere to live. And `gh-pages` was deployed from `5be38e2` on 2026-08-10, so the **live site is the v2 frontend pointed at a dead backend**. Sign-in fails with a network error rather than falling back to demo mode, because `isSupabaseConfigured()` only checks that the env vars are *set*, not that the host answers.
>
> Confirm in the Supabase dashboard before anything else. If it's gone, step one is a new project + `schema.sql` + updated GitHub repo secrets. Nothing else on this list matters until then.

---

## 1. Gap ledger

| # | Gap | Verdict | Evidence |
|---|---|---|---|
| **G1** | Vision model decommissioned | ✅ **Fixed** | Worker calls `gemini-flash-latest` primary, `gpt-4o-mini` fallback, `callWithRetry` with backoff on 429 |
| **G2** | Group totals always zero | ✅ **Fixed** | `repo.listGroups` reads `shared_daily_totals` / `shared_meal_logs`, not the local `logs` array |
| **G3** | Storage bucket public | ✅ **Fixed** *(but see N3)* | Bucket created with `public = false`; three `storage.objects` policies keyed on `auth.uid()`; `signedThumbUrl()` helper exists |
| **G4** | Fabricated chart data | ✅ **Fixed by deletion** | No `Math.random()` outside invite-code generation. The charts are gone — so is the Trends tab (see §3) |
| **G5** | Committed secrets, open CORS | ✅ **Fixed** — and it was never as bad as written | CORS locked to `ALLOWED_ORIGINS`. `.env` gitignored and removed at `5be38e2`. It's still in history at `cea1347`, but it only ever held `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORKER_URL` — the anon key ships in the JS bundle by design; RLS is the real boundary. **No rotation needed.** The actual secrets (Gemini, GitHub) are Wrangler secrets and were never in the repo |
| **G6** | Single-group schema | ✅ **Fixed** | `groups` + `group_members` with per-membership `share_level`; `profiles.family_id` gone |
| **G7** | Can't edit or delete logs | ⚠️ **Half** | Delete works end to end (UI → `repo.deleteMeal` → `logs_delete_own` policy). **Edit does not exist** — no `updateMeal`, no UI. A wrong number can only be deleted and re-entered |
| **G8** | No history beyond today | ❌ **Open** | `repo.listMeals(userId, todayISO())` is the only read path. No date picker, no past-day view. Arguably worse than v1, which at least fetched everything |
| **G9** | Client-triggered 90-day purge | ✅ **Fixed** *(verify N5)* | `purge_old_thumbnails()` + `cron.schedule('purge-thumbnails-nightly', '0 3 * * *')`, 30-day interval |
| **G10** | Physical metrics unused | ⚠️ **Half** | `suggestGoals()` implements Mifflin-St Jeor → TDEE → macro split, wired to "Suggest goals for me". But there's **no way to update age/weight/height after signup** — so the suggestion drifts stale the moment your weight changes, which is the one thing that changes |
| **G11** | `alert()` everywhere | ✅ **Mostly** | `ToastProvider` + inline `err` states throughout. Three `window.confirm` remain — delete meal, leave group, sign out. Defensible for destructive actions; the sign-out one is unnecessary |
| **G12** | Guessable codes, no leave/remove/rotate | ⚠️ **Half** | Enumeration is properly blocked: no open SELECT on `groups`, joins go through the `join_group_by_code` security-definer RPC. Leave works. **`rotate_invite_code()` and owner-removes-member exist in the database with no repo method and no UI** — dead server-side features. Code entropy unchanged (6 base-36 chars) and the RPC has no rate limit, so brute force is still theoretically open |
| **G13** | Implicit timezone | ✅ **Fixed** | `logged_date` stamped by `todayISO()` at insert, indexed `(user_id, logged_date)`, both views group by it |
| **G14** | 1,712-line `App.jsx` | ✅ **Fixed** | 119 lines. Five screens, a `UI.jsx`, a `lib/` — 1,402 lines total across the app. Still no routing and no error boundary |
| **G15** | Duplicated demo/real logic | ✅ **Fixed** | `repo.js` is the single seam. One leak: `AddMeal.jsx` still branches on `repo.demo` to pick `fakeAnalyze` vs `analyzeMeal` |
| **G16** | No tests or CI checks | ❌ **Open** | `deploy.yml` still only builds and deploys. No Vitest, no lint, no test script in `package.json` |

**Tally:** 9 fixed · 4 half-done · 2 open · 1 fixed-by-removing-the-feature.

---

## 2. PRD sections that are now factually wrong

Fix these before the doc misleads you again:

| PRD section | Says | Actually |
|---|---|---|
| §4 Architecture diagram | "`App.jsx` — 1,712 lines, single component" | 119 lines; five screens under `src/screens/`, `src/lib/`, `src/components/` |
| §5.1 "Current schema — to be migrated" | `families`, `profiles.family_id`, `shared_macro_logs` | Already migrated. `schema.sql` **is** the v2 target as a fresh-install script — the §5.3 migration path was never run and is now dead text |
| §6.3 Today | "Concentric SVG rings — protein (outer), carbs (middle), fat (inner)" | No rings. Big calorie number, one progress bar, three linear macro bars |
| §6.5 Trends | A whole section | **The tab does not exist.** Four tabs: Today, Groups, Add, Me |
| §6.6 Profile | "Editable macro goals, age/weight/height, per-group sharing levels" | Goals and sharing levels yes. Age/weight/height are not editable anywhere |
| §7 Known Gaps | 16 open gaps | 9 closed — see §1 |
| §8 Phase 1 / 2 | Roadmap | Both essentially complete |
| Appendix file map | 4 source files | ~12; the map is missing `lib/`, `screens/`, `components/` entirely |
| Header | "Last code commit: `829dbc2`" | `5be38e2` |

---

## 3. Scope that quietly disappeared

Not defects — decisions made in code that the PRD never recorded. Worth deciding whether you meant them:

- **Trends is gone.** G4 said "delete the fake charts, show an empty state until real queries exist." What shipped deleted the charts *and the tab*. Phase 5 #21 ("real trends") is now a from-scratch build, not a data swap.
- **Rings → bars.** Together with the much larger type, generous touch targets, and plain-language copy ("Is this right?", "They see every meal you eat"), the v2 UI reads as deliberately retargeted at less technical family members. That's a real product decision and it isn't in the PRD.
- **Group types are dead.** The schema constrains `group_type` to `family|gym|office|other`, but `Groups.jsx` never passes a type — `repo.createGroup` defaults every group to `'other'`. The family/gym/office distinction exists only in the demo seed data.
- **Photos are captured and never shown.** See N3.

---

## 4. New issues, not in the PRD

Ordered by severity.

**N1 — `createGroup` will probably fail against real Supabase. Verify first.**
`repo.createGroup` does `.insert(...).select().single()` on `groups`. PostgREST issues `INSERT ... RETURNING`, and returning a row requires a **SELECT** policy to pass on it. Your only SELECT policy is `groups_select_member`, which calls `is_group_member(id)` — and at the instant of the insert you are not yet a member; the `group_members` row is written on the *next* statement. Expect the insert to return no row or an RLS error, and the group to be created but unusable. Fix by moving creation into a `security definer` RPC that inserts the group and the owner membership in one transaction — mirroring what `join_group_by_code` already does. *(This has likely never been observed, because the Supabase project died before anyone could hit it.)*

**N2 — `saveMeal` has no error handling.**
`AddMeal.jsx` awaits `repo.addMeal` bare. Any failure — RLS, network, dead backend — is an unhandled rejection: no toast, no error state, and `onSaved()` never fires, so the user sits on the review screen with a button that appears to do nothing. This is exactly the silent-failure class G11 was meant to eliminate, reintroduced in the one flow that matters most.

**N3 — Photos are uploaded, stored, and never displayed.**
`signedThumbUrl()` in `utils/supabase.js` has zero call sites. `thumbnailPath` is mapped onto every meal object by `rowToMeal` and read by nothing. So: every logged photo costs an upload, a storage row, and 30 days of quota, and no user ever sees it again. Either render it in the meal list — which is the whole point of a private bucket and signed URLs — or stop uploading it and reclaim the storage line in the cost model.

**N4 — Deleting a meal orphans its photo.**
`repo.deleteMeal` deletes the row and never calls `storage.remove()`. The file lingers until the nightly purge — which matches on `macro_logs.thumbnail_path`, and that row is gone. **The orphan is never collected.** Small at your scale, unbounded over time.

**N5 — The purge may not actually free storage.** *(verify)*
`purge_old_thumbnails()` deletes rows from `storage.objects` with plain SQL. In Supabase, removing that row does not reliably remove the underlying object from the storage backend — the documented path is the Storage API. If that holds, the cron job silently clears references while the bytes accumulate. Test it with one file before trusting the 1 GB headroom.

**N6 — No way to update weight.** *(the substance of G10's other half)*
Age, weight, and height are collected once at signup and are editable nowhere. "Suggest goals for me" therefore recomputes from stale inputs forever. For a tracker, weight is the input most likely to change.

**N7 — Dead server-side features.**
`rotate_invite_code()` and the owner-removes-member DELETE policy both work in the database. Neither has a repo method or a button. G12 is written as done but is half-shipped.

**N8 — `repo.listGroups` is N+1.**
One `group_members` query per group, in a loop, on every refresh. Fine for three groups; worth knowing it's there.

**N9 — Your working tree is ahead of what's deployed.**
`UI.jsx`, `Onboarding.jsx`, and `styles/index.css` have uncommitted local edits, plus three untracked mockups. `gh-pages` was built from `5be38e2`. **The live site is not what's on your disk** — diff before you assume a bug is in production.

---

## 5. What I'd do next

1. **Check the Supabase dashboard.** Everything below is blocked on it. If the project is gone: new project → run `schema.sql` → update the three GitHub repo secrets → redeploy.
2. **Fix N1 before you test group creation**, or you'll spend an evening debugging RLS recursion that isn't recursion.
3. **Wrap `saveMeal` in try/catch** (N2). Five-line fix, protects the core flow.
4. **Decide about photos** (N3) — render them or stop storing them. Right now you're paying quota for nothing.
5. **Commit or discard your working tree** (N9), so "what's live" is answerable.
6. **Rewrite PRD §7 and §8** from §1 above, and delete §5.1/§5.3 — the migration is history, not a plan.

Then the honest remaining backlog is: **edit a logged meal (G7), see a past day (G8), edit your weight (N6), rotate/remove in the Groups UI (N7), and any tests at all (G16)** — plus Trends as a genuine from-scratch feature rather than the data-swap the PRD implies.
