import type { ReactNode } from "react";

// Messages stay plain text in the database. Formatting is a tiny marker
// syntax that's turned into React elements here -- never HTML -- so a
// message can't inject anything, and an unmatched marker just shows as text.
//   **bold**   *italic*   __underline__   [red]coloured[/red]
export const TEXT_COLOURS = [
  { name: "red", label: "Red", css: "var(--critical)" },
  { name: "amber", label: "Amber", css: "var(--warn)" },
  { name: "green", label: "Green", css: "var(--good)" },
  { name: "blue", label: "Blue", css: "var(--info)" },
] as const;

const COLOUR_CSS: Record<string, string> = Object.fromEntries(
  TEXT_COLOURS.map((c) => [c.name, c.css])
);

const PATTERNS: { re: RegExp; wrap: (inner: ReactNode, m: RegExpExecArray, key: number) => ReactNode }[] = [
  {
    re: /\[(red|amber|green|blue)\]([\s\S]+?)\[\/\1\]/,
    wrap: (inner, m, key) => (
      <span key={key} style={{ color: COLOUR_CSS[m[1]] }}>
        {inner}
      </span>
    ),
  },
  { re: /\*\*([\s\S]+?)\*\*/, wrap: (inner, _m, key) => <strong key={key}>{inner}</strong> },
  { re: /__([\s\S]+?)__/, wrap: (inner, _m, key) => <u key={key}>{inner}</u> },
  { re: /\*([^*\n]+?)\*/, wrap: (inner, _m, key) => <em key={key}>{inner}</em> },
];

function innerOf(m: RegExpExecArray): string {
  return m[2] !== undefined ? m[2] : m[1];
}

// Web addresses become real links. Only http(s) is matched, so nothing like
// "javascript:" can ever become clickable. They're swapped for placeholders
// before the formatting markers are parsed, so an address containing "__" or
// "*" isn't mangled, then turned into links when the text is rendered.
// An address stops at whitespace or the start of a closing [/colour] tag, and
// loses any trailing punctuation or formatting markers (so "**https://x**" and
// "see https://x." both link to https://x).
const URL_RE = /https?:\/\/(?:(?!\[\/)[^\s<>])+/g;
const TRAILING_PUNCT = /[.,;:!?'")\]}*_]+$/;
const PLACEHOLDER_RE = /\uE000(\d+)\uE001/;

function linkify(segment: string, urls: string[]): ReactNode[] {
  if (!segment) return [];
  return segment.split(new RegExp(PLACEHOLDER_RE.source, "g")).map((part, i) => {
    if (i % 2 === 0) return part;
    const url = urls[Number(part)];
    return (
      <a key={`url-${part}-${i}`} href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    );
  });
}

export function renderRichText(text: string): ReactNode[] {
  const urls: string[] = [];
  const protectedText = text.replace(URL_RE, (match) => {
    const trailing = TRAILING_PUNCT.exec(match)?.[0] ?? "";
    const url = trailing ? match.slice(0, -trailing.length) : match;
    if (!url) return match;
    urls.push(url);
    return `\uE000${urls.length - 1}\uE001${trailing}`;
  });
  return renderParts(protectedText, urls);
}

function renderParts(text: string, urls: string[]): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let key = 0;
  while (rest) {
    let best: { m: RegExpExecArray; i: number } | null = null;
    PATTERNS.forEach((p, i) => {
      const m = p.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { m, i };
    });
    if (!best) {
      out.push(...linkify(rest, urls));
      break;
    }
    const { m, i } = best as { m: RegExpExecArray; i: number };
    if (m.index > 0) out.push(...linkify(rest.slice(0, m.index), urls));
    out.push(PATTERNS[i].wrap(renderParts(innerOf(m), urls), m, key++));
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

/** True when the text contains any formatting markers worth previewing. */
export function hasFormatting(text: string): boolean {
  return PATTERNS.some((p) => p.re.test(text));
}

/** Wraps the current selection (or the caret position) of a textarea in markers. */
export function wrapSelection(
  el: HTMLTextAreaElement,
  open: string,
  close: string,
  setValue: (v: string) => void
) {
  const { selectionStart, selectionEnd, value } = el;
  const selected = value.slice(selectionStart, selectionEnd);
  setValue(value.slice(0, selectionStart) + open + selected + close + value.slice(selectionEnd));
  // Put the selection (or caret) back inside the markers once React re-renders.
  setTimeout(() => {
    el.focus();
    el.setSelectionRange(selectionStart + open.length, selectionStart + open.length + selected.length);
  }, 0);
}
