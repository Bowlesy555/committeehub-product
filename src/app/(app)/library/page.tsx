"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";
import { timeAgo } from "@/lib/format";
import { compareBy, usePersistedSort, type SortMode } from "@/lib/sort";
import { LibraryItemModal } from "@/components/LibraryItemModal";
import { SortSelect } from "@/components/SortSelect";
import type { LibraryItem } from "@/types";

const LIBRARY_SORTS: readonly SortMode[] = ["az", "za", "created"];
const UNCATEGORISED = "Uncategorised";

export default function LibraryPage() {
  const {
    groups,
    libraryItems,
    libraryItemGroups,
    profiles,
    myGroupIds,
    userId,
    isGroupAdmin,
    supabase,
  } = useAppData();
  const showToast = useToast();

  const [sortMode, setSortMode] = usePersistedSort("sort:library", "az", LIBRARY_SORTS);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [groupFilter, setGroupFilter] = useState<string>("");

  // null = closed, "new" = adding, otherwise the item being edited
  const [editing, setEditing] = useState<LibraryItem | "new" | null>(null);

  // item id -> the groups it's shared with that I can see (I only ever see
  // the share rows of groups I belong to)
  const groupsOf = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const l of Object.values(libraryItemGroups)) (map[l.item_id] ||= []).push(l.group_id);
    return map;
  }, [libraryItemGroups]);

  const myGroupSet = useMemo(() => new Set(myGroupIds), [myGroupIds]);

  // Items I can see: shared with one of my groups, or added by me.
  const mine = useMemo(
    () =>
      Object.values(libraryItems).filter(
        (i) => i.added_by === userId || (groupsOf[i.id] || []).some((g) => myGroupSet.has(g))
      ),
    [libraryItems, groupsOf, myGroupSet, userId]
  );

  const categories = useMemo(() => {
    const names = new Set<string>();
    for (const i of mine) if (i.category) names.add(i.category);
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [mine]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mine
      .filter((i) => !groupFilter || (groupsOf[i.id] || []).includes(groupFilter))
      .filter((i) => !categoryFilter || (i.category || UNCATEGORISED) === categoryFilter)
      .filter(
        (i) =>
          !q ||
          `${i.title} ${i.description || ""} ${i.category || ""}`.toLowerCase().includes(q)
      )
      .sort(
        compareBy<LibraryItem>(sortMode, { name: (i) => i.title, created: (i) => i.created_at })
      );
  }, [mine, groupsOf, search, categoryFilter, groupFilter, sortMode]);

  // Grouped under category headings: named categories A-Z, Uncategorised last.
  const sections = useMemo(() => {
    const by: Record<string, LibraryItem[]> = {};
    for (const i of filtered) (by[i.category || UNCATEGORISED] ||= []).push(i);
    return Object.keys(by)
      .sort((a, b) =>
        a === UNCATEGORISED
          ? 1
          : b === UNCATEGORISED
            ? -1
            : a.localeCompare(b, undefined, { sensitivity: "base" })
      )
      .map((name) => ({ name, items: by[name] }));
  }, [filtered]);

  const canManage = (i: LibraryItem) =>
    i.added_by === userId || (groupsOf[i.id] || []).some((g) => isGroupAdmin(g));

  async function remove(i: LibraryItem) {
    if (!window.confirm(`Remove “${i.title}” from the Library? The file in Google Drive isn't touched.`))
      return;
    const { error } = await supabase.from("library_items").delete().eq("id", i.id);
    if (error) showToast(error.message);
    else showToast("Removed from the Library");
  }

  const chips = ["", ...categories, ...(mine.some((i) => !i.category) ? [UNCATEGORISED] : [])];

  return (
    <div>
      <div className="section-title">
        <h2>Library</h2>
        <button className="btn primary sm" onClick={() => setEditing("new")} disabled={myGroupIds.length === 0}>
          + Add to Library
        </button>
      </div>
      <p className="section-desc">
        Reference documents that a group should all have to hand — rules, policies, forms,
        templates. Each item is shared with the groups you choose, and only their members can
        see it. Links go to Google Drive, so people still need Drive access to open the file.
      </p>

      {mine.length > 0 && (
        <>
          <div className="row wrap" style={{ gap: 8, marginBottom: 10 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 180 }}
              type="search"
              placeholder="Search the Library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the Library"
            />
            {myGroupIds.length > 1 && (
              <select
                className="select"
                style={{ width: "auto" }}
                value={groupFilter}
                onChange={(e) => setGroupFilter(e.target.value)}
                aria-label="Filter by group"
              >
                <option value="">All my groups</option>
                {myGroupIds.map((gid) => (
                  <option key={gid} value={gid}>
                    {groups[gid]?.name}
                  </option>
                ))}
              </select>
            )}
            <SortSelect value={sortMode} onChange={setSortMode} options={LIBRARY_SORTS} />
          </div>

          {categories.length > 0 && (
            <div className="filter-chips">
              {chips.map((c) => (
                <button
                  key={c || "all"}
                  type="button"
                  className={`tag-check${categoryFilter === c ? " on" : ""}`}
                  onClick={() => setCategoryFilter(c)}
                >
                  {c || "All"}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {mine.length === 0 && (
        <div className="card">
          <div className="empty">
            {myGroupIds.length === 0
              ? "You're not in any groups yet."
              : "Nothing in the Library yet — add the first reference document."}
          </div>
        </div>
      )}

      {mine.length > 0 && filtered.length === 0 && (
        <div className="card">
          <div className="empty">Nothing matches.</div>
        </div>
      )}

      {sections.map(({ name, items }) => (
        <div key={name} style={{ marginBottom: 18 }}>
          <div className="group-head" style={{ marginBottom: 6 }}>
            {name} <span className="badge">{items.length}</span>
          </div>
          <div className="card">
            {items.map((i) => {
              const shared = (groupsOf[i.id] || []).filter((g) => myGroupSet.has(g));
              return (
                <div className="list-row" key={i.id} style={{ cursor: "default" }}>
                  <div className="main">
                    <div className="t">
                      <a href={i.url} target="_blank" rel="noopener noreferrer">
                        📄 {i.title}
                      </a>
                    </div>
                    {i.description && <div className="s">{i.description}</div>}
                    <div className="s">
                      {shared.map((g) => (
                        <span key={g} className="badge">
                          {groups[g]?.name}
                        </span>
                      ))}{" "}
                      Added by {profiles[i.added_by || ""]?.name || "someone"} ·{" "}
                      {timeAgo(i.created_at)}
                    </div>
                  </div>
                  {canManage(i) && (
                    <div className="row" style={{ gap: 6 }}>
                      <button type="button" className="btn ghost sm" onClick={() => setEditing(i)}>
                        Edit
                      </button>
                      <button type="button" className="btn ghost sm" onClick={() => remove(i)}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {editing && (
        <LibraryItemModal
          key={editing === "new" ? "new" : editing.id}
          item={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
