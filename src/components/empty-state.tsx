import Link from "next/link";
import type { LucideIcon } from "lucide-react";

/** Friendly empty page: what this is for and the next step. */
export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: { href: string; label: string } }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-accent"><Icon aria-hidden className="h-6 w-6" /></span>
      <p className="font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted">{text}</p>
      {action && <Link href={action.href} className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">{action.label}</Link>}
    </div>
  );
}
