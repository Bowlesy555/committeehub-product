// Turns one source logo into the full icon set a deployment needs, and
// (with --upload) puts it in a public "brand" bucket in that committee's
// own Supabase project.
//
//   node scripts/generate-icons.mjs logo.svg
//   node --env-file=customers/riverside.env scripts/generate-icons.mjs logo.svg --upload
//
// Options:
//   --out <dir>          where to write the files (default: brand-out)
//   --background <hex>   colour behind the logo on the maskable and Apple
//                        icons, which must be opaque (default: #FFFFFF)
//   --upload             upload to Supabase Storage; needs
//                        NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY

import { mkdir, readFile, copyFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};
const source = args.find((a, i) => !a.startsWith("--") && !["--out", "--background"].includes(args[i - 1]));
if (!source) {
  console.error("Usage: node scripts/generate-icons.mjs <logo.svg|png> [--out dir] [--background #hex] [--upload]");
  process.exit(1);
}
const outDir = flag("--out") ?? "brand-out";
const background = flag("--background") ?? "#FFFFFF";
const upload = args.includes("--upload");
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

// The logo scaled to `fill` of a square canvas and centred on `bg`.
async function icon(size, fill, bg) {
  const inner = Math.round(size * fill);
  const logo = await sharp(source, { density: 600 })
    .resize(inner, inner, { fit: "contain", background: transparent })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: "centre" }])
    .png()
    .toBuffer();
}

const files = {
  "icon-192.png": await icon(192, 0.9, transparent),
  "icon-512.png": await icon(512, 0.9, transparent),
  // Android crops a maskable icon to a circle, squircle or rounded square;
  // only the middle 80% is guaranteed visible, so the logo stays well inside.
  "icon-512-maskable.png": await icon(512, 0.6, background),
  // iOS turns transparency black, so this one is opaque too.
  "apple-touch-icon.png": await icon(180, 0.8, background),
};

await mkdir(outDir, { recursive: true });
for (const [name, data] of Object.entries(files)) {
  await sharp(data).toFile(path.join(outDir, name));
}
const logoName = "logo" + path.extname(source).toLowerCase();
await copyFile(source, path.join(outDir, logoName));
console.log(`Wrote ${Object.keys(files).length} icons and ${logoName} to ${outDir}/`);

if (upload) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("--upload needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (use node --env-file=...)");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error: bucketError } = await supabase.storage.createBucket("brand", { public: true });
  if (bucketError && !/already exists/i.test(bucketError.message)) throw bucketError;

  const types = { ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
  for (const name of [...Object.keys(files), logoName]) {
    const { error } = await supabase.storage
      .from("brand")
      .upload(name, await readFile(path.join(outDir, name)), {
        contentType: types[path.extname(name)] ?? "application/octet-stream",
        cacheControl: "86400",
        upsert: true,
      });
    if (error) throw error;
  }
  const base = `${url.replace(/\/+$/, "")}/storage/v1/object/public/brand`;
  console.log("\nUploaded. Set these on the deployment:\n");
  console.log(`NEXT_PUBLIC_BRAND_ICON_BASE_URL=${base}`);
  console.log(`NEXT_PUBLIC_BRAND_LOGO_URL=${base}/${logoName}`);
}
