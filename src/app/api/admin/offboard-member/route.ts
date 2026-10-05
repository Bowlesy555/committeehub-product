import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Offboards a departed committee member: keeps every message, vote, task and
// decision they touched exactly where it is (foreign keys are untouched),
// but strips their identity and revokes their login. Name/email are replaced
// with an incrementing "Former Member N" placeholder, their committee role
// assignments are cleared (they no longer hold that role), and the auth
// account is banned for ~100 years -- long enough to be permanent without
// deleting the row, which would cascade-delete their votes.
export async function POST(request: Request) {
  const { memberId } = await request.json();
  if (!memberId || typeof memberId !== "string") {
    return NextResponse.json({ error: "memberId is required" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "Global admin only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id")
    .eq("id", memberId)
    .single();
  if (!target) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .like("name", "Former Member %");
  const nextNumber = (count ?? 0) + 1;
  const anonName = `Former Member ${nextNumber}`;
  const anonEmail = `former-member-${nextNumber}@removed.invalid`;

  const { error: profileError } = await admin
    .from("profiles")
    .update({ name: anonName, email: anonEmail, active: false, is_global_admin: false })
    .eq("id", memberId);
  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  await admin.from("member_roles").delete().eq("member_id", memberId);

  const { error: banError } = await admin.auth.admin.updateUserById(memberId, {
    ban_duration: "876000h",
  });
  if (banError) {
    return NextResponse.json({ error: banError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, name: anonName });
}
