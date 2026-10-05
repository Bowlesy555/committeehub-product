import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";

// Called by the client right after a vote is cast, to send an immediate
// "your motion has been decided" email the moment it crosses quorum.
// Idempotent via decisions.resolution_notified, since the DB trigger that
// actually resolves passed/failed runs before this ever sees the row.
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
  // acting on their say-so, even though the only effect is triggering an email.
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

  if (
    (decision.status !== "passed" && decision.status !== "failed") ||
    decision.resolution_notified ||
    !decision.proposed_by
  ) {
    return NextResponse.json({ ok: true, sent: false });
  }

  const { data: proposer } = await admin
    .from("profiles")
    .select("email, name")
    .eq("id", decision.proposed_by)
    .single();

  // For a custom vote-options motion, "passed"/"failed" doesn't mean much on
  // its own -- surface which option actually won instead.
  const isCustomOutcome =
    decision.resolved_choice && decision.resolved_choice !== "yes" && decision.resolved_choice !== "no";
  const outcomeLabel = isCustomOutcome ? `resolved — "${decision.resolved_choice}" won` : decision.status;

  if (proposer?.email) {
    await sendEmail(
      proposer.email,
      `Motion ${outcomeLabel}: ${decision.title}`,
      `<p>Your motion in <strong>${decision.groups?.name ?? "your group"}</strong> has <strong>${outcomeLabel}</strong>.</p>
       <p><strong>${decision.title}</strong></p>
       <blockquote>${decision.motion_text}</blockquote>`
    );
  }

  await admin.from("notifications").insert({
    member_id: decision.proposed_by,
    kind: "decision_resolved",
    title: `Motion ${outcomeLabel}: ${decision.title}`,
    body: `In ${decision.groups?.name ?? "your group"}`,
    decision_id: decision.id,
  });

  await admin.from("decisions").update({ resolution_notified: true }).eq("id", decisionId);

  return NextResponse.json({ ok: true, sent: true });
}
