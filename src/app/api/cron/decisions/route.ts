import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { processExpiredDecisions } from "@/lib/decision-expiry";
import { cleanUpPictures } from "@/lib/picture-cleanup";
import { sweepQuietRooms } from "@/lib/room-sweep";
import { sendPushToMembers } from "@/lib/push";
import { billingReminderFor, type BillingStatus } from "@/lib/billing";

// Scheduled once a day by Vercel Cron (see vercel.json). Despite the path,
// this now covers both decisions and tasks -- same daily trigger, kept as
// one route rather than a second cron entry for an identical schedule.
//  1. At an open decision's deadline: if an option has reached quorum (only
//     possible once it was extended to wait for everyone) it moves to
//     "Decision made" for its proposer to deal with; otherwise it auto-fails
//     (the vote trigger only re-checks on a vote change, so nothing else
//     catches a decision that simply times out).
//  2. Email the proposer a reminder for anything open, undecided, and due in
//     the next ~30 hours (a same-day daily cron needs slack either side of
//     "the day before" so a run's exact time of day doesn't skip a decision).
//  3. Email a task's assignees the day before it's due, and once more if it
//     goes overdue without being marked done.
//  4. Remove pictures in messages older than the retention setting (Admin tab),
//     and any stray files nothing refers to.
//  5. Ask the creator of any open room with no messages for 30+ days whether it
//     should be closed (each room is asked at most once per 30 days).
//  6. Remove any "Download everything" copy an admin made more than an hour
//     ago; its download link only lasted ten minutes anyway.
//  0. Before any of that: if the subscription has lapsed and the system is
//     locked, do nothing at all; otherwise, on a reminder day, tell the
//     admins that a payment is coming up or overdue.
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const reminderWindowEnd = new Date(now.getTime() + 30 * 60 * 60 * 1000);

  // An error here means this database has no billing yet: carry on as normal.
  const { data: billingData } = await admin.rpc("billing_state");
  const billing = (billingData as BillingStatus | null) ?? { state: "none" };
  if (billing.state === "locked") {
    return NextResponse.json({ ok: true, locked: true });
  }
  let billingReminder = false;
  const reminder = billingReminderFor(billing, now.toISOString().slice(0, 10));
  if (reminder) {
    const { data: admins } = await admin.from("profiles").select("id, email").eq("is_global_admin", true);
    for (const person of admins ?? []) {
      if (person.email) await sendEmail(person.email, reminder.subject, `<p>${reminder.body}</p>`);
    }
    await sendPushToMembers(admin, (admins ?? []).map((a) => a.id), {
      title: reminder.subject,
      body: reminder.body,
      url: "/dashboard",
      tag: "billing",
    });
    billingReminder = true;
  }

  const { expiredCount, madeCount } = await processExpiredDecisions(admin, now);

  const { data: dueSoon } = await admin
    .from("decisions")
    .select("*, groups(name)")
    .eq("status", "open")
    .eq("reminder_sent", false)
    .lte("deadline", reminderWindowEnd.toISOString())
    .gt("deadline", now.toISOString());

  let reminderCount = 0;
  for (const decision of dueSoon ?? []) {
    if (!decision.proposed_by) continue;
    const { data: proposer } = await admin
      .from("profiles")
      .select("email")
      .eq("id", decision.proposed_by)
      .single();
    if (proposer?.email) {
      await sendEmail(
        proposer.email,
        `Deadline tomorrow: ${decision.title}`,
        `<p>Your motion in <strong>${decision.groups?.name ?? "your group"}</strong> hasn't reached quorum yet and its deadline is coming up.</p>
         <p><strong>${decision.title}</strong></p>
         <blockquote>${decision.motion_text}</blockquote>`
      );
    }
    await admin.from("notifications").insert({
      member_id: decision.proposed_by,
      kind: "decision_reminder",
      title: `Deadline tomorrow: ${decision.title}`,
      body: `In ${decision.groups?.name ?? "your group"}`,
      decision_id: decision.id,
    });
    await admin.from("decisions").update({ reminder_sent: true }).eq("id", decision.id);
    reminderCount++;
  }

  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // A task can have any number of assignees; each one is told, and the
  // task's flag is set once so nobody is told twice.
  async function remindAssignees(
    tasks: { id: string; title: string; groups: { name: string } | null }[],
    kind: "task_reminder" | "task_overdue",
    subject: string,
    sentence: string,
    flag: "due_reminder_sent" | "overdue_notified"
  ) {
    if (!tasks.length) return 0;
    const { data: links } = await admin
      .from("task_assignees")
      .select("task_id, member_id")
      .in("task_id", tasks.map((t) => t.id));
    let count = 0;
    for (const task of tasks) {
      const memberIds = (links ?? []).filter((l) => l.task_id === task.id).map((l) => l.member_id);
      if (!memberIds.length) continue; // nobody to tell
      for (const memberId of memberIds) {
        const { data: person } = await admin
          .from("profiles")
          .select("email")
          .eq("id", memberId)
          .single();
        if (person?.email) {
          await sendEmail(
            person.email,
            `${subject}: ${task.title}`,
            `<p>${sentence.replace("{group}", `<strong>${task.groups?.name ?? "your group"}</strong>`)}</p>
             <p><strong>${task.title}</strong></p>`
          );
        }
        await admin.from("notifications").insert({
          member_id: memberId,
          kind,
          title: `${subject}: ${task.title}`,
          body: `In ${task.groups?.name ?? "your group"}`,
          task_id: task.id,
        });
      }
      await admin.from("tasks").update({ [flag]: true }).eq("id", task.id);
      count++;
    }
    return count;
  }

  const { data: tasksDueSoon } = await admin
    .from("tasks")
    .select("id, title, groups(name)")
    .neq("status", "done")
    .eq("due_reminder_sent", false)
    .eq("due_date", tomorrow);
  const taskReminderCount = await remindAssignees(
    (tasksDueSoon ?? []) as unknown as Parameters<typeof remindAssignees>[0],
    "task_reminder",
    "Due tomorrow",
    "A task assigned to you in {group} is due tomorrow.",
    "due_reminder_sent"
  );

  const { data: tasksOverdue } = await admin
    .from("tasks")
    .select("id, title, groups(name)")
    .neq("status", "done")
    .eq("overdue_notified", false)
    .lt("due_date", today);
  const taskOverdueCount = await remindAssignees(
    (tasksOverdue ?? []) as unknown as Parameters<typeof remindAssignees>[0],
    "task_overdue",
    "Overdue",
    "A task assigned to you in {group} is now overdue.",
    "overdue_notified"
  );

  // Its own try: a storage hiccup must not stop the reminders above.
  let pictures: Awaited<ReturnType<typeof cleanUpPictures>> | { error: string };
  try {
    pictures = await cleanUpPictures(admin, now);
  } catch (e) {
    pictures = { error: e instanceof Error ? e.message : "picture clean-up failed" };
  }

  let quietRooms: Awaited<ReturnType<typeof sweepQuietRooms>> | { error: string };
  try {
    quietRooms = await sweepQuietRooms(admin, now, new URL(request.url).origin);
  } catch (e) {
    quietRooms = { error: e instanceof Error ? e.message : "room sweep failed" };
  }

  let exportsRemoved = 0;
  try {
    const { data: copies } = await admin.storage.from("exports").list();
    const stale = (copies ?? []).filter(
      (f) => f.created_at && new Date(f.created_at).getTime() < now.getTime() - 60 * 60 * 1000
    );
    if (stale.length) await admin.storage.from("exports").remove(stale.map((f) => f.name));
    exportsRemoved = stale.length;
  } catch {
    // no bucket yet (nobody has downloaded a copy): nothing to do
  }

  return NextResponse.json({
    ok: true,
    exportsRemoved,
    billingReminder,
    decisionsMade: madeCount,
    quietRooms,
    pictures,
    expiredCount,
    reminderCount,
    taskReminderCount,
    taskOverdueCount,
  });
}
