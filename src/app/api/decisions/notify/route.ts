import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyDecisionMade } from "@/lib/decision-made";

// Called by the client right after a vote is cast, to tell whoever proposed
// the motion the moment it reaches quorum and moves to "Decision made".
// Idempotent via decisions.resolution_notified, since the database trigger that
// moves the motion runs before this ever sees the row.
export async function POST(request: Request) {
  const { decisionId } = await request.json();
  if (!decisionId) {
    return NextResponse.json({ error: "decisionId required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: decision } = await admin
    .from("decisions")
    .select("*, groups(name)")
    .eq("id", decisionId)
    .single();

  if (!decision) {
    return NextResponse.json({ error: "Decision not found" }, { status: 404 });
  }

  // Confirm the caller is actually a member of this decision's group before
  // acting on their say-so, even though the only effect is sending a notice.
  const { data: membership } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("group_id", decision.group_id)
    .eq("member_id", user.id)
    .maybeSingle();
  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("is_global_admin")
    .eq("id", user.id)
    .single();
  if (!membership && !callerProfile?.is_global_admin) {
    return NextResponse.json({ error: "Not a member of this group" }, { status: 403 });
  }

  if (decision.status !== "decision_made" || decision.resolution_notified) {
    return NextResponse.json({ ok: true, sent: false });
  }

  const sent = await notifyDecisionMade(admin, decision);
  return NextResponse.json({ ok: true, sent });
}
