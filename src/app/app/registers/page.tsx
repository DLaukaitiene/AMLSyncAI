import { Download, FileArchive } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { REGISTERS } from "@/lib/server/registers";

export default async function ReportsPage() {
  await requireUser("approve.compliance");
  const pillars = [...new Set(REGISTERS.map((r) => r.pillar))];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Reports</h1>
        <p className="text-sm text-muted">Audit-ready registers from live data, as CSV (opens in Excel). Run them before a supervisor inspection or your annual review. Each export is logged and the Owner is told.</p>
      </div>
      {pillars.map((p) => (
        <section key={p} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{p}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {REGISTERS.filter((r) => r.pillar === p).map((r) => (
              <li key={r.id} className="flex flex-col justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
                <div><p className="font-semibold">{r.title}</p><p className="text-sm text-muted">{r.text}</p></div>
                <a href={`/api/registers/${r.id}`} className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent"><Download aria-hidden className="h-4 w-4" />Download CSV<span className="sr-only">: {r.title}</span></a>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4">
        <div><p className="font-semibold">Full export</p><p className="text-sm text-muted">Your firm file and every client file with documents, in one ZIP.</p></div>
        <a href="/api/export/all" className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent"><FileArchive aria-hidden className="h-4 w-4" />Download ZIP</a>
      </section>
    </div>
  );
}
