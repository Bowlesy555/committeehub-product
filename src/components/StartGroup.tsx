"use client";

import { useState } from "react";
import { useAppData } from "@/lib/data-store";
import { useToast } from "@/lib/toast";

/** Lets a committee member start a small group (a working party) themselves:
 *  they become its admin and can add or remove its members afterwards. The
 *  work is done by a database function that checks they're allowed to. */
export function StartGroup() {
  const { supabase, profiles, userId } = useAppData();
  const showToast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [quorum, setQuorum] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const people = Object.values(profiles)
    .filter((p) => p.active && p.id !== userId)
    .sort((a, b) => a.name.localeCompare(b.name));

  const size = picked.length + 1; // including you
  const majority = Math.floor(size / 2) + 1;
  const effectiveQuorum = Math.min(Math.max(1, quorum ?? majority), size);

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function create() {
    if (!name.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc("create_working_party", {
      p_name: name.trim(),
      p_description: description.trim() || null,
      p_quorum: effectiveQuorum,
      p_member_ids: picked,
    });
    setSaving(false);
    if (error) {
      showToast(error.message);
      return;
    }
    showToast("Group created — you're its admin");
    setName("");
    setDescription("");
    setPicked([]);
    setQuorum(null);
  }

  return (
    <>
      <div className="section-title">
        <h2>Start a group</h2>
      </div>
      <div className="card pad" style={{ marginBottom: 18 }}>
        <p className="help" style={{ marginBottom: 10 }}>
          For a small working party. You become its admin, and can add or remove members later
          from your groups below. The group gets its own rooms, motions and tasks, visible only
          to its members.
        </p>
        <div className="row wrap">
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label>Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Awards Working Party"
            />
          </div>
          <div className="field" style={{ flex: 2, minWidth: 200 }}>
            <label>What it&apos;s for (optional)</label>
            <input
              className="input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label>Members</label>
          <div className="filter-chips" style={{ marginBottom: 4 }}>
            {people.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`tag-check${picked.includes(p.id) ? " on" : ""}`}
                onClick={() => toggle(p.id)}
                aria-pressed={picked.includes(p.id)}
              >
                {p.name}
              </button>
            ))}
          </div>
          <span className="help">You&apos;re included automatically. {size} in the group so far.</span>
        </div>
        <div className="row wrap" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ width: 160 }}>
            <label>Votes needed</label>
            <input
              className="input"
              type="number"
              min={1}
              max={size}
              value={effectiveQuorum}
              onChange={(e) => setQuorum(Number(e.target.value))}
            />
          </div>
          <span className="help" style={{ flex: 1, minWidth: 200 }}>
            How many votes a motion in this group needs to be decided. A simple majority of{" "}
            {size} is {majority}.
          </span>
          <button className="btn primary" onClick={create} disabled={saving || !name.trim()}>
            {saving ? "Creating…" : "Create group"}
          </button>
        </div>
      </div>
    </>
  );
}
