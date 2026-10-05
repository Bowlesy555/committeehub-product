import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { memberId, pin } = await request.json();

  if (!memberId || !/^\d{6}$/.test(pin || "")) {
    return NextResponse.json({ error: "memberId and a 6-digit pin are required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_global_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_global_admin) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(memberId, { password: pin });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
