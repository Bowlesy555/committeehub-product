import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PushPayload } from "@/lib/push";

export type PushEvent =
  | { type: "decision"; id: string }
  | { type: "task_assigned"; task_id: string; member_id: string }
  | { type: "notification"; id: string }
  | { type: "message"; id: string };

export interface PushJob {
  memberIds: string[];
  payload: PushPayload;
  /** Only devices that opted in to message alerts. */
  messagesOnly?: boolean;
}

// Message text can carry formatting markers; they're noise in a notification.
function plain(text: string): string {
  return text
    .replace(/\[\/?(?:red|amber|green|blue)\]/g, "")
    .replace(/\*\*|__|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

async function activeIds(admin: SupabaseClient, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await admin.from("profiles").select("id").in("id", ids).eq("active", true);
  return (data ?? []).map((p) => p.id);
}

/**
 * Works out who should hear about an event and what to tell them. Kept apart
 * from the sending so it can be tested without a real device.
 *   decision      -> a motion to vote on: everyone in its group but the proposer
 *   task_assigned -> the person given a task (unless they gave it to themselves)
 *   notification  -> a reminder / outcome / quiet-room prompt: just its recipient
 *   message       -> opt-in: everyone who can see the room except the author
 */
export async function buildPushJob(admin: SupabaseClient, event: PushEvent): Promise<PushJob | null> {
  switch (event.type) {
    case "decision": {
      const { data: d } = await admin
        .from("decisions")
        .select("id, title, group_id, proposed_by, status")
        .eq("id", event.id)
        .maybeSingle();
      if (!d || d.status !== "open") return null;
      const { data: members } = await admin.from("group_members").select("member_id").eq("group_id", d.group_id);
      const ids = await activeIds(
        admin,
        (members ?? []).map((m) => m.member_id).filter((id) => id !== d.proposed_by)
      );
      return {
        memberIds: ids,
        payload: { title: "A motion needs your vote", body: clip(d.title, 120), url: "/decisions", tag: `decision-${d.id}` },
      };
    }

    case "task_assigned": {
      const { data: t } = await admin
        .from("tasks")
        .select("id, title, created_by")
        .eq("id", event.task_id)
        .maybeSingle();
      if (!t || t.created_by === event.member_id) return null;
      const ids = await activeIds(admin, [event.member_id]);
      return {
        memberIds: ids,
        payload: { title: "A task was assigned to you", body: clip(t.title, 120), url: "/tasks", tag: `task-${t.id}` },
      };
    }

    case "notification": {
      const { data: n } = await admin
        .from("notifications")
        .select("id, member_id, kind, title, body, space_id")
        .eq("id", event.id)
        .maybeSingle();
      if (!n) return null;
      const url =
        n.kind === "room_inactive" && n.space_id
          ? `/spaces/${n.space_id}`
          : n.kind.startsWith("task_")
            ? "/tasks"
            : "/decisions";
      return {
        memberIds: await activeIds(admin, [n.member_id]),
        payload: { title: clip(n.title, 90), body: clip(n.body ?? "", 120), url, tag: `note-${n.id}` },
      };
    }

    case "message": {
      const { data: m } = await admin
        .from("messages")
        .select("id, space_id, topic_id, author_id, text, image_paths")
        .eq("id", event.id)
        .maybeSingle();
      if (!m) return null;
      const { data: space } = await admin
        .from("spaces")
        .select("id, name, group_id, visibility")
        .eq("id", m.space_id)
        .maybeSingle();
      if (!space) return null;

      let audience: string[];
      if (space.visibility === "private") {
        const { data } = await admin.from("space_participants").select("member_id").eq("space_id", space.id);
        audience = (data ?? []).map((p) => p.member_id);
      } else {
        const { data } = await admin.from("group_members").select("member_id").eq("group_id", space.group_id);
        audience = (data ?? []).map((p) => p.member_id);
      }
      const memberIds = await activeIds(
        admin,
        audience.filter((id) => id !== m.author_id)
      );

      const { data: author } = m.author_id
        ? await admin.from("profiles").select("name").eq("id", m.author_id).maybeSingle()
        : { data: null };
      const who = author?.name ?? "Someone";
      const text = plain(m.text ?? "");
      const hasPicture = (m.image_paths?.length ?? 0) > 0;
      const body = text ? clip(text, 120) : hasPicture ? "Sent a picture" : "";
      const url = m.topic_id ? `/spaces/${space.id}?topic=${m.topic_id}` : `/spaces/${space.id}`;
      return {
        memberIds,
        messagesOnly: true,
        payload: {
          title: space.visibility === "private" ? who : `${who} in ${clip(space.name, 50)}`,
          body,
          url,
          tag: `space-${space.id}`,
        },
      };
    }
  }
}
