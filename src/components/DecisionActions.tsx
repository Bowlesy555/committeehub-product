"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { toLocalInput } from "@/lib/format";
import { Modal } from "@/components/Modal";
import { AssigneePicker } from "@/components/AssigneePicker";
import type { Decision } from "@/types";

/** How the winning option reads: "Yes", "No", or a custom option as written. */
export function outcomeName(d: Decision): string {
  const c = d.resolved_choice;
  if (!c) return "";
  return c === "yes" ? "Yes" : c === "no" ? "No" : c;
}

/** Extend the deadline of a "decision made" motion, or reopen a filed one: either way
 *  voting opens again until a new deadline so the rest of the team can vote. */
export function ExtendDeadlineModal({
  decision,
  mode = "extend",
  onClose,
}: {
  decision: Decision;
  mode?: "extend" | "reopen";
  onClose: () => void;
}) {
  const { supabase } = useAppData();
  const showToast = useToast();
  const [value, setValue] = useState(() => {
    const base = Math.max(new Date().getTime(), new Date(decision.deadline).getTime());
    return toLocalInput(new Date(base + 3 * 24 * 60 * 60 * 1000).toISOString());
  });
  const [busy, setBusy] = useState(false);
  const valid = !!value && new Date(value).getTime() > new Date().getTime();

  async function extend() {
    if (!valid) return;
    setBusy(true);
    const { error } = await supabase.rpc(mode === "reopen" ? "reopen_decision" : "extend_decision", {
      p_id: decision.id,
      p_deadline: new Date(value).toISOString(),
    });
    setBusy(false);
    if (error) showToast(error.message);
    else {
      showToast(mode === "reopen" ? "Motion reopened — voting is open again" : "Deadline extended — voting is open again");
      onClose();
    }
  }

  return (
    <Modal
      title={mode === "reopen" ? "Reopen this decision" : "Extend the deadline"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={extend} disabled={busy || !valid}>
            {busy ? "Working…" : mode === "reopen" ? "Reopen voting" : "Extend and reopen voting"}
          </button>
        </>
      }
    >
      {mode === "reopen" ? (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{decision.title}</strong> was filed as <strong>{decision.status}</strong>.
          </p>
          <p className="help">
            Reopening makes it an open motion again, with the votes already cast kept as they are.
            Everyone who hasn&apos;t voted is told it&apos;s open, and can vote until the new deadline.
            It then comes back to Decision made, ready for you to file again.
          </p>
        </>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>{decision.title}</strong> reached quorum on <strong>{outcomeName(decision)}</strong>.
          </p>
          <p className="help">
            Extending reopens voting so the rest of the team can vote, and tells everyone who
            hasn&apos;t voted yet. It comes back to Decision made once everyone has voted, or at the
            new deadline if the result stands.
          </p>
        </>
      )}
      <div className="field">
        <label>New deadline</label>
        <input
          className="input"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {!valid && (
          <span className="help" style={{ color: "var(--critical)" }}>
            Choose a date and time in the future.
          </span>
        )}
      </div>
    </Modal>
  );
}

/** Close and file: records the final result and can't be undone. */
export function FileDecisionModal({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const { supabase } = useAppData();
  const showToast = useToast();
  const [busy, setBusy] = useState(false);
  const result = decision.resolved_choice === "no" ? "Failed" : "Passed";

  async function file() {
    setBusy(true);
    const { error } = await supabase.rpc("file_decision", { p_id: decision.id });
    setBusy(false);
    if (error) showToast(error.message);
    else {
      showToast("Decision filed");
      onClose();
    }
  }

  return (
    <Modal
      title="Close and file this decision?"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Not yet
          </button>
          <button className="btn primary" onClick={file} disabled={busy}>
            {busy ? "Filing…" : "Close and file"}
          </button>
        </>
      }
    >
      <p style={{ marginTop: 0 }}>
        <strong>{decision.title}</strong> will be filed as <strong>{result}</strong>
        {decision.resolved_choice && decision.resolved_choice !== "yes" && decision.resolved_choice !== "no"
          ? ` — “${decision.resolved_choice}” won`
          : ""}
        .
      </p>
      <p className="help">
        It moves to the committee&apos;s record with its votes. It can&apos;t be reopened after that;
        if more votes are needed, use <strong>Extend the deadline</strong> instead.
      </p>
    </Modal>
  );
}

/** Add a task for the result, optionally filing the decision at the same time. */
export function DecisionTaskModal({ decision, onClose }: { decision: Decision; onClose: () => void }) {
  const { supabase, userId, profiles, groupMembers } = useAppData();
  const showToast = useToast();
  const outcome = outcomeName(decision);
  const [title, setTitle] = useState(`Action: ${decision.title}`);
  const [description, setDescription] = useState(
    `Following the decision "${decision.title}" (${outcome}).\n\n${decision.motion_text}`
  );
  const [due, setDue] = useState("");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [alsoFile, setAlsoFile] = useState(true);
  const [busy, setBusy] = useState(false);

  const members = useMemo(
    () =>
      Object.values(groupMembers)
        .filter((gm) => gm.group_id === decision.group_id)
        .map((gm) => profiles[gm.member_id])
        .filter((p) => !!p && p.active),
    [groupMembers, profiles, decision.group_id]
  );

  async function add() {
    if (!title.trim() || !userId) return;
    setBusy(true);
    const taskId = crypto.randomUUID();
    const { error } = await supabase.from("tasks").insert({
      id: taskId,
      group_id: decision.group_id,
      space_id: decision.space_id,
      topic_id: decision.topic_id,
      decision_id: decision.id,
      title: title.trim(),
      description: description.trim() || null,
      due_date: due || null,
      created_by: userId,
    });
    if (error) {
      setBusy(false);
      showToast(error.message);
      return;
    }
    if (assignees.length > 0) {
      const { error: aErr } = await supabase
        .from("task_assignees")
        .insert(assignees.map((member_id) => ({ task_id: taskId, member_id })));
      if (aErr) showToast("Task added, but assigning people failed: " + aErr.message);
    }
    if (alsoFile) {
      const { error: fErr } = await supabase.rpc("file_decision", { p_id: decision.id });
      if (fErr) showToast("Task added, but the decision couldn't be filed: " + fErr.message);
      else showToast("Task added and decision filed");
    } else {
      showToast("Task added — the decision is still waiting for you");
    }
    setBusy(false);
    onClose();
  }

  return (
    <Modal
      title="Add a task for the result"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={add} disabled={busy || !title.trim()}>
            {busy ? "Adding…" : "Add task"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Task</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </div>
      <div className="field">
        <label>Details</label>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Due date (optional)</label>
        <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
      </div>
      <div className="field">
        <label>Assign to</label>
        <AssigneePicker members={members} value={assignees} onChange={setAssignees} />
      </div>
      <label className="row" style={{ gap: 8 }}>
        <input type="checkbox" checked={alsoFile} onChange={(e) => setAlsoFile(e.target.checked)} />
        <span>
          Then close and file the decision
          <span className="help" style={{ display: "block" }}>
            Untick to keep it in Decision made, for example to add more tasks first.
          </span>
        </span>
      </label>
    </Modal>
  );
}
