"use client";

import Link from "next/link";
import { useState } from "react";
import { ActionForm, Submit, type ActionState } from "@/components/form";

export type SourceCheck = { key: string; label: string; href: string; linkText: string; detail: string; warn: boolean };

/**
 * Generate the AML Program: first asks the person to confirm that the three sources it is written from
 * (firm profile, risk assessment, Country Profile) are up to date, with a link to each [28 Nov 2026].
 */
export function GenerateProgram({ action, label, sources }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; label: string; sources: SourceCheck[] }) {
  const [open, setOpen] = useState(false);
  const [ok, setOk] = useState<Record<string, boolean>>({});
  const all = sources.every((x) => ok[x.key]);
  return (
    <div className="space-y-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink hover:brightness-105" data-testid="generate-program">{label}</button>
      {open && (
        <ActionForm action={action} className="space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
          <p>The AML Program is written from these three. Confirm each one is up to date:</p>
          <ul className="space-y-2">
            {sources.map((x) => (
              <li key={x.key} className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex items-start gap-2">
                  <input type="checkbox" name={`ok-${x.key}`} checked={!!ok[x.key]} onChange={(e) => setOk({ ...ok, [x.key]: e.target.checked })} className="mt-0.5 h-4 w-4" />
                  <span><strong>{x.label}</strong> is up to date<span className={`block text-xs ${x.warn ? "text-amber-800 dark:text-amber-300" : "text-muted"}`}>{x.detail}</span></span>
                </label>
                <Link href={x.href} className="text-accent underline">{x.linkText}</Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <Submit variant="primary">{all ? "Generate" : "Confirm all three to generate"}</Submit>
            <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted underline">Cancel</button>
          </div>
        </ActionForm>
      )}
    </div>
  );
}
