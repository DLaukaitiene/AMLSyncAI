import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { ActionForm, Submit } from "@/components/form";
import { COLUMNS, MAX_ROWS } from "@/lib/transactions/format";
import { uploadTransactionsAction } from "./actions";

export const metadata = { title: "Import transactions" };

const STATUS: Record<string, string> = { preview: "waiting for your confirmation", importing: "importing", imported: "imported", cancelled: "cancelled", undone: "undone" };

export default async function ImportTransactionsPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const s = await requireUser("client.edit");
  const sp = await searchParams;
  const batches = await withTenant(s.firm.id, (tx) => tx.txImportBatch.findMany({ orderBy: { createdAt: "desc" }, take: 10, select: { id: true, fileName: true, status: true, imported: true, duplicates: true, rejected: true, flagged: true, createdAt: true } }));
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <p className="text-sm"><Link href="/app/transactions" className="text-accent underline">Transaction Monitoring</Link></p>
        <h1 className="text-3xl">Import transactions</h1>
        <p className="text-sm text-muted">Upload payments from your accounting software or bank as a .csv or .xlsx file (up to {MAX_ROWS.toLocaleString("en")} rows and 5 MB). You see every row checked before anything is saved, and you can undo an import for 24 hours. Importing never starts a paid check.</p>
      </div>
      {sp.cancelled && <p role="status" className="rounded-lg border border-border p-3 text-sm">Import cancelled. Nothing was saved.</p>}
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="font-semibold">1. Download the template</h2>
        <div className="flex flex-wrap gap-3 text-sm" data-testid="templates">
          <a className="rounded-full border border-border px-4 py-2 font-semibold hover:border-accent" href="/api/transactions/template?format=xlsx">Download template (.xlsx, with instructions in Lithuanian)</a>
          <a className="rounded-full border border-border px-4 py-2 font-semibold hover:border-accent" href="/api/transactions/template?format=csv">Download template (.csv)</a>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-accent">What each column means</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead><tr>{["Column", "Required", "Format", "Example"].map((h) => <th key={h} className="px-2 py-1">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-border">{COLUMNS.map((c) => <tr key={c.name}><td className="px-2 py-1 font-mono">{c.name}</td><td className="px-2 py-1">{c.required}</td><td className="px-2 py-1">{c.en} <span className="text-muted">({c.format})</span></td><td className="px-2 py-1 font-mono">{c.example}</td></tr>)}</tbody>
            </table>
          </div>
        </details>
      </section>
      <section className="space-y-3 rounded-2xl border border-border p-4">
        <h2 className="font-semibold">2. Upload the file</h2>
        <ActionForm action={uploadTransactionsAction} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="block font-medium">File (.csv or .xlsx)</span><input type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="block text-sm" /></label>
          <Submit>Check the file</Submit>
        </ActionForm>
      </section>
      {batches.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-semibold">Recent imports</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border text-sm">
            {batches.map((b) => (
              <li key={b.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <Link href={`/app/transactions/import/${b.id}`} className="font-medium text-accent hover:underline">{b.fileName}</Link>
                <span className="text-muted">{b.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {STATUS[b.status] ?? b.status}{b.status === "imported" ? ` · ${b.imported} imported, ${b.flagged} flagged, ${b.duplicates} duplicates, ${b.rejected} rejected` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
