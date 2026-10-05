import type {
  Decision,
  Group,
  Profile,
  Space,
  SpaceParticipant,
  Task,
  TaskAssignee,
  Vote,
} from "@/types";
import { assigneeIdsOf } from "@/lib/tasks";
import { roomDisplayName } from "@/lib/rooms";

export interface ActivityItem {
  id: string;
  at: string;
  icon: string;
  text: string;
  href: string;
}

/**
 * A minimal committee-wide activity feed built entirely from data already
 * loaded into context — no separate activity_log table. Sourced from: votes
 * (voted_at), spaces (last_message_at/last_message_by, already tracked for
 * unread dots), tasks (created_at) and decisions (closed_at once resolved).
 */
export function buildActivityFeed(
  votes: Vote[],
  spaces: Space[],
  tasks: Task[],
  decisions: Record<string, Decision>,
  profiles: Record<string, Profile>,
  groups: Record<string, Group>,
  myId: string | null,
  spaceParticipants: Record<string, SpaceParticipant>,
  taskAssignees: Record<string, TaskAssignee>,
  limit = 12
): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const v of votes) {
    const d = decisions[v.decision_id];
    const p = profiles[v.member_id];
    if (!d || !p) continue;
    items.push({
      id: `vote:${v.decision_id}:${v.member_id}`,
      at: v.voted_at,
      icon: "🗳️",
      text: `${p.name} voted ${v.choice} on "${d.title}"`,
      href: "/decisions",
    });
  }

  for (const s of spaces) {
    if (!s.last_message_at || !s.last_message_by) continue;
    const p = profiles[s.last_message_by];
    if (!p) continue;
    items.push({
      id: `msg:${s.id}`,
      at: s.last_message_at,
      icon: s.visibility === "private" ? "🔒" : "💬",
      text:
        s.visibility === "private"
          ? `${p.name} sent a message in a private chat`
          : `${p.name} sent a message in "${roomDisplayName(s, myId, spaceParticipants, profiles)}"`,
      href: `/spaces/${s.id}`,
    });
  }

  for (const t of tasks) {
    const names = assigneeIdsOf(t.id, taskAssignees).map((id) => profiles[id]?.name || "someone");
    items.push({
      id: `task:${t.id}`,
      at: t.created_at,
      icon: "✅",
      text: names.length
        ? `New task assigned to ${names.join(", ")}: "${t.title}"`
        : `New task created: "${t.title}"`,
      href: "/tasks",
    });
  }

  for (const d of Object.values(decisions)) {
    if (d.status === "open" || !d.closed_at) continue;
    items.push({
      id: `decision:${d.id}`,
      at: d.closed_at,
      icon: d.status === "passed" ? "✅" : d.status === "failed" ? "❌" : "↩️",
      text: `Decision ${d.status}: "${d.title}" (${groups[d.group_id]?.name || "committee"})`,
      href: "/decisions",
    });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}
