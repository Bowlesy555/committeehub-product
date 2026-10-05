export function initials(name: string | null | undefined): string {
  const parts = String(name || "?").trim().split(/\s+/);
  return (
    ((parts[0] || "")[0] || "?").toUpperCase() +
    ((parts[1] || "")[0] || "").toUpperCase()
  );
}

function hueFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  return h;
}

export function colorFor(id: string): string {
  return `hsl(${hueFor(id)}, 42%, 38%)`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// What a <input type="datetime-local"> expects: the viewer's LOCAL time as
// YYYY-MM-DDTHH:mm. (Slicing the stored UTC string would show the wrong hour
// in summer time and shift the value when saved.)
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export function firstName(name: string | null | undefined): string {
  return String(name || "").trim().split(/\s+/)[0] || "there";
}

export function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return Math.floor(s / 60) + "m ago";
  if (s < 86400) return Math.floor(s / 3600) + "h ago";
  if (s < 86400 * 7) return Math.floor(s / 86400) + "d ago";
  return fmtDate(iso);
}

export function truncate(text: string, maxLen = 140): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > maxLen ? t.slice(0, maxLen).trim() + "…" : t;
}

export function countdownText(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "Deadline passed";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `Closes in ${mins}m`;
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `Closes in ${hours}h`;
  const days = Math.round(ms / 86400000);
  return `Closes in ${days}d`;
}
