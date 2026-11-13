import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";

const STATUS: Record<string, string> = { OPEN: "In progress", COMPLETE: "Accepted", SDD: "Accepted (SDD)", EDD: "Accepted (EDD)", REFUSED: "Refused", TERMINATED: "Terminated" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const s = await requireUser("client.view");
  const { q } = await searchParams;
  const files = await withTenant(s.firm.id, (tx) =>
    tx.cddFile.findMany({
      where: { role: "CLIENT", ...(q ? { party: { displayName: { contains: q, mode: "insensitive" } } } : {}) },
      include: { party: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Clients</h1>
        {can(s.user.roles, "client.edit") && (
          <Link href="/app/clients/new" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white dark:text-black">New client</Link>
        )}
      </div>
      <form className="flex gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search clients" className="w-full max-w-sm rounded border border-border bg-transparent px-3 py-2 text-sm" />
        <button className="rounded border border-border px-3 py-2 text-sm">Search</button>
      </form>
      {files.length === 0 ? (
        <p className="text-sm text-muted">No clients yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted">
              <tr><th className="py-2 pr-4 font-normal">Name</th><th className="py-2 pr-4 font-normal">Type</th><th className="py-2 pr-4 font-normal">Status</th><th className="py-2 pr-4 font-normal">Risk</th><th className="py-2 font-normal">Next refresh</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {files.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 pr-4"><Link className="text-accent underline" href={`/app/clients/${f.id}`}>{f.party.displayName}</Link></td>
                  <td className="py-2 pr-4">{f.party.kind === "NATURAL" ? "Person" : "Company"}</td>
                  <td className="py-2 pr-4">{STATUS[f.status]}</td>
                  <td className="py-2 pr-4">{f.riskAssessments[0]?.final ?? "—"}</td>
                  <td className="py-2">{f.nextRefreshOn?.toISOString().slice(0, 10) ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
