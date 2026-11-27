"use client";

import { useState } from "react";

/** Copies a piece of text to the clipboard. */
export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { /* clipboard blocked: the text can still be selected by hand */ } }}
      className="rounded-full border border-border px-3 py-1 text-xs font-semibold hover:border-accent"
    >
      {done ? "Copied" : label}
    </button>
  );
}
