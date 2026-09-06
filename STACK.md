# Tech Stack & What Each Piece Does

*Reference for `nutrient-tracking` — written Aug 2026 from the code as it actually stands.*

---

## The one-paragraph version

A React SPA built with Vite, deployed as static files to GitHub Pages by a GitHub Action. It talks to two backends: **Supabase** (auth, Postgres, private file storage) directly from the browser, and a **Cloudflare Worker** for anything needing a secret API key. The Worker is the only thing that holds AI credentials; it calls **Google Gemini Flash** first and falls back to **GitHub Models `gpt-4o-mini`**. Everything is on a free tier — total running cost $0.

---

## Frontend

| Tech | Version | What it does here |
|---|---|---|
| **React** | 18.2 | UI. No router — `App.jsx` (119 lines) holds a `tab` state and swaps between five screens in `src/screens/`. |
| **Vite** | 5.0 | Dev server (port 3000) and production bundler. `base: '/nutrient-tracking/'` in `vite.config.js` — that's what makes asset paths work under the GitHub Pages subpath. |
| **@vitejs/plugin-react** | 4.2 | JSX transform + fast refresh. |
| **lucide-react** | 0.300 | All icons. |
| **Plain CSS** | — | `styles/variables.css` holds design tokens (macro colors, glass surfaces); `styles/index.css` the rest. No Tailwind, no CSS-in-JS. |
| **Hand-rolled SVG** | — | The concentric macro rings and trend charts are inline SVG. **No chart library is installed** — don't go looking for Recharts. |

There is no TypeScript (only `@types/react` as a dev dep for editor hints), no test runner, no linter.

### Frontend file map

| File | Role |
|---|---|
| `src/App.jsx` | Shell: session state, tab switching, bottom nav |
| `src/screens/Onboarding.jsx` | Sign up / sign in, collects age-weight-height, suggests goals |
| `src/screens/Today.jsx` | Rings, today's meals |
| `src/screens/AddMeal.jsx` | Camera / upload / text → compress → analyze → review & save |
| `src/screens/Groups.jsx` | Group list, create, join by code, per-group sharing level |
| `src/screens/Me.jsx` | Profile, goals, sign out |
| `src/components/UI.jsx` | Shared primitives (buttons, cards, toasts) |
| `src/lib/repo.js` | **Data layer** — one interface, two implementations (`supabaseRepo` / `demoRepo`). Screens never branch on demo mode. |
| `src/lib/ai.js` | Calls the Worker; `fakeAnalyze()` is the offline demo stand-in |
| `src/lib/goals.js` | Mifflin-St Jeor BMR → TDEE → macro split; `todayISO()` device-local date |
| `src/utils/supabase.js` | Supabase client, config check, `signedThumbUrl()` |
| `src/utils/compressor.js` | Canvas-based recursive image compression |

---

## Backend — Supabase (free tier)

Called directly from the browser with the **anon key**; all security is enforced by Row Level Security, not by the client.

| Piece | Use |
|---|---|
| **Supabase Auth** | Email + password. Signup metadata (name, age, weight, height, goals) is passed through `raw_user_meta_data` and picked up by a DB trigger. |
| **Postgres** | Tables: `profiles`, `groups`, `group_members`, `macro_logs`. Sharing level lives on `group_members`, not on the user. |
| **Row Level Security** | On every table. Membership checks go through `security definer` helpers — `is_group_member()`, `shares_groups_with()`, `effective_share()` — because an RLS policy on `group_members` that queries `group_members` recurses infinitely. |
| **Postgres views** | `shared_meal_logs` (individual meals from `detailed` members) and `shared_daily_totals` (aggregates from `detailed` + `totals`). Neither projects `thumbnail_path` — photos never appear in a shared read path. |
| **Postgres functions** | `join_group_by_code()` resolves invite codes without an open SELECT on `groups` (blocks code enumeration); `rotate_invite_code()` is owner-only. |
| **Supabase Storage** | Bucket `thumbnails`, **private** (`public = false`). Path convention `{user_id}/{timestamp}.jpg`; storage policies match the first path segment against `auth.uid()`. Reads go through 60-minute signed URLs. |
| **pg_cron** | Nightly 03:00 UTC `purge_old_thumbnails()` — deletes photo files older than 30 days and clears the references. Macro text is kept forever. |
| **uuid-ossp** | `uuid_generate_v4()` for primary keys. |
| **Trigger** | `on_auth_user_created` → `handle_new_user()` auto-creates the profile row on signup. |

