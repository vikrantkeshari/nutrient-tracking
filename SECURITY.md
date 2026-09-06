# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Use GitHub's private reporting instead: go to the **Security** tab → **Report a vulnerability**. That opens a draft advisory visible only to you and the maintainers.

> Maintainers: enable this at *Settings → Code security → Private vulnerability reporting*. Without it the Security tab has no report button and this instruction is dead. If you'd rather take reports by email, replace this section with an address you're happy to publish.

Expect a first response within a week. This is a hobby project maintained in spare time — please be patient, and please don't publicly disclose before we've had a chance to look.

---

## What actually protects your data

Contributors change security-relevant code without realizing it, because in this project the security boundary is not where people expect it. Read this before touching `repo.js`, `schema.sql`, or the Worker.

### The Supabase anon key is public, and that's fine

`VITE_SUPABASE_ANON_KEY` is compiled into the JavaScript bundle and served to every visitor. **This is by design.** It is not a secret and it never was — anyone can read it out of the deployed site with dev tools.

**Row Level Security is the entire boundary.** The anon key grants nothing on its own; every table is `enable row level security` and every read and write is filtered by policy against `auth.uid()`.

The practical consequence: **a mistake in `schema.sql` is a data breach, and a mistake in the frontend is a bug.** Client-side checks are user experience, not security. Never rely on one.

### The real secrets live in the Worker

`GEMINI_API_KEY` and `GITHUB_TOKEN` are the only true secrets in this project. They are set as Cloudflare Worker secrets (`wrangler secret put`) and never appear in the repository, the bundle, or any response body.

The Worker exists for exactly this reason. **If you find yourself calling an AI provider directly from `frontend/`, stop** — you're about to ship a key to the public.

### Photos are private by construction, not by convention

Three independent mechanisms, all of which must hold:

1. **The bucket is private.** `storage.buckets` is created with `public = false`. There is no `/object/public/` URL that works.
2. **Storage policies match the path.** Objects live at `{user_id}/{timestamp}.jpg`, and the insert/select/delete policies compare `(storage.foldername(name))[1]` against `auth.uid()::text`. A user cannot read another user's folder even with a valid session.
3. **`thumbnail_path` is not in any shared view.** `shared_meal_logs` and `shared_daily_totals` deliberately omit the column. There is no query a group member can run that returns it.

**If you add a column to either view, do not add `thumbnail_path`.** If you add a new sharing feature, it goes through the views. This is the product's central promise and the one thing a PR will be rejected over without discussion.

### RLS recursion is a real trap

A policy on `group_members` that queries `group_members` recurses infinitely and hangs Postgres. That's why membership checks go through `security definer` helpers:

- `is_group_member(gid)` — am I in this group?
- `shares_groups_with(uid)` — do we share any group?
- `effective_share(uid)` — highest level this person grants me, across all shared groups

**Do not rewrite these as inline subqueries in policies.** They are `security definer` on purpose, and each one has `set search_path = public` to prevent search-path hijacking. Keep both properties if you modify them.

### Invite codes are the weakest link

Codes are six base-36 characters (~2.2 billion combinations). Enumeration through `SELECT` is blocked — there is no open read policy on `groups`, and joining goes through the `join_group_by_code` security-definer function.

But **that function has no rate limit**, so brute force is theoretically possible against a determined attacker. The blast radius is bounded: joining a group reveals only what members chose to share, and never photos. Improving this is [open in the backlog](docs/BACKLOG.md).

---

## Known accepted risks

| Risk | Why it's accepted |
|---|---|
| Anon key in the bundle | Public by design; RLS is the boundary |
| Anon key present in git history (commit `cea1347`) | Same — nothing to rotate. No service-role key was ever committed |
| No rate limit on `join_group_by_code` | Bounded blast radius; tracked in the backlog |
| Worker CORS allows any `localhost` origin | Needed for local dev; a local attacker already has better options |
| Group owners cannot see more than members | Deliberate — ownership grants admin rights, not extra visibility |

## Out of scope

Denial of service against free-tier quotas, findings that require a compromised device or an already-valid session for the account in question, and anything in the `demo` code path (it never leaves the browser).
