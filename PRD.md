# Nutrient Tracking — Product Requirements Document

**Status:** As-built baseline + gap analysis + roadmap
**Version:** 1.1 (July 2026) — incorporates multi-group sharing, privacy, and zero-cost constraints
**Repo:** `vikrantkeshari/nutrient-tracking`
**Last code commit:** `829dbc2` — "delete duplicate static.yml to prevent deployment collisions"

> **Provenance:** An original PRD informed this codebase (source comments reference "PRD specification" and "PRD edit tracking requirement") but was never committed. This document reconstructs the spec from the implemented code, then records the product decisions made in review and the work remaining.

---

## 1. Product Summary

**One-liner:** A macro tracker where you photograph a meal and AI estimates the macros — shared with the groups you choose, at the level of detail you choose.

**The problem.** Manual macro logging is high-friction: search a database, guess the portion, log four numbers, three times a day. Most people quit in a week. And accountability is what makes tracking stick — but the people you want accountability from aren't one homogeneous group. Your family, your gym friends, and your office are three different audiences who should see three different amounts.

**The approach.**

1. **Photo-first logging.** Point the camera at the plate. A vision model returns `{food_item, calories, protein_g, carbs_g, fat_g, confidence, explanation}`. The user reviews and corrects if wrong — corrections are recorded so AI accuracy is measurable over time.
2. **Multiple groups, per-group sharing level.** Belong to as many groups as you like. Each membership carries its own sharing level: your family sees your meals, your gym group sees only daily totals, your office sees nothing until you say so.
3. **Photos are never shared.** Images are used to generate an estimate and stored privately for your own reference only. No group, at any sharing level, sees another member's meal photos.

**Non-goals.** Recipe management, grocery lists, restaurant menu databases, barcode scanning, exercise tracking, weight-loss coaching, public/social features beyond invited groups.

---

## 2. Design Constraints

These are hard constraints, not preferences. They shape every technical decision below.

| Constraint | Implication |
|---|---|
| **Zero running cost** | Free tiers only. No paid API keys, no paid hosting, no paid database. Must stay free at ~5–20 users. |
| **Photos stay private** | Images never cross the user boundary. Sharing exposes macros only. |
| **Multi-group membership** | Schema must be many-to-many, not the current single `family_id`. |
| **Per-group sharing level** | Sharing is a property of *membership*, not of the user. |
| **Device-local time** | "Today" means today on the user's device. No server timezone assumptions. |
| **Short photo retention** | Meal images purged at 30 days. Macro text retained indefinitely. |
| **Web-only for now** | GitHub Pages SPA. Offline logging deferred until a packaged app exists. |

### Cost model at target scale

| Service | Free allowance | Projected use (5 users × 3 meals/day) | Headroom |
|---|---|---|---|
| Google Gemini (vision) | 1,500 req/day | ~15 req/day | 99% |
| GitHub Models (fallback) | Free tier | Failover only | — |
| Cloudflare Workers | 100k req/day | ~15 req/day | ~100% |
| Supabase Postgres | 500 MB | < 5 MB/year (text) | ~99% |
| Supabase Storage | 1 GB | ~11 MB steady state* | ~99% |
| GitHub Pages | Unlimited static | — | — |

\* 5 users × 3 meals × 30-day retention × ~25 KB compressed = ~11 MB rolling.

**Total projected cost: $0/month.** The aggressive image compression already in the codebase (~25 KB target, 50 KB hard cap, 400px max) is what makes the storage math work — it should be preserved, not relaxed.

---

## 3. Users

| Persona | Need | Typical sharing level |
|---|---|---|
| **Primary tracker** (you) | Fast logging, hit protein/calorie targets | Detailed with family |
| **Family member** (spouse, parent, teen) | Low-effort participation, household visibility | Detailed or Totals |
| **Gym friend** | Friendly accountability on protein/calories | Totals only |
| **Office colleague** | Casual challenge participation | Totals only, or None |

The same person appears in multiple groups at different levels. That is the core insight this version encodes.

---

## 4. Architecture

