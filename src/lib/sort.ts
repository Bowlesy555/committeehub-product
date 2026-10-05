import { useState } from "react";

export type SortMode = "comments" | "created" | "az" | "za";

export const SORT_LABELS: Record<SortMode, string> = {
  comments: "Newest comments",
  created: "Newest created",
  az: "A to Z",
  za: "Z to A",
};

/** A comparator for the chosen mode. `comments` may return null (nothing yet),
 *  in which case that item sorts by when it was created. */
export function compareBy<T>(
  mode: SortMode,
  get: {
    name: (t: T) => string;
    created: (t: T) => string;
    comments?: (t: T) => string | null | undefined;
  }
): (a: T, b: T) => number {
  const time = (iso: string) => new Date(iso).getTime();
  const byName = (a: T, b: T) =>
    get.name(a).localeCompare(get.name(b), undefined, { sensitivity: "base", numeric: true });
  switch (mode) {
    case "az":
      return byName;
    case "za":
      return (a, b) => byName(b, a);
    case "created":
      return (a, b) => time(get.created(b)) - time(get.created(a));
    case "comments":
      return (a, b) =>
        time(get.comments?.(b) ?? get.created(b)) - time(get.comments?.(a) ?? get.created(a));
  }
}

/** Remembers a person's chosen sort per page in this browser. */
export function usePersistedSort(
  key: string,
  initial: SortMode,
  allowed: readonly SortMode[]
): [SortMode, (m: SortMode) => void] {
  const [mode, setMode] = useState<SortMode>(() => {
    try {
      const saved = window.localStorage.getItem(key) as SortMode | null;
      if (saved && allowed.includes(saved)) return saved;
    } catch {
      // storage blocked or unavailable -- fall back to the default
    }
    return initial;
  });
  function choose(next: SortMode) {
    setMode(next);
    try {
      window.localStorage.setItem(key, next);
    } catch {
      // not saved, but the sort still applies for this visit
    }
  }
  return [mode, choose];
}
