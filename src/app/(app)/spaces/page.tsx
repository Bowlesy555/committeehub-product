"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { isEffectivelyPinned } from "@/lib/rooms";
import { Modal } from "@/components/Modal";
import { SortSelect } from "@/components/SortSelect";
import { compareBy, usePersistedSort, type SortMode } from "@/lib/sort";

const ROOM_SORTS: readonly SortMode[] = ["comments", "created", "az", "za"];

export default function SpacesPage() {
  const { groups, spaces, userId, myGroupIds, supabase, unreadSpaceIds } = useAppData();
  const showToast = useToast();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("");
  const [saving, setSaving] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
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

  const pinnedRooms = showClosed
    ? []
    : Object.values(spaces)
        .filter((s) => s.visibility === "group" && s.status === "open" && isEffectivelyPinned(s))
        .sort(byActivity);
  const pinnedIds = new Set(pinnedRooms.map((s) => s.id));

  const byGroup = myGroupIds
    .map((gid) => ({
      group: groups[gid],
      spaces: Object.values(spaces)
        .filter((s) => s.group_id === gid && s.status === wantedStatus && !pinnedIds.has(s.id))
        .sort(byActivity),
    }))
    .filter((g) => g.group && (!showClosed || g.spaces.length > 0))
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  function openCreate() {
    setGroupId(myGroupIds[0] || "");
    setName("");
    setCreating(true);
  }

  async function createSpace() {
    if (!name.trim() || !groupId) return;
    setSaving(true);
    const { error } = await supabase
      .from("spaces")
      .insert({ name: name.trim(), group_id: groupId, visibility: "group", created_by: userId });
    setSaving(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast("Room created");
      setCreating(false);
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
        </button>
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

      {byGroup.length === 0 && pinnedRooms.length === 0 && (
        <div className="card">
          <div className="empty">
            {showClosed ? "No closed rooms." : "You're not in any groups yet."}
          </div>
        </div>
      )}

      {byGroup.map(({ group, spaces: groupSpaces }) => (
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
                    </div>
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
                disabled={saving || !name.trim() || !groupId}
              >
                {saving ? "Creating…" : "Create"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Group</label>
            <select
              className="select"
              value={groupId}
              onChange={(e) => setGroupId(e.target.value)}
            >
              {myGroupIds.map((gid) => (
                <option key={gid} value={gid}>
                  {groups[gid]?.name}
                </option>
              ))}
            </select>
          </div>
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
