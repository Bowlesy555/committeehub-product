"use client";

import { SORT_LABELS, type SortMode } from "@/lib/sort";

export function SortSelect({
  value,
  onChange,
  options,
}: {
  value: SortMode;
  onChange: (m: SortMode) => void;
  options: readonly SortMode[];
}) {
  return (
    <label className="row" style={{ gap: 6 }}>
      <span className="help">Sort</span>
      <select
        className="select"
        style={{ width: "auto", fontSize: 12, padding: "4px 8px" }}
        value={value}
        onChange={(e) => onChange(e.target.value as SortMode)}
        aria-label="Sort order"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {SORT_LABELS[m]}
          </option>
        ))}
      </select>
    </label>
  );
}
