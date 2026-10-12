import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToMembers } from "@/lib/push";
import { brand } from "@/lib/brand";

// "Send me a test notification": goes only to the signed-in person's own devices.
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const result = await sendPushToMembers(createAdminClient(), [user.id], {
    title: "Notifications are working",
    body: `This is a test from ${brand.appName}.`,
    url: "/dashboard",
    tag: "test",
    force: true,
  });
  return NextResponse.json({ ok: true, ...result });
}
