import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/resend";
import { INACTIVE_ROOM_DAYS } from "@/lib/rooms";

const DAY_MS = 24 * 60 * 60 * 1000;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The sweep of quiet rooms. It runs inside the daily job, but each room is
 * only prompted once per INACTIVE_ROOM_DAYS, so in practice it is monthly:
 * an open group room with no message for that long gets a prompt (in the app
 * and by email) to its creator, asking whether it should be closed.
 *
 * Left alone: private chats, closed rooms, and rooms pinned right now
 * (pinned rooms are kept on purpose).
 */
export async function sweepQuietRooms(admin: SupabaseClient, now: Date, origin: string) {
  const cutoff = now.getTime() - INACTIVE_ROOM_DAYS * DAY_MS;

  const { data: rooms } = await admin
    .from("spaces")
    .select(
      "id, name, created_by, created_at, last_message_at, pinned, pinned_until, inactivity_prompted_at"
    )
    .eq("status", "open")
    .eq("visibility", "group")
    .lt("created_at", new Date(cutoff).toISOString());

  const quiet = (rooms ?? []).filter((r) => {
    const pinnedNow = r.pinned && (!r.pinned_until || new Date(r.pinned_until).getTime() > now.getTime());
    if (pinnedNow) return false;
    const lastActivity = new Date(r.last_message_at ?? r.created_at).getTime();
    if (lastActivity >= cutoff) return false;
    // already asked within the last period
    if (r.inactivity_prompted_at && new Date(r.inactivity_prompted_at).getTime() >= cutoff) return false;
    return true;
  });

  let prompted = 0;
  for (const room of quiet) {
    let recipients: string[] = room.created_by ? [room.created_by] : [];
    if (recipients.length === 0) {
      // the creator has left: ask whoever co-owns it instead
      const { data: owners } = await admin.from("space_owners").select("member_id").eq("space_id", room.id);
      recipients = (owners ?? []).map((o) => o.member_id);
    }
    if (recipients.length === 0) continue;

    const link = `${origin}/spaces/${room.id}`;
    const title = `No activity in "${room.name}" for ${INACTIVE_ROOM_DAYS}+ days`;
    for (const memberId of recipients) {
      await admin.from("notifications").insert({
        member_id: memberId,
        kind: "room_inactive",
        title,
        body: "Does it still need to be open? Open the room to close it or keep it.",
        space_id: room.id,
      });
      const { data: person } = await admin.from("profiles").select("email").eq("id", memberId).single();
      if (person?.email) {
        await sendEmail(
          person.email,
          title,
          `<p>The room <strong>${esc(room.name)}</strong> hasn't had a message for more than ${INACTIVE_ROOM_DAYS} days.</p>
           <p>Does it still need to be open? <a href="${link}">Open the room</a> to close it, or choose to keep it open.</p>`
        );
      }
    }
    await admin.from("spaces").update({ inactivity_prompted_at: now.toISOString() }).eq("id", room.id);
    prompted++;
  }

  return { checked: rooms?.length ?? 0, prompted };
}
