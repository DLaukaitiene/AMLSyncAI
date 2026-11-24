import Link from "next/link";
import { ScanFace } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { Chip } from "@/components/chips";
import { EmptyState } from "@/components/empty-state";

const METHOD: Record<string, string> = { EID: "eID", IN_PERSON: "In person", DOCUMENT_NFC_LIVENESS: "Document chip + liveness", DOCUMENT_LIVENESS: "Document + liveness" };

export default async function IdentityVerificationPage() {
  const s = await requireUser("client.view");
  const data = await withTenant(s.firm.id, async (tx) => ({
    sessions: await tx.diditSession.findMany({ where: { kind: "idv", importedAt: null }, orderBy: { createdAt: "desc" }, take: 100 }),
    done: await tx.identityVerification.findMany({ orderBy: { verifiedAt: "desc" }, take: 200, include: { party: { select: { displayName: true, cddFiles: { select: { id: true }, take: 1 } } } } }),
    names: new Map((await tx.party.findMany({ select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName])),
  }));
  const fileLink = (fileId: string | null | undefined, name: string) => (fileId ? <Link className="font-medium text-accent underline-offset-2 hover:underline" href={`/app/clients/${fileId}`}>{name}</Link> : <span className="font-medium">{name}</span>);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Identity Checks</h1>
        <p className="text-sm text-muted">Every identity check across your clients and the people behind them. Start a new check from the client&apos;s file.</p>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">In progress <span className="text-sm font-normal text-muted">({data.sessions.length})</span></h2>
        {data.sessions.length === 0 ? <p className="text-sm text-muted">No checks waiting on a client.</p> : (
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {data.sessions.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span>{fileLink(x.cddFileId, data.names.get(x.partyId) ?? "Person")} <span className="text-muted">· sent {x.createdAt.toISOString().slice(0, 10)} {x.createdVia === "portal" ? "via the client portal" : "by staff"}{x.sandbox ? " · test mode" : ""}</span></span>
                <Chip tone={/declin|expired|abandon/i.test(x.status) ? "red" : /review/i.test(x.status) ? "amber" : "blue"}>{x.status}</Chip>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Verified <span className="text-sm font-normal text-muted">({data.done.length})</span></h2>
        {data.done.length === 0 ? (
          <EmptyState icon={ScanFace} title="No verified identities yet" text="Open a client and choose Verify identity, or send them their secure link to do it themselves." action={{ href: "/app/clients", label: "Go to Clients" }} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted"><tr><th className="px-4 py-2 font-medium">Person</th><th className="px-4 py-2 font-medium">Method</th><th className="px-4 py-2 font-medium">Provider</th><th className="px-4 py-2 font-medium">Verified</th></tr></thead>
              <tbody className="divide-y divide-border">
                {data.done.map((v) => (
                  <tr key={v.id}>
                    <td className="px-4 py-2">{fileLink(v.party.cddFiles[0]?.id, v.party.displayName)}</td>
                    <td className="px-4 py-2"><Chip tone={v.method === "DOCUMENT_LIVENESS" ? "amber" : "green"}>{METHOD[v.method] ?? v.method}</Chip></td>
                    <td className="px-4 py-2 text-muted">{v.provider ?? "—"}</td>
                    <td className="px-4 py-2 text-muted">{v.verifiedAt.toISOString().slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
