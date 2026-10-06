// Fills a DEMO deployment with a believable, lived-in committee for sales
// pitches: members, groups, rooms with conversation, decisions, tasks,
// meetings, documents and skills.
//
//   node --env-file=customers/demo.env scripts/seed-demo.mjs --reset
//   node --env-file=customers/demo.env scripts/seed-demo.mjs --scenario village-hall --reset
//
//   node --env-file=customers/demo.env scripts/seed-demo.mjs --scenario current --reset
//
// The committee itself is described in scripts/demo-scenarios/<name>.mjs
// (default: sports-club); this file only knows how to load one. Switching
// scenario also swaps the roles, the skill areas, and the logo and icons
// (from <name>.svg beside it). The app's name and colour are deployment
// settings and don't change, so the demo is deployed with neutral ones.
//
// --reset wipes every group (and with it every room, message, decision,
// task, meeting and document), the library, and every fictional member this
// script made before, then builds it all again -- so run it after a pitch to
// put the demo back to its starting state. Real accounts (yours) are kept.
// With DEMO_GUEST_EMAIL and DEMO_GUEST_PIN in the env file, it also keeps a
// public guest sign-in in every group, as an ordinary member.
//
// NEVER point this at a real committee's project.

import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use node --env-file=...)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const scenarioFlag = process.argv.indexOf("--scenario");
let scenarioName = scenarioFlag === -1 ? "sports-club" : process.argv[scenarioFlag + 1];

// "--scenario current" rebuilds whichever committee is loaded now, worked out
// from the address ending of the fictional members already there. Used by the
// nightly reset, so it never undoes a switch made for the next day's pitch.
if (scenarioName === "current") {
  scenarioName = "sports-club";
  const { data: sample } = await db.from("profiles").select("email").like("email", "%-demo.example").limit(1);
  const loadedSlug = sample?.[0]?.email.match(/@(.+)-demo\.example$/)?.[1];
  const dir = new URL("./demo-scenarios/", import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".mjs"))) {
    if ((await import(new URL(file, dir))).default.slug === loadedSlug) scenarioName = file.replace(/\.mjs$/, "");
  }
}
let scenario;
try {
  scenario = (await import(`./demo-scenarios/${scenarioName}.mjs`)).default;
} catch {
  console.error(`No scenario called "${scenarioName}" in scripts/demo-scenarios/`);
  process.exit(1);
}

// Fictional members are recognised by this address ending, which can never
// belong to a real person (.example is reserved for exactly this).
const DEMO_DOMAIN = "-demo.example";

async function run(step, promise) {
  const { data, error } = await promise;
  if (error) {
    console.error(`${step} failed: ${error.message}`);
    process.exit(1);
  }
  return data;
}

const daysFromNow = (d, hour = 19) => {
  const t = new Date();
  t.setDate(t.getDate() + d);
  t.setHours(hour, 0, 0, 0);
  return t.toISOString();
};
const dateFromNow = (d) => daysFromNow(d).slice(0, 10);

// ---- reset -------------------------------------------------------------

const existingGroups = await run("Reading groups", db.from("groups").select("id"));
if (existingGroups.length && !process.argv.includes("--reset")) {
  console.error(
    `${url} already has ${existingGroups.length} group(s).\n` +
      "Re-run with --reset to wipe them and rebuild the demo. Only ever do this on a demo project."
  );
  process.exit(1);
}
console.log(`Seeding the "${scenarioName}" demo into ${url}`);
await run("Clearing groups", db.from("groups").delete().not("id", "is", null));
await run("Clearing private chats", db.from("spaces").delete().not("id", "is", null));
await run("Clearing the library", db.from("library_items").delete().not("id", "is", null));
await run("Clearing the login log", db.from("login_events").delete().not("id", "is", null));
const oldDemo = await run("Finding old demo members", db.from("profiles").select("id").like("email", `%${DEMO_DOMAIN}`));
for (const p of oldDemo) {
  const { error } = await db.auth.admin.deleteUser(p.id);
  if (error) console.warn(`Could not remove an old demo member: ${error.message}`);
}

// ---- roles and skill areas ---------------------------------------------

// Each kind of committee has its own, so they are replaced wholesale. (Any
// roles or skill ratings on real accounts go with them.)
const slug = (label) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
await run("Clearing roles", db.from("roles").delete().not("id", "is", null));
await run("Clearing skill areas", db.from("skill_areas").delete().not("id", "is", null));
const roles = await run(
  "Adding roles",
  db.from("roles").insert(scenario.roles.map((label, i) => ({ label, sort_order: i + 1 }))).select("id,label")
);
const skillAreas = await run(
  "Adding skill areas",
  db.from("skill_areas").insert(scenario.skillAreas.map((label, i) => ({ id: slug(label), label, sort_order: i + 1 }))).select("id,label")
);

// ---- members -----------------------------------------------------------

const roleId = (label) => roles.find((r) => r.label === label)?.id;
const skillId = (label) => skillAreas.find((s) => s.label === label)?.id;

// Everything in a scenario refers to people by first name.
const m = {};
const who = (first) => {
  if (!m[first]) throw new Error(`Scenario mentions "${first}", who isn't in its people list`);
  return m[first];
};

