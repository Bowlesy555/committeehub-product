// Takes a complete copy of one committee's information, to send to them when
// they ask for it or when their system is being closed.
//
//   npm run export -- riverside
//
// It only reads; nothing in their system is changed or deleted. The copy goes
// in customers/exports/<name>-<date>/ and, where the machine can, a .zip of
// the same beside it:
//
//   README.txt      what each file is
//   *.csv           one spreadsheet per kind of record, opens in Excel, with
//                   people, groups and rooms shown by name
//   pictures/       pictures added to messages
//   backup.json     everything exactly as stored, for setting the system up
//                   again later (reactivation). Not meant for reading.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const name = process.argv[2];
if (!name || name.startsWith("--")) {
  console.error("Usage: npm run export -- <customer>");
  process.exit(1);
}

// Sign-in records for phones, secrets and billing are ours, not theirs, and
// are left out. Read markers and bell notifications are left out as noise.
const TABLES = [
  ["profiles", "Members"],
  ["roles", "Roles"],
  ["member_roles", "Who holds which role"],
  ["skill_areas", "Skill areas"],
  ["member_skills", "Skills matrix ratings"],
  ["groups", "Groups and working parties"],
  ["group_members", "Who is in which group"],
  ["spaces", "Rooms and private chats"],
  ["space_participants", "Who is in which private chat"],
  ["space_owners", "Room owners"],
  ["space_topics", "Topics within rooms"],
  ["messages", "Messages"],
  ["decisions", "Motions and their outcomes"],
  ["votes", "Votes"],
  ["tasks", "Tasks"],
  ["task_assignees", "Who each task is assigned to"],
  ["task_skill_tags", "Skill areas tagged on tasks"],
  ["meetings", "Calendar"],
  ["documents", "Document links"],
  ["document_links", "What each document is attached to"],
  ["library_items", "Library"],
  ["library_item_groups", "Which groups see each library item"],
  ["login_events", "Sign-in log"],
  ["app_settings", "Settings"],
];

async function connect() {
  let text;
  try {
    text = await readFile(path.join("customers", `${name}.env`), "utf8");
  } catch {
    throw new Error(`There is no customers/${name}.env`);
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

async function readAll(supabase, table) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + 999);
    if (error) throw new Error(`Reading ${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

function csv(rows, labels) {
  if (!rows.length) return "";
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (column, value) => {
    if (value === null || value === undefined) return "";
    // Show who or what an id refers to, except in the row's own id column.
    if (column !== "id" && typeof value === "string" && labels.has(value)) value = labels.get(value);
    if (typeof value === "object") value = JSON.stringify(value);
    let text = String(value);
    // Stop Excel treating text that starts like a formula as one.
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => cell(c, r[c])).join(","))];
  // The marker at the start makes Excel read accents and emoji correctly.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

async function listFiles(bucket, folder = "") {
  const files = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await bucket.list(folder, { limit: 100, offset });
    if (error) throw new Error(`Listing pictures: ${error.message}`);
    for (const item of data) {
      const full = folder ? `${folder}/${item.name}` : item.name;
      if (item.id === null) files.push(...(await listFiles(bucket, full)));
      else files.push(full);
    }
    if (data.length < 100) return files;
  }
}

try {
  const supabase = await connect();
  const today = new Date().toISOString().slice(0, 10);
  const folder = path.join("customers", "exports", `${name}-${today}`);
  await mkdir(folder, { recursive: true });

  const all = {};
  for (const [table] of TABLES) all[table] = await readAll(supabase, table);

  const labels = new Map();
  for (const rows of Object.values(all)) {
    for (const r of rows) {
      const label = r.name ?? r.title ?? r.label;
      if (typeof r.id === "string" && typeof label === "string") labels.set(r.id, label);
    }
  }

  const readme = [
    `A copy of everything held in your CommitteeHub, taken on ${today}.`,
    "",
    "The .csv files open in Excel or any spreadsheet program:",
    "",
  ];
  for (const [table, what] of TABLES) {
    await writeFile(path.join(folder, `${table}.csv`), csv(all[table], labels));
    readme.push(`  ${`${table}.csv`.padEnd(26)} ${what} (${all[table].length})`);
    console.log(`${table.padEnd(22)} ${all[table].length}`);
  }

  const bucket = supabase.storage.from("message-images");
  const pictures = await listFiles(bucket);
  for (const file of pictures) {
    const { data, error } = await bucket.download(file);
    if (error) throw new Error(`Downloading ${file}: ${error.message}`);
    const target = path.join(folder, "pictures", file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, Buffer.from(await data.arrayBuffer()));
  }
  console.log(`${"pictures".padEnd(22)} ${pictures.length}`);

  await writeFile(path.join(folder, "backup.json"), JSON.stringify({ taken: today, tables: all }, null, 1));
  readme.push(
    "",
    `  pictures/                  Pictures added to messages (${pictures.length}). Each is named in the`,
    "                             'images' column of messages.csv.",
    "  backup.json                The same information exactly as stored. Keep it: it is",
    "                             what would be used to set your CommitteeHub up again.",
    "",
    "Documents in CommitteeHub were links to files in your own storage. Those",
    "files were never held in CommitteeHub and are not affected.",
    "",
    "This copy contains personal information about your members. Please store",
    "it securely.",
    "",
    "CommitteeHub - support@committeehub.co.uk"
  );
  await writeFile(path.join(folder, "README.txt"), readme.join("\r\n") + "\r\n");

  let zipped = false;
  try {
    // Windows 10+, macOS and Linux all ship a tar that writes .zip with -a.
    execFileSync("tar", ["-a", "-cf", `../${name}-${today}.zip`, "."], { cwd: folder, stdio: "ignore" });
    zipped = true;
  } catch {
    // no matter: the folder is the copy
  }

  console.log(`\nSaved in ${folder}`);
  if (zipped) console.log(`Zip to send: ${folder}.zip`);
  console.log(
    "\nIt holds personal information: send it by a secure link, not as a plain email\n" +
      "attachment, and delete your own copy once they confirm they have it (unless they\n" +
      "may come back, in which case keep it no longer than you have told them)."
  );
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