```
┌─────────────────────────────────────────────────────────┐
│  React 18 + Vite SPA  (GitHub Pages, /nutrient-tracking) │
│  frontend/src/App.jsx — 1,712 lines, single component    │
└───────────┬───────────────────────────┬─────────────────┘
            │                           │
   image (base64, ≤50KB)         auth / CRUD / storage
            │                           │
            ▼                           ▼
┌────────────────────────┐   ┌───────────────────────────┐
│ Cloudflare Worker      │   │ Supabase                  │
│ worker/src/index.js    │   │ • Postgres + RLS          │
│                        │   │ • Auth (email/password)   │
│ 1. Gemini Flash  ◄── NEW│   │ • Storage: `thumbnails`   │
│ 2. GitHub Models       │   │   (private, owner-only)   │
│    (gpt-4o-mini)       │   │ • Sharing views           │
│ + 429 retry w/ backoff │   │ • pg_cron retention job   │
│ + CORS locked to origin│   └───────────────────────────┘
└────────────────────────┘
```

**Decisions worth preserving:**

- **API keys live in the Worker**, never the client.
- **Aggressive client-side compression** (`compressor.js`) — the reason storage stays free.
- **Provider failover** with exponential backoff on HTTP 429. Free-tier rate limits are the expected failure mode; the app degrades to a manual-entry form rather than blocking the user.
- **Demo mode** — with Supabase env vars absent, runs entirely on `localStorage` with seeded data. Zero-setup development. *(But see G12 — it has drifted from the cloud path and caused a production bug.)*

**Decisions changed in v1.1:**

- **Vision provider → Google Gemini Flash (primary).** The current `llama-3.2-11b-vision-preview` is decommissioned (see G1). Gemini's free tier gives 1,500 requests/day and ~10 RPM with vision included and no credit card — roughly 100× the household's need. GitHub Models `gpt-4o-mini` stays as fallback since it is already implemented and working.
- **Storage bucket becomes private.** Since photos are never shared, the `thumbnails` bucket needs owner-only RLS and signed-URL reads — not the `/object/public/` path the Family Feed currently uses.
- **Retention 90 days → 30 days**, moved from client-triggered to a scheduled server-side job.

---

## 5. Data Model

### 5.1 Current schema (`supabase/schema.sql`) — to be migrated

`families` (id, family_name, invite_code) · `profiles` (with **single** `family_id` FK and a **global** `share_with_family` boolean) · `macro_logs` · `shared_macro_logs` view.

The single `family_id` and global sharing boolean are exactly what the new requirements break.

### 5.2 Target schema

```sql
-- Replaces `families`
create table public.groups (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  group_type text not null default 'other',   -- 'family' | 'gym' | 'office' | 'other'
  invite_code text unique not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- NEW: many-to-many membership carrying its own sharing level
create table public.group_members (
  group_id uuid references public.groups(id) on delete cascade,
  user_id  uuid references public.profiles(id) on delete cascade,
  role text not null default 'member',        -- 'owner' | 'member'
  share_level text not null default 'totals', -- 'detailed' | 'totals' | 'none'
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- profiles: DROP family_id, DROP share_with_family (both now live in group_members)

-- macro_logs: ADD logged_date date not null
--   Local calendar date computed on the DEVICE at insert time.
--   Makes day-grouping unambiguous and queryable server-side.
```

**Sharing levels:**

| Level | Group members see | Photos |
|---|---|---|
| `detailed` | Individual meals: name, calories, protein, carbs, fat, time | Never |
| `totals` | Daily aggregates only: total calories + macro breakdown | Never |
| `none` | Membership only — no intake data | Never |

**Two views replace `shared_macro_logs`:**

- `shared_meal_logs` — individual meals from members at `detailed`, **with `thumbnail_path` removed from the projection entirely**
- `shared_daily_totals` — per-member per-`logged_date` aggregates from members at `detailed` or `totals`

Both scoped to groups the caller belongs to.

> **Implementation warning:** RLS policies on `group_members` that query `group_members` cause infinite recursion in Postgres. Membership checks must go through a `security definer` helper function (e.g. `is_group_member(gid uuid)`). This is the single most likely thing to break during the migration.

