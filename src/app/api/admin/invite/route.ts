import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { email, name, roleIds, pin } = await request.json();

  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }
  if (pin && !/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be exactly 6 digits" }, { status: 400 });
  }
  const roleIdList: string[] = Array.isArray(roleIds) ? roleIds : [];

  // Verify the caller is signed in and is a global admin before using the
  // service-role client — this API can create arbitrary auth users, so
  // this check is the only thing standing between it and abuse.
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
  let newUserId: string | undefined;

  if (pin) {
    // Create the account directly with a PIN as its password and the email
    // pre-confirmed — no email is sent at all. Bypasses the invite-email
    // flow entirely, which matters while Resend's sandbox can't deliver to
    // anyone but the account owner.
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: pin,
      email_confirm: true,
      user_metadata: { name: name || undefined },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    newUserId = data.user?.id;
  } else {
    const { origin } = new URL(request.url);
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { name: name || undefined },
      redirectTo: `${origin}/auth/callback`,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    newUserId = data.user?.id;
  }

  if (newUserId && roleIdList.length) {
    await admin
      .from("member_roles")
      .insert(roleIdList.map((role_id) => ({ member_id: newUserId, role_id })));
  }

  return NextResponse.json({ ok: true });
}
