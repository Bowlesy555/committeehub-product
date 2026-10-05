"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { isEffectivelyPinned, roomDisplayName, roomParticipantIds } from "@/lib/rooms";
import { Modal } from "@/components/Modal";

export default function ChatPage() {
  const { spaces, profiles, spaceParticipants, userId, supabase, unreadSpaceIds } = useAppData();
  const showToast = useToast();

  const [startingChat, setStartingChat] = useState(false);
  const [chatParticipantIds, setChatParticipantIds] = useState<string[]>([]);
  const [chatName, setChatName] = useState("");
  const [chatSaving, setChatSaving] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const closedCount = Object.values(spaces).filter(
    (s) => s.visibility === "private" && s.status === "closed"
  ).length;
  const chats = Object.values(spaces)
    .filter((s) => s.visibility === "private" && s.status === (showClosed ? "closed" : "open"))
    .sort((a, b) => {
      const pa = isEffectivelyPinned(a) ? 1 : 0;
      const pb = isEffectivelyPinned(b) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return (b.last_message_at || b.created_at).localeCompare(a.last_message_at || a.created_at);
    });

  const otherMembers = Object.values(profiles)
    .filter((p) => p.active && p.id !== userId)
    .sort((a, b) => a.name.localeCompare(b.name));

  function openStartChat() {
    setChatParticipantIds([]);
    setChatName("");
    setStartingChat(true);
  }

  function toggleChatParticipant(id: string) {
    setChatParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  async function startChat() {
    if (!userId || chatParticipantIds.length === 0) return;
    setChatSaving(true);
    const fallbackName =
      chatName.trim() ||
      chatParticipantIds.map((id) => profiles[id]?.name).filter(Boolean).join(", ") ||
      "Private chat";
    // Generated client-side and inserted explicitly, then never re-read via
    // .select() -- a private room's own SELECT policy requires already being
    // a participant, which isn't true yet the instant the room is created,
    // so asking Postgres to RETURN the row right away gets rejected by RLS.
    const newSpaceId = crypto.randomUUID();
    const { error } = await supabase.from("spaces").insert({
      id: newSpaceId,
      name: fallbackName,
      visibility: "private",
      group_id: null,
      created_by: userId,
    });
    if (error) {
      setChatSaving(false);
      showToast(error.message);
      return;
    }
    const { error: participantsError } = await supabase.from("space_participants").insert(
      [userId, ...chatParticipantIds].map((member_id) => ({ space_id: newSpaceId, member_id }))
    );
    setChatSaving(false);
    if (participantsError) {
      showToast(participantsError.message);
    } else {
      showToast("Chat started");
      setStartingChat(false);
    }
  }

  return (
    <div>
      <div className="section-title">
        <h2>Chat</h2>
        <button className="btn primary sm" onClick={openStartChat}>
          + New chat
        </button>
      </div>
      <p className="section-desc">
        Direct messages and small private groups. Only the people in a chat can see it — not the
        whole committee, and not even admins.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setShowClosed((v) => !v)}>
          {showClosed ? "← Back to open chats" : `Closed chats (${closedCount})`}
        </button>
      </div>

      {chats.length === 0 ? (
        <div className="card">
          <div className="empty">
            {showClosed
              ? "No closed chats."
              : "No chats yet — start one with “+ New chat”."}
          </div>
        </div>
      ) : (
        <div className="card">
          {chats.map((s) => {
            const others = roomParticipantIds(s.id, spaceParticipants).filter(
              (id) => id !== userId
            );
            const pinned = isEffectivelyPinned(s);
            return (
              <Link href={`/spaces/${s.id}`} className="list-row" key={s.id}>
                <div className="main">
                  <div className="t">
                    {pinned && "📌 "}🔒 {roomDisplayName(s, userId, spaceParticipants, profiles)}
                    {unreadSpaceIds.has(s.id) && (
                      <span className="unread-dot" style={{ marginLeft: 7 }} />
                    )}
                  </div>
                  <div className="s">
                    {others.length > 1 ? `${others.length + 1} people` : "Direct message"}
                    {" · "}
                    {timeAgo(s.last_message_at || s.created_at)}
                    {pinned && s.pinned_until && <> · pinned until {fmtDateTime(s.pinned_until)}</>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {startingChat && (
        <Modal
          title="New chat"
          onClose={() => setStartingChat(false)}
          footer={
            <>
              <button className="btn" onClick={() => setStartingChat(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={startChat}
                disabled={chatSaving || chatParticipantIds.length === 0}
              >
                {chatSaving ? "Starting…" : "Start chat"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Who with</label>
            <div className="row wrap">
              {otherMembers.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  className={`tag-check${chatParticipantIds.includes(p.id) ? " on" : ""}`}
                  onClick={() => toggleChatParticipant(p.id)}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <span className="help">
              Pick one person for a direct message, or a few for a small private group.
            </span>
          </div>
          {chatParticipantIds.length > 1 && (
            <div className="field">
              <label>Name (optional)</label>
              <input
                className="input"
                value={chatName}
                onChange={(e) => setChatName(e.target.value)}
                placeholder={chatParticipantIds
                  .map((id) => profiles[id]?.name)
                  .filter(Boolean)
                  .join(", ")}
              />
            </div>
          )}
          <span className="help">
            Only visible to the people you pick, plus you. Not linked to any group — motions and
            tasks can&apos;t be created from a private chat.
          </span>
        </Modal>
      )}
    </div>
  );
}
