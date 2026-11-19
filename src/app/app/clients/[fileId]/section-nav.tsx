"use client";

import { useEffect, useState } from "react";

export interface Step { label: string; anchor: string; done: boolean; na: boolean }

/**
 * Left-hand menu for the client file: the CDD progress steps with their status, then every
 * section on the page (found from `[data-nav]` cards), highlighting the one in view.
 */
export function FileSectionNav({ steps }: { steps: Step[] }) {
  const [sections, setSections] = useState<{ id: string; label: string }[]>([]);
  const [current, setCurrent] = useState<string>();

  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("#file-body [data-nav]")].filter((e) => e.id);
    setSections(els.map((e) => ({ id: e.id, label: e.dataset.nav! })));
    const seen = new Map<string, number>();
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) seen.set(en.target.id, en.isIntersecting ? en.boundingClientRect.top : Infinity);
      // The section nearest the top of the viewport that is still visible.
      const top = [...seen.entries()].filter(([, t]) => t !== Infinity).sort((a, b) => Math.abs(a[1]) - Math.abs(b[1]))[0];
      if (top) setCurrent(top[0]);
    }, { rootMargin: "-80px 0px -55% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  const done = steps.filter((s) => s.done).length;
  const needed = steps.filter((s) => !s.na).length;
  const link = (on: boolean) => `flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition ${on ? "bg-accent/10 font-medium text-foreground shadow-[inset_2px_0_0_var(--brand)]" : "text-muted hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"}`;

  return (
    <nav aria-label="Sections of this file" className="space-y-5 text-sm">
      <div>
        <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted">Progress</p>
        <div className="mx-2 mb-2 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
          <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${needed ? (done / needed) * 100 : 100}%` }} />
        </div>
        <p className="mb-2 px-2 text-xs text-muted">{done} of {needed} steps done</p>
        <ol className="space-y-0.5">
          {steps.map((s, i) => (
            <li key={s.label}>
              <a href={`#${s.anchor}`} className={link(current === s.anchor)}>
                <span aria-hidden className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold ${s.done ? "bg-green-600 text-white" : s.na ? "bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200" : "bg-amber-500 text-white"}`}>
                  {s.done ? "✓" : s.na ? "–" : i + 1}
                </span>
                <span className={s.na ? "line-through decoration-muted/60" : ""}>{s.label}</span>
                <span className="sr-only">{s.done ? " — done" : s.na ? " — not needed" : " — to do"}</span>
              </a>
            </li>
          ))}
        </ol>
      </div>
      {sections.length > 0 && (
        <div>
          <p className="mb-1 px-2 text-xs font-semibold uppercase tracking-wider text-muted">On this page</p>
          <ul className="space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}><a href={`#${s.id}`} className={link(current === s.id)}>{s.label}</a></li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