for (const [name, roleLabels, capacity, skills] of scenario.people) {
  const first = name.split(" ")[0];
  const email = `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${scenario.slug}${DEMO_DOMAIN}`;
  // A long random password nobody knows: these people exist to be seen in
  // the demo, not to sign in.
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("hex"),
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    console.error(`Creating ${name} failed: ${error.message}`);
    process.exit(1);
  }
  m[first] = data.user.id;
  await run(`Setting ${first}'s capacity`, db.from("profiles").update({ capacity }).eq("id", m[first]));
  const memberRoles = roleLabels.map(roleId).filter(Boolean).map((role_id) => ({ member_id: m[first], role_id }));
  if (memberRoles.length) await run(`Giving ${first} roles`, db.from("member_roles").insert(memberRoles));
  const memberSkills = skills
    .filter(([label]) => skillId(label))
    .map(([label, level]) => ({ member_id: m[first], skill_id: skillId(label), level }));
  if (memberSkills.length) await run(`Rating ${first}'s skills`, db.from("member_skills").insert(memberSkills));
}

// A guest sign-in for prospects to try the demo themselves, if
// DEMO_GUEST_EMAIL and DEMO_GUEST_PIN are set. Its PIN is public, so it is an
// ordinary member, never an admin, and every run puts its name and PIN back
// in case a visitor changed them.
const guestEmail = (process.env.DEMO_GUEST_EMAIL ?? "").trim().toLowerCase();
const guestPin = (process.env.DEMO_GUEST_PIN ?? "").trim();
let guestId = null;
if (guestEmail && /^\d{6}$/.test(guestPin)) {
  const existing = await run("Finding the guest", db.from("profiles").select("id").eq("email", guestEmail).maybeSingle());
  if (existing) {
    guestId = existing.id;
    const { error } = await db.auth.admin.updateUserById(guestId, { password: guestPin });
    if (error) console.warn(`Could not reset the guest PIN: ${error.message}`);
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email: guestEmail, password: guestPin, email_confirm: true, user_metadata: { name: "Guest Visitor" },
    });
    if (error) {
      console.error(`Creating the guest failed: ${error.message}`);
      process.exit(1);
    }
    guestId = data.user.id;
  }
  await run(
    "Resetting the guest profile",
    db.from("profiles").update({ name: "Guest Visitor", is_global_admin: false, capacity: "available" }).eq("id", guestId)
  );
}

// Real accounts (the person giving the demo) join everything too, as admins.
const real = await run("Reading real accounts", db.from("profiles").select("id").not("email", "like", `%${DEMO_DOMAIN}`));
const realIds = real.map((p) => p.id).filter((id) => id !== guestId);

// ---- groups ------------------------------------------------------------

const groups = {};
for (const g of scenario.groups) {
  const [row] = await run(
    `Creating ${g.name}`,
    db.from("groups").insert({ name: g.name, kind: g.kind, description: g.description, default_quorum: g.quorum }).select()
  );
  groups[g.key] = row.id;
  const firstNames = g.members === "everyone" ? Object.keys(m) : g.members;
  const memberIds = [...new Set([...firstNames.map(who), ...realIds, ...(guestId ? [guestId] : [])])];
  await run(
    `Adding members to ${g.name}`,
    db.from("group_members").insert(
      memberIds.map((member_id) => ({
        group_id: row.id,
        member_id,
        is_admin: g.admins.map(who).includes(member_id) || realIds.includes(member_id),
      }))
    )
  );
}

// ---- rooms, topics and conversation -------------------------------------

// lines: [first name, text]; spread evenly between the two ages in days.
async function chat(space_id, topic_id, fromDaysAgo, toDaysAgo, lines) {
  const step = lines.length > 1 ? (fromDaysAgo - toDaysAgo) / (lines.length - 1) : 0;
  // One at a time and in order, so "latest message" on the room is right.
  for (const [i, [author, text]] of lines.entries()) {
    const t = new Date(Date.now() - (fromDaysAgo - step * i) * 86400000);
    await run(
      "Posting a message",
      db.from("messages").insert({ space_id, topic_id, author_id: who(author), text, created_at: t.toISOString() })
    );
  }
}

const rooms = {};
const topics = {};
for (const r of scenario.rooms) {
  const [row] = await run(
    `Creating room ${r.name}`,
    db.from("spaces").insert({ group_id: groups[r.group], name: r.name, created_by: who(r.by), pinned: !!r.pinned }).select()
  );
  rooms[r.key] = row.id;
  for (const t of r.topics ?? []) {
    const [topic] = await run(
      `Creating topic ${t.name}`,
      db.from("space_topics").insert({ space_id: row.id, name: t.name, created_by: who(t.by) }).select()
    );
    topics[t.key] = topic.id;
  }
  for (const c of r.chats) await chat(row.id, c.topic ? topics[c.topic] : null, c.from, c.to, c.lines);
}

