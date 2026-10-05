import type { Profile, TaskPriority, TaskStatus } from "@/types";

export type ParsedActionItem = {
  description: string;
  ownerName: string;
  priority: TaskPriority;
  dueDate: string | null; // yyyy-mm-dd, or null if blank/unparseable
  rawDeadline: string;
  status: TaskStatus;
  notes: string;
};

// Matches a typical committee action log template: Ref | Action description |
// Owner | Priority | Deadline | Status | Notes / update. A recognised
// header row is matched by these (normalised) names so column order can
// vary; anything else falls back to this exact positional order.
const HEADER_ALIASES: Record<string, string[]> = {
  description: ["action description", "action", "description", "item", "task"],
  owner: ["owner", "assignee", "who", "responsible"],
  priority: ["priority", "pri"],
  deadline: ["deadline", "due", "due date", "date"],
  status: ["status"],
  notes: ["notes", "notes / update", "update", "comments"],
};

const POSITIONAL_COLUMNS = ["ref", "description", "owner", "priority", "deadline", "status", "notes"];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (/ {2,}/.test(line)) return line.split(/ {2,}/);
  return [line];
}

function detectHeader(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((cell, i) => {
    const norm = normalize(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.some((a) => norm === normalize(a))) map[field] = i;
    }
  });
  return map.description !== undefined ? map : null;
}

function parsePriority(s: string): TaskPriority {
  const v = s.trim().toLowerCase();
  if (v.startsWith("h")) return "high";
  if (v.startsWith("l")) return "low";
  return "normal";
}

function parseStatus(s: string): TaskStatus {
  const v = s.trim().toLowerCase();
  if (v.includes("progress")) return "doing";
  if (v.includes("done") || v.includes("complete")) return "done";
  if (v.includes("block")) return "blocked";
  return "todo";
}

function parseDeadline(s: string): string | null {
  const v = s.trim();
  if (!v) return null;
  let m = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    const [, d, mo, yRaw] = m;
    const y = yRaw.length === 2 ? "20" + yRaw : yRaw;
    const iso = `${y.padStart(4, "0")}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return isNaN(new Date(iso).getTime()) ? null : iso;
  }
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
    return isNaN(new Date(iso).getTime()) ? null : iso;
  }
  return null;
}

/** Parses pasted spreadsheet/table text into action items; blank-description
 *  rows (e.g. unused rows from a template) are dropped. */
export function parseActionItems(text: string): ParsedActionItem[] {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\r$/, ""))
    .filter((l) => l.trim());
  if (!lines.length) return [];

  let rows = lines.map(splitRow);
  let colMap = detectHeader(rows[0]);
  if (colMap) {
    rows = rows.slice(1);
  } else {
    colMap = Object.fromEntries(POSITIONAL_COLUMNS.map((name, i) => [name, i]).filter(([n]) => n !== "ref"));
  }

  const get = (cells: string[], field: string) =>
    colMap![field] !== undefined ? (cells[colMap![field]] || "").trim() : "";

  const items: ParsedActionItem[] = [];
  for (const cells of rows) {
    const description = get(cells, "description");
    if (!description) continue;
    const rawDeadline = get(cells, "deadline");
    items.push({
      description,
      ownerName: get(cells, "owner"),
      priority: parsePriority(get(cells, "priority")),
      dueDate: parseDeadline(rawDeadline),
      rawDeadline,
      status: parseStatus(get(cells, "status")),
      notes: get(cells, "notes"),
    });
  }
  return items;
}

/** Best-effort match of a pasted owner name against a group's members --
 *  exact full-name match first, then a first-name match if it's unambiguous. */
export function matchMember(name: string, members: Profile[]): Profile | null {
  const norm = name.trim().toLowerCase();
  if (!norm) return null;
  const exact = members.find((m) => m.name.trim().toLowerCase() === norm);
  if (exact) return exact;
  const firstToken = norm.split(/\s+/)[0];
  const byFirstName = members.filter((m) => m.name.trim().toLowerCase().split(/\s+/)[0] === firstToken);
  return byFirstName.length === 1 ? byFirstName[0] : null;
}
