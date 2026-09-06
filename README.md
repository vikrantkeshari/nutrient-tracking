# 🥗 Nutrient Tracking

**Photograph your meal. Get the macros. Share exactly as much as you want, with exactly who you choose.**

[![License: MIT](https://img.shields.io/badge/License-MIT-A78BFA.svg)](LICENSE)
[![Deploy](https://github.com/vikrantkeshari/nutrient-tracking/actions/workflows/deploy.yml/badge.svg)](https://github.com/vikrantkeshari/nutrient-tracking/actions/workflows/deploy.yml)
[![Cost](https://img.shields.io/badge/running%20cost-%240%2Fmonth-34D399.svg)](docs/ARCHITECTURE.md#cost-model)

Manual macro logging is high-friction: search a database, guess the portion, type four numbers, three times a day. Most people quit in a week.

This app does two things differently:

1. **Photo-first logging.** Point the camera at your plate. A vision model returns the food name and its macros. You correct it if it's wrong — and every correction is recorded, so the model's accuracy is measurable rather than assumed.
2. **Per-group sharing.** You belong to as many groups as you like — family, gym, office — and each membership carries **its own** sharing level. Your family sees every meal. Your gym group sees daily totals. Your office sees nothing at all.

**Photos are never shared.** Not at any sharing level, not with any group. Images generate an estimate, are stored privately for your own reference, and are deleted after 30 days.

---

## 📸 What it looks like

**[→ The screen gallery](docs/mockups.html)** — all 27 screens that exist, plus 8 designed and waiting for someone to build them. Start here if you want to contribute UI.

> GitHub displays `.html` as source rather than rendering it. Clone the repo and open `docs/mockups.html` in a browser, or run `npx serve docs` and visit the printed URL.

The app is designed deliberately large — 18px base font, 66px inputs, 70px buttons, plain-language copy ("Is this right?" not "Confirm estimate"). It's meant to be usable by a parent or grandparent, not just by the person who built it.

---

## ⚠️ Project status — read this first

This is a **working hobby project, mid-repair**. It is honest about its state:

| | |
|---|---|
| **Frontend** | ✅ Built and deployed. React + Vite on GitHub Pages |
| **AI proxy** | ✅ Built. Cloudflare Worker, Gemini Flash → GitHub Models failover |
| **Database schema** | ✅ Written — `supabase/schema.sql`, multi-group with RLS |
| **Hosted backend** | ❌ **The original Supabase project no longer exists.** Free-tier projects are removed after long inactivity. You must create your own — see [SETUP](docs/SETUP.md) |
| **Demo mode** | ✅ Works with zero setup. `npm run dev` with no env vars runs the whole app on `localStorage` |
| **Tests** | ❌ None yet. [#16](docs/BACKLOG.md) is open and unclaimed |

**So the fastest way to see it run is demo mode**, which needs no accounts, no keys, and no backend. See below.

There is a documented backlog of real, reproducible bugs in **[docs/BACKLOG.md](docs/BACKLOG.md)** — several of them are genuinely good first issues with the fix already sketched out.

---

## 🚀 Quick start (demo mode, 60 seconds)

```bash
git clone https://github.com/vikrantkeshari/nutrient-tracking.git
cd nutrient-tracking/frontend
npm install
npm run dev
```

Open <http://localhost:3000>. Sign up with any email and password — nothing is sent anywhere. The app runs entirely on `localStorage` with seeded groups and a fake meal analyzer.

Three demo group codes work: `FAM-7K2X9M`, `GYM-4B8QZ1`, `OFF-9W3RT6`.

> Demo mode activates automatically whenever `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset. There is no flag to toggle.

**Want the real backend?** → **[docs/SETUP.md](docs/SETUP.md)** walks through Supabase, the Worker, and deployment. Budget about 30 minutes.

---

## 🧱 Stack

Everything is on a free tier. That is a hard design constraint, not a preference — see [ARCHITECTURE § Cost model](docs/ARCHITECTURE.md#cost-model).

| Layer | Tech | Role |
|---|---|---|
| UI | React 18 + Vite 5 | SPA, four tabs, no router |
| Icons | lucide-react | All iconography |
| Styling | Plain CSS + custom properties | Tokens in `styles/variables.css` |
| Auth / DB / Files | Supabase | Postgres, Row Level Security, private Storage bucket |
| AI proxy | Cloudflare Worker | Holds the API keys; the browser never sees them |
| Vision (primary) | Google Gemini Flash | 1,500 req/day free |
| Vision (fallback) | GitHub Models `gpt-4o-mini` | Failover on error or 429 |
| Scheduling | `pg_cron` | Nightly 30-day photo purge |
| CI/CD | GitHub Actions | Build + deploy to GitHub Pages |

Charts and the macro rings are hand-rolled SVG/CSS — **there is no chart library**, so don't go looking for Recharts.

---

## 🗺️ Repo layout

```
frontend/
  src/
    App.jsx              Shell: session, tab switching, bottom nav (119 lines)
    screens/             One file per screen — Onboarding, Today, AddMeal, Groups, Me
    components/UI.jsx    Shared primitives: Toast, Stepper, MacroBar, Avatar…
    lib/
      repo.js            ⭐ Data layer. Two implementations, one interface
      ai.js              Worker call + offline fake
      goals.js           Mifflin-St Jeor BMR → TDEE → macro split
    utils/
      supabase.js        Client, config check, signed URLs
      compressor.js      Canvas compression to ~25KB
    styles/              Design tokens + global CSS
worker/
  src/index.js           AI proxy: Gemini → GitHub Models, retry, CORS
  wrangler.toml          Config; secrets set via CLI
supabase/
  schema.sql             Whole database: tables, RLS, views, functions, cron
docs/
  SETUP.md               Get it running for real
  ARCHITECTURE.md        How and why it works this way
  BACKLOG.md             Known bugs, ready to file as issues
  mockups.html           Every screen, built and planned
```

---

## 🤝 Contributing

Contributions are very welcome, especially on the documented backlog.

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first — it's short, and it covers the one rule that isn't obvious: **every data operation must be implemented twice in `repo.js`**, once for Supabase and once for demo mode. The two paths drifting apart has already caused one production bug.

Good places to start:

- 🐛 **[docs/BACKLOG.md](docs/BACKLOG.md)** — real bugs with repro steps and suggested fixes
- 🎨 **[docs/mockups.html](docs/mockups.html)** — screens designed but not built (past-day history, edit a meal, trends)
- 🧪 **Tests** — there are none. The macro math, the edit-diff logic, and the sharing-level filter are all pure functions begging for a Vitest suite

---

## 🔒 Privacy model in one paragraph

Meal photos live in a private Supabase Storage bucket under `{user_id}/`, readable only by their owner via short-lived signed URLs, and purged after 30 days. Sharing happens through two Postgres views that project macros and never touch `thumbnail_path` — so there is no query path, at any sharing level, that returns another person's photo. Sharing level lives on the *membership* row, not the user, which is what makes "detailed with family, totals with the gym, nothing with the office" possible. Details in [SECURITY.md](SECURITY.md).

---

## 📄 License

[MIT](LICENSE). Fork it, ship it, sell it — just keep the notice.
