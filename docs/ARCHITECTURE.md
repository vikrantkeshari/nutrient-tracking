# Architecture

How this thing is put together, and — more usefully — why. Every unusual decision here traces back to one of three constraints:

1. **It must cost $0/month.** Free tiers only, forever, at 5–20 users.
2. **Meal photos must never reach another user.** Not at any sharing level.
3. **Sharing is per-group, not per-user.** Family sees everything, the gym sees totals, the office sees nothing — simultaneously, for the same person.

---

## The shape of it

```
                     ┌──────────────────────────────────┐
                     │  React SPA  ·  GitHub Pages      │
                     │  static files, no server         │
                     └───────┬──────────────────┬───────┘
                             │                  │
              base64 image ≤50KB          anon key + JWT
                             │                  │
                             ▼                  ▼
        ┌────────────────────────────┐  ┌──────────────────────────┐
        │  Cloudflare Worker         │  │  Supabase                │
        │                            │  │                          │
        │  holds the API keys        │  │  Auth   email/password   │
        │                            │  │  Postgres + RLS          │
        │  1. Gemini Flash  ─────────┼─►│  Storage  private bucket │
        │  2. gpt-4o-mini (fallback) │  │  pg_cron  nightly purge  │
        │  429 → backoff → retry     │  │                          │
        │  CORS locked to origin     │  │  ⚠ RLS is the ONLY       │
        └────────────────────────────┘  │    security boundary     │
                                        └──────────────────────────┘
```

There is no backend of our own. The SPA is static files; Supabase is reached directly from the browser; the Worker is a single stateless function. Nothing to operate, nothing to pay for, nothing to keep patched.

### Why a Worker at all

Because the browser cannot hold an API key. Gemini and GitHub Models both authenticate with bearer secrets, and anything in the frontend bundle is public. The Worker is the smallest possible thing that can hold a secret: one `fetch` handler, no state, no storage, free at 100k requests/day.

It also gives us provider failover for free. Free-tier rate limits are the *expected* failure mode here, not an exceptional one, so the chain is: Gemini → retry with backoff on 429 → GitHub Models → retry → give up and return an error the UI turns into a manual-entry form. **Logging never hard-blocks on the AI.**

---

## Request flow: logging a meal

```
 user taps "Take a photo"
        │
        ▼
 getUserMedia  ──►  canvas capture
        │
        ▼
 compressor.js         recursive: drop quality → then scale
        │              until ≤50KB, targeting ~25KB, max 400px
        ▼
 POST → Worker  { image: "data:image/jpeg;base64,…" }
        │
        ▼
 Gemini Flash          responseMimeType: application/json, temp 0.1
        │              ↳ on failure: gpt-4o-mini
        ▼
 { food_item, calories, protein_g, carbs_g, fat_g, confidence, explanation }
        │
        ▼
 "Is this right?"      pre-filled form, user corrects anything wrong
        │
        ▼
 diff against the AI's numbers ──► is_edited, original_*
        │
        ▼
 repo.addMeal()  ─┬─► Storage: thumbnails/{user_id}/{ts}.jpg   (private)
                  └─► macro_logs INSERT + logged_date (device-local)
```

Two details in that flow matter more than they look:

**The compression is load-bearing.** ~25 KB per photo × 3 meals × 5 users × 30 days ≈ 11 MB rolling, against a 1 GB free allowance. Relax the compressor for image quality and the storage math stops working. This is why [CONTRIBUTING](../CONTRIBUTING.md) asks you to open an issue before touching those numbers.

**Corrections are data, not just UX.** On save, the client diffs every field against what the model returned. Any difference sets `is_edited = true` and writes the model's original numbers to `original_calories`, `original_protein_g`, and so on. This turns "is the AI any good?" from an opinion into a query — correction rate, mean absolute error per macro, confidence calibration. The columns are being written today and read by nothing; building that dashboard is an open feature.

---

## Data model

Four tables. The interesting one is `group_members`.

```
profiles                       groups
  id (= auth.users.id)           id
  display_name                   name
  daily_*_goal  ×4               group_type   family|gym|office|other
  age, weight, height            invite_code  unique
                                 created_by

              group_members  ◄── the whole design lives here
                group_id ─┐
                user_id ──┴─ composite PK
                role          owner | member
                share_level   detailed | totals | none
                joined_at

macro_logs
  user_id, meal_name, calories, protein_g, carbs_g, fat_g
  thumbnail_path        never appears in any shared view
  logged_date           device-local calendar date, indexed with user_id
  ai_confidence, is_edited, original_*   ×4     ← accuracy dataset
```

### Why `share_level` lives on the membership

The obvious design — a `share_with_family` boolean on the user — is what v1 had, and it makes the product's central feature impossible. Sharing is not a property of *you*; it's a property of *your relationship to a particular group*. Putting it on the join row is what lets one person be `detailed` with family and `none` with the office at the same time.

Everything else follows from that. `effective_share(uid)` resolves the highest level a person grants across all groups you share with them, so the views don't need to know which group a query came through.

### Why `logged_date` exists

"Today" means today on the user's device, not on a server in another timezone. The client stamps `logged_date` from its own calendar at insert time (`todayISO()` in `lib/goals.js`). Persisting it — instead of computing day boundaries from `created_at` at query time — is what makes server-side daily aggregation possible at all, and it's indexed as `(user_id, logged_date)`.

---

## The sharing and security model

**Read [SECURITY.md](../SECURITY.md) before changing anything in this section.** The short version: the Supabase anon key is public by design, so **RLS is the entire security boundary**. A mistake in `schema.sql` is a data breach; a mistake in a screen is a bug.

### Three security-definer helpers

