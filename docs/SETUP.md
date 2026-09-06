# Setup

Two paths. Pick the one that matches what you're doing.

- **[Demo mode](#demo-mode)** — 60 seconds, no accounts, no keys. Enough for any frontend work.
- **[Full setup](#full-setup)** — ~30 minutes across three free services. Needed for anything touching auth, the database, RLS, or the AI.

Everything here uses free tiers only. If a step ever asks for a credit card, you've taken a wrong turn.

---

## Demo mode

```bash
git clone https://github.com/vikrantkeshari/nutrient-tracking.git
cd nutrient-tracking/frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Sign up with anything — `a@b.com` / `password123` works. Nothing leaves your browser.

**Seeded group codes:**

| Code | Group | What it demonstrates |
|---|---|---|
| `FAM-7K2X9M` | Family | All three sharing levels side by side |
| `GYM-4B8QZ1` | Gym Friends | Totals-only members |
| `OFF-9W3RT6` | Office | A member sharing nothing |

**To reset:** clear the `nt_demo_v2` key from `localStorage`, or run `localStorage.clear()` in the console.

Demo mode turns on automatically when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing or contain the word `placeholder`. There is no flag — see `isSupabaseConfigured()` in `src/utils/supabase.js`.

---

## Full setup

Three services, in this order. Each is independent, so you can stop after Supabase if you don't need photo analysis.

### 1. Supabase — auth, database, file storage

**a. Create the project**

1. Sign up at <https://supabase.com> (GitHub login works, no card needed)
2. **New project** → pick any name, any region near you, and set a database password (save it somewhere; you'll rarely need it)
3. Wait ~2 minutes for provisioning

**b. Run the schema**

1. Left sidebar → **SQL Editor** → **New query**
2. Paste the entire contents of `supabase/schema.sql`
3. **Run**

This creates four tables, all the RLS policies, the three `security definer` helpers, both sharing views, the private storage bucket and its policies, the signup trigger, and the nightly purge job — in one pass.

> **If `create extension pg_cron` fails:** some regions don't have it enabled. Go to **Database → Extensions**, search `pg_cron`, toggle it on, then re-run. If it still refuses, delete the `pg_cron` extension line and the final `cron.schedule(...)` call — everything else works, you just lose the automatic 30-day photo purge.

**c. Verify it took**

Run this in the SQL editor. All four should come back `true`:

```sql
select
  (select count(*) from information_schema.tables
     where table_schema='public'
       and table_name in ('profiles','groups','group_members','macro_logs')) = 4 as tables_ok,
  (select count(*) from pg_policies where schemaname='public') >= 12          as policies_ok,
  (select not public from storage.buckets where id='thumbnails')              as bucket_private,
  (select count(*) from information_schema.views
     where table_schema='public'
       and table_name in ('shared_meal_logs','shared_daily_totals')) = 2      as views_ok;
```

`bucket_private` returning `true` is the important one — it's the guarantee that meal photos are never publicly readable.

**d. Turn off email confirmation (development only)**

**Authentication → Sign In / Providers → Email** → disable *Confirm email*. Otherwise every test signup waits on an inbox.

**e. Grab your keys**

**Project Settings → API**. You need two values:

- **Project URL** → `VITE_SUPABASE_URL`
- **anon / public** key → `VITE_SUPABASE_ANON_KEY`

> **Never use the `service_role` key.** It bypasses every RLS policy. It has no place in this project — not in `.env`, not in the Worker, not anywhere.

The anon key is safe to ship publicly; it's compiled into the bundle by design. [SECURITY.md](../SECURITY.md) explains why.

---

### 2. Cloudflare Worker — the AI proxy

Skip this if you only care about the UI; demo mode fakes the analyzer, and with a real Supabase but no Worker the app degrades to manual macro entry rather than breaking.

**a. Get the AI keys**

- **Gemini (primary):** <https://aistudio.google.com/apikey> → **Create API key**. Free tier, no card: 1,500 requests/day, ~10 RPM.
- **GitHub Models (fallback):** a GitHub personal access token from <https://github.com/settings/tokens>. A classic token with **no scopes ticked** is sufficient.

**b. Deploy**

```bash
cd worker
npm install
npx wrangler login          # opens a browser
npx wrangler secret put GEMINI_API_KEY     # paste when prompted
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

Deploy prints your Worker URL — something like `https://nutrient-tracking-worker.<subdomain>.workers.dev`. That's `VITE_WORKER_URL`.

**c. Lock CORS to your origin**

Edit `worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://<your-username>.github.io"
```

Then `npx wrangler deploy` again. `localhost` and `127.0.0.1` are always allowed, so local dev keeps working. Without this, any website can spend your AI quota — which matters, because on a free tier the quota *is* the budget.

**d. Test it**

```bash
curl -X POST https://your-worker.workers.dev \
  -H "Content-Type: application/json" \
  -d '{"text":"two rotis, dal and a bowl of curd"}'
```

Expect a JSON object with `food_item`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `confidence`, `explanation`.

**Local Worker development:**

```bash
cd worker && npx wrangler dev      # → http://localhost:8787
```

Then point the frontend at it with `VITE_WORKER_URL=http://localhost:8787/`.

---

### 3. Frontend

```bash
cd frontend
cp .env.example .env
```

Fill in `.env`:

```env
VITE_SUPABASE_URL=https://yourproject.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_WORKER_URL=https://nutrient-tracking-worker.yoursubdomain.workers.dev
```

```bash
npm install
npm run dev
```

`.env` is gitignored. Keep it that way.

**Smoke test — end to end, about two minutes:**

1. Sign up with a real-format email → you land on Today
2. Add a meal by typing "two eggs and toast" → an estimate appears → Save
3. Today shows the meal and the calorie bar moves
4. Groups → Start a new group → pick a sharing level → a code appears
5. Sign up as a *second* user in a private window → join with that code
6. Each account sees exactly what the other's sharing level permits — and neither sees a photo

Step 6 is the one that actually exercises the RLS policies. Do it before you trust a schema change.

---

### 4. Deploying your own copy

**a. GitHub Pages**

Repo **Settings → Pages → Source: Deploy from a branch → `gh-pages` / root**.

**b. Repo secrets**

**Settings → Secrets and variables → Actions → New repository secret**, three times:

| Secret | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your project URL |
| `VITE_SUPABASE_ANON_KEY` | Your anon key |
| `VITE_WORKER_URL` | Your Worker URL |

The workflow writes these into `frontend/.env` at build time.

**c. Fix the base path**

`frontend/vite.config.js` hardcodes `base: '/nutrient-tracking/'`. If your fork has a different repo name, change it to match — otherwise every asset 404s and you get a white page.

**d. Push**

Push to `main`. The Action builds and publishes to `gh-pages`. Your site appears at `https://<username>.github.io/<repo-name>/`.

**Remember: the Worker is not part of this pipeline.** Changes under `worker/` need `npx wrangler deploy` separately. This catches everybody at least once.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App loads but sign-in hangs or fails with a network error | `VITE_SUPABASE_URL` points at a project that no longer exists — free-tier projects are removed after long inactivity | Check the host resolves: `nslookup yourproject.supabase.co`. NXDOMAIN means it's gone; create a new project and re-run the schema |
| It runs but everything is fake data | Env vars unset → demo mode | Check `.env` exists and both Supabase vars are filled. Restart `npm run dev` — Vite only reads `.env` at startup |
| Blank white page on GitHub Pages | `base` in `vite.config.js` doesn't match the repo name | Set it to `/<your-repo-name>/` and redeploy |
| "Failed to fetch" when analyzing a meal | Worker CORS rejects your origin | Add it to `ALLOWED_ORIGINS` in `wrangler.toml`, redeploy the Worker |
| Analysis always falls back to manual entry | Worker secrets missing or invalid | `npx wrangler secret list`, then curl the Worker directly to see the real error |
| Creating a group fails or the group behaves as if it doesn't exist | Known bug — RLS blocks the `INSERT … RETURNING` because you aren't a member yet at that instant | See [BACKLOG #1](BACKLOG.md#1--creating-a-group-fails-under-rls) |
| Query hangs forever after editing `schema.sql` | An RLS policy on `group_members` queries `group_members` | Route the check through `is_group_member()` — this is the documented trap |
| Photos never appear anywhere | Not a bug — they're captured and stored but no screen renders them yet | [BACKLOG #3](BACKLOG.md#3--photos-are-stored-but-never-displayed) |
| `pg_cron` extension error | Not enabled in your region | **Database → Extensions** → enable, or drop the cron lines |

---

## Cost check

At five users logging three meals a day, projected monthly cost is **$0**, with 99% headroom on every limit.

| Service | Free allowance | Projected use |
|---|---|---|
| Gemini Flash | 1,500 req/day | ~15/day |
| Cloudflare Workers | 100,000 req/day | ~15/day |
| Supabase Postgres | 500 MB | < 5 MB/year |
| Supabase Storage | 1 GB | ~11 MB rolling |
| GitHub Pages | Unlimited static | — |
| GitHub Actions | 2,000 min/month | a few min per push |

The storage figure depends on the image compressor staying aggressive — 5 users × 3 meals × 30-day retention × ~25 KB. See [ARCHITECTURE § Cost model](ARCHITECTURE.md#cost-model).

**One thing to know about free Supabase:** projects pause after about a week of inactivity and are eventually deleted. If this is a real household tracker, open it weekly or expect to rebuild. This has already happened once to the original project.
