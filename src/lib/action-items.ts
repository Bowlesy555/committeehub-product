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

// The defaults match a typical committee action log: Ref | Action description |
// Owner | Priority | Deadline | Status | Notes / update. A recognised header
// row is matched by these (normalised) names so column order can vary;
// anything else falls back to the positional order.
//
// Every committee lays its action log out differently, so each of these
// tables can be replaced per deployment by NEXT_PUBLIC_MINUTES_IMPORT_PROFILE
// (JSON, same shape as ImportProfile) -- calibrated against that committee's
// real template rather than by editing this file.
type ImportProfile = {
  headerAliases: Record<string, string[]>;
  positionalColumns: string[];
  // Each list is matched as "the cell contains any of these words".
  priorityWords: { high: string[]; low: string[] };
  statusWords: { doing: string[]; done: string[]; blocked: string[] };
};

const DEFAULT_PROFILE: ImportProfile = {
  headerAliases: {
    description: ["action description", "action", "description", "item", "task"],
    owner: ["owner", "assignee", "who", "responsible"],
    priority: ["priority", "pri"],
    deadline: ["deadline", "due", "due date", "date"],
    status: ["status"],
    notes: ["notes", "notes / update", "update", "comments"],
  },
  positionalColumns: ["ref", "description", "owner", "priority", "deadline", "status", "notes"],
  priorityWords: { high: ["h"], low: ["l"] },
  statusWords: { doing: ["progress"], done: ["done", "complete"], blocked: ["block"] },
};

function loadProfile(): ImportProfile {
  const raw = process.env.NEXT_PUBLIC_MINUTES_IMPORT_PROFILE;
  if (!raw) return DEFAULT_PROFILE;
  try {
    const custom = JSON.parse(raw) as Partial<ImportProfile>;
    return {
      headerAliases: { ...DEFAULT_PROFILE.headerAliases, ...custom.headerAliases },
      positionalColumns: custom.positionalColumns ?? DEFAULT_PROFILE.positionalColumns,
      priorityWords: { ...DEFAULT_PROFILE.priorityWords, ...custom.priorityWords },
      statusWords: { ...DEFAULT_PROFILE.statusWords, ...custom.statusWords },
    };
  } catch {
    console.warn("NEXT_PUBLIC_MINUTES_IMPORT_PROFILE is not valid JSON -- using the default profile");
    return DEFAULT_PROFILE;
  }
}

const PROFILE = loadProfile();

/** False until this deployment has a profile matched to the committee's own
 *  minutes, so the import can say it is still on the standard layout. */
export const importIsCalibrated = !!process.env.NEXT_PUBLIC_MINUTES_IMPORT_PROFILE;
const HEADER_ALIASES = PROFILE.headerAliases;
const POSITIONAL_COLUMNS = PROFILE.positionalColumns;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t");
  if (/ {2,}/.test(line)) return line.split(/ {2,}/);
  return [line];
}

// One line of a .csv file: commas separate cells, except inside "quotes".
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
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
  if (PROFILE.priorityWords.high.some((w) => v.startsWith(w))) return "high";
  if (PROFILE.priorityWords.low.some((w) => v.startsWith(w))) return "low";
  return "normal";
}

function parseStatus(s: string): TaskStatus {
  const v = s.trim().toLowerCase();
  const { doing, done, blocked } = PROFILE.statusWords;
  if (doing.some((w) => v.includes(w))) return "doing";
  if (done.some((w) => v.includes(w))) return "done";
  if (blocked.some((w) => v.includes(w))) return "blocked";
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

  // Text pasted from a spreadsheet is tab-separated. The text of a .csv file
  // (the downloadable example, opened in a text editor) is comma-separated;
  // it's only treated that way when its first line is a recognisable header,
  // so a pasted list of sentences with commas in them isn't cut up.
  const isCsv = !lines.some((l) => l.includes("\t")) && detectHeader(splitCsvRow(lines[0])) !== null;
  let rows = lines.map(isCsv ? splitCsvRow : splitRow);
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
