import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/resend";
import { notifyDecisionMade } from "@/lib/decision-made";

/**
 * Open motions whose deadline has passed. If an option reached quorum while
 * the motion was waiting for the rest of the team, it moves to "Decision made"
 * for its proposer; otherwise it fails for want of quorum. (`onlyIds` limits
 * the run, for testing.)
 */
export async function processExpiredDecisions(
  admin: SupabaseClient,
  now: Date,
  options: { onlyIds?: string[] } = {}
) {
  let query = admin
    .from("decisions")
    .select("*, groups(name)")
    .eq("status", "open")
    .lt("deadline", now.toISOString());
  if (options.onlyIds) query = query.in("id", options.onlyIds);
  const { data: expired } = await query;

  let expiredCount = 0;
  let madeCount = 0;
  for (const decision of expired ?? []) {
    // Did an option reach quorum while the motion was waiting for the rest?
    const { data: cast } = await admin.from("votes").select("choice").eq("decision_id", decision.id);
    const counts: Record<string, number> = {};
    for (const v of cast ?? []) {
      if (v.choice !== "abstain" && decision.vote_options.includes(v.choice)) {
        counts[v.choice] = (counts[v.choice] ?? 0) + 1;
      }
    }
    const winner = Object.entries(counts)
      .filter(([, n]) => n >= decision.quorum)
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (winner) {
      const { data: moved } = await admin
        .from("decisions")
        .update({
          status: "decision_made",
          resolved_choice: winner,
          made_at: now.toISOString(),
          resolution_notified: false,
        })
        .eq("id", decision.id)
        .eq("status", "open")
        .select("*, groups(name)");
      if (moved && moved.length > 0) {
        await notifyDecisionMade(admin, moved[0]);
        madeCount++;
      }
      continue;
    }

    await admin
      .from("decisions")
      .update({ status: "failed", closed_at: now.toISOString(), resolution_notified: true })
      .eq("id", decision.id)
      .eq("status", "open"); // guard against a race with the vote trigger
    expiredCount++;

    if (decision.proposed_by) {
      const { data: proposer } = await admin
        .from("profiles")
        .select("email")
        .eq("id", decision.proposed_by)
        .single();
      if (proposer?.email) {
        await sendEmail(
          proposer.email,
          `Motion failed (deadline passed): ${decision.title}`,
          `<p>Your motion in <strong>${decision.groups?.name ?? "your group"}</strong> didn't reach quorum before its deadline and has been marked <strong>failed</strong>.</p>
           <p><strong>${decision.title}</strong></p>
           <blockquote>${decision.motion_text}</blockquote>`
        );
      }
      await admin.from("notifications").insert({
        member_id: decision.proposed_by,
        kind: "decision_resolved",
        title: `Motion failed (deadline passed): ${decision.title}`,
        body: `In ${decision.groups?.name ?? "your group"}`,
        decision_id: decision.id,
      });
    }
  }
  return { expiredCount, madeCount };
}
