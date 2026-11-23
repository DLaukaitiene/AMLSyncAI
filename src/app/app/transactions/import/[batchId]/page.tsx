import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionButton } from "@/components/action-button";
import { undoBlocker, type PreviewRow } from "@/lib/server/tx-import";
import { cancelImportAction, confirmImportAction, undoImportAction } from "../actions";

export const metadata = { title: "Check the import" };
const eur = (n: number) => `€${n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SEV: Record<string, string> = { high: "text-red-800 dark:text-red-300", medium: "text-amber-800 dark:text-amber-300", low: "text-muted" };

export default async function ImportBatchPage({ params, searchParams }: { params: Promise<{ batchId: string }>; searchParams: Promise<{ show?: string }> }) {
  const { batchId } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(batchId)) notFound();
  const s = await requireUser("client.edit");
  const data = await withTenant(s.firm.id, async (tx) => {
    const batch = await tx.txImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) return null;
    return { batch, undo: await undoBlocker(tx, batch) };
  });
  if (!data) notFound();
  const { batch } = data;
  const rows = batch.rows as unknown as PreviewRow[];
  const ok = rows.filter((r) => r.status === "ok"), errors = rows.filter((r) => r.status === "error"), dups = rows.filter((r) => r.status === "duplicate");
  const willFlag = ok.filter((r) => r.flags?.length).length;
  const shown = sp.show === "errors" ? [...errors, ...dups] : sp.show === "flagged" ? ok.filter((r) => r.flags?.length) : rows;
  const limit = 500;
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm"><Link href="/app/transactions/import" className="text-accent underline">Import transactions</Link></p>
        <h1 className="text-3xl">{batch.status === "preview" ? "Check the file before importing" : "Import summary"}</h1>
        <p className="text-sm text-muted">{batch.fileName} · uploaded {batch.createdAt.toISOString().slice(0, 16).replace("T", " ")}</p>
      </div>

      <ul className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4" data-testid="import-counts">
        {batch.status === "imported" || batch.status === "undone" ? (
          <>
            <li className="rounded-2xl border border-border p-3"><span className="block text-muted">Imported</span><span className="text-2xl font-bold">{batch.imported}</span></li>
            <li className="rounded-2xl border border-border p-3"><span className="block text-muted">Flagged</span><span className="text-2xl font-bold">{batch.flagged}</span></li>
          </>
        ) : (
          <>
            <li className="rounded-2xl border border-border p-3"><span className="block text-muted">Ready to import</span><span className="text-2xl font-bold">{ok.length}</span></li>
            <li className="rounded-2xl border border-border p-3"><span className="block text-muted">Would be flagged</span><span className="text-2xl font-bold">{willFlag}</span></li>
          </>
        )}
        <li className="rounded-2xl border border-border p-3"><span className="block text-muted">Skipped as duplicate</span><span className="text-2xl font-bold">{batch.duplicates}</span></li>
        <li className="rounded-2xl border border-border p-3"><span className="block text-muted">Rejected</span><span className="text-2xl font-bold">{batch.rejected}</span></li>
      </ul>

      {batch.status === "preview" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-accent/50 bg-brand/10 p-4 text-sm" data-testid="import-decision">
          <p className="w-full">Nothing is saved yet. {errors.length || dups.length ? `${errors.length + dups.length} row(s) won't be imported: fix them in your file and upload it again, or import the valid rows now.` : "All rows are valid."}</p>
          {ok.length > 0 && <ActionButton action={confirmImportAction.bind(null, batch.id)} variant="primary">{`Import ${ok.length} valid row(s)`}</ActionButton>}
          <ActionButton action={cancelImportAction.bind(null, batch.id)}>Cancel</ActionButton>
        </div>
      )}
      {batch.status === "imported" && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border p-4 text-sm" data-testid="import-done">
          <p className="w-full">Imported {batch.importedAt?.toISOString().slice(0, 16).replace("T", " ")}. <Link href={`/app/transactions?batch=${batch.id}`} className="text-accent underline">See these transactions</Link>.</p>
          {can(s.user.roles, "approve.compliance") && !data.undo && <ActionButton action={undoImportAction.bind(null, batch.id)}>Undo the whole import</ActionButton>}
          {data.undo && <p className="text-xs text-muted">{data.undo}</p>}
        </div>
      )}
      {batch.status === "undone" && <p className="rounded-2xl border border-border p-4 text-sm">This import was undone on {batch.undoneAt?.toISOString().slice(0, 16).replace("T", " ")}; its transactions were removed.</p>}
      {(errors.length > 0 || dups.length > 0) && <p className="text-sm"><a href={`/api/transactions/import/${batch.id}/errors`} className="text-accent underline">Download the rows that weren&apos;t imported, with the reason (CSV)</a></p>}

      <nav className="flex gap-3 text-sm" aria-label="Show rows">
        {[["", `All rows (${rows.length})`], ["errors", `Not imported (${errors.length + dups.length})`], ["flagged", `With flags (${willFlag})`]].map(([k, label]) => (
          <Link key={k} href={`/app/transactions/import/${batch.id}${k ? `?show=${k}` : ""}`} className={(sp.show ?? "") === k ? "font-semibold" : "text-accent underline"}>{label}</Link>
        ))}
      </nav>
      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full text-left text-sm" data-testid="preview-table">
          <thead className="bg-surface"><tr>{["Row", "Result", "Date", "Client", "Case", "Amount", "Method", "Rules it triggers"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-border">
            {shown.slice(0, limit).map((r) => (
              <tr key={r.line} className={r.status === "ok" ? "" : "bg-red-50/60 dark:bg-red-950/40"}>
                <td className="px-3 py-2 align-top">{r.line}</td>
                <td className="px-3 py-2 align-top">{r.status === "ok" ? <span className="font-semibold text-green-700 dark:text-green-300">OK</span> : <span className="font-semibold text-red-800 dark:text-red-300">{r.status === "duplicate" ? "Duplicate" : "Error"}</span>}{r.error && <span className="block text-xs">{r.error}</span>}{r.note && <span className="block text-xs text-amber-800 dark:text-amber-300">{r.note}</span>}</td>
                <td className="px-3 py-2 align-top">{r.raw.date}</td>
                <td className="px-3 py-2 align-top">{r.clientName ?? r.raw.client_name ?? r.raw.client_code}</td>
                <td className="px-3 py-2 align-top">{r.matterTitle ?? r.raw.matter_ref ?? ""}</td>
                <td className="px-3 py-2 align-top">{r.amountEUR !== undefined ? eur(r.amountEUR) : `${r.raw.amount ?? ""} ${r.raw.currency ?? ""}`}{r.raw.currency && r.raw.currency.toUpperCase() !== "EUR" && r.amountEUR !== undefined ? <span className="block text-xs text-muted">{r.raw.amount} {r.raw.currency.toUpperCase()}</span> : null}</td>
                <td className="px-3 py-2 align-top">{r.raw.method}</td>
                <td className="px-3 py-2 align-top">{r.flags?.length ? <ul>{r.flags.map((f, i) => <li key={i} className={SEV[f.severity]}><span className="font-semibold">{f.rule}</span> · {f.severity} · {f.message}</li>)}</ul> : r.status === "ok" ? <span className="text-muted">none</span> : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length > limit && <p className="text-sm text-muted">Showing the first {limit} of {shown.length} rows. Download the rows that weren&apos;t imported for the full list of errors.</p>}
    </div>
  );
}
