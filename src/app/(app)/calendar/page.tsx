"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { fmtDate, fmtDateTime, toLocalInput } from "@/lib/format";
import { matchMember, parseActionItems } from "@/lib/action-items";
import { Modal } from "@/components/Modal";
import { features } from "@/lib/brand";
import type { Meeting } from "@/types";

type CalItem = {
  id: string;
  kind: "meeting" | "decision" | "task";
  date: string;
  title: string;
  groupId: string;
  sub: string;
  href?: string;
  meeting?: Meeting;
};

const KIND_ICON: Record<CalItem["kind"], string> = {
  meeting: "📅",
  decision: "🗳️",
  task: "✅",
};

export default function CalendarPage() {
  const {
    groups,
    meetings,
    decisions,
    tasks,
    profiles,
    groupMembers,
    userId,
    isGroupAdmin,
    myGroupIds,
    supabase,
  } = useAppData();
  const showToast = useToast();
  const [showPast, setShowPast] = useState(false);

  const [creating, setCreating] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editScheduledAt, setEditScheduledAt] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importGroupId, setImportGroupId] = useState("");
  const [importMeetingId, setImportMeetingId] = useState("");
  const [importText, setImportText] = useState("");
  const [importSaving, setImportSaving] = useState(false);

  const items = useMemo(() => {
    const list: CalItem[] = [];
    for (const m of Object.values(meetings)) {
      list.push({
        id: m.id,
        kind: "meeting",
        date: m.scheduled_at,
        title: m.title,
        groupId: m.group_id,
        sub: [groups[m.group_id]?.name, m.location].filter(Boolean).join(" · "),
        meeting: m,
      });
    }
    const nowMs = new Date().getTime();
    for (const d of Object.values(decisions)) {
      // withdrawn/decided motions only belong in the past list, not upcoming
      if (d.status !== "open" && new Date(d.deadline).getTime() > nowMs) continue;
      list.push({
        id: d.id,
        kind: "decision",
        date: d.deadline,
        title: d.title,
        groupId: d.group_id,
        sub: `${groups[d.group_id]?.name || "committee"} · ${d.status}`,
        href: "/decisions",
      });
    }
    for (const t of Object.values(tasks)) {
      if (!t.due_date) continue;
      list.push({
        id: t.id,
        kind: "task",
        date: new Date(t.due_date + "T12:00:00").toISOString(),
        title: t.title,
        groupId: t.group_id,
        sub: `${groups[t.group_id]?.name || "committee"} · ${t.status}`,
        href: "/tasks",
      });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [meetings, decisions, tasks, groups]);

  const now = new Date().getTime();
  const upcoming = items.filter((i) => new Date(i.date).getTime() >= now);
  const past = items.filter((i) => new Date(i.date).getTime() < now).reverse();
  const visible = showPast ? past : upcoming;

  const byMonth = useMemo(() => {
    const groupsByMonth: { label: string; items: CalItem[] }[] = [];
    for (const item of visible) {
      const label = new Date(item.date).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      const last = groupsByMonth[groupsByMonth.length - 1];
      if (last && last.label === label) last.items.push(item);
      else groupsByMonth.push({ label, items: [item] });
    }
    return groupsByMonth;
  }, [visible]);

  function openCreate() {
    setGroupId(myGroupIds[0] || "");
    setTitle("");
    setScheduledAt("");
    setLocation("");
    setNotes("");
    setCreating(true);
  }

  async function createMeeting() {
    if (!title.trim() || !groupId || !scheduledAt) return;
    setSaving(true);
    const { error } = await supabase.from("meetings").insert({
      group_id: groupId,
      title: title.trim(),
      scheduled_at: new Date(scheduledAt).toISOString(),
      location: location.trim() || null,
      notes: notes.trim() || null,
      created_by: userId,
    });
    setSaving(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast("Meeting scheduled");
      setCreating(false);
    }
  }

  function openEdit(m: Meeting) {
    setEditingMeeting(m);
    setEditTitle(m.title);
    setEditScheduledAt(toLocalInput(m.scheduled_at));
    setEditLocation(m.location || "");
    setEditNotes(m.notes || "");
  }

  async function saveEdit() {
    if (!editingMeeting || !editTitle.trim() || !editScheduledAt) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("meetings")
      .update({
        title: editTitle.trim(),
        scheduled_at: new Date(editScheduledAt).toISOString(),
        location: editLocation.trim() || null,
        notes: editNotes.trim() || null,
      })
      .eq("id", editingMeeting.id);
    setEditSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Meeting updated");
      setEditingMeeting(null);
    }
  }

  async function removeMeeting(id: string) {
    const { error } = await supabase.from("meetings").delete().eq("id", id);
    if (error) showToast(error.message);
    else showToast("Meeting removed");
  }

  function openImport(meeting?: Meeting) {
    setImportGroupId(meeting?.group_id || myGroupIds[0] || "");
    setImportMeetingId(meeting?.id || "");
    setImportText("");
    setImportOpen(true);
  }

  const importGroupMembers = Object.values(groupMembers)
    .filter((gm) => gm.group_id === importGroupId)
    .map((gm) => profiles[gm.member_id])
    .filter((p): p is NonNullable<typeof p> => !!p && p.active);

  const importGroupMeetings = Object.values(meetings)
    .filter((m) => m.group_id === importGroupId)
    .sort((a, b) => b.scheduled_at.localeCompare(a.scheduled_at));

  const parsedActionItems = useMemo(() => parseActionItems(importText), [importText]);

  async function createFromImport() {
    if (!importGroupId || parsedActionItems.length === 0) return;
    setImportSaving(true);
    const owners = parsedActionItems.map((item) => matchMember(item.ownerName, importGroupMembers));
    const rows = parsedActionItems.map((item) => ({
      group_id: importGroupId,
      meeting_id: importMeetingId || null,
      title: item.description,
      description: item.notes || null,
      status: item.status,
      priority: item.priority,
      due_date: item.dueDate,
      created_by: userId,
    }));
    const { data: created, error } = await supabase.from("tasks").insert(rows).select("id");
    // A single multi-row insert returns its rows in the order they were sent,
    // so created[i] is the task for parsedActionItems[i].
    const assigneeRows =
      !error && created
        ? created.flatMap((t, i) => (owners[i] ? [{ task_id: t.id, member_id: owners[i]!.id }] : []))
        : [];
    if (assigneeRows.length) await supabase.from("task_assignees").insert(assigneeRows);
    setImportSaving(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast(`${rows.length} action item${rows.length === 1 ? "" : "s"} created`);
      setImportOpen(false);
    }
  }

  return (
    <div>
      <div className="section-title">
        <h2>Calendar</h2>
        <div className="row">
          {features.minutesImport && (
            <button className="btn sm" onClick={() => openImport()}>
              📋 Import action items
            </button>
          )}
          <button className="btn primary sm" onClick={openCreate}>
            + New meeting
          </button>
        </div>
      </div>
      <p className="section-desc">
        Meetings you schedule here, plus every open decision&apos;s deadline and every task&apos;s
        due date, in one place.
      </p>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className="btn sm" onClick={() => setShowPast((p) => !p)}>
          {showPast ? "← Back to upcoming" : `Show past (${past.length})`}
        </button>
      </div>

      {byMonth.length === 0 && (
        <div className="card">
          <div className="empty">
            {showPast ? "Nothing in the past yet." : "Nothing scheduled — enjoy the quiet."}
          </div>
        </div>
      )}

      {byMonth.map(({ label, items: monthItems }) => (
        <div key={label} style={{ marginBottom: 18 }}>
          <div className="group-head" style={{ marginBottom: 6 }}>
            {label}
          </div>
          <div className="card">
            {monthItems.map((item) => {
              const isMeeting = item.kind === "meeting" && item.meeting;
              const canManage = isMeeting
                ? isGroupAdmin(item.groupId) || item.meeting!.created_by === userId
                : false;
              const row = (
                <div className="main">
                  <div className="t">
                    {KIND_ICON[item.kind]} {item.title}
                  </div>
                  <div className="s">
                    {fmtDateTime(item.date)}
                    {item.sub && <> · {item.sub}</>}
                  </div>
                </div>
              );
              return (
                <div className="list-row calendar-row" key={`${item.kind}:${item.id}`} style={{ cursor: "default" }}>
                  {row}
                  {isMeeting ? (
                    <div className="row calendar-actions" style={{ gap: 6 }}>
                      {features.minutesImport && (
                        <button className="btn ghost sm" onClick={() => openImport(item.meeting!)}>
                          Import action items
                        </button>
                      )}
                      <button className="btn ghost sm" onClick={() => openEdit(item.meeting!)}>
                        Edit
                      </button>
                      {canManage && (
                        <button
                          className="btn danger sm"
                          onClick={() => removeMeeting(item.meeting!.id)}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ) : (
                    item.href && (
                      <Link href={item.href} className="hint">
                        View →
                      </Link>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {creating && (
        <Modal
          title="New meeting"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createMeeting}
                disabled={saving || !title.trim() || !groupId || !scheduledAt}
              >
                {saving ? "Scheduling…" : "Schedule"}
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
              placeholder="e.g. Committee catch-up"
              autoFocus
            />
          </div>
          <div className="field">
            <label>Date &amp; time</label>
            <input
              className="input"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Location (optional)</label>
            <input
              className="input"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Google Meet link, or a room name"
            />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <textarea
              className="textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Agenda, dial-in details, anything worth noting"
            />
          </div>
        </Modal>
      )}

      {editingMeeting && (
        <Modal
          title="Edit meeting"
          onClose={() => setEditingMeeting(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditingMeeting(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={saveEdit}
                disabled={editSaving || !editTitle.trim() || !editScheduledAt}
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
              autoFocus
            />
          </div>
          <div className="field">
            <label>Date &amp; time</label>
            <input
              className="input"
              type="datetime-local"
              value={editScheduledAt}
              onChange={(e) => setEditScheduledAt(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Location (optional)</label>
            <input
              className="input"
              value={editLocation}
              onChange={(e) => setEditLocation(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <textarea
              className="textarea"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {importOpen && (
        <Modal
          title="Import action items"
          onClose={() => setImportOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createFromImport}
                disabled={importSaving || !importGroupId || parsedActionItems.length === 0}
              >
                {importSaving
                  ? "Creating…"
                  : `Create ${parsedActionItems.length || ""} action item${parsedActionItems.length === 1 ? "" : "s"}`}
              </button>
            </>
          }
        >
          <div className="row wrap">
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Group</label>
              <select
                className="select"
                value={importGroupId}
                onChange={(e) => {
                  setImportGroupId(e.target.value);
                  setImportMeetingId("");
                }}
              >
                {myGroupIds.map((gid) => (
                  <option key={gid} value={gid}>
                    {groups[gid]?.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flex: 1, minWidth: 160 }}>
              <label>Link to a meeting (optional)</label>
              <select
                className="select"
                value={importMeetingId}
                onChange={(e) => setImportMeetingId(e.target.value)}
              >
                <option value="">Not linked</option>
                {importGroupMeetings.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title} — {fmtDate(m.scheduled_at)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label>Paste the action items table from your minutes</label>
            <textarea
              className="textarea"
              style={{ minHeight: 120, fontFamily: "monospace", fontSize: 12.5 }}
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Paste straight from Word or Excel — column order doesn't matter if you keep the header row."}
            />
            <span className="help">
              Matches the committee action log columns: Action description, Owner, Priority
              (H/M/L), Deadline, Status. A blank Action description row (e.g. an unused template
              row) is skipped.
            </span>
          </div>
          {parsedActionItems.length > 0 && (
            <div className="field">
              <label>Preview — {parsedActionItems.length} item{parsedActionItems.length === 1 ? "" : "s"}</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {parsedActionItems.map((item, i) => {
                  const owner = matchMember(item.ownerName, importGroupMembers);
                  const ownerIssue = item.ownerName && !owner;
                  const dateIssue = item.rawDeadline && !item.dueDate;
                  return (
                    <div key={i} style={{ fontSize: 12.5, borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
                      <div style={{ fontWeight: 600 }}>{item.description}</div>
                      <div className="help">
                        {owner ? owner.name : "Unassigned"} · {item.priority} ·{" "}
                        {item.dueDate ? `due ${fmtDate(item.dueDate)}` : "no due date"} ·{" "}
                        {item.status}
                      </div>
                      {ownerIssue && (
                        <div style={{ color: "var(--warn)" }}>
                          Couldn&apos;t match owner &ldquo;{item.ownerName}&rdquo; to a group member —
                          left unassigned.
                        </div>
                      )}
                      {dateIssue && (
                        <div style={{ color: "var(--warn)" }}>
                          Couldn&apos;t read deadline &ldquo;{item.rawDeadline}&rdquo; — left blank.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
