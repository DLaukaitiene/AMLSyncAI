"use client";

import { useId, useState } from "react";
import { CircleHelp } from "lucide-react";

/**
 * Legal basis behind a small (?) — shown on click or hover instead of article
 * numbers in the text. Use it only where the legal basis really matters
 * (deadlines, reporting, refusals, gates); elsewhere leave the reference out.
 */
export function LawRef({ basis, why }: { basis: string | null | undefined; why?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!basis) return null;
  const text = /^Art\.?\s/.test(basis) ? `AMLR ${basis}` : basis;
  return (
    <span className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label="Legal basis" aria-expanded={open} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-accent hover:bg-brand/15 focus:outline-2 focus:outline-accent">
        <CircleHelp aria-hidden className="h-4 w-4" />
      </button>
      {open && (
        <span role="tooltip" id={id} className="absolute left-1/2 top-6 z-20 w-max max-w-64 -translate-x-1/2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-normal text-foreground shadow-[var(--shadow)]">
          {why && <span className="mb-1 block">{why}</span>}
          <span className="block text-muted">Legal basis: {text}</span>
        </span>
      )}
    </span>
  );
}
