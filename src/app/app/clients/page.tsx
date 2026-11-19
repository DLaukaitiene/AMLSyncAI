import Link from "next/link";
import { Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { loadClientFile } from "@/lib/server/cdd";
import { openCddItems } from "@/lib/rules/gates";
import { Chip, RiskChip, StatusChip } from "@/components/chips";

const TABS = [
  { id: "all", label: "All" },
  { id: "open", label: "In progress" },
  { id: "accepted", label: "Accepted" },
  { id: "refresh", label: "Refresh due" },
  { id: "high", label: "High risk" },
  { id: "closed", label: "Refused / ended" },
] as const;
type Tab = (typeof TABS)[number]["id"];

function whereFor(tab: Tab, soon: Date): Prisma.CddFileWhereInput {
  switch (tab) {
    case "open": return { status: "OPEN" };
    case "accepted": return { status: { in: ["COMPLETE", "SDD", "EDD"] } };
    case "refresh": return { status: { in: ["COMPLETE", "SDD", "EDD"] }, nextRefreshOn: { lte: soon } };
    case "high": return { riskAssessments: { some: { final: "HIGH" } }, status: { notIn: ["REFUSED", "TERMINATED"] } };
    case "closed": return { status: { in: ["REFUSED", "TERMINATED"] } };
    default: return {};
  }
}

/** Ready-to-decide is worked out for small open lists only (it runs the full gate check per file). */
const READY_CHECK_LIMIT = 60;

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string }> }) {
  const s = await requireUser("client.view");
  const sp = await searchParams;
  const q = sp.q?.trim();
  const tab = (TABS.some((t) => t.id === sp.tab) ? sp.tab : "all") as Tab;
  const soon = new Date(Date.now() + 30 * 86_400_000);
  const { files, counts, openItems } = await withTenant(s.firm.id, async (tx) => {
    const base: Prisma.CddFileWhereInput = { role: "CLIENT", ...(q ? { party: { displayName: { contains: q, mode: "insensitive" } } } : {}) };
    const counts = Object.fromEntries(await Promise.all(TABS.map(async (t) => [t.id, await tx.cddFile.count({ where: { ...base, ...whereFor(t.id, soon) } })] as const)));
    const files = await tx.cddFile.findMany({
      where: { ...base, ...whereFor(tab, soon) },
      include: { party: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    const open = files.filter((f) => f.status === "OPEN");
    const openItems = new Map<string, number>();
    if (open.length <= READY_CHECK_LIMIT) {
      for (const f of open) openItems.set(f.id, openCddItems((await loadClientFile(tx, s.firm.id, f.id)).state).length);
    }
    return { files, counts, openItems };
  });
  const today = new Date();
  const qs = (t: string) => `/app/clients?${new URLSearchParams({ ...(q ? { q } : {}), ...(t !== "all" ? { tab: t } : {}) })}`;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Clients</h1>
          <p className="text-sm text-muted">{counts.all} client{counts.all === 1 ? "" : "s"} · {counts.open} in progress · {counts.refresh} refresh due within 30 days</p>
        </div>
        {can(s.user.roles, "client.edit") && (
          <div className="flex gap-2">
            <Link href="/app/remediation" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent">Import existing clients</Link>
            <Link href="/app/clients/new" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">Add Client</Link>
          </div>
        )}
      </div>

      <nav aria-label="Filter clients" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.id} href={qs(t.id)} aria-current={tab === t.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${tab === t.id ? "border-accent bg-accent/10 font-semibold" : "border-border hover:border-accent"}`}>
            {t.label} <span className="text-muted">{counts[t.id]}</span>
          </Link>
        ))}
      </nav>

      <form className="flex gap-2" role="search">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search clients" className="w-full max-w-sm rounded border border-border bg-transparent px-3 py-2 text-sm" />
        <button className="rounded-full border border-border px-4 py-2 text-sm">Search</button>
      </form>

      {files.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-accent"><Users aria-hidden className="h-6 w-6" /></span>
          {counts.all === 0 ? (
            <>
              <p className="font-semibold">No clients yet</p>
              <p className="max-w-md text-sm text-muted">Create a client with just a name and email, then send them a secure link: they fill in their details, upload documents and verify their identity.</p>
              {can(s.user.roles, "client.edit") && <Link href="/app/clients/new" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">Add your first client</Link>}
            </>
          ) : (
            <p className="text-sm text-muted">No clients match{q ? ` “${q}”` : ""} in this view.</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Risk</th>
                <th className="px-4 py-2 font-medium">Open items</th>
                <th className="px-4 py-2 font-medium">Next refresh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => {
                const items = openItems.get(f.id);
                const due = f.nextRefreshOn && f.nextRefreshOn <= soon;
                return (
                  <tr key={f.id} className="hover:bg-surface">
                    <td className="px-4 py-2.5">
                      <Link className="font-medium text-accent hover:underline" href={`/app/clients/${f.id}`}>{f.party.displayName}</Link>
                      <span className="block text-xs text-muted">{f.party.kind === "NATURAL" ? "Person" : "Company"}{f.scope === "identification-only" ? " · identification only" : ""}{f.source === "back-book" ? " · existing client" : ""}</span>
                    </td>
                    <td className="px-4 py-2.5"><StatusChip status={f.status} ready={f.status === "OPEN" && items === 0} /></td>
                    <td className="px-4 py-2.5"><RiskChip level={f.riskAssessments[0]?.final} /></td>
                    <td className="px-4 py-2.5">{f.status !== "OPEN" ? <span className="text-muted">—</span> : items === undefined ? <span className="text-muted">open the file</span> : items === 0 ? <Chip tone="blue">None</Chip> : <Chip tone="amber">{items}</Chip>}</td>
                    <td className="px-4 py-2.5">{f.nextRefreshOn ? <span className={due ? "font-semibold text-amber-800 dark:text-amber-300" : ""}>{f.nextRefreshOn.toISOString().slice(0, 10)}{due && f.nextRefreshOn < today ? " (overdue)" : ""}</span> : <span className="text-muted">—</span>}</td>
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
