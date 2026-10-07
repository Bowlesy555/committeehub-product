// One-off setup for a new committee's deployment, run after the database
// migrations and seed.sql have been applied to its Supabase project:
//
//   node --env-file=customers/riverside.env scripts/setup-customer.mjs customers/riverside.json
//
// It (1) replaces the default roles / skill areas with the committee's own,
// if the JSON lists any, (2) creates the first admin, signed in by email +
// PIN with no email sent, and (3) prints the environment variables to set
// on the Vercel project. Safe to re-run. See customer.example.json.

import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!file || !url || !serviceKey) {
  console.error(
    "Usage: node --env-file=<customer>.env scripts/setup-customer.mjs <customer>.json\n" +
      "The env file needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."
  );
  process.exit(1);
}

const customer = JSON.parse(await readFile(file, "utf8"));
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

function fail(step, error) {
  console.error(`${step} failed: ${error.message ?? error}`);
  process.exit(1);
}

const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// ---- 1. roles and skill areas ------------------------------------------

async function count(table) {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) fail(`Reading ${table} (have the migrations been applied?)`, error);
  return count ?? 0;
}

// Wholesale replacement is only safe while nothing refers to the lists yet.
// Once members hold roles or have rated skills, only add what's missing.
if (Array.isArray(customer.roles) && customer.roles.length) {
  if ((await count("member_roles")) === 0) {
    const { error } = await supabase.from("roles").delete().not("id", "is", null);
    if (error) fail("Clearing default roles", error);
  }
  const rows = customer.roles.map((label, i) => ({ label, sort_order: i + 1 }));
  const { error } = await supabase.from("roles").upsert(rows, { onConflict: "label", ignoreDuplicates: true });
  if (error) fail("Adding roles", error);
  console.log(`Roles: ${customer.roles.join(", ")}`);
}

if (Array.isArray(customer.skillAreas) && customer.skillAreas.length) {
  if ((await count("member_skills")) === 0 && (await count("task_skill_tags")) === 0) {
    const { error } = await supabase.from("skill_areas").delete().not("id", "is", null);
    if (error) fail("Clearing default skill areas", error);
  }
  const rows = customer.skillAreas.map((label, i) => ({ id: slug(label), label, sort_order: i + 1 }));
  const { error } = await supabase.from("skill_areas").upsert(rows, { onConflict: "id", ignoreDuplicates: true });
  if (error) fail("Adding skill areas", error);
  console.log(`Skill areas: ${customer.skillAreas.join(", ")}`);
}

// ---- 2. first admin ----------------------------------------------------

const admin = customer.admin;
if (admin?.email) {
  if (!/^\d{6}$/.test(admin.pin ?? "")) fail("Creating the admin", "admin.pin must be exactly 6 digits");
  const email = admin.email.trim().toLowerCase();

  let { data: profile } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (!profile) {
    // Same as the Admin tab's invite-with-PIN: the account exists at once,
    // email pre-confirmed, and the handle_new_user trigger makes its profile.
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: admin.pin,
      email_confirm: true,
      user_metadata: { name: admin.name || undefined },
    });
    if (error) fail("Creating the admin", error);
    profile = { id: data.user.id };
    console.log(`Created ${email} — signs in with that email and the PIN from the JSON file`);
  } else {
    console.log(`${email} already has an account — left its PIN alone`);
  }
  const { error } = await supabase
    .from("profiles")
    .update({ is_global_admin: true, ...(admin.name ? { name: admin.name } : {}) })
    .eq("id", profile.id);
  if (error) fail("Making them an admin", error);
  console.log(`${email} is a global admin`);
}

// ---- 3. environment variables for Vercel -------------------------------

const f = customer.features ?? {};
const b = customer.brand ?? {};
const lines = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "<anon key from Supabase>"],
  ["SUPABASE_SERVICE_ROLE_KEY", "<service role key from Supabase — mark as Sensitive>"],
  ["CRON_SECRET", randomBytes(32).toString("hex")],
  ["NEXT_PUBLIC_ORG_NAME", customer.orgName],
  ["NEXT_PUBLIC_APP_NAME", customer.appName],
  ["NEXT_PUBLIC_APP_SHORT_NAME", customer.shortName],
  // Printed without the leading # -- pasted into a .env file, an unquoted #
  // would start a comment and empty the value. The app accepts either form.
  ["NEXT_PUBLIC_BRAND_ACCENT", b.accent?.replace(/^#/, "")],
  ["NEXT_PUBLIC_BRAND_ACCENT_DARK", b.accentDark?.replace(/^#/, "")],
  ["NEXT_PUBLIC_BRAND_LOGO_BADGE", b.logoBadge ? "true" : undefined],
  // On by default; only printed when a committee wants it switched off.
  ["NEXT_PUBLIC_FEATURE_MINUTES_IMPORT", f.minutesImport === false ? "false" : undefined],
  ["NEXT_PUBLIC_MINUTES_IMPORT_PROFILE", f.minutesImportProfile ? JSON.stringify(f.minutesImportProfile) : undefined],
  ["NEXT_PUBLIC_FEATURE_EMAIL_LINK", f.emailLinkSignIn ? "true" : undefined],
];
console.log("\nEnvironment variables for the Vercel project");
console.log("(plus the two NEXT_PUBLIC_BRAND_* lines printed by generate-icons.mjs --upload,");
console.log(" and RESEND_API_KEY / RESEND_FROM_EMAIL if this committee wants reminder emails):\n");
for (const [name, value] of lines) {
  if (value !== undefined && value !== "") console.log(`${name}=${value}`);
}
