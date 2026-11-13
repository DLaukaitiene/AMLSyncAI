import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";

const TYPE_LABELS: Record<string, string> = {
  ENGAGEMENT: "Engagement", PROPERTY_SALE: "Property sale", LETTING: "Letting", GOODS_SALE: "Sale of goods", COMPANY_FORMATION: "Company formation / transfer", TRANSACTION: "Transaction",
};

export default async function MattersPage() {
  const s = await requireUser("client.view");
  const matters = await withTenant(s.firm.id, (tx) =>
    tx.matter.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { parties: { include: { party: { select: { displayName: true } } } } } }),
  );
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Matters</h1>
        {can(s.user.roles, "client.edit") && <Link href="/app/matters/new" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white dark:text-black">New matter</Link>}
      </div>
      {matters.length === 0 ? <p className="text-sm text-muted">No matters yet. A matter is an engagement, deal, sale, letting or transaction.</p> : (
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {matters.map((m) => (
            <li key={m.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
              <span><Link className="text-accent underline" href={`/app/matters/${m.id}`}>{m.title}</Link> <span className="text-muted">· {TYPE_LABELS[m.type]}</span></span>
              <span className="text-muted">{m.parties.map((p) => `${p.party.displayName} (${p.role.toLowerCase()})`).join(", ") || "no parties"} · {m.status.toLowerCase().replace("_", " ")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
