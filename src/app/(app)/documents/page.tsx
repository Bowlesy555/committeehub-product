"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { timeAgo } from "@/lib/format";
import { isGoogleDriveUrl } from "@/lib/documents";
import { roomLink } from "@/lib/rooms";
import { Modal } from "@/components/Modal";
import { LibraryItemModal } from "@/components/LibraryItemModal";
import type { Document } from "@/types";

export default function DocumentsPage() {
  const {
    groups,
    documents,
    documentLinks,
    libraryItems,
    spaces,
    spaceTopics,
    tasks,
    decisions,
    profiles,
    myGroupIds,
    userId,
    isGroupAdmin,
    supabase,
  } = useAppData();
  const showToast = useToast();

  const [creating, setCreating] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // The document being offered to the Library.
  const [promoting, setPromoting] = useState<Document | null>(null);

  const [editing, setEditing] = useState<Document | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const byGroup = myGroupIds
    .map((gid) => ({
      group: groups[gid],
      docs: Object.values(documents)
        .filter((d) => d.group_id === gid)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    }))
    .filter((g) => g.group)
    .sort((a, b) => a.group.name.localeCompare(b.group.name));

  function openCreate() {
    setGroupId(myGroupIds[0] || "");
    setTitle("");
    setUrl("");
    setCreating(true);
  }

  const urlValid = !url.trim() || isGoogleDriveUrl(url);

  async function addDocument() {
    if (!title.trim() || !groupId || !isGoogleDriveUrl(url) || !userId) return;
    setSaving(true);
    const { error } = await supabase.from("documents").insert({
      group_id: groupId,
      title: title.trim(),
      url: url.trim(),
      added_by: userId,
    });
    setSaving(false);
    if (error) {
      showToast(error.message);
    } else {
      showToast("Document added");
      setCreating(false);
    }
  }

  // Everything a document is attached to, as links back to it.
  function attachmentsOf(documentId: string) {
    const out: { key: string; icon: string; label: string; href: string }[] = [];
    for (const l of Object.values(documentLinks)) {
      if (l.document_id !== documentId) continue;
      if (l.space_id && spaces[l.space_id]) {
        const topic = l.topic_id ? spaceTopics[l.topic_id] : null;
        out.push({
          key: l.id,
          icon: "💬",
          label: spaces[l.space_id].name + (topic ? ` › ${topic.name}` : ""),
          href: roomLink(l.space_id, l.topic_id),
        });
      } else if (l.task_id && tasks[l.task_id]) {
        out.push({ key: l.id, icon: "✅", label: tasks[l.task_id].title, href: "/tasks" });
      } else if (l.decision_id && decisions[l.decision_id]) {
        out.push({ key: l.id, icon: "🗳️", label: decisions[l.decision_id].title, href: "/decisions" });
      }
    }
    return out;
  }

  const normUrl = (u: string) => u.trim().replace(/\/+$/, "").toLowerCase();
  // Library items I can see that already point at this file.
  const inLibrary = (d: Document) =>
    Object.values(libraryItems).some((i) => normUrl(i.url) === normUrl(d.url));

  function openEdit(d: Document) {
    setEditing(d);
    setEditTitle(d.title);
    setEditUrl(d.url);
  }

  async function saveEdit() {
    if (!editing || !editTitle.trim() || !isGoogleDriveUrl(editUrl)) return;
    setEditSaving(true);
    const { error } = await supabase
      .from("documents")
      .update({ title: editTitle.trim(), url: editUrl.trim() })
      .eq("id", editing.id);
    setEditSaving(false);
    if (error) showToast(error.message);
    else {
      showToast("Document updated");
      setEditing(null);
    }
  }

  async function removeDocument(id: string) {
    const { error } = await supabase.from("documents").delete().eq("id", id);
    if (error) showToast(error.message);
  }

  return (
    <div>
      <div className="section-title">
        <h2>Documents</h2>
        <button className="btn primary sm" onClick={openCreate}>
          + Add document
        </button>
      </div>
      <p className="section-desc">
        Links to files kept in Google Drive — CommitteeHub only stores where to find them, not
        the files themselves. Anyone opening a link will still need Google Drive access to it.
      </p>

      {byGroup.length === 0 && (
        <div className="card">
          <div className="empty">You&apos;re not in any groups yet.</div>
        </div>
      )}

      {byGroup.map(({ group, docs }) => (
        <div key={group.id} style={{ marginBottom: 18 }}>
          <div className="group-head" style={{ marginBottom: 6 }}>
            {group.name}
          </div>
          <div className="card">
            {docs.length === 0 ? (
              <div className="empty">No documents yet.</div>
            ) : (
              docs.map((d) => (
                <div className="list-row" key={d.id} style={{ cursor: "default" }}>
                  <div className="main">
                    <div className="t">
                      <a href={d.url} target="_blank" rel="noopener noreferrer">
                        📄 {d.title}
                      </a>
                    </div>
                    <div className="s">
                      Added by {profiles[d.added_by || ""]?.name || "someone"} ·{" "}
                      {timeAgo(d.created_at)}
                    </div>
                    {attachmentsOf(d.id).length > 0 && (
                      <div className="s">
                        <span>📎 Attached to:</span>
                        {attachmentsOf(d.id).map((a) => (
                          <Link key={a.key} href={a.href} className="hint">
                            {a.icon} {a.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {inLibrary(d) ? (
                      <span className="badge">📚 In Library</span>
                    ) : (
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => setPromoting(d)}
                      >
                        Add to Library
                      </button>
                    )}
                    {(isGroupAdmin(d.group_id) || d.added_by === userId) && (
                      <>
                      <button type="button" className="btn ghost sm" onClick={() => openEdit(d)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        onClick={() => removeDocument(d.id)}
                      >
                        Remove
                      </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ))}

      {promoting && (
        <LibraryItemModal
          key={promoting.id}
          prefill={{ title: promoting.title, url: promoting.url, groupIds: [promoting.group_id] }}
          onClose={() => setPromoting(null)}
        />
      )}

      {editing && (
        <Modal
          title="Edit document"
          onClose={() => setEditing(null)}
          footer={
            <>
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={saveEdit}
                disabled={editSaving || !editTitle.trim() || !isGoogleDriveUrl(editUrl)}
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
            <label>Google Drive link only</label>
            <input
              className="input"
              type="url"
              value={editUrl}
              onChange={(e) => setEditUrl(e.target.value)}
            />
            {editUrl.trim() && !isGoogleDriveUrl(editUrl) && (
              <span className="help" style={{ color: "var(--critical)" }}>
                That doesn&apos;t look like a Google Drive link.
              </span>
            )}
          </div>
        </Modal>
      )}

      {creating && (
        <Modal
          title="Add document"
          onClose={() => setCreating(false)}
          footer={
            <>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={addDocument}
                disabled={saving || !title.trim() || !groupId || !isGoogleDriveUrl(url)}
              >
                {saving ? "Adding…" : "Add"}
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
              placeholder="e.g. Committee Meeting Minutes — March 2027"
              autoFocus
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
            {!urlValid && (
              <span className="help" style={{ color: "var(--critical)" }}>
                That doesn&apos;t look like a Google Drive link — copy the &ldquo;Share&rdquo;
                link from Google Drive, Docs, Sheets or Slides.
              </span>
            )}
            <span className="help">
              This only stores the link. The file itself stays in Google Drive, and it must
              already be shared with whoever needs to open it from here.
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
