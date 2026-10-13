// Billing for each committee's deployment: who has paid, until when, and
// recording a payment. Each committee has customers/<name>.env holding its
// Supabase address and secret key.
//
//   npm run customers                       where everyone stands
//   npm run paid -- riverside               record a payment: moves the date
//                                           on a year (annual) or a month
//                                           (monthly) from the OLD date, not
//                                           from today
//   npm run paid -- riverside --undo        put back the date before the last change
//
//   Starting or changing a plan (the date given is the first one they owe on):
//   npm run paid -- riverside --start trial                    14 days from today
//   npm run paid -- riverside --start annual --until 2027-11-01
//   npm run paid -- riverside --start monthly --until 2026-12-01
//   npm run paid -- riverside --off         no billing: never locks (the demos)
//
// What the date means: trial = last day of the trial; annual = the renewal
// date the next invoice is due on; monthly = the date the next instalment is
// due. Trial and annual lock the day after it. Monthly locks once an
// instalment is more than 10 working days late.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DIR = "customers";
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const command = args[0];

async function connect(name) {
  let text;
  try {
    text = await readFile(path.join(DIR, `${name}.env`), "utf8");
  } catch {
    throw new Error(`There is no ${DIR}/${name}.env`);
  }
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(`${name}.env needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY`);
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const iso = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${s}T12:00:00Z`);
const show = (s) =>
  parse(s).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "") && !Number.isNaN(parse(s).getTime());

// Same day next month (or year). A day the month doesn't have becomes its
// last day, and `anchor` remembers the intended day so it comes back after.
function addMonths(date, months, anchor) {
  const d = parse(date);
  const day = anchor ?? d.getUTCDate();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1, 12));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return iso(first);
}

async function state(supabase) {
  const { data, error } = await supabase.rpc("billing_state");
  if (error) throw new Error(`${error.message} (has the billing migration been run in this project?)`);
  return data;
}

const STATE_WORDS = {
  none: "no billing (never locks)",
  ok: "paid up",
  due: "payment coming up",
  overdue: "OVERDUE",
  locked: "LOCKED",
};

function describe(s) {
  if (s.state === "none") return STATE_WORDS.none;
  const what = { trial: "trial ends", annual: "renews", monthly: "next instalment" }[s.plan];
  const lock = s.state === "locked" ? `locked since ${show(s.lock_on)}` : `locks ${show(s.lock_on)} if unpaid`;
  return `${s.plan}, ${what} ${show(s.paid_until)}, ${STATE_WORDS[s.state]}, ${lock}`;
}

async function listCustomers() {
  const files = (await readdir(DIR)).filter((f) => f.endsWith(".env") && !f.endsWith(".vercel.env"));
  for (const f of files.sort()) {
    const name = f.replace(/\.env$/, "");
    let line;
    try {
      line = describe(await state(await connect(name)));
    } catch (e) {
      line = `could not check: ${e.message}`;
    }
    console.log(`${name.padEnd(18)} ${line}`);
  }
}

async function paid(name) {
  const supabase = await connect(name);
  await state(supabase); // fails clearly if the migration is missing
  const { data: row, error } = await supabase.from("billing").select("*").maybeSingle();
  if (error) throw new Error(error.message);

  if (flag("off")) {
    const { error: e } = await supabase.from("billing").delete().eq("id", true);
    if (e) throw new Error(e.message);
    console.log(`${name}: billing switched off. This deployment will never lock.`);
    return;
  }

  let next;
  if (flag("undo")) {
    if (!row?.previous_paid_until) throw new Error("There is nothing to undo.");
    next = {
      plan: row.previous_plan ?? row.plan,
      paid_until: row.previous_paid_until,
      previous_paid_until: null,
      previous_plan: null,
    };
  } else if (option("start")) {
    const plan = option("start");
    if (!["trial", "annual", "monthly"].includes(plan)) throw new Error("--start must be trial, annual or monthly");
    let until = option("until");
    if (!until && plan === "trial") until = iso(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000));
    if (!isDate(until)) throw new Error("Give the date as --until YYYY-MM-DD, for example --until 2027-11-01");
    next = {
      plan,
      paid_until: until,
      anchor_day: plan === "monthly" ? parse(until).getUTCDate() : null,
      previous_paid_until: row?.paid_until ?? null,
      previous_plan: row?.plan ?? null,
    };
  } else {
    if (!row) throw new Error(`Billing hasn't been started for ${name}. Use --start (see the top of scripts/billing.mjs).`);
    if (row.plan === "trial") {
      throw new Error("They are on a trial. Start their plan instead: --start annual (or monthly) --until YYYY-MM-DD");
    }
    next = {
      paid_until:
        row.plan === "monthly" ? addMonths(row.paid_until, 1, row.anchor_day) : addMonths(row.paid_until, 12),
      previous_paid_until: row.paid_until,
      previous_plan: row.plan,
    };
  }

  const { error: e } = await supabase
    .from("billing")
    .upsert({ id: true, ...(row ?? {}), ...next, updated_at: new Date().toISOString() });
  if (e) throw new Error(e.message);

  if (row && !flag("undo")) console.log(`${name}: was ${row.plan}, ${show(row.paid_until)}`);
  console.log(`${name}: now ${describe(await state(supabase))}`);
  if (!flag("undo")) console.log(`Wrong customer or a slip? Put it back with: npm run paid -- ${name} --undo`);
}

try {
  if (command === "list") await listCustomers();
  else if (command === "paid" && args[1] && !args[1].startsWith("--")) await paid(args[1]);
  else {
    console.error("Usage: npm run customers   or   npm run paid -- <customer> [--undo | --start <plan> --until <date> | --off]");
    process.exit(1);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
