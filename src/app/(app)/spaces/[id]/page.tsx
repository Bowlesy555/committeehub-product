"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAppData, useSpaceMessages } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { fmtDateTime } from "@/lib/format";
import { isEffectivelyPinned, roomDisplayName, roomParticipantIds } from "@/lib/rooms";
import { Modal } from "@/components/Modal";
import { FormatBar } from "@/components/FormatBar";
import { AssigneePicker } from "@/components/AssigneePicker";
import { AttachedDocuments } from "@/components/AttachedDocuments";
import { hasFormatting, renderRichText } from "@/lib/rich-text";
import { DEFAULT_VOTE_OPTIONS } from "@/types";

function deriveTitle(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 70 ? t.slice(0, 70).trim() + "…" : t;
}

const MAX_VOTE_OPTIONS = 8;

interface SelectionMenu {
  text: string;
  top: number;
  left: number;
}

export default function SpaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <RoomView key={id} id={id} />;
}

function RoomView({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const {
    spaces,
    spaceTopics,
    spaceReads,
    groups,
    groupMembers,
    spaceParticipants,
    profiles,
    userId,
    isGroupAdmin,
    supabase,
    markSpaceRead,
  } = useAppData();
  const { messages, ready } = useSpaceMessages(id);
  const showToast = useToast();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingRoom, setDeletingRoom] = useState(false);
  const [roomDeleteBusy, setRoomDeleteBusy] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Topics: null is the room's implicit "General" topic.
  const [topicId, setTopicId] = useState<string | null>(() => searchParams.get("topic"));
  const [creatingTopic, setCreatingTopic] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [topicSaving, setTopicSaving] = useState(false);
  const [renamingTopic, setRenamingTopic] = useState(false);
  const [topicRenameValue, setTopicRenameValue] = useState("");
  // When you opened the room (before it was marked read) and when you last
  // left each topic -- messages newer than these put a dot on that topic.
  const [openedReadAt] = useState(() => spaceReads[`${id}:${userId}`]?.last_read_at ?? null);
  const [leftTopicAt, setLeftTopicAt] = useState<Record<string, string>>({});

  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);

  const [pinning, setPinning] = useState(false);
  const [pinMode, setPinMode] = useState<"permanent" | "until">("permanent");
  const [pinUntil, setPinUntil] = useState("");
  const [pinSaving, setPinSaving] = useState(false);

  const space = spaces[id];
  const isPrivate = space?.visibility === "private";
  const spaceGroup = space?.group_id ? groups[space.group_id] : null;
  const pinnedNow = !!space && isEffectivelyPinned(space);
  const canManage = !!space && (isGroupAdmin(space.group_id) || space.created_by === userId);

  // Group rooms: group admins only. Private chats: whoever started it.
  const canDeleteRoom = !!space && (isPrivate ? space.created_by === userId : isGroupAdmin(space.group_id));

  const topics = Object.values(spaceTopics)
    .filter((t) => t.space_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  // If the open topic disappears (deleted elsewhere), fall back to General.
  const activeTopicId =
    topicId && spaceTopics[topicId]?.space_id === id ? topicId : null;
  const activeTopic = activeTopicId ? spaceTopics[activeTopicId] : null;
  const visibleMessages = messages.filter((m) => (m.topic_id ?? null) === activeTopicId);
  const canManageTopic =
    !!activeTopic &&
    !!space &&
    (activeTopic.created_by === userId || isGroupAdmin(space.group_id));

  const topicKey = (tid: string | null) => tid ?? "general";
  function topicHasNew(tid: string | null) {
    if (tid === activeTopicId) return false;
    const since = new Date(leftTopicAt[topicKey(tid)] ?? openedReadAt ?? 0).getTime();
    return messages.some(
      (m) =>
        (m.topic_id ?? null) === tid &&
        m.author_id !== userId &&
        new Date(m.created_at).getTime() > since
    );
  }

  // Selected-text quick actions: highlight a message and a small floating
  // menu offers to turn it straight into a task or a motion, pre-filled.
  const [selectionMenu, setSelectionMenu] = useState<SelectionMenu | null>(null);
  const [taskDraft, setTaskDraft] = useState<{ title: string; description: string } | null>(null);
  const [motionDraft, setMotionDraft] = useState<{ title: string; motionText: string } | null>(
    null
  );
  const [quickAssigneeIds, setQuickAssigneeIds] = useState<string[]>([]);
  const [quickSaving, setQuickSaving] = useState(false);
  const [customizeOptions, setCustomizeOptions] = useState(false);
  const [customOptions, setCustomOptions] = useState<string[]>(["", ""]);

  const trimmedCustomOptions = customOptions.map((o) => o.trim()).filter(Boolean);
  const customOptionsValid =
    !customizeOptions ||
    (trimmedCustomOptions.length >= 2 &&
      new Set(trimmedCustomOptions.map((o) => o.toLowerCase())).size === trimmedCustomOptions.length);

  function updateCustomOption(i: number, value: string) {
    setCustomOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addCustomOption() {
    setCustomOptions((prev) => (prev.length < MAX_VOTE_OPTIONS ? [...prev, ""] : prev));
  }
  function removeCustomOption(i: number) {
    setCustomOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  const isPrivateRef = useRef(isPrivate);
  useEffect(() => {
    isPrivateRef.current = isPrivate;
  }, [isPrivate]);

  useEffect(() => {
    function handleSelectionChange() {
      // A private room isn't tied to a group, so there's no quorum or task
      // board to file anything into -- skip the quick-create menu there.
      if (isPrivateRef.current) {
        setSelectionMenu(null);
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionMenu(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text || !threadRef.current || !threadRef.current.contains(sel.anchorNode)) {
        setSelectionMenu(null);
        return;
      }
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setSelectionMenu({ text, top: rect.top, left: rect.left + rect.width / 2 });
    }
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  function openTaskFromSelection() {
    if (!selectionMenu) return;
    setTaskDraft({ title: deriveTitle(selectionMenu.text), description: selectionMenu.text });
    setQuickAssigneeIds([]);
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  }

  function openMotionFromSelection() {
    if (!selectionMenu) return;
    setMotionDraft({ title: deriveTitle(selectionMenu.text), motionText: selectionMenu.text });
    setCustomizeOptions(false);
    setCustomOptions(["", ""]);
    window.getSelection()?.removeAllRanges();
    setSelectionMenu(null);
  }

  const groupMemberProfiles = space?.group_id
    ? Object.values(groupMembers)
        .filter((gm) => gm.group_id === space.group_id)
        .map((gm) => profiles[gm.member_id])
        .filter((p): p is NonNullable<typeof p> => !!p && p.active)
    : [];

  async function createTaskFromSelection() {
    const groupId = space?.group_id;
    if (!taskDraft?.title.trim() || !space || !groupId) return;
    setQuickSaving(true);
    const { data: created, error } = await supabase
      .from("tasks")
      .insert({
        group_id: groupId,
        space_id: space.id,
        topic_id: activeTopicId,
        title: taskDraft.title.trim(),
        description: taskDraft.description.trim() || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (!error && created && quickAssigneeIds.length) {
      await supabase
        .from("task_assignees")
        .insert(quickAssigneeIds.map((member_id) => ({ task_id: created.id, member_id })));
    }
    setQuickSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Task created");
      setTaskDraft(null);
    }
  }

  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

  async function createMotionFromSelection() {
    const groupId = space?.group_id;
    if (
      !motionDraft?.title.trim() ||
      !motionDraft.motionText.trim() ||
      !space ||
      !groupId ||
      !userId ||
      !customOptionsValid
    )
      return;
    const voteOptions = customizeOptions ? trimmedCustomOptions : DEFAULT_VOTE_OPTIONS;
    setQuickSaving(true);
    const { error } = await supabase.from("decisions").insert({
      group_id: groupId,
      space_id: space.id,
      topic_id: activeTopicId,
      title: motionDraft.title.trim(),
      motion_text: motionDraft.motionText.trim(),
      quorum: groups[groupId]?.default_quorum ?? 1,
      deadline: new Date(Date.now() + FIVE_DAYS_MS).toISOString(),
      proposed_by: userId,
      vote_options: voteOptions,
    });
    setQuickSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Motion proposed");
      setMotionDraft(null);
    }
  }

  // Mark read on open, and again whenever a new message streams in while
  // this room stays open, so the dot doesn't reappear the moment you leave.
  useEffect(() => {
    if (ready) markSpaceRead(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, ready, messages.length]);

  async function send() {
    if (!draft.trim() || !userId || !space) return;
    setSending(true);
    const { error } = await supabase
      .from("messages")
      .insert({
        space_id: space.id,
        topic_id: activeTopicId,
        author_id: userId,
        text: draft.trim(),
      });
    setSending(false);
    if (error) showToast(error.message);
    else {
      setDraft("");
      if (composerRef.current) composerRef.current.style.height = "";
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  async function deleteRoom() {
    if (!space) return;
    setRoomDeleteBusy(true);
    const { data, error } = await supabase.from("spaces").delete().eq("id", space.id).select();
    setRoomDeleteBusy(false);
    if (error) {
      showToast(error.message);
    } else if (!data?.length) {
      showToast("That couldn't be deleted");
    } else {
      showToast(isPrivate ? "Chat deleted" : "Room deleted");
      router.push(isPrivate ? "/chat" : "/spaces");
    }
  }

  async function deleteMessage(messageId: string) {
    const { data, error } = await supabase.from("messages").delete().eq("id", messageId).select();
    setConfirmDeleteId(null);
    if (error) showToast(error.message);
    else if (!data?.length) showToast("That message couldn't be deleted");
    else showToast("Message deleted");
  }

  function startEditMessage(messageId: string, text: string) {
    setEditingMessageId(messageId);
    setEditText(text);
  }

  async function saveEditMessage() {
    if (!editingMessageId || !editText.trim()) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("messages")
      .update({ text: editText.trim() })
      .eq("id", editingMessageId);
    setEditSaving(false);
    if (error) showToast(error.message);
    else setEditingMessageId(null);
  }

  async function saveRename() {
    if (!space || !renameValue.trim()) return;
    setRenameSaving(true);
    const { error } = await supabase
      .from("spaces")
      .update({ name: renameValue.trim() })
      .eq("id", space.id);
    setRenameSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Room renamed");
      setRenaming(false);
    }
  }

  function selectTopic(next: string | null) {
    if (next === activeTopicId) return;
    setLeftTopicAt((prev) => ({ ...prev, [topicKey(activeTopicId)]: new Date().toISOString() }));
    setTopicId(next);
    setEditingMessageId(null);
  }

  async function createTopic() {
    if (!newTopicName.trim() || !space || !userId) return;
    setTopicSaving(true);
    const { data, error } = await supabase
      .from("space_topics")
      .insert({ space_id: space.id, name: newTopicName.trim(), created_by: userId })
      .select()
      .single();
    setTopicSaving(false);
    if (error) {
      showToast(error.message);
    } else {
      setCreatingTopic(false);
      setNewTopicName("");
      if (data) selectTopic(data.id);
    }
  }

  async function saveTopicRename() {
    if (!activeTopic || !topicRenameValue.trim()) return;
    setTopicSaving(true);
    const { error } = await supabase
      .from("space_topics")
      .update({ name: topicRenameValue.trim() })
      .eq("id", activeTopic.id);
    setTopicSaving(false);
    if (error) showToast(error.message);
    else setRenamingTopic(false);
  }

  async function deleteEmptyTopic() {
    if (!activeTopic) return;
    const { data, error } = await supabase
      .from("space_topics")
      .delete()
      .eq("id", activeTopic.id)
      .select();
    if (error) showToast(error.message);
    else if (!data?.length) showToast("Only an empty topic can be deleted");
    else {
      showToast("Topic deleted");
      setTopicId(null);
    }
  }

  async function toggleStatus() {
    if (!space) return;
    const nextStatus = space.status === "open" ? "closed" : "open";
    const { error } = await supabase
      .from("spaces")
      .update({
        status: nextStatus,
        closed_at: nextStatus === "closed" ? new Date().toISOString() : null,
      })
      .eq("id", space.id);
    if (error) showToast(error.message);
  }

  function openPinModal() {
    setPinMode("permanent");
    setPinUntil("");
    setPinning(true);
  }

  async function savePin() {
    if (!space) return;
    if (pinMode === "until" && !pinUntil) return;
    setPinSaving(true);
    const { error } = await supabase
      .from("spaces")
      .update({
        pinned: true,
        pinned_until: pinMode === "until" ? new Date(pinUntil).toISOString() : null,
      })
      .eq("id", space.id);
    setPinSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Room pinned");
      setPinning(false);
    }
  }

  async function unpin() {
    if (!space) return;
    const { error } = await supabase
      .from("spaces")
      .update({ pinned: false, pinned_until: null })
      .eq("id", space.id);
    if (error) showToast(error.message);
    else showToast("Room unpinned");
  }

  if (!space) {
    return <div className="empty">Loading room…</div>;
  }

  return (
    <div className="container narrow" style={{ padding: 0 }}>
      <Link href={isPrivate ? "/chat" : "/spaces"} className="hint">
        {isPrivate ? "← Chat" : "← Rooms"}
      </Link>
      <div className="section-title">
        <h2>
          {pinnedNow && "📌 "}
          {isPrivate ? "🔒" : "💬"} {roomDisplayName(space, userId, spaceParticipants, profiles)}
        </h2>
        <span className={`pill pill-${space.status}`}>{space.status}</span>
      </div>
      <div className="row wrap" style={{ marginBottom: 14 }}>
        {isPrivate ? (
          <span className="badge">
            {roomParticipantIds(space.id, spaceParticipants)
              .map((mid) => (mid === userId ? "You" : profiles[mid]?.name))
              .filter(Boolean)
              .join(", ")}
          </span>
        ) : (
          <span className="badge">{spaceGroup?.name}</span>
        )}
        {pinnedNow && (
          <span className="badge">
            Pinned{space.pinned_until && <> until {fmtDateTime(space.pinned_until)}</>}
          </span>
        )}
        {canManage && (
          <button className="btn sm" onClick={toggleStatus}>
            {space.status === "open" ? "Close room" : "Reopen room"}
          </button>
        )}
        {canDeleteRoom && (
          <button className="btn sm danger" onClick={() => setDeletingRoom(true)}>
            {isPrivate ? "Delete chat" : "Delete room"}
          </button>
        )}
        {canManage && (!isPrivate || roomParticipantIds(space.id, spaceParticipants).length > 2) && (
          <button
            className="btn sm"
            onClick={() => {
              setRenameValue(space.name);
              setRenaming(true);
            }}
          >
            Rename
          </button>
        )}
        {canManage &&
          (pinnedNow ? (
            <button className="btn sm" onClick={unpin}>
              Unpin
            </button>
          ) : (
            <button className="btn sm" onClick={openPinModal}>
              📌 Pin
            </button>
          ))}
      </div>

      {!isPrivate && selectionMenu && (
        <div
          className="selection-toolbar"
          style={{ top: selectionMenu.top, left: selectionMenu.left }}
        >
          <button type="button" onClick={openTaskFromSelection}>
            ✅ Create Task
          </button>
          <button type="button" onClick={openMotionFromSelection}>
            🗳️ Create Motion
          </button>
        </div>
      )}

      <div className="topic-bar" role="tablist" aria-label="Topics">
        <button
          type="button"
          className={`topic-chip${activeTopicId === null ? " on" : ""}`}
          onClick={() => selectTopic(null)}
        >
          General
          {topicHasNew(null) && <span className="unread-dot" style={{ marginLeft: 6 }} />}
        </button>
        {topics.map((t) => (
          <button
            type="button"
            key={t.id}
            className={`topic-chip${activeTopicId === t.id ? " on" : ""}`}
            onClick={() => selectTopic(t.id)}
          >
            {t.name}
            {topicHasNew(t.id) && <span className="unread-dot" style={{ marginLeft: 6 }} />}
          </button>
        ))}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            setNewTopicName("");
            setCreatingTopic(true);
          }}
        >
          + New topic
        </button>
      </div>
      {activeTopic && canManageTopic && (
        <div className="row" style={{ marginBottom: 8, gap: 6 }}>
          <span className="help">Topic: {activeTopic.name}</span>
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => {
              setTopicRenameValue(activeTopic.name);
              setRenamingTopic(true);
            }}
          >
            Rename topic
          </button>
          {visibleMessages.length === 0 && (
            <button type="button" className="btn ghost sm" onClick={deleteEmptyTopic}>
              Delete empty topic
            </button>
          )}
        </div>
      )}

      {!isPrivate && space.group_id && (
        <>
          {activeTopic && (
            <AttachedDocuments
              groupId={space.group_id}
              target={{ space_id: id, topic_id: null }}
              label="Documents for the whole room"
              readOnly
            />
          )}
          <AttachedDocuments
            groupId={space.group_id}
            target={{ space_id: id, topic_id: activeTopicId }}
            label={
              activeTopic
                ? "Documents for this topic"
                : topics.length > 0
                  ? "Documents for the whole room"
                  : "Documents for this room"
            }
          />
        </>
      )}

      <div className="card">
        <div className="thread" ref={threadRef}>
          {!ready ? (
            <div className="empty">Loading messages…</div>
          ) : visibleMessages.length === 0 ? (
            <div className="empty">
              {activeTopic
                ? "No messages in this topic yet — start the conversation."
                : "No messages yet — start the conversation."}
            </div>
          ) : (
            visibleMessages.map((m) => (
              <div className="msg" key={m.id}>
                <div className="bubble">
                  <div className="head">
                    <span className="nm">
                      {profiles[m.author_id || ""]?.name || "Someone"}
                    </span>
                    <time>{fmtDateTime(m.created_at)}</time>
                    {m.edited_at && <span className="help">(edited)</span>}
                    {editingMessageId !== m.id &&
                      (confirmDeleteId === m.id ? (
                        <span className="row" style={{ marginLeft: "auto", gap: 4 }}>
                          <span className="help">Delete this message?</span>
                          <button
                            type="button"
                            className="btn danger sm"
                            style={{ padding: "0 6px", fontSize: 11 }}
                            onClick={() => deleteMessage(m.id)}
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            className="btn ghost sm"
                            style={{ padding: "0 6px", fontSize: 11 }}
                            onClick={() => setConfirmDeleteId(null)}
                          >
                            Keep
                          </button>
                        </span>
                      ) : (
                        <span className="row" style={{ marginLeft: "auto", gap: 2 }}>
                          {m.author_id === userId && (
                            <button
                              type="button"
                              className="btn ghost sm"
                              style={{ padding: "0 6px", fontSize: 11 }}
                              onClick={() => startEditMessage(m.id, m.text)}
                            >
                              Edit
                            </button>
                          )}
                          {(m.author_id === userId || (!isPrivate && isGroupAdmin(space.group_id))) && (
                            <button
                              type="button"
                              className="btn ghost sm"
                              style={{ padding: "0 6px", fontSize: 11 }}
                              onClick={() => setConfirmDeleteId(m.id)}
                            >
                              Delete
                            </button>
                          )}
                        </span>
                      ))}
                  </div>
                  {editingMessageId === m.id ? (
                    <div>
                      <FormatBar textareaRef={editRef} onChange={setEditText} />
                      <textarea
                        ref={editRef}
                        className="textarea"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        autoFocus
                      />
                      <div className="row" style={{ marginTop: 6, gap: 6 }}>
                        <button
                          className="btn primary sm"
                          onClick={saveEditMessage}
                          disabled={editSaving || !editText.trim()}
                        >
                          {editSaving ? "Saving…" : "Save"}
                        </button>
                        <button className="btn sm" onClick={() => setEditingMessageId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="txt">{renderRichText(m.text)}</div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <FormatBar textareaRef={composerRef} onChange={setDraft} />
        {hasFormatting(draft) && (
          <div className="msg-preview">
            <b className="lbl">Preview</b>
            {renderRichText(draft)}
          </div>
        )}
        <div className="composer">
          <textarea
            ref={composerRef}
            className="textarea"
            rows={1}
            placeholder="Write a message…"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter adds a line. On a touch screen there's
              // no Shift, so Enter adds a line and the Send button sends.
              const touch = window.matchMedia("(pointer: coarse)").matches;
              if (e.key === "Enter" && !e.shiftKey && !touch) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button
            className="btn primary"
            onClick={send}
            disabled={sending || !draft.trim()}
          >
            Send
          </button>
        </div>
      </div>

      {deletingRoom && (
        <Modal
          title={isPrivate ? "Delete this chat?" : "Delete this room?"}
          onClose={() => setDeletingRoom(false)}
          footer={
            <>
              <button className="btn" onClick={() => setDeletingRoom(false)}>
                Keep it
              </button>
              <button className="btn danger" onClick={deleteRoom} disabled={roomDeleteBusy}>
                {roomDeleteBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            This permanently deletes <strong>{roomDisplayName(space, userId, spaceParticipants, profiles)}</strong>{" "}
            for everyone, including its {messages.length} message{messages.length === 1 ? "" : "s"}
            {topics.length > 0
              ? ` and ${topics.length} topic${topics.length === 1 ? "" : "s"}`
              : ""}
            .
          </p>
          <p className="help">
            Any motions or tasks that were created from it are kept, but lose their link back
            here. This can&apos;t be undone — if you only want it out of the way, use{" "}
            <strong>Close room</strong> instead.
          </p>
        </Modal>
      )}

      {creatingTopic && (
        <Modal
          title="New topic"
          onClose={() => setCreatingTopic(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreatingTopic(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createTopic}
                disabled={topicSaving || !newTopicName.trim()}
              >
                {topicSaving ? "Creating…" : "Create topic"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Topic name</label>
            <input
              className="input"
              value={newTopicName}
              onChange={(e) => setNewTopicName(e.target.value)}
              placeholder="e.g. Fire extinguishers"
              autoFocus
            />
            <span className="help">
              A topic is its own conversation inside this room — everyone in the room can see it.
            </span>
          </div>
        </Modal>
      )}

      {renamingTopic && (
        <Modal
          title="Rename topic"
          onClose={() => setRenamingTopic(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRenamingTopic(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={saveTopicRename}
                disabled={topicSaving || !topicRenameValue.trim()}
              >
                {topicSaving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Topic name</label>
            <input
              className="input"
              value={topicRenameValue}
              onChange={(e) => setTopicRenameValue(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {renaming && (
        <Modal
          title="Rename"
          onClose={() => setRenaming(false)}
          footer={
            <>
              <button className="btn" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={saveRename}
                disabled={renameSaving || !renameValue.trim()}
              >
                {renameSaving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Name</label>
            <input
              className="input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
            />
          </div>
        </Modal>
      )}

      {pinning && (
        <Modal
          title="Pin room"
          onClose={() => setPinning(false)}
          footer={
            <>
              <button className="btn" onClick={() => setPinning(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={savePin}
                disabled={pinSaving || (pinMode === "until" && !pinUntil)}
              >
                {pinSaving ? "Pinning…" : "Pin"}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="checkbox-row">
              <input
                type="radio"
                name="pin-mode"
                checked={pinMode === "permanent"}
                onChange={() => setPinMode("permanent")}
              />
              Pin permanently
            </label>
            <label className="checkbox-row">
              <input
                type="radio"
                name="pin-mode"
                checked={pinMode === "until"}
                onChange={() => setPinMode("until")}
              />
              Pin until a set time
            </label>
          </div>
          {pinMode === "until" && (
            <div className="field">
              <label>Unpins automatically at</label>
              <input
                className="input"
                type="datetime-local"
                value={pinUntil}
                onChange={(e) => setPinUntil(e.target.value)}
              />
            </div>
          )}
          <span className="help">
            Pinning puts this at the top of the list for everyone in it, not just you.
          </span>
        </Modal>
      )}

      {taskDraft && (
        <Modal
          title="Create task from selection"
          onClose={() => setTaskDraft(null)}
          footer={
            <>
              <button className="btn" onClick={() => setTaskDraft(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createTaskFromSelection}
                disabled={quickSaving || !taskDraft.title.trim()}
              >
                {quickSaving ? "Creating…" : "Create task"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Title</label>
            <input
              className="input"
              value={taskDraft.title}
              onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              className="textarea"
              value={taskDraft.description}
              onChange={(e) => setTaskDraft({ ...taskDraft, description: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Assigned to (optional)</label>
            <AssigneePicker
              members={groupMemberProfiles}
              value={quickAssigneeIds}
              onChange={setQuickAssigneeIds}
            />
          </div>
          <span className="help">
            Added to {spaceGroup?.name} and linked back to this room.
          </span>
        </Modal>
      )}

      {motionDraft && (
        <Modal
          title="Propose motion from selection"
          onClose={() => setMotionDraft(null)}
          footer={
            <>
              <button className="btn" onClick={() => setMotionDraft(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createMotionFromSelection}
                disabled={
                  quickSaving ||
                  !motionDraft.title.trim() ||
                  !motionDraft.motionText.trim() ||
                  !customOptionsValid
                }
              >
                {quickSaving ? "Proposing…" : "Propose"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Title</label>
            <input
              className="input"
              value={motionDraft.title}
              onChange={(e) => setMotionDraft({ ...motionDraft, title: e.target.value })}
              autoFocus
            />
          </div>
          <div className="field">
            <label>Motion text</label>
            <textarea
              className="textarea"
              value={motionDraft.motionText}
              onChange={(e) => setMotionDraft({ ...motionDraft, motionText: e.target.value })}
            />
          </div>
          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={customizeOptions}
                onChange={(e) => setCustomizeOptions(e.target.checked)}
              />
              Customise vote options
            </label>
            <span className="help">
              Default is Yes / No / Abstain. Turn this on to vote between other choices instead
              (e.g. picking between venues).
            </span>
          </div>
          {customizeOptions && (
            <div className="field">
              <label>Vote options</label>
              {customOptions.map((opt, i) => (
                <div className="row" key={i} style={{ marginBottom: 6 }}>
                  <input
                    className="input"
                    value={opt}
                    onChange={(e) => updateCustomOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  {customOptions.length > 2 && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => removeCustomOption(i)}
                      title="Remove option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {customOptions.length < MAX_VOTE_OPTIONS && (
                <button type="button" className="btn ghost sm" onClick={addCustomOption}>
                  + Add option
                </button>
              )}
              <span className="help">
                Members vote for exactly one option; whichever reaches quorum first wins.
                {!customOptionsValid &&
                  " Enter at least 2 unique, non-empty options to continue."}
              </span>
            </div>
          )}
          <span className="help">
            Proposed in {spaceGroup?.name} · quorum{" "}
            {spaceGroup?.default_quorum ?? 1} · deadline defaults to 5 days — use
            &quot;+ Propose motion&quot; on the Decisions page for a different deadline.
            Automatically linked back to this room.
          </span>
        </Modal>
      )}
    </div>
  );
}