**Preserved from v1:** the AI accountability columns on `macro_logs` — `ai_confidence`, `is_edited`, `original_calories`, `original_protein_g`, `original_carbs_g`, `original_fat_g`. These persist the AI's estimate alongside the user's correction, making model accuracy measurable. Currently written but never read; this is a working dataset waiting to be used.

### 5.3 Migration path

1. Create `groups` + `group_members`; backfill from `families` / `profiles.family_id`, mapping `share_with_family = true → 'detailed'`, `false → 'none'`, `group_type = 'family'`
2. Add `macro_logs.logged_date`; backfill from `created_at` (accepting approximation for historical rows)
3. Rebuild views without `thumbnail_path`
4. Rewrite RLS with the security-definer helper
5. Drop `profiles.family_id`, `profiles.share_with_family`, and `families` only after the app is cut over

---

## 6. Functional Requirements

### 6.1 Auth & Onboarding
Email/password via Supabase Auth. Registration collects display name, age, weight, height. Profile creation is dual-path (client upsert + DB trigger fallback for the email-verification case). After signup the user may create or join groups — **and may now skip this entirely**, since solo tracking must work without any group.

### 6.2 Meal Logging
Three input modes: text description, live camera (`getUserMedia`, rear-facing), file upload. Flow: input → compress → POST to Worker → AI estimate → **Review & Tweak** form pre-filled → save.

On save the client diffs each field against the AI result; any difference sets `is_edited = true` and persists the AI's values to `original_*`. `logged_date` is stamped from the device's local calendar date. Thumbnail uploads to a **private** bucket path `{user_id}/{timestamp}.jpg`.

**Failure path:** Worker failure yields an inline error and a zeroed manual-entry form. Logging never hard-blocks.

### 6.3 Today
Concentric SVG rings — protein (outer), carbs (middle), fat (inner) — calorie counter centered. Linear bars below. Own meal list. Group summary cards showing each sharing member's calorie total for the local day.

### 6.4 Groups *(reworked)*
- Group list; create a group (name + type, generates invite code) or join by code
- Per-group sharing control: **Detailed / Totals / None**, changeable at any time, with plain-language explanation of what each exposes
- Group detail view:
  - `detailed` members → meal timeline (name, macros, time — **no photos**)
  - `totals` members → daily total cards only
  - `none` members → listed as participating, no data
- Leave group; owner can remove members and rotate the invite code

### 6.5 Trends
Personal 90-day chart with goal-target overlay, switchable across all four macros. Group comparison of daily calorie/macro totals for members sharing at `detailed` or `totals`. **All chart data must come from real queries** (see G4).

### 6.6 Profile
Editable macro goals, age/weight/height, per-group sharing levels, sign out.

---

## 7. Known Gaps & Defects

Ordered by severity. Source review of `App.jsx`, `index.js`, `schema.sql`, `supabase.js`, `compressor.js`.

### P0 — Broken

**G1. Vision model is decommissioned.** The Worker calls `llama-3.2-11b-vision-preview`; Groq retired it, and its recommended successor `meta-llama/llama-4-scout-17b-16e-instruct` was itself deprecated June 17, 2026. Every photo request currently fails on the primary and silently falls through to `gpt-4o-mini` — functional, but with no redundancy left. **Resolution: switch primary to Gemini Flash free tier**, keep GitHub Models as fallback.

**G2. Family totals are always zero in production.** `getDailyTotals(memberId)` filters the `logs` state array, but `loadUserData` populates `logs` only with `.eq('user_id', userId)` — the current user's rows. Every other member shows `0 kcal`. Demo mode masks this because mock logs include other users. Fix: source group summaries from the shared views.

**G3. Storage bucket has no policies, and is read publicly.** `schema.sql` never creates the `thumbnails` bucket or its RLS, yet the app uploads to it and the feed reads it via `/object/public/`. Under the new privacy requirement this is a direct violation: **meal photos must be owner-only**, read via signed URLs, and removed from every shared view.

**G4. Group history charts are fabricated.** The "2-Month History" bar chart is `Math.random()` — 45 random bars, no query, **in production as well as demo**. The personal 90-day line also injects random values in demo mode. It renders as real data and is not.

