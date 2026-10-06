# Deploying CommitteeHub for a new committee

Every committee gets its own Supabase project and its own Vercel project,
both built from this one repository. Nothing in the code changes per
committee — only the settings below. If a committee needs something this
runbook can't give them, the answer is a new setting or a generally-useful
feature, never a copy of the code.

Keep each committee's files (`<name>.json`, `<name>.env`, their logo) in a
`customers/` folder. It is git-ignored: customer details and keys never go
into this repository.

## What you need from the committee

- The name to show in the app. Any text works: "Riverside CommitteeHub",
  "CommitteeHub Riverside", or a name of their own. Plus a short version
  (about 12 characters) for the phone home-screen icon.
- Their logo, ideally an SVG, otherwise a large PNG. And one brand colour.
- The first admin's name and email.
- Their list of committee roles and skill areas, if the defaults in
  `supabase/seed.sql` don't suit.
- Whether they want reminder **emails** (step 7) or in-app notifications only.
- Their web address: `<name>.committeehub.co.uk` (the default), or their own
  domain, in which case who manages its DNS (step 6).

Copy `customer.example.json` to `customers/<name>.json` and fill it in.

## 1. Create the Supabase project

1. New project at supabase.com. Choose the region nearest the committee.
2. **SQL Editor**: paste and run each file in `supabase/migrations/` in
   filename order, then `supabase/seed.sql`.
3. **Authentication → Sign In / Providers → Email**: turn **off** "Allow new
   users to sign up". Members are only ever added by an admin.
4. Create `customers/<name>.env` with the three values from **Project
   Settings → API**:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

## 2. Generate and upload the icons

```bash
node --env-file=customers/<name>.env scripts/generate-icons.mjs customers/<name>-logo.svg --upload
```

This makes the four app icons from the logo, uploads them and the logo to a
public `brand` bucket in the committee's Supabase project, and prints two
`NEXT_PUBLIC_BRAND_*` lines for step 4. Look at the files in `brand-out/`
first if you want to check them: run it without `--upload`.

- `--background "#123456"` sets the colour behind the logo on the phone
  icons (default white).
- If the logo file has a solid white background rather than a transparent
  one, set `"logoBadge": true` in the JSON so it sits in a white badge in
  the topbar.

## 3. Seed their lists and create the first admin

```bash
node --env-file=customers/<name>.env scripts/setup-customer.mjs customers/<name>.json
```

This replaces the default roles and skill areas with theirs (if the JSON
lists any), creates the first admin with the PIN from the JSON — no email is
sent — and prints the environment variables for the next step. It is safe to
run again.

## 4. Create the Vercel project

1. **Add New → Project**, and import this same GitHub repository. Every
   committee's Vercel project points at the same repository and branch.
2. **Settings → Environment Variables**: add everything printed by steps 2
   and 3, plus the service-role key (mark it Sensitive).
3. Deploy.

A change to any `NEXT_PUBLIC_*` variable only takes effect after a redeploy.

## 5. Point Supabase at the live address

In Supabase, **Authentication → URL Configuration**:

- **Site URL**: the deployment's address.
- **Redirect URLs**: `<address>/auth/callback`.

Repeat this whenever the address changes (step 6).

## 6. Their web address

**Standard: a subdomain of committeehub.co.uk.** In the Vercel project,
**Settings → Domains → Add**, and enter `<name>.committeehub.co.uk`. Nothing
else is needed: a wildcard DNS record at Hostinger (`*` → `cname.vercel-dns.com`)
already sends every such address to Vercel. Vercel may show an orange "DNS
Change Recommended" badge suggesting a project-specific record; ignore it,
the wildcard keeps working. Keep `www`, `demo`, `notify`, `app`, `mail` and
`support` for your own use.

**Or their own domain.** Add it the same way, e.g. `committee.theirclub.org`.
Vercel shows one DNS record to create; send it to whoever manages the
committee's domain. A subdomain needs a single CNAME record and is the easy
case; a bare domain (`theirclub.org`) needs an A record instead.

