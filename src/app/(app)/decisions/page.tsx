"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { computeQuorumMath } from "@/lib/quorum-math";
import { fmtDateTime, initials, colorFor, toLocalInput } from "@/lib/format";
import { Modal } from "@/components/Modal";
import { AttachedDocuments } from "@/components/AttachedDocuments";
import { SortSelect } from "@/components/SortSelect";
import { compareBy, usePersistedSort, type SortMode } from "@/lib/sort";

const DECISION_SORTS: readonly SortMode[] = ["created", "comments", "az", "za"];
import { roomLink } from "@/lib/rooms";
import { DEFAULT_VOTE_OPTIONS, type Decision, type DecisionStatus, type VoteChoice } from "@/types";

const MAX_VOTE_OPTIONS = 8;

const STATUS_FILTERS: { id: DecisionStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "passed", label: "Passed" },
  { id: "failed", label: "Failed" },
  { id: "withdrawn", label: "Withdrawn" },
];

export default function DecisionsPage() {
  const {
    groups,
    decisions,
    votes,
    spaces,
    spaceTopics,
    groupMembers,
    profiles,
    userId,
    myGroupIds,
    isGroupAdmin,
    supabase,
    unreadDecisionNotificationCount,
    markNotificationsRead,
  } = useAppData();
  const showToast = useToast();
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<DecisionStatus | "all">("all");
  const [sortMode, setSortMode] = usePersistedSort("sort:decisions", "created", DECISION_SORTS);

  const [deleting, setDeleting] = useState<Decision | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState<Decision | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [editing, setEditing] = useState<Decision | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editMotionText, setEditMotionText] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editLocked, setEditLocked] = useState(false);
  const [editSaving, setEditSaving] = useState(false);

  // Visiting the list clears the "something changed" dot on the nav tab,
  // the same way opening a room clears its own unread dot.
  useEffect(() => {
    if (unreadDecisionNotificationCount > 0) {
      markNotificationsRead(["decision_resolved", "decision_reminder"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [title, setTitle] = useState("");
  const [motionText, setMotionText] = useState("");
  const [groupId, setGroupId] = useState("");
  const [deadline, setDeadline] = useState("");
  const [discussSpaceId, setDiscussSpaceId] = useState("");
  const [discussTopicId, setDiscussTopicId] = useState("");
  const [customizeOptions, setCustomizeOptions] = useState(false);
  const [customOptions, setCustomOptions] = useState<string[]>(["", ""]);
  const [saving, setSaving] = useState(false);
  const submitLockRef = useRef(false);

  const trimmedCustomOptions = customOptions.map((o) => o.trim()).filter(Boolean);
  const customOptionsValid =
    !customizeOptions ||
    (trimmedCustomOptions.length >= 2 &&
      new Set(trimmedCustomOptions.map((o) => o.toLowerCase())).size === trimmedCustomOptions.length);

  function updateOption(i: number, value: string) {
    setCustomOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  }
  function addOption() {
    setCustomOptions((prev) => (prev.length < MAX_VOTE_OPTIONS ? [...prev, ""] : prev));
  }
  function removeOption(i: number) {
    setCustomOptions((prev) => prev.filter((_, idx) => idx !== i));
  }

  const allGroupMembers = Object.values(groupMembers);
  const allVotes = Object.values(votes);

  const roomOptions = Object.values(spaces).filter((s) => s.group_id === groupId);
  const topicOptions = Object.values(spaceTopics)
    .filter((t) => t.space_id === discussSpaceId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // Sorted newest-first, then duplicate open proposals (same group + title +
  // motion text -- e.g. from a double-submitted click) are collapsed down to
  // just the most recent one so members don't see the same motion twice.
  const list = useMemo(() => {
    const sorted = Object.values(decisions).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
    const seenOpenKeys = new Set<string>();
    return sorted.filter((d) => {
      if (d.status !== "open") return true;
      const key = `${d.group_id}::${d.title.trim().toLowerCase()}::${d.motion_text.trim().toLowerCase()}`;
      if (seenOpenKeys.has(key)) return false;
      seenOpenKeys.add(key);
      return true;
    });
  }, [decisions]);

  const stats = useMemo(
    () => ({
      total: list.length,
      open: list.filter((d) => d.status === "open").length,
      passed: list.filter((d) => d.status === "passed").length,
      failed: list.filter((d) => d.status === "failed").length,
      withdrawn: list.filter((d) => d.status === "withdrawn").length,
    }),
    [list]
  );

  // "Newest comments" = the latest message in the room the motion is linked to;
  // a motion with no linked room falls back to when it was created.
  const sortedList = useMemo(
    () =>
      [...list].sort(
        compareBy<Decision>(sortMode, {
          name: (d) => d.title,
          created: (d) => d.created_at,
          comments: (d) => (d.space_id ? spaces[d.space_id]?.last_message_at : null),
        })
      ),
    [list, sortMode, spaces]
  );

  const visibleList =
    statusFilter === "all" ? sortedList : sortedList.filter((d) => d.status === statusFilter);

  function activeMemberCount(gid: string) {
    return allGroupMembers.filter(
      (gm) => gm.group_id === gid && profiles[gm.member_id]?.active
    ).length;
  }

  const groupQuorum = groupId ? groups[groupId]?.default_quorum ?? 1 : 1;
  const groupActiveCount = groupId ? activeMemberCount(groupId) : 0;

  function openCreate() {
    setGroupId(myGroupIds[0] || "");
    setTitle("");
    setMotionText("");
    setDeadline("");
    setDiscussSpaceId("");
    setDiscussTopicId("");
    setCustomizeOptions(false);
    setCustomOptions(["", ""]);
    setCreating(true);
  }

  const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

  async function createDecision() {
    if (!title.trim() || !motionText.trim() || !groupId || !userId || !customOptionsValid) return;
    const voteOptions = customizeOptions ? trimmedCustomOptions : DEFAULT_VOTE_OPTIONS;
    // Guards against a double-click firing two inserts before `saving` state
    // re-renders the disabled button -- the ref updates synchronously.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSaving(true);
    const { error } = await supabase.from("decisions").insert({
      group_id: groupId,
      title: title.trim(),
      motion_text: motionText.trim(),
      quorum: groupQuorum,
      deadline: deadline
        ? new Date(deadline).toISOString()
        : new Date(Date.now() + FIVE_DAYS_MS).toISOString(),
      proposed_by: userId,
      space_id: discussSpaceId || null,
      topic_id: discussSpaceId && discussTopicId ? discussTopicId : null,
      vote_options: voteOptions,
    });
    setSaving(false);
    submitLockRef.current = false;
    if (error) showToast(error.message);
    else {
      showToast("Motion proposed");
      setCreating(false);
    }
  }

  async function notifyIfResolved(decisionId: string) {
    try {
      await fetch("/api/decisions/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisionId }),
      });
    } catch {
      // best-effort — a missed notification isn't worth surfacing an error for
    }
  }

  async function deleteMotion() {
    if (!deleting) return;
    setDeleteBusy(true);
    const { data, error } = await supabase
      .from("decisions")
      .delete()
      .eq("id", deleting.id)
      .select();
    setDeleteBusy(false);
    if (error) showToast(error.message);
    else if (!data?.length) showToast("That motion can't be deleted (it may have votes now)");
    else {
      showToast("Motion deleted");
      setDeleting(null);
    }
  }

  async function withdrawMotion() {
    if (!withdrawing) return;
    setWithdrawBusy(true);
    const { data, error } = await supabase
      .from("decisions")
      .update({ status: "withdrawn", closed_at: new Date().toISOString() })
      .eq("id", withdrawing.id)
      .eq("status", "open")
      .select();
    setWithdrawBusy(false);
    if (error) showToast(error.message);
    else if (!data?.length) showToast("That motion can't be withdrawn (it may already be decided)");
    else {
      showToast("Motion withdrawn");
      setWithdrawing(null);
    }
  }

  function openEdit(d: Decision, wordingLocked: boolean) {
    setEditing(d);
    setEditTitle(d.title);
    setEditMotionText(d.motion_text);
    setEditDeadline(toLocalInput(d.deadline));
    setEditLocked(wordingLocked);
  }

  async function saveEdit() {
    if (!editing || !editDeadline) return;
    if (!editLocked && (!editTitle.trim() || !editMotionText.trim())) return;
    const deadline = new Date(editDeadline);
    if (deadline.getTime() <= new Date().getTime()) {
      showToast("The deadline needs to be in the future");
      return;
    }
    setEditSaving(true);
    // Wording is only sent while it's still editable (no votes yet); the
    // deadline can be amended any time the motion is open.
    const patch = editLocked
      ? { deadline: deadline.toISOString() }
      : {
          title: editTitle.trim(),
          motion_text: editMotionText.trim(),
          deadline: deadline.toISOString(),
        };
    const { error } = await supabase.from("decisions").update(patch).eq("id", editing.id);
    setEditSaving(false);
    if (error) showToast(error.message);
    else {
      showToast(editLocked ? "Deadline updated" : "Motion updated");
      setEditing(null);
    }
  }

  async function castVote(decisionId: string, choice: VoteChoice) {
    if (!userId) return;
    const existing = votes[`${decisionId}:${userId}`];
    if (existing?.choice === choice) {
      const { error } = await supabase
        .from("votes")
        .delete()
        .eq("decision_id", decisionId)
        .eq("member_id", userId);
      if (error) showToast(error.message);
      else showToast("Vote withdrawn");
      return;
    }
    const { error } = await supabase
      .from("votes")
      .upsert({ decision_id: decisionId, member_id: userId, choice });
    if (error) showToast(error.message);
    else {
      showToast("Vote recorded");
      notifyIfResolved(decisionId);
    }
  }

  return (
    <div>
      <div className="section-title">
        <h2>Decisions</h2>
        <button className="btn primary sm" onClick={openCreate}>
          + Propose motion
        </button>
      </div>
      <p className="section-desc">
        Decisions are formal votes requiring quorum. Once resolved, they stay here as a record —
        use the filters below to see the committee&apos;s history.
      </p>

      {list.length > 0 && (
        <div className="stats-bar">
          <span className="sitem">
            <strong>{stats.total}</strong>total
          </span>
          <span className="sitem">
            <strong>{stats.open}</strong>open
          </span>
          <span className="sitem">
            <strong>{stats.passed}</strong>passed
          </span>
          <span className="sitem">
            <strong>{stats.failed}</strong>failed
          </span>
          <span className="sitem">
            <strong>{stats.withdrawn}</strong>withdrawn
          </span>
        </div>
      )}

      {list.length > 0 && (
        <div className="row" style={{ marginBottom: 8, justifyContent: "flex-end" }}>
          <SortSelect value={sortMode} onChange={setSortMode} options={DECISION_SORTS} />
        </div>
      )}

      {list.length > 0 && (
        <div className="filter-chips">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`tag-check${statusFilter === f.id ? " on" : ""}`}
              onClick={() => setStatusFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {visibleList.length === 0 && (
        <div className="card">
          <div className="empty">
            {list.length === 0 ? "No motions yet." : "No decisions match this filter."}
          </div>
        </div>
      )}

      {visibleList.map((d) => {
        const math = computeQuorumMath(d, allGroupMembers, profiles, allVotes);
        const myVote = userId ? votes[`${d.id}:${userId}`] : undefined;
        const isOpen = expanded === d.id;
        // The proposer or a group admin can amend an open motion. Its wording
        // locks once anyone has voted (enforced in the database too -- the
        // text people voted on mustn't change underneath them), but the
        // deadline can still be moved.
        const canEdit =
          d.status === "open" && (d.proposed_by === userId || isGroupAdmin(d.group_id));
        const wordingLocked = allVotes.some((v) => v.decision_id === d.id);
        // Deletion is for motions made in error, so only while nobody has voted.
        const canDelete =
          !wordingLocked && (d.proposed_by === userId || isGroupAdmin(d.group_id));
        const groupMemberIds = allGroupMembers
          .filter((gm) => gm.group_id === d.group_id)
          .map((gm) => gm.member_id);
        const nonAbstainOptions = math.options.filter((o) => o !== "abstain");
        const leadingChoice = nonAbstainOptions.length
          ? nonAbstainOptions.reduce((a, b) => (math.counts[b] > math.counts[a] ? b : a))
          : math.options[0];

        return (
          <div className="decision-card" key={d.id}>
            <div className="row between">
              <div>
                <strong>🗳️ {d.title}</strong>
                <div className="s" style={{ color: "var(--muted)", fontSize: 11.5 }}>
                  {groups[d.group_id]?.name} · proposed by{" "}
                  {profiles[d.proposed_by || ""]?.name || "someone"} ·{" "}
                  {fmtDateTime(d.created_at)}
                </div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                {canEdit && (
                  <button type="button" className="btn ghost sm" onClick={() => openEdit(d, wordingLocked)}>
                    Edit
                  </button>
                )}
                {canEdit && (
                  <button type="button" className="btn ghost sm" onClick={() => setWithdrawing(d)}>
                    Withdraw
                  </button>
                )}
                {canDelete && (
                  <button type="button" className="btn ghost sm" onClick={() => setDeleting(d)}>
                    Delete
                  </button>
                )}
                <span className={`pill pill-${d.status === "open" ? "pending" : d.status}`}>
                  {d.status}
                </span>
              </div>
            </div>

            <div
              className="motion-text"
              style={{ cursor: "pointer" }}
              onClick={() => setExpanded(isOpen ? null : d.id)}
            >
              {d.motion_text}
            </div>

            {d.space_id && spaces[d.space_id] && (
              <Link href={roomLink(d.space_id, d.topic_id)} className="hint" style={{ display: "inline-block", marginBottom: 8 }}>
                💬 Discuss in {spaces[d.space_id].name}
                {d.topic_id && spaceTopics[d.topic_id] ? ` › ${spaceTopics[d.topic_id].name}` : ""} →
              </Link>
            )}

            <AttachedDocuments groupId={d.group_id} target={{ decision_id: d.id }} />

            <div className="row between vote-tally-row">
              <div className="vote-tally">
                {math.options.map((opt) => `${math.counts[opt] || 0} ${opt}`).join(" · ")} ·{" "}
                {math.notYetVoted} not yet voted (quorum {d.quorum})
                {d.deadline && <> · deadline {fmtDateTime(d.deadline)}</>}
                {" · "}
                <span
                  style={{ cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                >
                  {isOpen ? "hide votes" : "show votes"}
                </span>
              </div>
              {d.status === "open" && (
                <div className="vote-buttons">
                  {d.vote_options.map((opt) => {
                    const isDefault = opt === "yes" || opt === "no" || opt === "abstain";
                    return (
                      <button
                        key={opt}
                        className={`btn${isDefault ? ` ${opt}` : " custom"}${
                          myVote?.choice === opt ? " active" : ""
                        }`}
                        onClick={() => castVote(d.id, opt)}
                      >
                        {isDefault ? opt[0].toUpperCase() + opt.slice(1) : opt}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="quorum-bar">
              <span style={{ width: `${math.pctFor(leadingChoice)}%` }} />
            </div>

            {isOpen && (
              <div className="vote-list">
                {groupMemberIds.map((mid) => {
                  const v = allVotes.find(
                    (vv) => vv.decision_id === d.id && vv.member_id === mid
                  );
                  const p = profiles[mid];
                  if (!p) return null;
                  return (
                    <div className="vl-row" key={mid}>
                      <div
                        className="avatar sm"
                        style={{ background: colorFor(mid) }}
                      >
                        {initials(p.name)}
                      </div>
                      <span>{p.name}</span>
                      <span
                        className={`choice-tag${
                          !v
                            ? " pending"
                            : v.choice === "yes" || v.choice === "no" || v.choice === "abstain"
                              ? ` ${v.choice}`
                              : ""
                        }`}
                        style={{ marginLeft: "auto" }}
                      >
                        {v ? v.choice : "pending"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {deleting && (
        <Modal
          title="Delete this motion?"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDeleting(null)}>
                Keep it
              </button>
              <button className="btn danger" onClick={deleteMotion} disabled={deleteBusy}>
                {deleteBusy ? "Deleting…" : "Delete permanently"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            <strong>{deleting.title}</strong> will be permanently removed.
          </p>
          <p className="help">
            Nobody has voted on it yet, so this leaves no trace in the record. Tasks that were
            created from it are kept but lose the link. This can&apos;t be undone. (Once a motion
            has votes it can only be withdrawn, not deleted.)
          </p>
        </Modal>
      )}

      {withdrawing && (
        <Modal
          title="Withdraw this motion?"
          onClose={() => setWithdrawing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setWithdrawing(null)}>
                Keep it open
              </button>
              <button className="btn danger" onClick={withdrawMotion} disabled={withdrawBusy}>
                {withdrawBusy ? "Withdrawing…" : "Withdraw motion"}
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            <strong>{withdrawing.title}</strong> will be closed to further voting and marked{" "}
            <strong>Withdrawn</strong>.
          </p>
          <p className="help">
            It stays on the record — including any votes already cast — it just can&apos;t be
            decided. This can&apos;t be undone from here.
          </p>
        </Modal>
      )}

      {editing && (
        <Modal
          title={editLocked ? "Change deadline" : "Edit motion"}
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={saveEdit}
                disabled={
                  editSaving ||
                  !editDeadline ||
                  (!editLocked && (!editTitle.trim() || !editMotionText.trim()))
                }
              >
                {editSaving ? "Saving…" : "Save"}
              </button>
            </>
          }
        >
          <div className="field">
            <label>Title</label>
            <input
              className="input"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              disabled={editLocked}
              autoFocus={!editLocked}
            />
          </div>
          <div className="field">
            <label>Motion text</label>
            <textarea
              className="textarea"
              value={editMotionText}
              onChange={(e) => setEditMotionText(e.target.value)}
              disabled={editLocked}
            />
            <span className="help">
              {editLocked
                ? "Voting has started, so the wording is locked — the text people voted on can't change. You can still move the deadline."
                : "You can reword a motion only until the first vote is cast — after that it's locked, so the text people voted on can't change."}
            </span>
          </div>
          <div className="field">
            <label>Deadline</label>
            <input
              className="input"
              type="datetime-local"
              value={editDeadline}
              onChange={(e) => setEditDeadline(e.target.value)}
              autoFocus={editLocked}
            />
            <span className="help">
              Must be in the future. Moving it re-arms the &ldquo;deadline tomorrow&rdquo;
              reminder for the new date.
            </span>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal
          title="Propose a motion"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createDecision}
                disabled={
                saving || !title.trim() || !motionText.trim() || !groupId || !customOptionsValid
              }
              >
                {saving ? "Proposing…" : "Propose"}
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
            <label>Title</label>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of the motion"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Motion text</label>
            <textarea
              className="textarea"
              value={motionText}
              onChange={(e) => setMotionText(e.target.value)}
              placeholder="Motion: that…"
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
                    onChange={(e) => updateOption(i, e.target.value)}
                    placeholder={`Option ${i + 1}`}
                  />
                  {customOptions.length > 2 && (
                    <button
                      type="button"
                      className="iconbtn"
                      onClick={() => removeOption(i)}
                      title="Remove option"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {customOptions.length < MAX_VOTE_OPTIONS && (
                <button type="button" className="btn ghost sm" onClick={addOption}>
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
          <div className="row wrap">
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Quorum</label>
              <div className="row" style={{ height: 37 }}>
                <strong>
                  {groupQuorum}{" "}
                  {customizeOptions ? "votes needed for an option to win" : "yes votes needed to pass"}
                </strong>
              </div>
              <span className="help">
                Set for {groupId ? groups[groupId]?.name : "this group"} in the Admin tab
                {groupId && groupQuorum > groupActiveCount && (
                  <>
                    {" "}
                    — <strong style={{ color: "var(--critical)" }}>
                      warning: only {groupActiveCount} active member
                      {groupActiveCount === 1 ? "" : "s"} in this group right now, so this can
                      never pass until more join
                    </strong>
                  </>
                )}
              </span>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Deadline (optional)</label>
              <input
                className="input"
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
              <span className="help">
                Leave blank to default to 5 days from now.
              </span>
            </div>
          </div>
          <div className="field">
            <label>Link to a room (optional)</label>
            <select
              className="select"
              value={discussSpaceId}
              onChange={(e) => {
                setDiscussSpaceId(e.target.value);
                setDiscussTopicId("");
              }}
            >
              <option value="">No linked room</option>
              {roomOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {topicOptions.length > 0 && (
              <select
                className="select"
                style={{ marginTop: 8 }}
                value={discussTopicId}
                onChange={(e) => setDiscussTopicId(e.target.value)}
                aria-label="Topic within the room"
              >
                <option value="">General — not a specific topic</option>
                {topicOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <span className="help">
              Adds a &quot;Discuss in…&quot; link on this motion so members can find the
              original conversation{topicOptions.length > 0 ? " — pick a topic to open it directly" : ""}.
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
