// A complete copy of one committee's information, as a .zip. Shared by the
// admin's "Download everything" button (src/app/api/admin/export) and the
// supplier's `npm run export` (scripts/export-customer.mjs), so both give
// exactly the same copy. Plain JavaScript so the script can run it directly.
//
// The zip holds:
//   README.txt      what each file is
//   *.csv           one spreadsheet per kind of record, opens in Excel, with
//                   people, groups and rooms shown by name
//   pictures/       pictures added to messages
//   backup.json     everything exactly as stored, for setting the system up
//                   again later. Not meant for reading.

import { zipSync, strToU8 } from "fflate";

// Phone sign-up records, secrets and billing are the supplier's, not the
// committee's, and are left out. Read markers and bell notifications are
// left out as noise.
export const TABLES = [
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
  ["message_reactions", "Reactions on messages"],
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

/**
 * Reads everything with the given service-role client and returns the zip.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 * @returns {Promise<{ zip: Uint8Array, counts: Record<string, number>, taken: string }>}
 */
export async function buildExport(supabase) {
  // Today in the UK, as YYYY-MM-DD.
  const taken = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const all = {};
  for (const [table] of TABLES) all[table] = await readAll(supabase, table);

  const labels = new Map();
  for (const rows of Object.values(all)) {
    for (const r of rows) {
      const label = r.name ?? r.title ?? r.label;
      if (typeof r.id === "string" && typeof label === "string") labels.set(r.id, label);
    }
  }

  const files = {};
  const counts = {};
  const readme = [
    `A copy of everything held in your CommitteeHub, taken on ${taken}.`,
    "",
    "The .csv files open in Excel or any spreadsheet program:",
    "",
  ];
  for (const [table, what] of TABLES) {
    files[`${table}.csv`] = strToU8(csv(all[table], labels));
    counts[table] = all[table].length;
    readme.push(`  ${`${table}.csv`.padEnd(26)} ${what} (${all[table].length})`);
  }

  const bucket = supabase.storage.from("message-images");
  const pictures = await listFiles(bucket);
  for (const file of pictures) {
    const { data, error } = await bucket.download(file);
    if (error) throw new Error(`Downloading ${file}: ${error.message}`);
    // Pictures are already compressed; storing them as they are is faster.
    files[`pictures/${file}`] = [new Uint8Array(await data.arrayBuffer()), { level: 0 }];
  }
  counts.pictures = pictures.length;

  files["backup.json"] = strToU8(JSON.stringify({ taken, tables: all }, null, 1));
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
  files["README.txt"] = strToU8(readme.join("\r\n") + "\r\n");

  return { zip: zipSync(files, { level: 6 }), counts, taken };
}
