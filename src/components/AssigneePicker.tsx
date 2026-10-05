"use client";

import type { Profile } from "@/types";

/** Pick any number of people from a group: chosen people show as chips, the
 *  dropdown lists everyone not chosen yet. */
export function AssigneePicker({
  members,
  value,
  onChange,
}: {
  members: Profile[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const remaining = members
    .filter((m) => !value.includes(m.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      {value.length > 0 && (
        <div className="row wrap" style={{ marginBottom: 8 }}>
          {value.map((id) => {
            const person = members.find((m) => m.id === id);
            return (
              <span className="chip" key={id}>
                {person?.name || "Former member"}
                <button
                  type="button"
                  aria-label={`Remove ${person?.name || "person"}`}
                  onClick={() => onChange(value.filter((v) => v !== id))}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className="row">
        <select
          className="select"
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...value, e.target.value]);
          }}
        >
          <option value="">
            {value.length === 0 ? "Pick someone…" : "Add another…"}
          </option>
          {remaining.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {remaining.length > 0 && (
          <button
            type="button"
            className="btn sm"
            style={{ whiteSpace: "nowrap" }}
            onClick={() => onChange([...value, ...remaining.map((m) => m.id)])}
          >
            Assign everyone
          </button>
        )}
      </div>
    </div>
  );
}
