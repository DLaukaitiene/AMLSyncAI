import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";

const TYPE_LABELS: Record<string, string> = {
  ENGAGEMENT: "Engagement", PROPERTY_SALE: "Property sale", LETTING: "Letting", GOODS_SALE: "Sale of goods", COMPANY_FORMATION: "Company formation / transfer", TRANSACTION: "Transaction",
};

const TABS = [
  { id: "open", label: "Open", statuses: ["OPEN", "ON_HOLD"] },
  { id: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { id: "cancelled", label: "Cancelled", statuses: ["CANCELLED"] },
  { id: "all", label: "All", statuses: ["OPEN", "ON_HOLD", "COMPLETED", "CANCELLED"] },
] as const;

export default async function MattersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireUser("client.view");
  const t = (await searchParams).tab;
  const tab = TABS.find((x) => x.id === t) ?? TABS[0];
  const { matters, counts } = await withTenant(s.firm.id, async (tx) => ({
    matters: await tx.matter.findMany({ where: { status: { in: [...tab.statuses] } }, orderBy: { createdAt: "desc" }, take: 200, include: { parties: { include: { party: { select: { displayName: true } } } } } }),
    counts: Object.fromEntries(await Promise.all(TABS.map(async (x) => [x.id, await tx.matter.count({ where: { status: { in: [...x.statuses] } } })] as const))),
  }));
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl">Cases</h1>
          <p className="text-sm text-muted">Engagements, sales, lettings and transactions. Completed and cancelled cases stay here as your register.</p>
        </div>
        {can(s.user.roles, "client.edit") && <Link href="/app/matters/new" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">New matter</Link>}
      </div>
      <nav aria-label="Filter cases" className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <Link key={x.id} href={x.id === "open" ? "/app/matters" : `/app/matters?tab=${x.id}`} aria-current={tab.id === x.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${tab.id === x.id ? "border-accent bg-accent/10 font-semibold" : "border-border hover:border-accent"}`}>
            {x.label} <span className="text-muted">{counts[x.id]}</span>
          </Link>
        ))}
      </nav>
      {matters.length === 0 && counts.all > 0 ? <p className="text-sm text-muted">No matters in this view.</p> : matters.length === 0 ? <EmptyState icon={Briefcase} title="No matters yet" text="A matter is an engagement, a property sale, a letting, a sale of goods or a transaction. Each party in it gets its own due diligence, and payments are checked against cash limits." action={{ href: "/app/matters/new", label: "Open a matter" }} /> : (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {matters.map((m) => (
            <li key={m.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span><Link className="text-accent underline" href={`/app/matters/${m.id}`}>{m.title}</Link> <span className="text-muted">· {m.type === "OTHER" ? String((m.details as { typeOther?: string }).typeOther ?? "Other") : TYPE_LABELS[m.type]}</span></span>
              <span className="text-muted">{m.parties.map((p) => `${p.party.displayName} (${p.role === "OTHER" ? p.roleOther ?? "other" : p.role.toLowerCase()})`).join(", ") || "no parties"} · {m.status.toLowerCase().replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
