import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/resend";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

interface DecisionRow {
  id: string;
  title: string;
  motion_text: string;
  group_id: string;
  proposed_by: string | null;
  resolved_choice: string | null;
  groups?: { name?: string | null } | null;
}

/** "yes" -> "Yes", a custom option stays as written. */
function outcomeName(choice: string | null): string {
  if (!choice) return "an option";
  return choice === "yes" ? "Yes" : choice === "no" ? "No" : `"${choice}"`;
}

/**
 * A motion has reached quorum and now sits in "Decision made". Tell whoever
 * proposed it (or, if they've left, the group's admins) that it's up to them
 * to choose what happens next: add a task, extend the deadline, or file it.
 * Returns true if anyone was told.
 */
export async function notifyDecisionMade(admin: SupabaseClient, decision: DecisionRow): Promise<boolean> {
  let recipients: string[] = decision.proposed_by ? [decision.proposed_by] : [];
  if (recipients.length === 0) {
    const { data } = await admin
      .from("group_members")
      .select("member_id")
      .eq("group_id", decision.group_id)
      .eq("is_admin", true);
    recipients = (data ?? []).map((m) => m.member_id);
  }
  if (recipients.length === 0) return false;

  const groupName = decision.groups?.name ?? "your group";
  const outcome = outcomeName(decision.resolved_choice);
  const title = `Decision made: ${decision.title}`;
  const body = `Quorum reached on ${outcome} in ${groupName}. Choose what happens next.`;

  for (const memberId of recipients) {
    await admin.from("notifications").insert({
      member_id: memberId,
      kind: "decision_resolved",
      title,
      body,
      decision_id: decision.id,
    });
    const { data: person } = await admin.from("profiles").select("email").eq("id", memberId).single();
    if (person?.email) {
      await sendEmail(
        person.email,
        title,
        `<p>Your motion in <strong>${esc(groupName)}</strong> has reached quorum: <strong>${esc(outcome)}</strong>.</p>
         <p><strong>${esc(decision.title)}</strong></p>
         <blockquote>${esc(decision.motion_text)}</blockquote>
         <p>It's now in <strong>Decision made</strong>, waiting for you. Open Decisions to <strong>add a task</strong> for the result, <strong>extend the deadline</strong> to wait for the rest of the team, or <strong>close and file</strong> it.</p>`
      );
    }
  }
  await admin.from("decisions").update({ resolution_notified: true }).eq("id", decision.id);
  return true;
}
