// Takes a complete copy of one committee's information, to send to them when
// they are leaving. (While they are a customer, their admins can download the
// same copy themselves: Admin tab > Download everything.)
//
//   npm run export -- riverside
//
// It only reads; nothing in their system is changed or deleted. The copy is
// saved as customers/exports/<name>-<date>.zip. What is inside is described
// in src/lib/export-data.mjs.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { buildExport } from "../src/lib/export-data.mjs";

const name = process.argv[2];
if (!name || name.startsWith("--")) {
  console.error("Usage: npm run export -- <customer>");
  process.exit(1);
}

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

try {
  const { zip, counts, taken } = await buildExport(await connect());
  for (const [what, n] of Object.entries(counts)) console.log(`${what.padEnd(22)} ${n}`);
  const file = path.join("customers", "exports", `${name}-${taken}.zip`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, zip);
  console.log(`\nSaved: ${file} (${Math.ceil(zip.length / 1024)} KB)`);
  console.log(
    "\nIt holds personal information: send it by a secure link, not as a plain email\n" +
      "attachment, and delete your own copy within 30 days, as the contract says."
  );
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
