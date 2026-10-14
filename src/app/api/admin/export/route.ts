import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildExport } from "@/lib/export-data.mjs";

// Reading every table and every picture can take a while on a big committee.
export const maxDuration = 120;

const BUCKET = "exports";

// The admin's "Download everything" button. The zip is too big to send back
// directly (Vercel caps a response at a few MB), so it is put in a private
// storage bucket and the browser is given a download link that works for
// ten minutes. Earlier copies are removed each time, so at most one is ever
// stored.
export async function POST() {
  // Only a global admin may take a copy of everything: it includes every
  // private chat and the sign-in log. Checked before the service-role client
  // is used, as that client can read all of it.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_global_admin")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.is_global_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  try {
    const { zip, taken } = await buildExport(admin);

    // Created on first use; "already exists" afterwards, which is fine.
    await admin.storage.createBucket(BUCKET, { public: false });
    const store = admin.storage.from(BUCKET);
    const { data: old } = await store.list();
    if (old?.length) await store.remove(old.map((f) => f.name));

    const fileName = `committeehub-copy-${taken}.zip`;
    const path = `${crypto.randomUUID()}.zip`;
    const { error: upErr } = await store.upload(path, zip, { contentType: "application/zip" });
    if (upErr) throw new Error(upErr.message);
    const { data: signed, error: signErr } = await store.createSignedUrl(path, 600, { download: fileName });
    if (signErr || !signed) throw new Error(signErr?.message ?? "Could not create the download link");

    return NextResponse.json({ url: signed.signedUrl, sizeKb: Math.ceil(zip.length / 1024) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Export failed" }, { status: 500 });
  }
}