RLS policies on `group_members` that themselves query `group_members` recurse infinitely and hang Postgres. This is the single most likely thing to break when someone edits the schema. The workaround is to route membership checks through functions that bypass RLS deliberately:

| Function | Answers |
|---|---|
| `is_group_member(gid)` | Am I in this group? |
| `shares_groups_with(uid)` | Do this person and I share any group? |
| `effective_share(uid)` | What's the highest level they grant me, anywhere we overlap? |

All three are `security definer` with `set search_path = public`. Keep both properties.

### Two views, and what they deliberately omit

| View | Rows | Visible to |
|---|---|---|
| `shared_meal_logs` | Individual meals — name, macros, date, time | You, plus anyone sharing `detailed` with you |
| `shared_daily_totals` | Per-person per-day sums | You, plus anyone sharing `detailed` **or** `totals` |

**Neither projects `thumbnail_path`.** That omission is the mechanism behind "photos are never shared" — there is no query a group member can run that returns another member's photo path, so there is nothing to sign a URL for. It is not a filter that could be forgotten at the call site; the column simply isn't in the projection.

Photos are additionally protected by the bucket being private (`public = false`) and by storage policies matching `(storage.foldername(name))[1]` against `auth.uid()::text`. Three independent mechanisms, all of which must hold.

### Joining without an enumerable code

`groups` has **no open `SELECT` policy** — you can only read a group you already belong to. That closes off invite-code enumeration, but it also means the client can't look up a code to join it. So joining goes through `join_group_by_code(code, level)`, a security-definer function that resolves the code, checks you aren't already a member, and inserts the membership in one transaction.

Same pattern for `rotate_invite_code(gid)`, which verifies ownership before issuing a new code. *(Both of these work in the database and have no UI yet.)*

---

## The frontend

```
App.jsx  (119 lines)
  ├─ session state, four tabs, bottom nav
  └─ screens/
       Onboarding   welcome · signin · forgot · sent · signup · about · groupsetup · sharing
       Today        calorie total, macro bars, meal list, group summary cards
       AddMeal      pick → camera|text → analyzing → review → save
       Groups       list · join · create · sharing picker · detail
       Me           goals, per-group sharing, sign out
```

No router (tabs are state), no error boundary, no state manager, no CSS framework, no chart library. That's not minimalism for its own sake — it's a bundle small enough that a static host on free tier loads fast on a mid-range phone. Adding any of them needs a reason.

**Design intent:** 18px base font, 66px inputs, 70px buttons, two-tier text colour both hitting WCAG AA on the card background, and copy written in plain language ("They see every meal you eat", not "Sharing level: detailed"). The app is meant for a parent or grandparent to use unaided. Every screen is in [mockups.html](mockups.html).

### `repo.js` — the one abstraction that matters

```js
export const repo = isSupabaseConfigured() ? supabaseRepo : demoRepo;
```

One interface, two implementations. `supabaseRepo` talks to Postgres; `demoRepo` reads and writes `localStorage` with seeded groups. Screens call `repo.listMeals(...)` and never learn which one they got.

This exists because the alternative was tried and failed. v1 branched `if (useDemo) {…} else {…}` inside every handler, the two paths drifted, and group totals silently returned zero in production for weeks while looking perfect in demo. **The seam is the fix. Adding a method to only one half re-creates the bug.**

---

## Deployment

| What | How | Trigger |
|---|---|---|
| Frontend | GitHub Actions → build → `gh-pages` branch | Push to `main` |
| Worker | `npx wrangler deploy` | **Manual** |
| Schema | Paste into the Supabase SQL editor | **Manual** |

The Worker and the schema are not in CI. Pushing to `main` updates the frontend and nothing else — this catches everyone once.

`vite.config.js` sets `base: '/nutrient-tracking/'` because GitHub Pages serves from a subpath. Forks with a different repo name must change it or every asset 404s.

---

## Cost model

| Service | Free allowance | Projected (5 users × 3 meals/day) | Headroom |
|---|---|---|---|
| Gemini Flash | 1,500 req/day | ~15/day | 99% |
| GitHub Models | free tier | failover only | — |
| Cloudflare Workers | 100k req/day | ~15/day | ~100% |
| Supabase Postgres | 500 MB | < 5 MB/year | ~99% |
| Supabase Storage | 1 GB | ~11 MB rolling | ~99% |
| GitHub Pages | unlimited static | — | — |
| GitHub Actions | 2,000 min/month | a few min/push | — |

**Total: $0/month.**

Two things keep it there. The **image compressor** (~25 KB × 3 meals × 5 users × 30 days ≈ 11 MB) and the **30-day retention job** (`pg_cron`, nightly at 03:00 UTC) — macro text is kept forever, photos are not. Weaken either and the storage line stops being free.

The one real limit worth watching is Gemini's ~10 requests/minute. Ample for a household; a group of twenty all photographing dinner at 8pm would brush it. The Worker's 429 backoff covers that case.

---

## Known architectural gaps

Documented honestly rather than hidden — full detail with repro steps in [BACKLOG.md](BACKLOG.md).

- **Group creation likely fails under real RLS.** `INSERT … RETURNING` needs the SELECT policy to pass, and you aren't a member at that instant. Needs the same security-definer treatment `join_group_by_code` already has.
- **No read path for photos.** They're compressed, uploaded, and stored — and `signedThumbUrl()` has zero call sites.
- **Only today is readable.** `listMeals` is hardcoded to the current date. No history, no date picker.
- **No edit for a logged meal.** Delete and re-enter is the only correction path.
- **No tests, no lint.** CI builds and deploys; nothing checks correctness.
- **`listGroups` is N+1** — one member query per group per refresh.
- **`group_type` is dead.** The schema constrains it to `family|gym|office|other`; the UI never sets it, so everything is `other`.