Either way: once Vercel shows the domain as valid, redo step 5 with the new
address, and set the project's `.vercel.app` address to redirect to it.

## 7. Reminder emails (optional)

Without this, everything still works: reminders appear in the app, and
members sign in with a PIN. Only do this for a committee that wants emails.

1. In Resend, **Domains → Add Domain**: a subdomain of the committee's
   domain, e.g. `notify.theirclub.org` — not the bare domain, so their
   normal email is untouched. Send the DNS records Resend shows to whoever
   manages the domain, then **Verify**.
2. Add to the Vercel project and redeploy:

   ```
   RESEND_API_KEY=...
   RESEND_FROM_EMAIL=noreply@notify.theirclub.org
   ```

   Emails are sent under the app's name automatically.
3. Only if they also want the "Email link" sign-in tab: set the same Resend
   account up as custom SMTP in Supabase (**Authentication → Emails → SMTP
   Settings**), review the wording of the Magic Link template there, and add
   `NEXT_PUBLIC_FEATURE_EMAIL_LINK=true`.

## 8. Hand over

Sign in as the first admin with the email and PIN from the JSON, change the
PIN (🔑 in the topbar), create the main committee group from the Admin tab,
and add the members.

## Paid add-ons

Off unless switched on for that committee.

- **Minutes import** (Calendar → Import action items).
  `"minutesImport": true` in the JSON. It is calibrated against the
  committee's real action-log template, not a generic one: get their
  template, then record its column names, column order and status/priority
  wording as `"minutesImportProfile"` in the JSON (the shape is
  `ImportProfile` in `src/lib/action-items.ts`). No code changes.

## The sales demo

The demo is an ordinary deployment (`customers/demo.json`) with one extra
step: sample content. It can show different kinds of committee, each a
fictional one described in `scripts/demo-scenarios/`:

| Command | Committee |
|---|---|
| `npm run demo:sports` | Riverside Sports Club |
| `npm run demo:village-hall` | Thornwick Village Hall |

Either command wipes the demo and rebuilds it as that committee: members,
roles, skill areas, three groups, conversations, motions, tasks, meetings,
documents, and the logo and app icons. It takes about a minute. Run it
before a pitch to pick the committee, and after one to undo whatever was
clicked; your own sign-in is kept. **Never point it at a real committee's
project** — it deletes every group and everything in them.

The app's name and colour are deployment settings and do not switch, so
the demo is deployed with neutral ones: named "CommitteeHub Demo", in the
default colour.

**Nightly reset.** A scheduled job (`.github/workflows/reset-demo.yml`) rebuilds
the demo every night at 02:00 UTC, keeping whichever committee is loaded. It
can also be run by hand from the repository's **Actions** tab on GitHub
("Reset the demo" → Run workflow), choosing the committee to load, which is
handy from a phone. It needs two repository secrets, `DEMO_SUPABASE_URL` and
`DEMO_SUPABASE_SECRET_KEY`.

**Guest sign-in.** With `DEMO_GUEST_EMAIL` and `DEMO_GUEST_PIN` set, every
rebuild keeps a public guest account in each group as an ordinary member and
puts its PIN back.

To add another kind of committee, copy a scenario file and its `.svg` logo,
rewrite the content, and add a line to `package.json`.

## Shipping an update to every committee

Pushing to the main branch redeploys every committee's Vercel project.

A change that touches the database is a **new** file in
`supabase/migrations/`, never an edit to an existing one. Apply it to every
committee's database **before** pushing the code that needs it, and keep it
backward-compatible (add columns and tables; don't rename or drop) so the
version already running keeps working in the meantime.

To apply: paste the new file into each project's SQL Editor. With more than
a handful of committees, the Supabase CLI can do it from a list of database
connection strings (`npx supabase db push --db-url ...`) — not yet tried
against this repository.