All of it lives in one file: `supabase/schema.sql` (fresh-install script, schema v2).

---

## Backend — Cloudflare Worker (free tier)

`worker/src/index.js`, deployed with **Wrangler 3** (`npm run deploy`). Config in `worker/wrangler.toml`.

**Why it exists:** so the AI API keys never touch the browser. It's a single POST endpoint that takes `{image, text}` and returns `{food_item, calories, protein_g, carbs_g, fat_g, confidence, explanation}`.

| Concern | How it's handled |
|---|---|
| **Primary model** | Google **Gemini Flash** — `gemini-flash-latest` via `generativelanguage.googleapis.com`, `responseMimeType: application/json`, temperature 0.1. Free tier: 1,500 req/day, ~10 RPM. |
| **Fallback model** | **GitHub Models** `gpt-4o-mini` at `models.inference.ai.azure.com`, OpenAI-compatible chat-completions shape. |
| **Rate limits** | `callWithRetry()` — exponential backoff on HTTP 429 only, 2 retries starting at 1s. |
| **CORS** | Locked to the `ALLOWED_ORIGINS` var (currently `https://vikrantkeshari.github.io`); `localhost` / `127.0.0.1` always allowed for dev. |
| **Response parsing** | `parseModelJson()` strips markdown fences and coerces string numbers — models return both. |

**Secrets** (set via `wrangler secret put`, never in the repo):

- `GEMINI_API_KEY` — from https://aistudio.google.com/apikey
- `GITHUB_TOKEN` — a GitHub PAT for GitHub Models

---

## Build & deploy

| Tech | Use |
|---|---|
| **GitHub Actions** | `.github/workflows/deploy.yml` — on push to `main`: Node 20 → write `frontend/.env` from repo secrets → `npm ci` → `npm run build` → deploy. |
| **JamesIves/github-pages-deploy-action@v4** | Pushes `frontend/dist` to the `gh-pages` branch. |
| **GitHub Pages** | Static hosting at `/nutrient-tracking/`. |
| **Wrangler** | Separate, manual deploy for the Worker — it is *not* in the Action. |

**GitHub repo secrets used by the build:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_WORKER_URL`.

---

## Environment variables

**Frontend** (`frontend/.env`, gitignored; template in `.env.example`):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_WORKER_URL=
```

If Supabase vars are missing or contain `placeholder`, `isSupabaseConfigured()` returns false and `repo.js` swaps in `demoRepo` — the whole app runs on localStorage with seeded data and `fakeAnalyze()`. That's the zero-setup dev path.

**Worker** — `ALLOWED_ORIGINS` as a plain var in `wrangler.toml`; `GEMINI_API_KEY` and `GITHUB_TOKEN` as Wrangler secrets.

---

## Cost model

| Service | Free allowance | Actual use (~5 users × 3 meals/day) |
|---|---|---|
| Gemini Flash | 1,500 req/day | ~15/day |
| GitHub Models | free tier | failover only |
| Cloudflare Workers | 100k req/day | ~15/day |
| Supabase Postgres | 500 MB | < 5 MB/year |
| Supabase Storage | 1 GB | ~11 MB rolling (30-day retention × ~25 KB/photo) |
| GitHub Pages | unlimited static | — |
| GitHub Actions | 2,000 min/mo | a few min per push |

**$0/month.** The image compressor is load-bearing for this — ~25 KB target, 50 KB hard cap, 400px max dimension, recursively dropping quality then scale until it fits. Relaxing it breaks the storage math.

---

## Things worth remembering

- **The Worker deploys separately from the frontend.** Pushing to `main` does not update the Worker; run `npm run deploy` in `worker/`.
- **`repo.js` is the seam.** Any new data operation goes there twice — once for Supabase, once for demo — and screens stay ignorant.
- **`security definer` is not optional** on the group helpers. Rewriting those as plain RLS subqueries will hang Postgres.
- **`.env` is gitignored now**, but it was committed at one point — if keys were ever rotated, that's why.
