import Link from "next/link";
import { BellRing } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { Chip } from "@/components/chips";
import { EmptyState } from "@/components/empty-state";
import { clientFileForParties } from "@/lib/server/client-of-party";

const TABS = [{ id: "open", label: "Open" }, { id: "resolved", label: "Resolved" }] as const;

export default async function MonitoringAlertsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const s = await requireUser("client.view");
  const wanted = (await searchParams).tab;
  const tab = TABS.find((x) => x.id === wanted) ?? TABS[0];
  const staffAccess = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => {
    const hits = await tx.screeningResult.findMany({
      where: tab.id === "open" ? { decision: "PENDING" } : { decision: { in: ["TRUE_MATCH", "FALSE_POSITIVE"] } },
      orderBy: { screenedAt: "desc" }, take: 200, include: { party: { select: { displayName: true } } },
    });
    return {
      hits,
      files: await clientFileForParties(tx, hits.map((h) => h.partyId)),
      staff: staffAccess ? await tx.staffScreening.findMany({ where: tab.id === "open" ? { status: "possible-match" } : { status: { in: ["cleared", "confirmed"] } }, orderBy: { screenedAt: "desc" }, take: 100 }) : [],
      names: new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name])),
      openCount: await tx.screeningResult.count({ where: { decision: "PENDING" } }) + (staffAccess ? await tx.staffScreening.count({ where: { status: "possible-match" } }) : 0),
    };
  });
  const empty = data.hits.length === 0 && data.staff.length === 0;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Monitoring Alerts</h1>
        <p className="text-sm text-muted">Possible sanctions and PEP matches from screening and the daily re-screening of your clients and staff. Each one needs a decision with a reason: not the same person, or a confirmed match.</p>
      </div>
      <nav aria-label="Alerts" className="flex flex-wrap gap-2">
        {TABS.map((x) => (
          <Link key={x.id} href={x.id === "open" ? "/app/monitoring-alerts" : `/app/monitoring-alerts?tab=${x.id}`} aria-current={tab.id === x.id ? "page" : undefined}
            className={`rounded-full border px-3 py-1.5 text-sm ${tab.id === x.id ? "border-accent bg-accent/10 font-semibold" : "border-border hover:border-accent"}`}>{x.label}{x.id === "open" ? ` (${data.openCount})` : ""}</Link>
        ))}
      </nav>
      {empty ? (
        <EmptyState icon={BellRing} title={tab.id === "open" ? "No open alerts" : "Nothing resolved yet"} text="Clients are re-screened automatically every day and whenever a list is updated. New possible matches appear here." />
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {data.hits.map((h) => {
            const m = h.matchData as { matchedName?: string; score?: number; reference?: string };
            const fileId = data.files.get(h.partyId);
            return (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="alert">
                <span className="space-y-0.5">
                  <span className="block font-medium">{h.party.displayName} <span className="font-normal text-muted">· client</span></span>
                  <span className="block text-muted">{h.listName}: {m.matchedName ?? "?"}{m.score != null ? ` (${Math.round(m.score * 100)}%)` : ""}{m.reference ? ` · ref ${m.reference}` : ""} · {h.screenedAt.toISOString().slice(0, 10)}</span>
                  {h.comment && <span className="block text-xs text-muted">Reason: {h.comment}</span>}
                </span>
                <span className="flex items-center gap-2">
                  <Chip tone={h.listKind === "SANCTIONS" ? "red" : "amber"}>{h.listKind === "SANCTIONS" ? "Sanctions" : h.listKind === "PEP" ? "PEP" : "Adverse media"}</Chip>
                  {h.decision !== "PENDING" && <Chip tone={h.decision === "TRUE_MATCH" ? "red" : "green"}>{h.decision === "TRUE_MATCH" ? "Confirmed match" : "Not the same person"}</Chip>}
                  {fileId && <Link href={`/app/clients/${fileId}#screening`} className="rounded-full border border-border px-3 py-1 hover:border-accent">{h.decision === "PENDING" ? "Review" : "Open file"}</Link>}
                </span>
              </li>
            );
          })}
          {data.staff.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" data-testid="alert">
              <span className="space-y-0.5">
                <span className="block font-medium">{data.names.get(r.userId) ?? "Former user"} <span className="font-normal text-muted">· staff</span></span>
                <span className="block text-muted">{(r.matches as { listName: string; matchedName: string }[]).map((m) => `${m.listName}: ${m.matchedName}`).join("; ")} · {r.screenedAt.toISOString().slice(0, 10)}</span>
              </span>
              <span className="flex items-center gap-2">
                {r.status !== "possible-match" && <Chip tone={r.status === "confirmed" ? "red" : "green"}>{r.status === "confirmed" ? "Confirmed match" : "Not the same person"}</Chip>}
                <Link href="/app/firm/integrity" className="rounded-full border border-border px-3 py-1 hover:border-accent">{r.status === "possible-match" ? "Review" : "Open"}</Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
