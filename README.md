# CommitteeHub

Committee spaces, decisions (with quorum voting), tasks, a calendar, a
document library and a skills matrix. Next.js (App Router) + Supabase
(Postgres, Auth, Realtime), deployed on Vercel.

One repository, deployed once per committee: each committee has its own
Supabase project and its own Vercel project, and differs only in its
settings. **[docs/RUNBOOK.md](docs/RUNBOOK.md)** is the step-by-step for
setting a new committee up.

## Run locally

1. Create a Supabase project and apply the database (runbook step 1).
2. `cp .env.local.example .env.local` and fill in the Supabase values.
3. Create yourself as the first admin (runbook step 3), pointing the script
   at `.env.local`.
4. Then:

   ```bash
   npm install
   npm run dev
   ```

   Open <http://localhost:3000> and sign in with that email and PIN.

## Settings

All read in [`src/lib/brand.ts`](src/lib/brand.ts); every one is optional
and documented in [`.env.local.example`](.env.local.example).

- **Name** — `NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_SHORT_NAME`,
  `NEXT_PUBLIC_ORG_NAME`.
- **Look** — `NEXT_PUBLIC_BRAND_ACCENT` (one colour; the lighter, darker and
  dark-mode shades are worked out from it), `NEXT_PUBLIC_BRAND_LOGO_URL`,
  `NEXT_PUBLIC_BRAND_ICON_BASE_URL`.
- **Optional features** — `NEXT_PUBLIC_FEATURE_MINUTES_IMPORT`,
  `NEXT_PUBLIC_FEATURE_EMAIL_LINK`.
- **Reminder emails** — sent only when `RESEND_API_KEY` is set; in-app
  notifications happen either way.

## Sign-in

Members sign in with their email and a 6-digit PIN (a Supabase password
under the hood). An admin sets it when adding the member, or later from the
Admin tab; members can change their own from the 🔑 button in the topbar.
An emailed sign-in link is available as an optional extra.

## Project shape

- `supabase/migrations/` — the database, as ordered migrations: tables, RLS
  policies, the `handle_new_user` trigger (auth user → profile row) and the
  `recompute_decision_status` trigger (votes → passed/failed). Every schema
  change is a new timestamped file here, applied to every deployment's
  database before the code that needs it ships; an applied file is never
  edited. Keep changes backward-compatible (add, don't rename or drop) so the
  previous version of the app keeps working while deployments catch up.
- `supabase/seed.sql` — default skill areas and roles for a new committee.
- `scripts/` — per-committee setup: icon generation, and seeding plus the
  first admin.
- `src/lib/brand.ts` — the one place per-deployment settings are read.
- `src/proxy.ts` — Next.js 16's replacement for middleware; refreshes the
  Supabase session cookie and redirects signed-out visitors to `/login`.
- `src/lib/data-store.tsx` — a client-side realtime store: subscribes to every
  table over Supabase Realtime and exposes it through `useAppData()`, so any
  page re-renders live when someone else votes, posts, or updates a task.
- `src/app/(app)/*` — the authenticated app, each page a client component
  reading from `useAppData()`.
- `src/app/api/*` — server-side routes; the only places the service-role key
  is used (adding members, setting PINs, notifications, the daily cron job).