// A private chat to the person giving the demo, to show that side of the app.
if (realIds.length && scenario.privateChat) {
  const author = scenario.privateChat.from;
  const fullName = scenario.people.find(([name]) => name.split(" ")[0] === author)[0];
  const [dm] = await run(
    "Creating a private chat",
    db.from("spaces").insert({ name: fullName, visibility: "private", created_by: who(author) }).select()
  );
  await run(
    "Adding chat participants",
    db.from("space_participants").insert([who(author), realIds[0]].map((member_id) => ({ space_id: dm.id, member_id })))
  );
  await chat(dm.id, null, 1, 0.1, [[author, scenario.privateChat.text]]);
}

// ---- decisions ---------------------------------------------------------

// A decision that reaches its quorum resolves itself (the database does
// this), exactly as it would in real use.
const decisions = {};
for (const d of scenario.decisions) {
  const [row] = await run(
    `Creating motion ${d.title}`,
    db.from("decisions").insert({
      group_id: groups[d.group],
      space_id: d.room ? rooms[d.room] : null,
      topic_id: d.topic ? topics[d.topic] : null,
      proposed_by: who(d.by),
      quorum: d.quorum,
      title: d.title,
      motion_text: d.text,
      ...(d.options ? { vote_options: d.options } : {}),
      deadline: daysFromNow(d.deadline),
      created_at: daysFromNow(d.created),
    }).select()
  );
  if (d.key) decisions[d.key] = row.id;
  for (const [voter, choice] of d.votes) {
    await run("Casting a vote", db.from("votes").insert({ decision_id: row.id, member_id: who(voter), choice }));
  }
  if (d.closedDaysAgo !== undefined) {
    await run("Backdating a motion", db.from("decisions").update({ closed_at: daysFromNow(-d.closedDaysAgo) }).eq("id", row.id));
  }
}

// ---- meetings ----------------------------------------------------------

const meetings = {};
for (const mt of scenario.meetings) {
  const [row] = await run(
    `Creating meeting ${mt.title}`,
    db.from("meetings").insert({
      group_id: groups[mt.group], title: mt.title, scheduled_at: daysFromNow(mt.days),
      location: mt.location, notes: mt.notes, created_by: who(scenario.secretary),
    }).select()
  );
  if (mt.key) meetings[mt.key] = row.id;
}

// ---- tasks -------------------------------------------------------------

for (const t of scenario.tasks) {
  // Already-due demo tasks shouldn't generate reminders the first time the
  // daily job runs.
  const flags = { due_reminder_sent: t.due <= 1, overdue_notified: t.due < 0 };
  const [row] = await run(
    `Creating task ${t.title}`,
    db.from("tasks").insert({
      group_id: groups[t.group], title: t.title, description: t.description ?? null,
      status: t.status, priority: t.priority, due_date: dateFromNow(t.due),
      assignee_id: who(t.who[0]), created_by: who(scenario.secretary),
      meeting_id: t.meeting ? meetings[t.meeting] : null,
      decision_id: t.decision ? decisions[t.decision] : null,
      ...flags,
    }).select()
  );
  await run("Assigning a task", db.from("task_assignees").insert(t.who.map((w) => ({ task_id: row.id, member_id: who(w) }))));
  const tags = t.skills.map(skillId).filter(Boolean).map((skill_id) => ({ task_id: row.id, skill_id }));
  if (tags.length) await run("Tagging a task", db.from("task_skill_tags").insert(tags));
  // task_assignees' trigger re-arms the reminder flags, so set them again.
  await run("Settling reminder flags", db.from("tasks").update(flags).eq("id", row.id));
}

// ---- documents and library ---------------------------------------------

// Placeholder addresses: the app only ever stores links to Google Drive.
const drive = (slug) => `https://docs.google.com/document/d/demo-${slug}/edit`;
await run(
  "Adding documents",
  db.from("documents").insert(
    scenario.documents.map((d) => ({ group_id: groups[d.group], title: d.title, url: drive(d.slug), added_by: who(d.by) }))
  )
);
await run(
  "Adding library items",
  db.from("library_items").insert(
    scenario.library.map((l) => ({
      title: l.title, category: l.category, description: l.description ?? null, url: drive(l.slug), added_by: who(l.by),
    }))
  )
);

console.log(
  `Done: ${scenario.people.length} members, ${scenario.groups.length} groups, ${scenario.rooms.length} rooms, ` +
    `${scenario.decisions.length} motions, ${scenario.meetings.length} meetings, ${scenario.tasks.length} tasks, ` +
    `${scenario.documents.length} documents, ${scenario.library.length} library items.`
);

// ---- logo and icons ----------------------------------------------------

// Uploaded over the previous scenario's files, so the deployment's existing
// logo and icon addresses now show this committee's.
const here = path.dirname(fileURLToPath(import.meta.url));
const logo = path.join(here, "demo-scenarios", `${scenarioName}.svg`);
if (existsSync(logo)) {
  execFileSync(
    process.execPath,
    [path.join(here, "generate-icons.mjs"), logo, "--out", path.join(tmpdir(), `committeehub-demo-${scenarioName}`), "--upload", "--cache", "60"],
    { stdio: ["ignore", "ignore", "inherit"] }
  );
  console.log("Logo and icons swapped. A browser that has the old ones may need a refresh to show the new.");
}
