import Link from "next/link";
import type { ReactNode } from "react";

/** Small presentational pieces for the Backoffice (server components). */

export function Page({ title, intro, children, actions }: { title: string; intro?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {intro && <p className="max-w-3xl text-sm text-muted">{intro}</p>}
        </div>
        {actions}
      </div>
      {children}
    </main>
  );
}

export function Section({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      {note && <p className="text-sm text-muted">{note}</p>}
      {children}
    </section>
  );
}

export function Tiles({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;
}

export function Tile({ label, value, sub, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "ok" | "warn" | "bad" }) {
  const ring = tone === "bad" ? "border-red-500" : tone === "warn" ? "border-amber-500" : "border-border";
  const body = (
    <div className={`h-full rounded-md border ${ring} p-3`}>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
  return href ? <Link href={href} className="block hover:opacity-80">{body}</Link> : body;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "bad" }) {
  const c = { neutral: "border-border text-muted", ok: "border-green-600 text-green-700 dark:text-green-400", warn: "border-amber-500 text-amber-700 dark:text-amber-300", bad: "border-red-500 text-red-700 dark:text-red-300" }[tone];
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs ${c}`}>{children}</span>;
}

export function Table({ head, rows, empty = "Nothing here yet.", testId }: { head: ReactNode[]; rows: ReactNode[][]; empty?: string; testId?: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-sm" data-testid={testId}>
        <thead className="text-left text-muted">
          <tr>{head.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-3 py-2 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="px-3 py-1.5 align-top">{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

export function Tabs({ base, tabs, current }: { base: string; tabs: { id: string; label: string }[]; current: string }) {
  return (
    <nav aria-label="Sections" className="flex gap-1 overflow-x-auto border-b border-border text-sm">
      {tabs.map((t) => (
        <Link key={t.id} href={`${base}?tab=${t.id}`} aria-current={t.id === current ? "page" : undefined}
          className={`whitespace-nowrap border-b-2 px-3 py-2 ${t.id === current ? "border-accent font-medium" : "border-transparent text-muted hover:text-foreground"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
export const fmtDateTime = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");
export const eur = (cents: number) => `€${((cents || 0) / 100).toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const bandTone = (b: "green" | "amber" | "red") => (b === "green" ? "ok" : b === "amber" ? "warn" : "bad") as "ok" | "warn" | "bad";
export const statusTone = (s: string) => (s === "active" ? "ok" : s === "paused" ? "warn" : s === "trial" ? "neutral" : "bad") as "ok" | "warn" | "bad" | "neutral";
