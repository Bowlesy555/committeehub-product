// Fills a DEMO deployment with a believable, lived-in committee for sales
// pitches: members, groups, rooms with conversation, decisions, tasks,
// meetings, documents and skills.
//
//   node --env-file=customers/demo.env scripts/seed-demo.mjs --reset
//
// --reset wipes every group (and with it every room, message, decision,
// task, meeting and document), the library, and every fictional member this
// script made before, then builds it all again -- so run it after a pitch to
// put the demo back to its starting state. Real accounts (yours) are kept.
//
// NEVER point this at a real committee's project.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use node --env-file=...)");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

// Fictional members are recognised by this address ending, which can never
// belong to a real person (.example is reserved for exactly this).
const DEMO_DOMAIN = "@riverside-demo.example";

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
      "Re-run with --reset to wipe them and rebuild the demo. Only ever do this on the demo project."
  );
  process.exit(1);
}
console.log(`Seeding demo content into ${url}`);
await run("Clearing groups", db.from("groups").delete().not("id", "is", null));
await run("Clearing private chats", db.from("spaces").delete().not("id", "is", null));
await run("Clearing the library", db.from("library_items").delete().not("id", "is", null));
await run("Clearing the login log", db.from("login_events").delete().not("id", "is", null));
const oldDemo = await run("Finding old demo members", db.from("profiles").select("id").like("email", `%${DEMO_DOMAIN}`));
for (const p of oldDemo) {
  const { error } = await db.auth.admin.deleteUser(p.id);
  if (error) console.warn(`Could not remove an old demo member: ${error.message}`);
}

// ---- members -----------------------------------------------------------

// name, roles, capacity, skills as [skill area label, level 1-3]
const PEOPLE = [
  ["Margaret Ellis", ["Chairperson"], "available", [["Governance & Rules", 3], ["Events", 2], ["Welfare & Conduct", 2]]],
  ["David Okafor", ["Vice Chair"], "available", [["Governance & Rules", 2], ["Fundraising & Sponsorship", 3]]],
  ["Priya Shah", ["Secretary"], "stretched", [["Governance & Rules", 3], ["Communications & Media", 2], ["Membership", 2]]],
  ["Tom Whitaker", ["Treasurer"], "available", [["Finance & Admin", 3], ["Fundraising & Sponsorship", 2]]],
  ["Hannah Lloyd", ["Welfare Officer", "Committee Member"], "available", [["Welfare & Conduct", 3], ["Membership", 1]]],
  ["Marcus Bell", ["Fixtures Secretary"], "available", [["Events", 3], ["IT & Digital", 1]]],
  ["Sophie Tran", ["Committee Member"], "available", [["Communications & Media", 3], ["IT & Digital", 3]]],
  ["George Patel", ["Committee Member"], "away", [["Finance & Admin", 2], ["Events", 2]]],
  ["Aisha Rahman", ["Committee Member"], "available", [["Membership", 3], ["Events", 2], ["Communications & Media", 1]]],
  ["Chris Nowak", ["Committee Member"], "stretched", [["IT & Digital", 2], ["Fundraising & Sponsorship", 1]]],
];

const roles = await run("Reading roles", db.from("roles").select("id,label"));
const skillAreas = await run("Reading skill areas", db.from("skill_areas").select("id,label"));
const roleId = (label) => roles.find((r) => r.label === label)?.id;
const skillId = (label) => skillAreas.find((s) => s.label === label)?.id;

