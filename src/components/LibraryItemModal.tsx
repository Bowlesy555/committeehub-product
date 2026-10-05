"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { isGoogleDriveUrl } from "@/lib/documents";
import { Modal } from "@/components/Modal";
import type { LibraryItem } from "@/types";

/** Add a Library item, edit one, or add one pre-filled from something else
 *  (e.g. promoting a document from the Documents tab). */
export function LibraryItemModal({
  item,
  prefill,
  onClose,
}: {
  /** The item being edited; omit to add a new one. */
  item?: LibraryItem;
  /** Starting values for a new item. */
  prefill?: { title?: string; url?: string; groupIds?: string[] };
  onClose: () => void;
}) {
  const { groups, libraryItems, libraryItemGroups, myGroupIds, userId, supabase } = useAppData();
  const showToast = useToast();

  const myGroupSet = useMemo(() => new Set(myGroupIds), [myGroupIds]);
  const currentGroups = useMemo(
    () =>
      item
        ? Object.values(libraryItemGroups)
            .filter((l) => l.item_id === item.id)
            .map((l) => l.group_id)
        : [],
    [item, libraryItemGroups]
  );

  const [title, setTitle] = useState(item?.title ?? prefill?.title ?? "");
  const [url, setUrl] = useState(item?.url ?? prefill?.url ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [category, setCategory] = useState(item?.category ?? "");
  const [shareWith, setShareWith] = useState<string[]>(() => {
    if (item) return currentGroups.filter((g) => myGroupSet.has(g));
    const start = (prefill?.groupIds ?? []).filter((g) => myGroupSet.has(g));
    if (start.length) return start;
    return myGroupIds.length === 1 ? [...myGroupIds] : [];
  });
  const [saving, setSaving] = useState(false);

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const i of Object.values(libraryItems)) if (i.category) names.add(i.category);
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [libraryItems]);

  function toggleGroup(gid: string) {
    setShareWith((cur) => (cur.includes(gid) ? cur.filter((g) => g !== gid) : [...cur, gid]));
  }

  // Reuse an existing category's spelling when someone types it in another case.
  function normalisedCategory(): string | null {
    const c = category.trim();
    if (!c) return null;
    return categories.find((x) => x.toLowerCase() === c.toLowerCase()) || c;
  }

  // Groups the item is shared with that I'm not in -- I can't change those.
  const hiddenShares = currentGroups.filter((g) => !myGroupSet.has(g)).length;
  const urlValid = !url.trim() || isGoogleDriveUrl(url);
  // An item must stay shared with at least one group (an edit that can only
  // touch my groups may still leave it shared with others).
  const canSave =
    !!title.trim() && isGoogleDriveUrl(url) && (shareWith.length > 0 || hiddenShares > 0);

  async function save() {
    if (!userId || !canSave) return;
    setSaving(true);
    const fields = {
      title: title.trim(),
      url: url.trim(),
      description: description.trim() || null,
      category: normalisedCategory(),
    };
    const now = new Date().toISOString();
    let error: { message: string } | null = null;

    if (!item) {
      // A client-side id, so we don't need to read the row back (its read
      // policy depends on the share rows that don't exist yet).
      const id = crypto.randomUUID();
      ({ error } = await supabase
        .from("library_items")
        .insert({ id, ...fields, added_by: userId }));
      if (!error) {
        ({ error } = await supabase
          .from("library_item_groups")
          .insert(shareWith.map((group_id) => ({ item_id: id, group_id }))));
      }
      // Other members only see an item once it has share rows, and Realtime
      // judges that at the moment of the event -- so touch the item last to
      // announce it to the groups it was just shared with.
      if (!error) {
        ({ error } = await supabase.from("library_items").update({ updated_at: now }).eq("id", id));
      }
    } else {
      const current = currentGroups.filter((g) => myGroupSet.has(g));
      const toAdd = shareWith.filter((g) => !current.includes(g));
      const toRemove = current.filter((g) => !shareWith.includes(g));
      if (toAdd.length) {
        ({ error } = await supabase
          .from("library_item_groups")
          .insert(toAdd.map((group_id) => ({ item_id: item.id, group_id }))));
      }
      if (!error && toRemove.length) {
        ({ error } = await supabase
          .from("library_item_groups")
          .delete()
          .eq("item_id", item.id)
          .in("group_id", toRemove));
      }
      if (!error) {
        ({ error } = await supabase
          .from("library_items")
          .update({ ...fields, updated_at: now })
          .eq("id", item.id));
      }
    }

    setSaving(false);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast(item ? "Library item updated" : "Added to the Library");
    onClose();
  }

  return (
    <Modal
      title={item ? "Edit Library item" : "Add to Library"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={saving || !canSave}>
            {saving ? "Saving…" : item ? "Save" : "Add"}
          </button>
        </>
      }
    >
      <div className="field">
        <label>Title</label>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Constitution — July 2026"
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
            That doesn&apos;t look like a Google Drive link — copy the &ldquo;Share&rdquo; link
            from Google Drive, Docs, Sheets or Slides.
          </span>
        )}
      </div>
      <div className="field">
        <label>Description (optional)</label>
        <textarea
          className="textarea"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this, and when would someone need it?"
        />
      </div>
      <div className="field">
        <label>Category (optional)</label>
        <input
          className="input"
          list="library-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="e.g. Rules, Forms, Policies — pick one or type a new one"
        />
        <datalist id="library-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label>Shared with</label>
        <div className="filter-chips" style={{ marginBottom: 4 }}>
          {myGroupIds.map((gid) => (
            <button
              key={gid}
              type="button"
              className={`tag-check${shareWith.includes(gid) ? " on" : ""}`}
              onClick={() => toggleGroup(gid)}
              aria-pressed={shareWith.includes(gid)}
            >
              {groups[gid]?.name}
            </button>
          ))}
        </div>
        <span className="help">
          Only members of the groups you tick can see this item.
          {hiddenShares > 0 &&
            ` It's also shared with ${hiddenShares} other group${hiddenShares === 1 ? "" : "s"} you're not in; those stay as they are.`}
        </span>
        {shareWith.length === 0 && hiddenShares === 0 && (
          <span className="help" style={{ color: "var(--critical)" }}>
            Choose at least one group.
          </span>
        )}
      </div>
    </Modal>
  );
}
