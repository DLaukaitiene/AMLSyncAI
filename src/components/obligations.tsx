import Link from "next/link";
import { BookOpen, CircleCheck, CircleAlert, CircleDot, CircleMinus, Clock3 } from "lucide-react";
import { obligation, type Obligation, type ObligationId } from "@/lib/obligations/catalog";
import { Help } from "./help";
import type { ObligationState, ObligationStatus } from "@/lib/obligations/evaluate";

const STATE: Record<ObligationState, { label: string; cls: string; icon: typeof CircleCheck }> = {
  done: { label: "In order", cls: "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200", icon: CircleCheck },
  todo: { label: "To do", cls: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200", icon: CircleDot },
  pending: { label: "Pending", cls: "bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-200", icon: Clock3 },
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

const MARK: Record<ObligationState, { label: string; cls: string; icon: typeof CircleCheck }> = {
  done: { label: "Done", cls: "text-green-700 dark:text-green-400", icon: CircleCheck },
  todo: { label: "To do", cls: "text-yellow-700 dark:text-yellow-300", icon: CircleDot },
  pending: { label: "Pending", cls: "text-orange-700 dark:text-orange-300", icon: Clock3 },
  overdue: { label: "Act now", cls: "text-red-700 dark:text-red-300", icon: CircleAlert },
  na: { label: "Not needed", cls: "text-slate-500 dark:text-slate-400", icon: CircleMinus },
};

/** One duty inside a dashboard box: title with a (?) for the explanation, status on the right, the link to do it below. */
export function ObligationItem({ o, status, children }: { o: Obligation; status: ObligationStatus; children?: React.ReactNode }) {
  const m = MARK[status.state];
  return (
    <li className="py-3" data-testid={`obligation-${o.id}`} data-state={status.state}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="font-semibold">{o.title}</span>
          <Help label="What does this mean?">
            <p>{o.duty}</p>
            <p><Link href={`/app/obligations#${o.id}`} className="text-accent underline">Step by step</Link> · {o.article}</p>
          </Help>
        </span>
        <span className={`inline-flex shrink-0 items-center gap-1 text-xs font-semibold ${m.cls}`}><m.icon aria-hidden className="h-5 w-5" /><span>{m.label}</span></span>
      </div>
      <p className={`mt-1 text-sm ${status.state === "overdue" ? "text-red-800 dark:text-red-300" : "text-muted"}`}>{status.detail}</p>
      {children}
      {status.state !== "na" && (
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <Link href={o.action.href} className="font-semibold text-accent hover:underline">{o.action.label} →</Link>
          {o.secondary && <Link href={o.secondary.href} className="text-accent hover:underline">{o.secondary.label} →</Link>}
        </p>
      )}
    </li>
  );
}

/** A dashboard box: one category of duties, with a count of what is open. */
export function ObligationBox({ title, open, children }: { title: string; open: number; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" aria-label={title} data-testid={`box-${title}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">{title}</h3>
        {open ? <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900 dark:bg-yellow-900/40 dark:text-yellow-200">{open} open</span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400"><CircleCheck aria-hidden className="h-4 w-4" />All in order</span>}
      </div>
      <ul className="divide-y divide-border">{children}</ul>
    </section>
  );
}

/** "Your duty" line at the top of a working page: the duty in one sentence, details behind (?). */
export function DutyNote({ id, extra }: { id: ObligationId; extra?: React.ReactNode }) {
  const o = obligation(id);
  return (
    <aside className="flex items-center gap-2 rounded-xl border border-accent/30 bg-brand/10 px-3 py-2 text-sm" aria-label="Your duty" data-testid="duty-note">
      <BookOpen aria-hidden className="h-4 w-4 shrink-0 text-accent" />
      <p className="min-w-0"><strong>Your duty: </strong>{o.duty}</p>
      <Help label="When and how" align="right">
        <p><span className="font-medium text-foreground">When: </span>{o.when}</p>
        {extra}
        <p><Link href={`/app/obligations#${o.id}`} className="text-accent underline">Step by step</Link> · {o.article}</p>
      </Help>
    </aside>
  );
}
