# Contributing

Thanks for looking. This is a small hobby project with a real backlog — help is genuinely welcome, and you do **not** need a Supabase account or an AI API key to contribute to most of it.

---

## Get running in 60 seconds

```bash
git clone https://github.com/vikrantkeshari/nutrient-tracking.git
cd nutrient-tracking/frontend
npm install
npm run dev          # → http://localhost:3000
```

That's it. With no environment variables set, the app runs in **demo mode**: `localStorage` instead of Postgres, a canned meal analyzer instead of the Worker, and three seeded groups. Sign up with any email and password.

Demo group codes: `FAM-7K2X9M` (family, mixed sharing levels) · `GYM-4B8QZ1` (totals only) · `OFF-9W3RT6` (one member sharing nothing).

You only need the [full backend setup](docs/SETUP.md) if your change touches Supabase, RLS, or the AI Worker.

---

## What to work on

| I want to… | Start here |
|---|---|
| Fix a real bug | [docs/BACKLOG.md](docs/BACKLOG.md) — repro steps and a suggested fix for each |
| Build a screen | [docs/mockups.html](docs/mockups.html) — the "Designed, not built" section. Open it in a browser; GitHub shows it as source |
| Write tests | There are none. Say so in an issue and take it; see [#16](docs/BACKLOG.md#16--no-tests-anywhere) |
| Understand the system | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |

Comment on an issue before starting anything substantial, so two people don't build the same screen twice.

---

## The rules that aren't obvious

Four things about this codebase will surprise you. They are the source of most review comments.

### 1. Every data operation is written twice

`src/lib/repo.js` exports one object with two implementations — `supabaseRepo` and `demoRepo` — chosen at import time by whether Supabase env vars are present. **Screens never check which one they got.**

If you add `repo.updateMeal()`, you must add it to *both* objects. A method that exists only on one is the bug pattern that already shipped once: group totals read correctly in demo and returned zero in production for weeks, because the two paths had drifted.

```js
// ✅ Screens call the interface
await repo.deleteMeal(user.id, meal.id);

// ❌ Never do this in a screen
if (isSupabaseConfigured()) { /* ... */ } else { /* ... */ }
```

There is currently one accepted exception: `AddMeal.jsx` branches on `repo.demo` to pick `fakeAnalyze` over `analyzeMeal`. Don't add a second.

### 2. RLS is the security boundary — the client is not

The Supabase anon key ships in the public JavaScript bundle. Every protection that matters lives in `supabase/schema.sql`. A validation check in a screen is UX; the same check in a policy is security. Write both, trust only the second.

If your PR touches `schema.sql`, say so in the description and explain what the policy change permits that it didn't before. See [SECURITY.md](SECURITY.md).

### 3. Photos are never shared. This is not negotiable

`shared_meal_logs` and `shared_daily_totals` deliberately do not project `thumbnail_path`. A PR that adds it, for any reason, will be closed. If you need a photo in a new feature, it must resolve through `signedThumbUrl()` for the owner only.

### 4. Keep the image compressor aggressive

`utils/compressor.js` targets ~25 KB with a 50 KB hard cap and 400px max dimension, recursively dropping quality and then scale until it fits. That aggressiveness is exactly what keeps storage inside Supabase's free 1 GB. Relaxing it for image quality breaks the project's zero-cost constraint — open an issue and make the case before changing the numbers.

---

## Code style

There's no linter yet (adding one is a welcome PR). Match what's there:

- **Functional React with hooks.** No classes.
- **Plain CSS with the tokens in `styles/variables.css`.** Use `var(--pro)`, `var(--card)`, `var(--t2)` — never a raw hex. Inline `style={{}}` for one-offs is fine and used throughout; add a class in `index.css` when a pattern repeats.
- **One screen per file** in `src/screens/`. If a screen passes ~250 lines, that's a signal to extract a component into `components/UI.jsx`.
- **Plain-language UI copy.** "Is this right?" not "Confirm estimate". "They see every meal you eat" not "Sharing level: detailed". The target user is a parent, not a developer.
- **Accessibility isn't optional here.** Minimum 44px touch targets (most are 66px+), `aria-label` on icon-only buttons, and text that stays readable at 18px base. The design exists for people with imperfect eyesight.
- **No new dependencies without discussion.** The bundle is small and free hosting stays fast because of it. There is deliberately no chart library, no CSS framework, no state manager.

---

## Making a change

```bash
git checkout -b fix/group-create-rls
# ... edit ...
cd frontend && npm run build     # must succeed — this is what CI runs
git commit -m "fix: create group through an RPC so RLS returns the row"
```

**Commit messages:** `type: imperative summary`, where type is one of `feat` · `fix` · `docs` · `refactor` · `test` · `chore`. Keep the summary under ~72 characters.

**Before opening the PR, check by hand** — there are no tests to catch you:

- [ ] `npm run build` passes
- [ ] Works in demo mode (no env vars)
- [ ] If it touches data: implemented in **both** halves of `repo.js`
- [ ] If it touches `schema.sql`: applied to a fresh Supabase project and the affected policy actually tested from two different accounts
- [ ] Looks right at 440px wide — the app is phone-first and `.phone` caps at 440px
- [ ] No new hardcoded colours, no new dependencies, no `console.log` left behind

Then fill in the PR template. Screenshots for anything visual, please — it's the fastest possible review.

---

## Working on the backend

Changes to `supabase/schema.sql` need a real project. [docs/SETUP.md](docs/SETUP.md) has the walkthrough. Two notes that will save you an evening:

- The schema is a **fresh-install script**, not a migration. Test it by running it on a brand-new project, not by patching a live one.
- Policies on `group_members` that query `group_members` recurse infinitely and hang Postgres. Membership checks go through the `security definer` helpers (`is_group_member`, `shares_groups_with`, `effective_share`). Keep them that way.

Changes to `worker/` need a Cloudflare account (free) and `wrangler`. Note the Worker **deploys separately** — pushing to `main` does not update it:

```bash
cd worker && npm install && npx wrangler deploy
```

---

## Questions

Open an issue with the question label. "I couldn't figure out how to run this" is a legitimate issue and a documentation bug on our side, not a failure on yours.

By contributing you agree that your work is licensed under the [MIT License](LICENSE), and you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).