const m = {}; // first name -> profile id
for (const [name, roleLabels, capacity, skills] of PEOPLE) {
  const first = name.split(" ")[0];
  const email = `${name.toLowerCase().replace(" ", ".")}${DEMO_DOMAIN}`;
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

// Real accounts (the person giving the demo) join everything too.
const real = await run("Reading real accounts", db.from("profiles").select("id").not("email", "like", `%${DEMO_DOMAIN}`));
const realIds = real.map((p) => p.id);
const everyone = [...Object.values(m), ...realIds];

// ---- groups ------------------------------------------------------------

async function group(name, kind, description, default_quorum, memberIds, adminIds) {
  const [g] = await run(`Creating ${name}`, db.from("groups").insert({ name, kind, description, default_quorum }).select());
  await run(
    `Adding members to ${name}`,
    db.from("group_members").insert(
      [...new Set(memberIds)].map((member_id) => ({
        group_id: g.id,
        member_id,
        is_admin: adminIds.includes(member_id) || realIds.includes(member_id),
      }))
    )
  );
  return g.id;
}

const committee = await group(
  "Main Committee", "committee", "The full elected committee. Formal decisions are made here.", 6,
  everyone, [m.Margaret, m.Priya]
);
const gala = await group(
  "Summer Gala Working Party", "working-party", "Planning the July fundraising gala and awards evening.", 3,
  [m.David, m.Marcus, m.Aisha, m.Sophie, m.Tom, ...realIds], [m.David]
);
const clubhouse = await group(
  "Clubhouse Refurbishment", "working-party", "Changing rooms, roof repairs and the grant application to pay for them.", 3,
  [m.Tom, m.George, m.Chris, m.Hannah, m.Margaret, ...realIds], [m.Tom]
);

// ---- rooms, topics and conversation -------------------------------------

async function room(group_id, name, created_by, opts = {}) {
  const [s] = await run(`Creating room ${name}`, db.from("spaces").insert({ group_id, name, created_by, ...opts }).select());
  return s.id;
}
async function topic(space_id, name, created_by) {
  const [t] = await run(`Creating topic ${name}`, db.from("space_topics").insert({ space_id, name, created_by }).select());
  return t.id;
}
// lines: [author, text]; spread evenly from `startDaysAgo` to `endDaysAgo`.
async function chat(space_id, topic_id, startDaysAgo, endDaysAgo, lines) {
  const step = lines.length > 1 ? (startDaysAgo - endDaysAgo) / (lines.length - 1) : 0;
  const rows = lines.map(([author, text], i) => {
    const t = new Date(Date.now() - (startDaysAgo - step * i) * 86400000);
    return { space_id, topic_id, author_id: m[author], text, created_at: t.toISOString() };
  });
  // One at a time and in order, so "latest message" on the room is right.
  for (const row of rows) await run("Posting a message", db.from("messages").insert(row));
}

const general = await room(committee, "General", m.Margaret, { pinned: true });
await chat(general, null, 9, 0.2, [
  ["Margaret", "Welcome to the new committee space, everyone. Agendas, decisions and actions all live here now, so nothing gets lost in email."],
  ["Priya", "Minutes from last month are in the Library. Action items have been imported as tasks, so check the Tasks tab for anything with your name on it."],
  ["Tom", "Accounts for the quarter are ready. Short version: we are about £1,400 ahead of budget, mostly thanks to the bar takings at the spring tournament."],
  ["Hannah", "Reminder that safeguarding refreshers are due for anyone who coaches juniors. I'll message people individually."],
  ["Marcus", "Fixture list for next season is drafted. I need the pitch availability from the council before I can confirm the home dates."],
  ["Margaret", "Thanks all. Next meeting is in the Calendar. Please vote on the two open motions before then so we can keep the meeting short."],
]);

const membership = await room(committee, "Membership & Fees", m.Aisha);
const feesTopic = await topic(membership, "2027 subscription rates", m.Aisha);
const juniorTopic = await topic(membership, "Junior section waiting list", m.Hannah);
await chat(membership, feesTopic, 6, 1, [
  ["Aisha", "Membership is at 214, up 9% on last year. Proposal for 2027: adults £95 (from £90), juniors held at £40, family cap held at £220."],
  ["Tom", "That covers the insurance increase with a little to spare. I'd support it."],
  ["George", "Could we offer a discount for paying before the end of January? It would help cash flow in the quiet months."],
  ["Aisha", "Good idea. I've put a motion up with an early-bird rate of £85."],
]);
await chat(membership, juniorTopic, 4, 2, [
  ["Hannah", "We have 17 on the junior waiting list. The limit is coaches, not pitch time."],
  ["Marcus", "Two parents have offered to do the Level 1 course if the club pays for it. About £180 each."],
  ["Hannah", "That seems well worth it. I'll raise a task to get them booked."],
]);

const galaRoom = await room(gala, "Gala planning", m.David, { pinned: true });
await chat(galaRoom, null, 8, 0.5, [
  ["David", "Date is confirmed: Saturday 17 July. The marquee company can do the same package as last year for £1,850."],
  ["Aisha", "Ticket price? Last year was £35 and we sold out in three weeks."],
  ["Tom", "At £40 with 160 tickets we clear about £3,200 after costs, before the raffle and auction."],
  ["Sophie", "I can have the poster and the online booking page ready by the end of the month if someone confirms the wording."],
  ["Marcus", "Awards list is nearly done. I need the junior coaches' nominations by Friday."],
  ["David", "Brilliant. Sponsors: two confirmed, one more to chase. I'll update the task when I hear back."],
]);

const refurb = await room(clubhouse, "Refurbishment & grant", m.Tom);
const grantTopic = await topic(refurb, "Community facilities grant", m.Tom);
await chat(refurb, grantTopic, 7, 1.5, [
  ["Tom", "The community facilities fund opens next month. Maximum award is £25,000 and they want match funding of at least 20%."],
  ["George", "We have three quotes for the roof: £14,200, £15,900 and £18,500. The cheapest can't start until October."],
  ["Chris", "The application needs evidence of community use. I can pull the booking figures for the last two years."],
  ["Hannah", "Accessible changing facilities should be in the bid. It scores highly and we genuinely need them."],
  ["Tom", "Agreed. Draft application is in Documents. Comments by the 20th please."],
]);

// A private chat, to show that side of the app.
if (realIds.length) {
  const [dm] = await run(
    "Creating a private chat",
    db.from("spaces").insert({ name: "Margaret Ellis", visibility: "private", created_by: m.Margaret }).select()
  );
  await run(
    "Adding chat participants",
    db.from("space_participants").insert([m.Margaret, realIds[0]].map((member_id) => ({ space_id: dm.id, member_id })))
  );
  await chat(dm.id, null, 1, 0.1, [
    ["Margaret", "Could we have a quick word before Thursday's meeting about the treasurer handover? Nothing urgent."],
  ]);
}

// ---- decisions ---------------------------------------------------------

// votes: [first name, choice]. A decision that reaches its quorum resolves
// itself (the database does this), exactly as it would in real use.
async function decision(fields, votes, closedDaysAgo) {
  const [d] = await run(`Creating motion ${fields.title}`, db.from("decisions").insert(fields).select());
  for (const [who, choice] of votes) {
    await run("Casting a vote", db.from("votes").insert({ decision_id: d.id, member_id: m[who], choice }));
  }
  if (closedDaysAgo !== undefined) {
    await run("Backdating a motion", db.from("decisions").update({ closed_at: daysFromNow(-closedDaysAgo) }).eq("id", d.id));
  }
  return d.id;
}

await decision(
  {
    group_id: committee, space_id: membership, topic_id: feesTopic, proposed_by: m.Aisha, quorum: 6,
    title: "2027 subscription rates",
    motion_text: "That adult subscriptions rise to £95 for 2027, with an early-bird rate of £85 for payment before 31 January. Junior and family rates are held.",
    deadline: daysFromNow(4), created_at: daysFromNow(-2),
  },
  [["Tom", "yes"], ["George", "yes"], ["Margaret", "yes"], ["Chris", "no"]]
);
await decision(
  {
    group_id: committee, space_id: membership, topic_id: juniorTopic, proposed_by: m.Hannah, quorum: 6,
    title: "Fund two Level 1 coaching courses",
    motion_text: "That the club pays for two volunteer parents to take the Level 1 coaching course, at a total cost of up to £360, to reduce the junior waiting list.",
    deadline: daysFromNow(1), created_at: daysFromNow(-4),
  },
  [["Hannah", "yes"], ["Marcus", "yes"], ["Aisha", "yes"], ["Priya", "yes"], ["David", "yes"]]
);
await decision(
  {
    group_id: gala, space_id: galaRoom, proposed_by: m.David, quorum: 3,
    title: "Gala ticket price",
    motion_text: "What should a gala ticket cost this year?",
    vote_options: ["£35", "£40", "£45", "abstain"],
    deadline: daysFromNow(6), created_at: daysFromNow(-1),
  },
  [["Tom", "£40"], ["Aisha", "£40"], ["Sophie", "£35"]]
);
const marquee = await decision(
  {
    group_id: gala, space_id: galaRoom, proposed_by: m.David, quorum: 3,
    title: "Book the marquee for 17 July",
    motion_text: "That we accept the marquee quote of £1,850 and pay the 25% deposit now to secure the date.",
    deadline: daysFromNow(-3), created_at: daysFromNow(-9),
  },
  [["David", "yes"], ["Tom", "yes"], ["Marcus", "yes"]],
  6
);
await decision(
  {
    group_id: committee, space_id: general, proposed_by: m.Tom, quorum: 6,
    title: "Approve the annual accounts",
    motion_text: "That the committee approves the accounts for the year as presented by the Treasurer, for submission to the AGM.",
    deadline: daysFromNow(-12), created_at: daysFromNow(-20),
  },
  [["Margaret", "yes"], ["David", "yes"], ["Priya", "yes"], ["Hannah", "yes"], ["Marcus", "yes"], ["Sophie", "yes"], ["George", "abstain"]],
  14
);
await decision(
  {
    group_id: committee, space_id: general, proposed_by: m.Chris, quorum: 6,
    title: "Move committee meetings to Monday evenings",
    motion_text: "That monthly committee meetings move from Thursday to Monday evenings from next quarter.",
    deadline: daysFromNow(-25), created_at: daysFromNow(-32),
  },
  [["Margaret", "no"], ["Priya", "no"], ["Tom", "no"], ["Hannah", "no"], ["Marcus", "no"], ["Aisha", "no"], ["Chris", "yes"], ["Sophie", "yes"]],
  27
);

// ---- meetings ----------------------------------------------------------

async function meeting(group_id, title, days, location, notes) {
  const [mt] = await run(
    `Creating meeting ${title}`,
    db.from("meetings").insert({ group_id, title, scheduled_at: daysFromNow(days), location, notes, created_by: m.Priya }).select()
  );
  return mt.id;
}
const lastMeeting = await meeting(committee, "Committee meeting", -12, "Clubhouse, committee room", "Accounts approved. Subscription rates to be put to a vote. Action items imported to Tasks.");
await meeting(committee, "Committee meeting", 5, "Clubhouse, committee room", "Agenda: subscription rates, junior coaching, refurbishment grant, AOB.");
await meeting(gala, "Gala planning catch-up", 2, "Online", "Confirm ticket price, poster wording and sponsor list.");
await meeting(clubhouse, "Site visit with roofing contractor", 9, "Clubhouse car park", "Meet the preferred contractor to agree start date and access.");
await meeting(committee, "Annual General Meeting", 33, "Main hall", "Accounts, election of officers, subscription rates.");

// ---- tasks -------------------------------------------------------------

// [group, title, description, assignees, status, priority, due in days, skills, extra]
const TASKS = [
  [committee, "Send safeguarding refresher reminders", "Everyone who coaches juniors needs the refresher before the season starts.", ["Hannah"], "doing", "high", 3, ["Welfare & Conduct"], { meeting_id: lastMeeting }],
  [committee, "Confirm pitch availability with the council", "Needed before the home fixture dates can be published.", ["Marcus"], "blocked", "high", -2, ["Events"], { meeting_id: lastMeeting }],
  [committee, "Publish the 2027 fixture list", null, ["Marcus", "Sophie"], "todo", "normal", 14, ["Events", "Communications & Media"], {}],
  [committee, "Book Level 1 coaching courses", "Two volunteer parents, subject to the motion passing.", ["Hannah"], "todo", "normal", 10, ["Welfare & Conduct", "Membership"], {}],
  [committee, "Circulate AGM notice to members", "Must go out at least 21 days before the AGM.", ["Priya"], "todo", "high", 8, ["Governance & Rules"], {}],
  [committee, "Renew club insurance", "Renewal quote received, up 6% on last year.", ["Tom"], "done", "normal", -6, ["Finance & Admin"], { meeting_id: lastMeeting }],
  [committee, "Update the membership form for 2027 rates", null, ["Aisha"], "todo", "low", 20, ["Membership"], {}],
  [gala, "Pay the marquee deposit", "25% of £1,850, as agreed.", ["Tom"], "done", "high", -5, ["Finance & Admin"], { decision_id: marquee }],
  [gala, "Design the gala poster and booking page", null, ["Sophie"], "doing", "normal", 6, ["Communications & Media", "IT & Digital"], {}],
  [gala, "Chase the third sponsor", "Two confirmed. The garage on Mill Lane said they were interested.", ["David"], "doing", "normal", 4, ["Fundraising & Sponsorship"], {}],
  [gala, "Collect junior award nominations", null, ["Marcus", "Aisha"], "todo", "normal", 1, ["Events"], {}],
  [gala, "Arrange raffle prizes", null, ["Aisha"], "todo", "low", 18, ["Fundraising & Sponsorship"], {}],
  [clubhouse, "Draft the community facilities grant application", "Draft is in Documents. Comments by the 20th.", ["Tom", "Chris"], "doing", "high", 7, ["Fundraising & Sponsorship", "Finance & Admin"], {}],
  [clubhouse, "Pull two years of community booking figures", "Evidence of community use for the grant bid.", ["Chris"], "todo", "normal", 5, ["IT & Digital"], {}],
  [clubhouse, "Get a fourth roofing quote", null, ["George"], "todo", "low", 12, ["Finance & Admin"], {}],
  [clubhouse, "Survey members on changing room priorities", null, ["Hannah"], "done", "normal", -10, ["Welfare & Conduct", "Membership"], {}],
];
for (const [group_id, title, description, who, status, priority, due, skills, extra] of TASKS) {
  const [t] = await run(
    `Creating task ${title}`,
    db.from("tasks").insert({
      group_id, title, description, status, priority, due_date: dateFromNow(due),
      assignee_id: m[who[0]], created_by: m.Priya,
      // Already-due demo tasks shouldn't generate reminders the first time
      // the daily job runs.
      due_reminder_sent: due <= 1, overdue_notified: due < 0,
      ...extra,
    }).select()
  );
  await run("Assigning a task", db.from("task_assignees").insert(who.map((w) => ({ task_id: t.id, member_id: m[w] }))));
  const tags = skills.map(skillId).filter(Boolean).map((skill_id) => ({ task_id: t.id, skill_id }));
  if (tags.length) await run("Tagging a task", db.from("task_skill_tags").insert(tags));
  // task_assignees' trigger re-arms the reminder flags, so set them again.
  await run("Settling reminder flags", db.from("tasks").update({ due_reminder_sent: due <= 1, overdue_notified: due < 0 }).eq("id", t.id));
}

// ---- documents and library ---------------------------------------------

// Placeholder addresses: the app only ever stores links to Google Drive.
const drive = (n) => `https://docs.google.com/document/d/demo-${n}/edit`;
await run(
  "Adding documents",
  db.from("documents").insert([
    { group_id: committee, title: "Committee Meeting Minutes — last month", url: drive("minutes"), added_by: m.Priya },
    { group_id: committee, title: "Annual accounts", url: drive("accounts"), added_by: m.Tom },
    { group_id: gala, title: "Gala budget and running order", url: drive("gala-budget"), added_by: m.David },
    { group_id: clubhouse, title: "Grant application — draft", url: drive("grant-draft"), added_by: m.Tom },
    { group_id: clubhouse, title: "Roofing quotes (3)", url: drive("roof-quotes"), added_by: m.George },
  ])
);
await run(
  "Adding library items",
  db.from("library_items").insert([
    { title: "Club Constitution", category: "Governance", description: "Adopted at the last AGM.", url: drive("constitution"), added_by: m.Priya },
    { title: "Safeguarding Policy", category: "Policies", description: "Reviewed annually by the Welfare Officer.", url: drive("safeguarding"), added_by: m.Hannah },
    { title: "Code of Conduct", category: "Policies", url: drive("conduct"), added_by: m.Hannah },
    { title: "Expenses Claim Form", category: "Forms", url: drive("expenses"), added_by: m.Tom },
    { title: "Committee Role Descriptions", category: "Governance", url: drive("roles"), added_by: m.Margaret },
  ])
);

console.log(
  `Done: ${PEOPLE.length} members, 3 groups, 4 rooms, 6 motions, 5 meetings, ${TASKS.length} tasks, 5 documents, 5 library items.`
);
