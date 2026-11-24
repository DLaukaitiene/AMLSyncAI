import Link from "next/link";
import { Scale } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { RiskChip, StatusChip } from "@/components/chips";
import { EmptyState } from "@/components/empty-state";

const FILTERS = [{ id: "all", label: "All" }, { id: "HIGH", label: "High" }, { id: "MEDIUM", label: "Medium" }, { id: "LOW", label: "Low" }, { id: "overridden", label: "Overridden" }] as const;

export default async function RiskAssessmentsPage({ searchParams }: { searchParams: Promise<{ risk?: string }> }) {
  const s = await requireUser("client.view");
  const wanted = (await searchParams).risk;
  const f = FILTERS.find((x) => x.id === wanted) ?? FILTERS[0];
  const files = await withTenant(s.firm.id, (tx) => tx.cddFile.findMany({
    where: { role: "CLIENT" }, orderBy: { createdAt: "desc" }, take: 500,
    include: { party: { select: { displayName: true } }, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
  }));
  const assessed = files.filter((x) => x.riskAssessments[0]);
  const counts = { HIGH: 0, MEDIUM: 0, LOW: 0 } as Record<string, number>;
  for (const x of assessed) counts[x.riskAssessments[0].final]++;
  const rows = assessed.filter((x) => f.id === "all" || (f.id === "overridden" ? !!x.riskAssessments[0].overrideReason : x.riskAssessments[0].final === f.id));
  const today = new Date();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Risk Ratings</h1>
        <p className="text-sm text-muted">The current risk rating of every client, calculated from the file data. A change of rating needs a reason and is kept with the assessment.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(["HIGH", "MEDIUM", "LOW"] as const).map((l) => (
          <Link key={l} href={`/app/risk-assessments?risk=${l}`} className="rounded-2xl border border-border bg-surface p-4 hover:border-accent">
            <p className="text-sm text-muted">{l === "HIGH" ? "High" : l === "MEDIUM" ? "Medium" : "Low"} risk</p>
            <p className="text-3xl font-semibold">{counts[l]}</p>
          </Link>
        ))}
      </div>
      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.id} href={x.id === "all" ? "/app/risk-assessments" : `/app/risk-assessments?risk=${x.id}`} aria-current={f.id === x.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${f.id === x.id ? "border-accent bg-accent/10 font-semibold" : "border-border hover:border-accent"}`}>{x.label}</Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={Scale} title="No risk assessments here" text="A risk assessment is calculated as soon as a client is added and updated whenever their data changes." action={{ href: "/app/clients/new", label: "Add Client" }} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted"><tr><th className="px-4 py-2 font-medium">Client</th><th className="px-4 py-2 font-medium">Rating</th><th className="px-4 py-2 font-medium">Score</th><th className="px-4 py-2 font-medium">Status</th><th className="px-4 py-2 font-medium">Assessed</th><th className="px-4 py-2 font-medium">Next review</th></tr></thead>
            <tbody className="divide-y divide-border">
              {rows.map((x) => {
                const ra = x.riskAssessments[0];
                const overdue = x.nextRefreshOn && x.nextRefreshOn < today;
                return (
                  <tr key={x.id}>
                    <td className="px-4 py-2"><Link className="font-medium text-accent underline-offset-2 hover:underline" href={`/app/clients/${x.id}#risk`}>{x.party.displayName}</Link></td>
                    <td className="px-4 py-2"><RiskChip level={ra.final} />{ra.overrideReason && <span className="ml-1 text-xs text-muted" title={ra.overrideReason}>(changed from {ra.calculated.toLowerCase()})</span>}</td>
                    <td className="px-4 py-2 text-muted">{ra.score}</td>
                    <td className="px-4 py-2"><StatusChip status={x.status} /></td>
                    <td className="px-4 py-2 text-muted">{ra.createdAt.toISOString().slice(0, 10)}</td>
                    <td className={`px-4 py-2 ${overdue ? "font-semibold text-red-700 dark:text-red-300" : "text-muted"}`}>{x.nextRefreshOn ? x.nextRefreshOn.toISOString().slice(0, 10) + (overdue ? " (overdue)" : "") : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
