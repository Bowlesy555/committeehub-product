import type { Profile, Space, SpaceParticipant } from "@/types";

/** Link to a room, optionally opening straight onto one of its topics. */
export function roomLink(spaceId: string, topicId?: string | null): string {
  return topicId ? `/spaces/${spaceId}?topic=${topicId}` : `/spaces/${spaceId}`;
}

export function roomParticipantIds(
  spaceId: string,
  spaceParticipants: Record<string, SpaceParticipant>
): string[] {
  return Object.values(spaceParticipants)
    .filter((sp) => sp.space_id === spaceId)
    .map((sp) => sp.member_id);
}

/**
 * A private room's name is computed per-viewer rather than trusting the
 * stored column: a straight 1:1 DM should always read as "the other
 * person's name" to both sides, which a single shared name column can't do.
 * A 3+-person private room falls back to whatever name its creator set.
 */
export function roomDisplayName(
  space: Space,
  myId: string | null,
  spaceParticipants: Record<string, SpaceParticipant>,
  profiles: Record<string, Profile>
): string {
  if (space.visibility !== "private") return space.name;
  const others = roomParticipantIds(space.id, spaceParticipants)
    .filter((id) => id !== myId)
    .map((id) => profiles[id]?.name)
    .filter((n): n is string => !!n);
  if (others.length <= 1) return others[0] || space.name;
  return space.name || others.join(", ");
}

/**
 * Whether a room's pin is currently in effect. A temporary pin's expiry is
 * computed here rather than by anything that un-sets `pinned` in the
 * database -- once `pinned_until` passes, the room just quietly drops back
 * into normal sort order.
 */
export function isEffectivelyPinned(space: Space): boolean {
  if (!space.pinned) return false;
  if (!space.pinned_until) return true;
  return new Date(space.pinned_until).getTime() > Date.now();
}

/** Finds an existing 1:1 private room between exactly these two people, if one exists. */
export function findExistingDirectMessage(
  myId: string,
  otherId: string,
  spaces: Record<string, Space>,
  spaceParticipants: Record<string, SpaceParticipant>
): string | null {
  for (const s of Object.values(spaces)) {
    if (s.visibility !== "private") continue;
    const members = roomParticipantIds(s.id, spaceParticipants);
    if (members.length === 2 && members.includes(myId) && members.includes(otherId)) {
      return s.id;
    }
  }
  return null;
}
