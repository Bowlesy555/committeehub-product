import { useEffect, useState } from "react";
import { useAppData } from "@/lib/data-store";

/** True when every word typed appears somewhere in the given text. */
export function matchesQuery(query: string, ...fields: (string | null | undefined)[]): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.filter(Boolean).join(" ").toLowerCase();
  return words.every((w) => haystack.includes(w));
}

export const MIN_MESSAGE_SEARCH_CHARS = 3;

// Message text can carry formatting markers ("**bold**", "[red]...[/red]");
// they're noise in a one-line preview.
function plain(text: string): string {
  return text
    .replace(/\[\/?(?:red|amber|green|blue)\]/g, "")
    .replace(/\*\*|__|\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function snippetAround(text: string, query: string): string {
  const t = plain(text);
  const i = t.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return t.slice(0, 100);
  const start = Math.max(0, i - 35);
  const end = Math.min(t.length, i + query.length + 65);
  return (start > 0 ? "…" : "") + t.slice(start, end) + (end < t.length ? "…" : "");
}

export interface MessageHit {
  count: number;
  snippet: string;
}

/**
 * Finds rooms and chats whose messages contain what was typed. It asks the
 * database directly (so it reaches messages from rooms that aren't open on
 * screen), and the usual read rules apply: only messages in rooms the person
 * can see ever come back. Waits for a pause in typing and for 3+ characters.
 */
export function useMessageSearch(query: string): Record<string, MessageHit> {
  const { supabase } = useAppData();
  const q = query.trim();
  const [result, setResult] = useState<{ q: string; hits: Record<string, MessageHit> }>({
    q: "",
    hits: {},
  });

  useEffect(() => {
    if (q.length < MIN_MESSAGE_SEARCH_CHARS) return;
    let active = true;
    const timer = setTimeout(async () => {
      const pattern = "%" + q.replace(/[\\%_]/g, (c) => "\\" + c) + "%";
      const { data } = await supabase
        .from("messages")
        .select("space_id, text, created_at")
        .ilike("text", pattern)
        .order("created_at", { ascending: false })
        .limit(300);
      if (!active) return;
      const hits: Record<string, MessageHit> = {};
      for (const m of data ?? []) {
        const existing = hits[m.space_id];
        if (existing) existing.count++;
        else hits[m.space_id] = { count: 1, snippet: snippetAround(m.text, q) };
      }
      setResult({ q, hits });
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [q, supabase]);

  // Ignore results that belong to an older or shorter query.
  return q.length >= MIN_MESSAGE_SEARCH_CHARS && result.q === q ? result.hits : {};
}
