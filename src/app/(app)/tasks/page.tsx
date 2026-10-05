"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { assigneeIdsOf } from "@/lib/tasks";
import { roomLink } from "@/lib/rooms";
import { Modal } from "@/components/Modal";
import { SortSelect } from "@/components/SortSelect";
import { compareBy, usePersistedSort, type SortMode } from "@/lib/sort";

// Tasks have no comments of their own, so there's no "newest comments" here.
const TASK_SORTS: readonly SortMode[] = ["created", "az", "za"];
import { AssigneePicker } from "@/components/AssigneePicker";
import { AttachedDocuments, linkMatches } from "@/components/AttachedDocuments";
import type { Task, TaskStatus } from "@/types";

const COLUMNS: { id: TaskStatus; label: string; icon: string }[] = [
  { id: "todo", label: "To do", icon: "📥" },
  { id: "doing", label: "Doing", icon: "🔧" },
  { id: "done", label: "Done", icon: "✅" },
  { id: "blocked", label: "Blocked", icon: "🚫" },
];

export default function TasksPage() {
  const {
    groups,
    tasks,
    meetings,
    spaces,
    spaceTopics,
    documents,
    documentLinks,
    taskSkillTags,
    taskAssignees,
    skillAreas,
    profiles,
    groupMembers,
    myGroupIds,
    userId,
    isGroupAdmin,
    supabase,
    unreadTaskNotificationCount,
    markNotificationsRead,
  } = useAppData();
  const showToast = useToast();

  // Visiting the board clears the "something changed" dot on the nav tab,
  // the same way opening Decisions clears its own.
  useEffect(() => {
    if (unreadTaskNotificationCount > 0) {
      markNotificationsRead(["task_reminder", "task_overdue"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [creating, setCreating] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [pickedSkills, setPickedSkills] = useState<string[]>([]);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPriority, setEditPriority] = useState<Task["priority"]>("normal");
  const [editAssigneeIds, setEditAssigneeIds] = useState<string[]>([]);
  const [editSkills, setEditSkills] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const [sortMode, setSortMode] = usePersistedSort("sort:tasks", "created", TASK_SORTS);

  const byColumn = useMemo(() => {
    const cols: Record<TaskStatus, Task[]> = { todo: [], doing: [], done: [], blocked: [] };
    Object.values(tasks).forEach((t) => cols[t.status].push(t));
    const cmp = compareBy<Task>(sortMode, { name: (t) => t.title, created: (t) => t.created_at });
    (Object.keys(cols) as TaskStatus[]).forEach((k) => cols[k].sort(cmp));
    return cols;
  }, [tasks, sortMode]);

  function openCreate() {
    setGroupId(myGroupIds[0] || "");
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("normal");
    setPickedSkills([]);
    setAssigneeIds([]);
    setCreating(true);
  }

  function toggleSkill(id: string) {
    setPickedSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function createTask() {
    if (!title.trim() || !groupId) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        group_id: groupId,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        due_date: dueDate || null,
        created_by: userId,
      })
      .select()
      .single();

    if (!error && data && pickedSkills.length) {
      await supabase
        .from("task_skill_tags")
        .insert(pickedSkills.map((skill_id) => ({ task_id: data.id, skill_id })));
    }
    if (!error && data && assigneeIds.length) {
      await supabase
        .from("task_assignees")
        .insert(assigneeIds.map((member_id) => ({ task_id: data.id, member_id })));
    }

    setSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Task created");
      setCreating(false);
    }
  }

  async function setStatus(taskId: string, status: TaskStatus) {
    const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
    if (error) showToast(error.message);
  }

  async function deleteTask() {
    if (!editingTask) return;
    const { data, error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", editingTask.id)
      .select();
    if (error) showToast(error.message);
    else if (!data?.length) showToast("That task couldn't be deleted");
    else {
      showToast("Task deleted");
      setEditingTask(null);
    }
    setConfirmingDelete(false);
  }

  function openEdit(t: Task) {
    setConfirmingDelete(false);
    setEditingTask(t);
    setEditTitle(t.title);
    setEditDescription(t.description || "");
    setEditDueDate(t.due_date || "");
    setEditPriority(t.priority);
    setEditAssigneeIds(assigneeIdsOf(t.id, taskAssignees));
    setEditSkills(
      Object.values(taskSkillTags)
        .filter((tag) => tag.task_id === t.id)
        .map((tag) => tag.skill_id)
    );
  }

  function toggleEditSkill(id: string) {
    setEditSkills((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  }

  async function saveEdit() {
    if (!editingTask || !editTitle.trim()) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("tasks")
      .update({
        title: editTitle.trim(),
        description: editDescription.trim() || null,
        due_date: editDueDate || null,
        priority: editPriority,
      })
      .eq("id", editingTask.id);

    if (!error) {
      const currentAssignees = assigneeIdsOf(editingTask.id, taskAssignees);
      const assigneesToAdd = editAssigneeIds.filter((m) => !currentAssignees.includes(m));
      const assigneesToRemove = currentAssignees.filter((m) => !editAssigneeIds.includes(m));
      if (assigneesToAdd.length) {
        await supabase
          .from("task_assignees")
          .insert(assigneesToAdd.map((member_id) => ({ task_id: editingTask.id, member_id })));
      }
      for (const member_id of assigneesToRemove) {
        await supabase
          .from("task_assignees")
          .delete()
          .eq("task_id", editingTask.id)
          .eq("member_id", member_id);
      }

      const currentTags = Object.values(taskSkillTags)
        .filter((tag) => tag.task_id === editingTask.id)
        .map((tag) => tag.skill_id);
      const toAdd = editSkills.filter((s) => !currentTags.includes(s));
      const toRemove = currentTags.filter((s) => !editSkills.includes(s));
      if (toAdd.length) {
        await supabase
          .from("task_skill_tags")
          .insert(toAdd.map((skill_id) => ({ task_id: editingTask.id, skill_id })));
      }
      for (const skill_id of toRemove) {
        await supabase
          .from("task_skill_tags")
          .delete()
          .eq("task_id", editingTask.id)
          .eq("skill_id", skill_id);
      }
    }

    setEditSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Task updated");
      setEditingTask(null);
    }
  }

  const groupMemberProfiles = (gid: string) =>
    Object.values(groupMembers)
      .filter((gm) => gm.group_id === gid)
      .map((gm) => profiles[gm.member_id])
      .filter((p): p is NonNullable<typeof p> => !!p && p.active);

  const createMembers = groupId ? groupMemberProfiles(groupId) : [];
  const editMembers = editingTask
    ? [
        ...groupMemberProfiles(editingTask.group_id),
        ...editAssigneeIds
          .map((id) => profiles[id])
          .filter(
            (p): p is NonNullable<typeof p> =>
              !!p && !groupMemberProfiles(editingTask.group_id).some((m) => m.id === p.id)
          ),
      ]
    : [];

  return (
    <div>
      <div className="section-title">
        <h2>Tasks</h2>
        <button className="btn primary sm" onClick={openCreate}>
          + New task
        </button>
      </div>
      <p className="section-desc">Tasks are actions assigned to committee members.</p>
      <div className="row" style={{ marginBottom: 12, justifyContent: "flex-end" }}>
        <SortSelect value={sortMode} onChange={setSortMode} options={TASK_SORTS} />
      </div>

      <div className="board">
        {COLUMNS.map((col) => (
          <div className="board-col" key={col.id}>
            <div className="col-head">
              <span>
                {col.icon} {col.label}
              </span>
              <span>{byColumn[col.id].length}</span>
            </div>
            {byColumn[col.id].map((t) => {
              const assignees = assigneeIdsOf(t.id, taskAssignees)
                .map((id) => profiles[id])
                .filter((p): p is NonNullable<typeof p> => !!p);
              const tags = Object.values(taskSkillTags).filter(
                (tag) => tag.task_id === t.id
              );
              const overdue =
                t.status !== "done" &&
                !!t.due_date &&
                t.due_date < new Date().toISOString().slice(0, 10);
              return (
                <div className="task-card" key={t.id}>
                  <div className="tt">
                    <span className={`prio-stripe prio-${t.priority}`} />
                    ✅ {t.title}
                  </div>
                  {t.description && (
                    <div className="help" style={{ marginTop: 4 }}>
                      {t.description}
                    </div>
                  )}
                  <div className="tm">
                    {overdue && <span className="pill pill-blocked">Overdue</span>}
                    {assignees.map((a) => (
                      <span className="badge" key={a.id}>
                        {a.name}
                      </span>
                    ))}
                    {t.due_date && <span className="badge">Due {t.due_date}</span>}
                    {t.space_id && spaces[t.space_id] && (
                      <Link className="badge" href={roomLink(t.space_id, t.topic_id)}>
                        💬 {spaces[t.space_id].name}
                        {t.topic_id && spaceTopics[t.topic_id]
                          ? ` › ${spaceTopics[t.topic_id].name}`
                          : ""}
                      </Link>
                    )}
                    {Object.values(documentLinks)
                      .filter((l) => linkMatches(l, { task_id: t.id }))
                      .map((l) =>
                        documents[l.document_id] ? (
                          <a
                            key={l.id}
                            className="badge"
                            href={documents[l.document_id].url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📎 {documents[l.document_id].title}
                          </a>
                        ) : null
                      )}
                    {t.meeting_id && meetings[t.meeting_id] && (
                      <span className="badge">📅 {meetings[t.meeting_id].title}</span>
                    )}
                    {tags.map((tag) => (
                      <span className="badge" key={tag.skill_id}>
                        {skillAreas[tag.skill_id]?.label || tag.skill_id}
                      </span>
                    ))}
                  </div>
                  <div className="row" style={{ marginTop: 8, gap: 6 }}>
                    <select
                      className="select"
                      style={{ fontSize: 11.5, padding: "4px 6px" }}
                      value={t.status}
                      onChange={(e) => setStatus(t.id, e.target.value as TaskStatus)}
                    >
                      {COLUMNS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    <button type="button" className="btn ghost sm" onClick={() => openEdit(t)}>
                      Edit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {creating && (
        <Modal
          title="New task"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={createTask}
                disabled={saving || !title.trim() || !groupId}
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
              onChange={(e) => {
                setGroupId(e.target.value);
                setAssigneeIds([]);
              }}
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
              autoFocus
            />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea
              className="textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="row wrap">
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>Due date</label>
              <input
                className="input"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>Priority</label>
              <select
                className="select"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Task["priority"])}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Relevant skills</label>
            <div className="row wrap">
              {Object.values(skillAreas).map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`tag-check${pickedSkills.includes(s.id) ? " on" : ""}`}
                  onClick={() => toggleSkill(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Assigned to</label>
            <AssigneePicker members={createMembers} value={assigneeIds} onChange={setAssigneeIds} />
          </div>
        </Modal>
      )}

      {editingTask && (
        <Modal
          title="Edit task"
          onClose={() => setEditingTask(null)}
          footer={
            <>
              {(editingTask.created_by === userId || isGroupAdmin(editingTask.group_id)) &&
                (confirmingDelete ? (
                  <span className="row" style={{ marginRight: "auto", gap: 6 }}>
                    <span className="help">Delete this task?</span>
                    <button className="btn danger sm" onClick={deleteTask}>
                      Yes, delete
                    </button>
                    <button className="btn ghost sm" onClick={() => setConfirmingDelete(false)}>
                      Keep
                    </button>
                  </span>
                ) : (
                  <button
                    className="btn ghost sm"
                    style={{ marginRight: "auto" }}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Delete task
                  </button>
                ))}
              <button className="btn" onClick={() => setEditingTask(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={saveEdit}
                disabled={editSaving || !editTitle.trim()}
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
            <label>Description</label>
            <textarea
              className="textarea"
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
            />
          </div>
          <div className="row wrap">
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>Due date</label>
              <input
                className="input"
                type="date"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1, minWidth: 140 }}>
              <label>Priority</label>
              <select
                className="select"
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as Task["priority"])}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Assigned to</label>
            <AssigneePicker members={editMembers} value={editAssigneeIds} onChange={setEditAssigneeIds} />
          </div>
          <div className="field">
            <AttachedDocuments groupId={editingTask.group_id} target={{ task_id: editingTask.id }} />
          </div>
          <div className="field">
            <label>Relevant skills</label>
            <div className="row wrap">
              {Object.values(skillAreas).map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className={`tag-check${editSkills.includes(s.id) ? " on" : ""}`}
                  onClick={() => toggleEditSkill(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
