import Link from "next/link";
import { requireUser } from "@/lib/server/session";

const WHAT = {
  export: "This downloads a file with your firm's confidential data. The download is logged and the Owner is emailed. Store the file securely.",
  report: "This downloads the report as a file for the authority's reporting channel. It contains confidential personal data: store it securely and never share it with the client. A draft report is marked as exported.",
} as const;

/** Confirm a download: says what will happen; Confirm starts it, Cancel goes back. */
export default async function ConfirmPage({ searchParams }: { searchParams: Promise<{ kind?: string; next?: string }> }) {
  await requireUser();
  const { kind, next } = await searchParams;
  // Only our own download addresses, never another site.
  const target = next && next.startsWith("/api/") && !next.startsWith("//") ? next : null;
  const text = WHAT[(kind ?? "export") as keyof typeof WHAT] ?? WHAT.export;
  return (
    <div className="max-w-xl space-y-4" data-testid="confirm-download">
      <h1 className="text-3xl">Please confirm</h1>
      <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">{text}</p>
      <div className="flex gap-2">
        {target ? <a href={target} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">Confirm and download</a> : <p className="text-sm">This link is not valid.</p>}
        <Link href="/app" className="rounded-full border border-border px-5 py-2 text-sm">Cancel</Link>
      </div>
    </div>
  );
}
