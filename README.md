# CommitteeHub

Committee spaces, decisions (with quorum voting), tasks and a skills matrix for
a committee. Next.js (App Router) + Supabase (Postgres, Auth, Realtime),
deployed on Vercel.

## 1. Create the Supabase project

1. Create a new project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run each file in
   [`supabase/migrations/`](supabase/migrations) in filename order (just the
   baseline, on day one). This creates every table, the row-level-security
   policies and the triggers. Then paste and run
   [`supabase/seed.sql`](supabase/seed.sql) for the default skill areas and
   roles — or the committee's own lists in its place.
3. In **Authentication → Sign In / Providers → Email**, turn **off** "Allow
   new users to sign up". Members are added by an admin invite (Admin tab in
   the app), not by anyone typing in their own email — leaving signups open
   would let a stranger create an account.
4. In **Authentication → URL Configuration**, set:
   - **Site URL**: your production URL (e.g. `https://committee.example.org`)
   - **Redirect URLs**: add both `http://localhost:3000/auth/callback` (for
     local dev) and `https://<your-vercel-domain>/auth/callback`.

## 2. Environment variables

Copy `.env.local.example` to `.env.local`:

```bash
cp .env.local.example .env.local
```

Then fill in:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from **Project
  Settings → API**. Safe to expose to the browser (that's what "anon" means;
  row-level security is what actually protects the data).
- `SUPABASE_SERVICE_ROLE_KEY` — from the same **Project Settings → API** page.
  **Secret.** Used server-side by the invite, set-pin, notify, and cron
  routes. Never commit it, never put it in a `NEXT_PUBLIC_*` variable.
- `RESEND_API_KEY` — from [resend.com](https://resend.com) → **Settings → API
  Keys**. Optional for local solo testing (emails just get skipped with a log
  line if it's missing); required before real decision notifications will
  send.
- `RESEND_FROM_EMAIL` — optional, defaults to `onboarding@resend.dev`. That
  default only delivers to your own Resend account email, so it's fine for
  solo testing but **must** be changed to a verified-domain address (see
  step 6) before other committee members can receive notification emails.
- `CRON_SECRET` — a random string you make up yourself (e.g.
  `openssl rand -hex 24`). Required for the daily deadline/reminder job —
  without it, `/api/cron/decisions` rejects every request, including
  Vercel's own scheduled calls to it.

## 3. Invite yourself as the first admin

The login page can only sign in someone who's already been invited — and
with public signups off (step 1.3), nobody has been invited yet. There's no
in-app way around this for the very first person, so bootstrap it from the
Supabase dashboard instead of the login page:

1. In Supabase, go to **Authentication → Users** and click **Invite user**
   (or **Add user → Send invite**).
2. Enter your own email and send it.
3. Open the invite email and click the link — it signs you in and drops you
   at `/auth/callback`, which creates your session (the `handle_new_user`
   trigger creates your `profiles` row automatically).
4. Back in the Supabase **SQL Editor**, make yourself a global admin:
   ```sql
   update public.profiles set is_global_admin = true where email = 'you@example.com';
   ```

From there, use the **Admin** tab in the app to invite the rest of the
committee and create groups (the main committee plus any working parties) —
the in-app invite (`src/app/api/admin/invite`) works fine for everyone after
this first bootstrap step, since it's admin-initiated rather than
self-service signup.

## 4. Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000> and sign in with the email you just invited and
made admin above (use the **Email link** tab the first time — there's no PIN
set yet).

## 5. Sign-in options

Every member can use **either** a PIN or an email link — it's not one or the
other, and not something you switch globally. Both work against the same
account at all times:

- **Email link**: the built-in Supabase magic-link flow. Always available,
  no setup needed.
- **PIN**: a real Supabase password under the hood, just presented as a
  6-digit PIN. Nobody has one until it's set, either by the member
  themselves (the 🔑 button in the topbar once signed in) or by an admin
  (the "Set PIN" column on the Admin tab's Members table).

## 6. Before inviting the real committee: verify a sending domain

Skip this while it's just you testing — Resend's default `onboarding@resend.dev`
sender works fine for emails to yourself. It does **not** work for emailing
anyone else, so this is required before other members' decision notifications
(quorum-reached, deadline reminders) will actually arrive.

1. In Resend, go to **Domains → Add Domain** and add a **subdomain** of the
   committee's domain — e.g. `notify.example.org` — not the bare domain. This
   keeps it completely separate from the organisation's real inboxes, so
   there's no risk of interfering with existing mail.
2. Resend shows 3–4 DNS records (types like `TXT`, `MX`, `CNAME`). Send these
   to whoever manages that domain's DNS to add,
   matching the Type/Host/Value exactly.
3. Click **Verify** in Resend once they're added (can take a few minutes to
   an hour to propagate).
4. Create an API key (**Settings → API Keys**) if you don't already have one,
   and set `RESEND_FROM_EMAIL=noreply@notify.example.org` (or whatever address
   you verified) in both `.env.local` and Vercel's environment variables.

## 7. Deploy to Vercel

1. Push this repo to GitHub.
2. In Vercel, "Add New Project" → import the repo.
3. Add **all five** environment variables from `.env.local` in the Vercel
   project's **Settings → Environment Variables** — they do not carry over
   from your local file automatically:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`,
   `CRON_SECRET`.
4. Deploy. Update the Supabase **Site URL** / **Redirect URLs** (step 1) to
   match the Vercel domain once you have it — the deployed app can't
   complete sign-in until this points at the real domain instead of just
   `localhost:3000`.
5. Vercel Cron (configured in `vercel.json`) only runs once deployed — it
   does nothing in local dev. Once live, it calls `/api/cron/decisions` daily
   to auto-fail overdue decisions and send deadline reminders.

## 8. Inviting the committee

Once steps 6–7 are done, use the **Admin** tab to invite each member (Admin →
Invite a member) and add them to the right groups. Each person can then sign
in with the email link the invite sends them, and optionally set a PIN for
faster access afterward — or you can set one for them directly from the same
Admin tab if that's easier for less technical members.

## Project shape

- `supabase/migrations/` — the database, as ordered migrations: tables, RLS
  policies, the `handle_new_user` trigger (auth user → profile row) and the
  `recompute_decision_status` trigger (votes → passed/failed). Every schema
  change is a new timestamped file here, applied to every deployment's
  database before the code that needs it ships; an applied file is never
  edited. Keep changes backward-compatible (add, don't rename or drop) so the
  previous version of the app keeps working while deployments catch up.
- `supabase/seed.sql` — default skill areas and roles for a new committee.
- `src/proxy.ts` — Next.js 16's replacement for middleware; refreshes the
  Supabase session cookie and redirects signed-out visitors to `/login`.
- `src/lib/data-store.tsx` — a client-side realtime store: subscribes to every
  table over Supabase Realtime and exposes it through `useAppData()`, so any
  page re-renders live when someone else votes, posts, or updates a task.
- `src/app/(app)/*` — the authenticated app (dashboard, spaces, decisions,
  tasks, skills matrix, admin), each a client component reading from
  `useAppData()`.
- `src/app/api/admin/invite` — the one server-side route; it's the only place
  the service-role key is used, to create invited members' auth accounts.
