"use client";

import { useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { isGoogleDriveUrl } from "@/lib/documents";
import type { DocumentLink } from "@/types";

/** What a document can be attached to: a room (optionally one of its topics), a task, or a decision. */
export interface DocTarget {
  space_id?: string;
  topic_id?: string | null;
  task_id?: string;
  decision_id?: string;
}

export function linkMatches(l: DocumentLink, t: DocTarget): boolean {
  if (t.space_id) return l.space_id === t.space_id && (l.topic_id ?? null) === (t.topic_id ?? null);
  if (t.task_id) return l.task_id === t.task_id;
  if (t.decision_id) return l.decision_id === t.decision_id;
  return false;
}

/** The documents attached to something, as clickable chips, with an inline
 *  panel to attach another (an existing Documents-tab link, or a new Drive link). */
export function AttachedDocuments({
  groupId,
  target,
  label = "Documents",
  readOnly = false,
}: {
  groupId: string;
  target: DocTarget;
  label?: string;
  readOnly?: boolean;
}) {
  const { documents, documentLinks, userId, isGroupAdmin, supabase } = useAppData();
  const showToast = useToast();
  const [open, setOpen] = useState(false);
  const [pickId, setPickId] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const links = Object.values(documentLinks).filter((l) => linkMatches(l, target));
  const linkedIds = new Set(links.map((l) => l.document_id));
  const available = Object.values(documents)
    .filter((d) => d.group_id === groupId && !linkedIds.has(d.id))
    .sort((a, b) => a.title.localeCompare(b.title));
  const newValid = !!title.trim() && isGoogleDriveUrl(url);

  if (readOnly && links.length === 0) return null;

  function reset() {
    setOpen(false);
    setPickId("");
    setTitle("");
    setUrl("");
  }

  async function attach() {
    if (!userId || (!pickId && !newValid)) return;
    setBusy(true);
    let documentId = pickId;
    if (!documentId) {
      const { data, error } = await supabase
        .from("documents")
        .insert({ group_id: groupId, title: title.trim(), url: url.trim(), added_by: userId })
        .select()
        .single();
      if (error || !data) {
        setBusy(false);
        showToast(error?.message || "Couldn't add that document");
        return;
      }
      documentId = data.id;
    }
    const { error } = await supabase.from("document_links").insert({
      document_id: documentId,
      linked_by: userId,
      space_id: target.space_id ?? null,
      topic_id: target.space_id ? (target.topic_id ?? null) : null,
      task_id: target.task_id ?? null,
      decision_id: target.decision_id ?? null,
    });
    setBusy(false);
    if (error) showToast(error.message);
    else {
      showToast("Document attached");
      reset();
    }
  }

  async function detach(linkId: string) {
    const { error } = await supabase.from("document_links").delete().eq("id", linkId);
    if (error) showToast(error.message);
  }

  return (
    <div style={{ margin: "8px 0" }}>
      <div className="row wrap" style={{ gap: 6 }}>
        <span className="help">📎 {label}</span>
        {links.map((l) => {
          const d = documents[l.document_id];
          if (!d) return null;
          const canRemove = !readOnly && (l.linked_by === userId || isGroupAdmin(groupId));
          return (
            <span className="chip" key={l.id}>
              <a href={d.url} target="_blank" rel="noopener noreferrer">
                {d.title}
              </a>
              {canRemove && (
                <button type="button" aria-label={`Detach ${d.title}`} onClick={() => detach(l.id)}>
                  ✕
                </button>
              )}
            </span>
          );
        })}
        {!readOnly && (
          <button type="button" className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
            + Attach document
          </button>
        )}
      </div>
      {open && !readOnly && (
        <div className="card pad" style={{ marginTop: 8 }}>
          {available.length > 0 && (
            <div className="field">
              <label>Choose a document from this group</label>
              <select className="select" value={pickId} onChange={(e) => setPickId(e.target.value)}>
                <option value="">— pick one —</option>
                {available.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!pickId && (
            <>
              <div className="field">
                <label>{available.length > 0 ? "…or add a new one — title" : "Title"}</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Membership form (draft 3)"
                />
              </div>
              <div className="field">
                <label>Google Drive link only</label>
                <input
                  className="input"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://drive.google.com/… or https://docs.google.com/…"
                />
                {url.trim() && !isGoogleDriveUrl(url) && (
                  <span className="help" style={{ color: "var(--critical)" }}>
                    That doesn&apos;t look like a Google Drive link.
                  </span>
                )}
                <span className="help">
                  A new one is also added to the Documents tab for this group.
                </span>
              </div>
            </>
          )}
          <div className="row" style={{ gap: 6 }}>
            <button
              type="button"
              className="btn primary sm"
              onClick={attach}
              disabled={busy || (!pickId && !newValid)}
            >
              {busy ? "Attaching…" : "Attach"}
            </button>
            <button type="button" className="btn sm" onClick={reset}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