**G5. Committed secrets and open CORS.** `frontend/.env` is committed to the repo. The Worker sets `Access-Control-Allow-Origin: *`, so any origin can spend the AI quota — which matters more now that free-tier quota *is* the budget.

### P1 — Incomplete

**G6. Single-group schema blocks the core requirement.** `profiles.family_id` is one FK and `share_with_family` is one global boolean. Multi-group with per-group levels is impossible without the §5.2 migration.

**G7. Logs cannot be edited or deleted.** `Trash2` and `RotateCcw` are imported and never used. No `DELETE` RLS policy exists on `macro_logs`. A mis-logged meal is permanent.

**G8. No history beyond today.** All logs are fetched unbounded on load — no pagination, no date filter, no search, no way to view a past day.

**G9. Retention purge is client-triggered and set to 90 days.** `runStoragePurge` runs in the browser on data load, so a user who stops opening the app never purges. Must become a scheduled `pg_cron` job at **30 days**.

**G10. Physical metrics collected and unused.** `age`, `weight`, `height` are stored and never read. Until BMR/TDEE goal suggestions exist, they're pure signup friction.

**G11. Errors surface as `alert()`.** Group create/join, save, and AI failures all use blocking browser alerts; other failures only `console.error` and are invisible.

**G12. Invite codes are guessable and joins unrestricted.** `FAM-` + 6 base-36 chars, and RLS lets any authenticated user read any family row — so codes can be enumerated. No approval, no leave flow, no member removal, no rotation. Higher stakes now that groups include colleagues.

**G13. Timezone handling is implicit.** Date math uses client `toDateString()`, which happens to match the "device time" decision — but nothing is persisted, so server-side aggregation is impossible and the logic is unverifiable. The `logged_date` column formalizes it.

### P2 — Structural

**G14. `App.jsx` is 1,712 lines in one component.** ~35 `useState` hooks, five tabs as inline `render*Tab()` closures, styling entirely inline. No routing, no error boundary, no tests.

**G15. Duplicated business logic.** Every handler branches `if (useDemo) {...} else {...}`. The two paths have already drifted — that drift *is* G2.

**G16. No tests or CI checks.** `deploy.yml` builds and deploys; nothing lints or tests.

---

## 8. Roadmap

### Phase 1 — Make it work and make it safe
1. Switch vision primary to Gemini Flash; verify fallback chain to GitHub Models (G1)
2. Gitignore `.env`, **rotate all keys**, lock Worker CORS to the deployed origin (G5)
3. Make `thumbnails` bucket private with owner-only RLS; convert reads to signed URLs (G3)
4. Fix group totals to read from shared views (G2)
5. Delete all `Math.random()` chart data — show an empty state until real queries exist (G4)

**Exit criteria:** photo logging works end-to-end, no secrets in the repo, no photo readable by anyone but its owner, no fabricated numbers on screen.

### Phase 2 — Multi-group sharing *(the headline feature)*
6. Ship the §5.2 migration: `groups`, `group_members`, `logged_date` (G6, G13)
7. Rewrite RLS with the `security definer` membership helper — recursion is the known trap
8. Build `shared_meal_logs` and `shared_daily_totals` views, both **without `thumbnail_path`**
9. Groups UI: list, create, join, per-group Detailed/Totals/None control with plain-language explanations
10. Group detail views rendering the correct level per member
11. Leave group, remove member, rotate invite code (G12)

**Exit criteria:** you belong to family, gym, and office simultaneously, each seeing a different level, and no group sees a photo.

### Phase 3 — Make it real
12. Edit + delete logs, with `DELETE` RLS policy (G7)
13. Replace `alert()` with inline toasts and error states; surface silent failures (G11)
14. Loading/empty states throughout; retry affordance on AI failure
15. Move retention purge to `pg_cron` at 30 days (G9)
16. Day-history view: pick a date, see that day's logs and rings (G8)

**Exit criteria:** the household uses it daily for two weeks without you fixing anything.

