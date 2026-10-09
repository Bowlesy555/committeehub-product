"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { isEffectivelyPinned } from "@/lib/rooms";
import { Modal } from "@/components/Modal";
import { SortSelect } from "@/components/SortSelect";
import { SearchBox } from "@/components/SearchBox";
import { matchesQuery, useMessageSearch } from "@/lib/search";
import { compareBy, usePersistedSort, type SortMode } from "@/lib/sort";

const ROOM_SORTS: readonly SortMode[] = ["comments", "created", "az", "za"];

export default function SpacesPage() {
  const {
    groups,
    groupMembers,
    profiles,
    isCommitteeMember,
    spaces,
    userId,
    myGroupIds,
    supabase,
    unreadSpaceIds,
    unreadRoomNotificationCount,
    markNotificationsRead,
  } = useAppData();
  const showToast = useToast();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  // A room is for a whole group, or for chosen people only (which makes a small
  // group behind the scenes).
  const [audience, setAudience] = useState<"group" | "people">("group");
  const [pickedPeople, setPickedPeople] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  // Search looks at room names and at what's been said in them. While it's
  // in use it ignores the open/closed split, so a closed room can be found.
  const [search, setSearch] = useState("");
  const q = search.trim();
  const searching = q.length > 0;
  const messageHits = useMessageSearch(q);
  const roomMatches = (s: (typeof spaces)[string]) =>
    !searching || matchesQuery(q, s.name) || !!messageHits[s.id];

  // Visiting the list clears the "a room has gone quiet" dot on the tab; the
  // room itself keeps showing its own banner until it's closed or kept.
  useEffect(() => {
    if (unreadRoomNotificationCount > 0) markNotificationsRead(["room_inactive"]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [sortMode, setSortMode] = usePersistedSort("sort:rooms", "comments", ROOM_SORTS);

  const byActivity = compareBy<(typeof spaces)[string]>(sortMode, {
    name: (s) => s.name,
    created: (s) => s.created_at,
    comments: (s) => s.last_message_at,
  });

  // Closed rooms stay in the database (so they can be reopened) but live
  // behind a "Closed rooms" link instead of cluttering the open list.
  const wantedStatus = showClosed ? "closed" : "open";
  const closedCount = Object.values(spaces).filter(
    (s) => s.visibility === "group" && s.status === "closed"
  ).length;
  // Closed rooms are tucked away, so say when one of them has something new.
  const closedUnread = Object.values(spaces).some(
    (s) => s.visibility === "group" && s.status === "closed" && unreadSpaceIds.has(s.id)
  );

  const pinnedRooms = showClosed || searching
    ? []
    : Object.values(spaces)
        .filter((s) => s.visibility === "group" && s.status === "open" && isEffectivelyPinned(s))
        .sort(byActivity);
  const pinnedIds = new Set(pinnedRooms.map((s) => s.id));

  const byGroup = myGroupIds
    .filter((gid) => !groups[gid]?.private_room)
    .map((gid) => ({
      group: groups[gid],
      spaces: Object.values(spaces)
        .filter(
          (s) =>
            s.group_id === gid &&
            (searching || s.status === wantedStatus) &&
            !pinnedIds.has(s.id) &&
            roomMatches(s)
        )
        .sort(byActivity),
    }))
    .filter((g) => g.group && (!(showClosed || searching) || g.spaces.length > 0))
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  // Rooms made for chosen people are listed together, not one heading each.
  const peopleRooms = Object.values(spaces)
    .filter(
      (s) =>
        s.visibility === "group" &&
        !!s.group_id &&
        !!groups[s.group_id]?.private_room &&
        (searching || s.status === wantedStatus) &&
        !pinnedIds.has(s.id) &&
        roomMatches(s)
    )
    .sort(byActivity);
  const sections: { group: { id: string; name: string }; spaces: (typeof spaces)[string][] }[] = [
    ...byGroup,
    ...(peopleRooms.length > 0
      ? [{ group: { id: "chosen-people", name: "🔒 Rooms for chosen people" }, spaces: peopleRooms }]
      : []),
  ];
  const peopleCount = (gid: string | null) =>
    gid ? Object.values(groupMembers).filter((gm) => gm.group_id === gid).length : 0;

  const otherPeople = Object.values(profiles)
    .filter((p) => p.active && p.id !== userId)
    .sort((a, b) => a.name.localeCompare(b.name));

  function togglePerson(id: string) {
    setPickedPeople((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function openCreate() {
    setAudience("group");
    setPickedPeople([]);
    setGroupId(myGroupIds.find((gid) => !groups[gid]?.private_room) || myGroupIds[0] || "");
    setName("");
    setCreating(true);
  }

  async function createSpace() {
    if (audience === "people") {
      if (!name.trim() || pickedPeople.length === 0) return;
      setSaving(true);
      const { data, error } = await supabase.rpc("create_room_for_people", {
        p_name: name.trim(),
        p_member_ids: pickedPeople,
      });
      setSaving(false);
      if (error) {
        showToast(error.message);
      } else {
        showToast("Room created for the people you chose");
        setCreating(false);
        router.push(`/spaces/${data}`);
      }
      return;
    }
    if (!name.trim() || !groupId) return;
    setSaving(true);
    // Generated here so we know where to go without reading the row back.
    const newId = crypto.randomUUID();
    const { error } = await supabase
      .from("spaces")
      .insert({ id: newId, name: name.trim(), group_id: groupId, visibility: "group", created_by: userId });
    setSaving(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast("Room created");
      setCreating(false);
      router.push(`/spaces/${newId}`);
    }
  }

  return (
    <div>
      <div className="section-title">
        <h2>Rooms</h2>
        <button className="btn primary sm" onClick={openCreate}>
          + New room
        </button>
      </div>
      <p className="section-desc">
        Rooms are discussion spaces for topics before they become formal decisions. For private
        conversations, use the Chat tab.
      </p>

      <div className="row wrap" style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <button className="btn sm" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? "← Back to open rooms" : `Closed rooms (${closedCount})`}
          {!showClosed && closedUnread && <span className="unread-dot" style={{ marginLeft: 6 }} />}
        </button>
        <SearchBox
          value={search}
          onChange={setSearch}
          placeholder="Search rooms and what's been said in them…"
        />
        <SortSelect value={sortMode} onChange={setSortMode} options={ROOM_SORTS} />
      </div>

      {pinnedRooms.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div className="group-head" style={{ marginBottom: 6 }}>
            📌 Pinned
          </div>
          <div className="card room-grid">
            {pinnedRooms.map((s) => (
              <Link href={`/spaces/${s.id}`} className="list-row" key={s.id}>
                <div className="main">
                  <div className="t">
                    💬 {s.name}
                    {unreadSpaceIds.has(s.id) && (
                      <span className="unread-dot" style={{ marginLeft: 7 }} />
                    )}
                  </div>
                  <div className="s">
                    {s.group_id ? groups[s.group_id]?.name : null}
                    {s.pinned_until && <> · pinned until {fmtDateTime(s.pinned_until)}</>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {sections.length === 0 && pinnedRooms.length === 0 && (
        <div className="card">
          <div className="empty">
            {searching
              ? `No rooms match “${q}”.`
              : showClosed
                ? "No closed rooms."
                : "You're not in any groups yet."}
          </div>
        </div>
      )}

      {sections.map(({ group, spaces: groupSpaces }) => (
        <div key={group.id} style={{ marginBottom: 18 }}>
          <div className="group-head" style={{ marginBottom: 6 }}>
            {group.name}
          </div>
          <div className="card room-grid">
            {groupSpaces.length === 0 ? (
              <div className="empty">No rooms yet.</div>
            ) : (
              groupSpaces.map((s) => (
                <Link href={`/spaces/${s.id}`} className="list-row" key={s.id}>
                  <div className="main">
                    <div className="t">
                      💬 {s.name}
                      {unreadSpaceIds.has(s.id) && (
                        <span className="unread-dot" style={{ marginLeft: 7 }} />
                      )}
                    </div>
                    <div className="s">
                      <span className={`pill pill-${s.status}`}>{s.status}</span>
                      {timeAgo(s.last_message_at || s.created_at)}
                      {s.group_id && groups[s.group_id]?.private_room && (
                        <span>· {peopleCount(s.group_id)} people</span>
                      )}
                    </div>
                    {searching && messageHits[s.id] && (
                      <div className="s" title="A matching message in this room">
                        💬 {messageHits[s.id].snippet}
                        {messageHits[s.id].count > 1 && ` (${messageHits[s.id].count} messages)`}
                      </div>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      ))}

      {creating && (
        <Modal
          title="New room"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createSpace}
                disabled={
                  saving ||
                  !name.trim() ||
                  (audience === "people" ? pickedPeople.length === 0 : !groupId)
                }
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </>
          }
        >
          {isCommitteeMember && (
            <div className="field">
              <label>Who can see it?</label>
              <div className="filter-chips" style={{ marginBottom: 4 }}>
                <button
                  type="button"
                  className={`tag-check${audience === "group" ? " on" : ""}`}
                  onClick={() => setAudience("group")}
                >
                  A whole group
                </button>
                <button
                  type="button"
                  className={`tag-check${audience === "people" ? " on" : ""}`}
                  onClick={() => setAudience("people")}
                >
                  Only chosen people
                </button>
              </div>
            </div>
          )}
          {audience === "group" ? (
            <div className="field">
              <label>Group</label>
              <select
                className="select"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                {myGroupIds
                  .filter((gid) => !groups[gid]?.private_room)
                  .map((gid) => (
                    <option key={gid} value={gid}>
                      {groups[gid]?.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>People</label>
              <div className="filter-chips" style={{ marginBottom: 4 }}>
                {otherPeople.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`tag-check${pickedPeople.includes(p.id) ? " on" : ""}`}
                    onClick={() => togglePerson(p.id)}
                    aria-pressed={pickedPeople.includes(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
              <span className="help">
                You&apos;re included. Only you and the people you tick can see this room, its
                motions and its tasks. They can be changed later from the Groups tab.
              </span>
            </div>
          )}
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Outdoor Champs 2027"
              autoFocus
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
