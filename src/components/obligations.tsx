import Link from "next/link";
import { BookOpen, CircleCheck, CircleAlert, CircleDot, CircleMinus } from "lucide-react";
import { obligation, type Obligation, type ObligationId } from "@/lib/obligations/catalog";
import type { ObligationState, ObligationStatus } from "@/lib/obligations/evaluate";

const STATE: Record<ObligationState, { label: string; cls: string; icon: typeof CircleCheck }> = {
  done: { label: "In order", cls: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200", icon: CircleCheck },
  todo: { label: "To do", cls: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200", icon: CircleDot },
  overdue: { label: "Act now", cls: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200", icon: CircleAlert },
  na: { label: "Not needed", cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300", icon: CircleMinus },
};

export function StateBadge({ state }: { state: ObligationState }) {
  const s = STATE[state];
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}><s.icon aria-hidden className="h-3.5 w-3.5" />{s.label}</span>;
}

/** One obligation on the dashboard: what it is, where you stand, and the button that does it. */
export function ObligationCard({ o, status, note, children }: { o: Obligation; status: ObligationStatus; note?: string | null; children?: React.ReactNode }) {
  const border = status.state === "overdue" ? "border-red-300 dark:border-red-800" : status.state === "todo" ? "border-amber-300 dark:border-amber-800" : "border-border";
  return (
    <li className={`flex flex-col gap-3 rounded-2xl border bg-background p-4 shadow-[var(--shadow)] ${border} ${status.state === "na" ? "bg-surface" : ""}`} data-testid={`obligation-${o.id}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug">{o.title}</h3>
        <StateBadge state={status.state} />
      </div>
      <p className="text-sm text-muted">{o.what}</p>
      {note && <p className="text-xs text-muted">{note}</p>}
      <p className={`text-sm font-medium ${status.state === "overdue" ? "text-red-800 dark:text-red-300" : ""}`}>{status.detail}</p>
      {children}
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        {status.state !== "na" && <Link href={o.action.href} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status.state === "done" ? "border border-border hover:border-accent" : "bg-brand text-brand-ink hover:brightness-105"}`}>{o.action.label}</Link>}
        {o.secondary && status.state !== "na" && <Link href={o.secondary.href} className="rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent">{o.secondary.label}</Link>}
        <Link href={`/app/obligations#${o.id}`} className="ml-auto inline-flex items-center gap-1 text-xs text-accent underline">What does this mean?</Link>
      </div>
    </li>
  );
}

/** One obligation as a single row on the dashboard: status, title, where you stand, and the button that does it. */
export function ObligationRow({ o, status, children }: { o: Obligation; status: ObligationStatus; children?: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4" data-testid={`obligation-${o.id}`}>
      <span className="sm:w-24"><StateBadge state={status.state} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{o.title}</span>
        <span className={`block text-sm ${status.state === "overdue" ? "text-red-800 dark:text-red-300" : "text-muted"}`}>{status.detail}</span>
        {children}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        {status.state !== "na" && <Link href={o.action.href} className={`rounded-full px-4 py-1.5 text-sm font-semibold ${status.state === "done" ? "border border-border hover:border-accent" : "bg-brand text-brand-ink hover:brightness-105"}`}>{o.action.label}</Link>}
        <Link href={`/app/obligations#${o.id}`} className="text-xs text-accent underline">What does this mean?</Link>
      </span>
    </li>
  );
}

/** "Your duty" callout at the top of a page: the obligation behind it, in one or two sentences. */
export function DutyNote({ id, extra }: { id: ObligationId; extra?: React.ReactNode }) {
  const o = obligation(id);
  return (
    <aside className="flex gap-3 rounded-2xl border border-accent/40 bg-brand/10 p-4 text-sm" aria-label="Your duty" data-testid="duty-note">
      <BookOpen aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      <div className="space-y-1">
        <p><strong>Your duty: </strong>{o.duty}</p>
        <p className="text-muted"><strong className="font-medium text-foreground">When: </strong>{o.when}</p>
        {extra}
        <p><Link href={`/app/obligations#${o.id}`} className="text-accent underline">How to do it, step by step</Link> <span className="text-muted">· {o.article}</span></p>
      </div>
    </aside>
  );
}