### Phase 4 — Refactor
17. Split `App.jsx` — component per tab, extract rings/charts/forms, data hooks (G14)
18. Data-access layer abstracting Supabase vs. demo; delete the `if (useDemo)` branches (G15)
19. Routing so tabs are linkable; add an error boundary
20. Vitest + RTL on macro math, edit-diff logic, and the sharing-level filter; wire into CI (G16)

### Phase 5 — Features
21. **Real trends** — server-side daily aggregates over `logged_date` powering personal and group charts
22. **Goal recommendations** from age/weight/height — Mifflin-St Jeor BMR → TDEE → macro split, offered as a suggestion the user accepts or overrides (G10)
23. **AI accuracy dashboard** — the `original_*` columns already hold the data. Show correction rate, mean error per macro, confidence calibration. Makes model choice an evidence question.
24. **Quick re-log** — one tap to repeat a recent meal; most people eat the same ~20 things
25. **Group challenges** — weekly protein streaks, consistency leaderboards

### Deferred — Offline logging
Not viable on the current GitHub Pages SPA; revisit if a packaged app happens.

> Worth knowing: a **PWA** is a middle path you may not have considered. The existing site becomes installable to an iOS/Android home screen with a manifest and a service worker — offline queueing of logs, no app store, no native rewrite, no cost. It won't match native camera performance, but it would deliver offline logging without leaving the current stack. Flagging as an option, not overriding the call to defer.

---

## 9. Success Metrics

| Metric | Why it matters | Target |
|---|---|---|
| Logs per active user per day | Core engagement; <2 means it isn't replacing anything | ≥ 2.5 |
| Time from tap to saved log | Friction is the whole thesis | < 20s median |
| AI edit rate (`is_edited`) | Estimate quality | < 35% |
| Mean absolute calorie error on edited logs | Estimate quality, precisely | < 100 kcal |
| Members active weekly per group | The differentiator working | ≥ 2 |
| Groups per user | Validates the multi-group bet | ≥ 1.5 |
| Week-4 retention | Everything else is vanity without this | ≥ 50% |
| Monthly infrastructure cost | Hard constraint | $0 |

Metrics 3 and 4 are computable today from existing columns — nothing new needs instrumenting.

---

## 10. Decisions Recorded

| Question | Decision |
|---|---|
| Which vision model? | **Gemini Flash free tier** primary, GitHub Models `gpt-4o-mini` fallback. Free tiers only. |
| What gets shared? | **Totals and macro breakdown. Never photos.** |
| Sharing granularity? | **Per-group level:** Detailed / Totals / None |
| Multi-group membership? | **Yes** — family, gym, office simultaneously. Requires schema migration. |
| Timezone handling? | **Device-local time**, persisted as `logged_date` at insert |
| Photo retention? | **30 days**, server-side scheduled job. Macro text retained indefinitely. |
| Offline logging? | **Deferred** — needs a packaged app. PWA noted as an unexplored middle path. |

### Still open

1. **Model accuracy is unvalidated.** Worth assembling ~20 photographed meals with known macros and running them through Gemini vs. `gpt-4o-mini` before committing. Cheap to do, and it turns provider choice into a measurement.
2. **Should group owners see more than members?** Currently no distinction beyond admin rights.
3. **Can a user be at `detailed` in a group where others are at `none`?** Asymmetric sharing is allowed by the schema — worth confirming it's desirable, or whether reciprocity should be enforced.
4. **Gemini free tier is 10 RPM.** Ample for a household, but a group of 20 all logging dinner at once could brush it. The existing 429 backoff covers this; worth watching.

---

## Appendix: File Map

| Path | Lines | Role |
|---|---|---|
| `frontend/src/App.jsx` | 1712 | Entire application |
| `frontend/src/utils/supabase.js` | 74 | Client, config check, retention purge |
| `frontend/src/utils/compressor.js` | ~70 | Recursive image compression (~25 KB target) |
| `frontend/src/styles/variables.css` | — | Design tokens (macro colors, glass surfaces) |
| `worker/src/index.js` | 181 | AI proxy, failover, retry |
| `supabase/schema.sql` | ~140 | Tables, view, RLS, trigger |
| `.github/workflows/deploy.yml` | — | Build + GitHub Pages deploy |
