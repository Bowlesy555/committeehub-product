"use client";

import type { RefObject } from "react";
import { TEXT_COLOURS, wrapSelection } from "@/lib/rich-text";

export function FormatBar({
  textareaRef,
  onChange,
}: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChange: (value: string) => void;
}) {
  function apply(open: string, close: string) {
    if (textareaRef.current) wrapSelection(textareaRef.current, open, close, onChange);
  }

  // onMouseDown + preventDefault keeps focus (and the highlighted text) in
  // the box when a button is pressed, so the selection is still there to wrap.
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="format-bar" role="toolbar" aria-label="Text formatting">
      <button type="button" className="fmt-btn" title="Bold" onMouseDown={keepFocus} onClick={() => apply("**", "**")}>
        <strong>B</strong>
      </button>
      <button type="button" className="fmt-btn" title="Italic" onMouseDown={keepFocus} onClick={() => apply("*", "*")}>
        <em>I</em>
      </button>
      <button type="button" className="fmt-btn" title="Underline" onMouseDown={keepFocus} onClick={() => apply("__", "__")}>
        <u>U</u>
      </button>
      <span className="fmt-sep" />
      {TEXT_COLOURS.map((c) => (
        <button
          key={c.name}
          type="button"
          className="fmt-btn"
          title={`${c.label} text`}
          aria-label={`${c.label} text`}
          onMouseDown={keepFocus}
          onClick={() => apply(`[${c.name}]`, `[/${c.name}]`)}
        >
          <span className="fmt-swatch" style={{ background: c.css }} />
        </button>
      ))}
    </div>
  );
}
