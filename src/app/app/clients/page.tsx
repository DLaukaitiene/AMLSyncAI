import Link from "next/link";
import { Users } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { loadClientFile } from "@/lib/server/cdd";
import { openCddItems } from "@/lib/rules/gates";
import { Chip, RiskChip, StatusChip, type Tone } from "@/components/chips";
import { SelectAll } from "@/components/select-all";
import { SCOPE_REASONS } from "@/lib/rules/cdd-scope";
import { bulkIdOnlyAction, bulkSendLinksAction } from "./bulk-actions";

/**
 * The client register, laid out like ClearAML's: search, filter dropdowns
 * (type, risk, status), sort, columns for type / risk / verification /
 * screening / status / next review, red rows for overdue reviews and blue rows
 * for reviews due within 30 days, and checkboxes to export the selection.
 */
const STATUSES = [
  { id: "all", label: "All statuses" },
  { id: "open", label: "In progress" },
  { id: "invited", label: "Invited" },
  { id: "accepted", label: "Accepted" },
  { id: "refresh", label: "Review due (30 days)" },
  { id: "overdue", label: "Overdue" },
  { id: "id-only", label: "Identification only" },
  { id: "closed", label: "Refused / ended" },
] as const;
const TYPES = [{ id: "all", label: "All types" }, { id: "individual", label: "Individual" }, { id: "entity", label: "Company or other entity" }] as const;
const RISKS = [{ id: "all", label: "All risk levels" }, { id: "HIGH", label: "High" }, { id: "MEDIUM", label: "Medium" }, { id: "LOW", label: "Low" }] as const;
const SORTS = [{ id: "newest", label: "Newest added" }, { id: "name", label: "Name" }, { id: "risk", label: "Risk level" }, { id: "type", label: "Client type" }, { id: "review", label: "Upcoming review" }] as const;
type Status = (typeof STATUSES)[number]["id"];

function statusWhere(st: Status, soon: Date, now: Date): Prisma.CddFileWhereInput {
  const accepted = { status: { in: ["COMPLETE", "SDD", "EDD"] as ("COMPLETE" | "SDD" | "EDD")[] } };
  switch (st) {
    case "open": return { status: "OPEN" };
    case "invited": return { status: "OPEN", id: { in: [] } }; // replaced below with files that have an unsubmitted link
    case "accepted": return accepted;
    case "refresh": return { ...accepted, nextRefreshOn: { lte: soon } };
    case "overdue": return { ...accepted, nextRefreshOn: { lt: now } };
    case "id-only": return { scope: "identification-only", status: { notIn: ["REFUSED", "TERMINATED"] } };
    case "closed": return { status: { in: ["REFUSED", "TERMINATED"] } };
    default: return {};
  }
}

/** Ready-to-decide is worked out for small open lists only (it runs the full gate check per file). */
const READY_CHECK_LIMIT = 15;
const pick = <T extends readonly { id: string }[]>(list: T, v: string | undefined) => (list.find((x) => x.id === v) ?? list[0]).id as T[number]["id"];

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; tab?: string; status?: string; type?: string; risk?: string; sort?: string; bulk?: string; sent?: string; skipped?: string; n?: string }> }) {
  const s = await requireUser("client.view");
  const sp = await searchParams;
  const q = sp.q?.trim();
  // Older links used ?tab=…; "high" was a tab before risk got its own filter.
  const status = pick(STATUSES, sp.status ?? (sp.tab === "high" ? undefined : sp.tab));
  const type = pick(TYPES, sp.type);
  const risk = pick(RISKS, sp.risk ?? (sp.tab === "high" ? "HIGH" : undefined));
  const sort = pick(SORTS, sp.sort);
  const now = new Date();
  const soon = new Date(now.getTime() + 30 * 86_400_000);

  const { files, total, openItems, verification, screening } = await withTenant(s.firm.id, async (tx) => {
    const invitedIds = (await tx.portalLink.findMany({ where: { submittedAt: null, purpose: "onboarding" }, select: { cddFileId: true } })).map((l) => l.cddFileId);
    const where: Prisma.CddFileWhereInput = {
      role: "CLIENT",
      ...(q ? { party: { displayName: { contains: q, mode: "insensitive" } } } : {}),
      ...(status === "invited" ? { status: "OPEN", id: { in: invitedIds } } : statusWhere(status, soon, now)),
      ...(type === "individual" ? { party: { kind: "NATURAL", ...(q ? { displayName: { contains: q, mode: "insensitive" as const } } : {}) } } : type === "entity" ? { party: { kind: { not: "NATURAL" }, ...(q ? { displayName: { contains: q, mode: "insensitive" as const } } : {}) } } : {}),
    };
    const total = await tx.cddFile.count({ where: { role: "CLIENT" } });
    let files = await tx.cddFile.findMany({ where, include: { party: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "desc" }, take: 500 });
    if (risk !== "all") files = files.filter((f) => f.riskAssessments[0]?.final === risk);
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 } as Record<string, number>;
    if (sort === "name") files.sort((a, b) => a.party.displayName.localeCompare(b.party.displayName));
    if (sort === "risk") files.sort((a, b) => (order[a.riskAssessments[0]?.final ?? ""] ?? 3) - (order[b.riskAssessments[0]?.final ?? ""] ?? 3));
    if (sort === "type") files.sort((a, b) => a.party.kind.localeCompare(b.party.kind));
    if (sort === "review") files.sort((a, b) => (a.nextRefreshOn ? +a.nextRefreshOn : Infinity) - (b.nextRefreshOn ? +b.nextRefreshOn : Infinity));
    files = files.slice(0, 200);
    const partyIds = files.map((f) => f.partyId);
    const verified = new Set((await tx.identityVerification.findMany({ where: { partyId: { in: partyIds } }, select: { partyId: true } })).map((v) => v.partyId));
    const extracts = new Set((await tx.registryExtract.findMany({ where: { partyId: { in: partyIds } }, select: { partyId: true } })).map((v) => v.partyId));
    const idvPending = new Set((await tx.diditSession.findMany({ where: { partyId: { in: partyIds }, kind: "idv", importedAt: null }, select: { partyId: true } })).map((v) => v.partyId));
    const results = await tx.screeningResult.findMany({ where: { partyId: { in: partyIds } }, select: { partyId: true, decision: true } });
    const verification = new Map<string, [string, Tone]>();
    const screening = new Map<string, [string, Tone]>();
    for (const f of files) {
      const p = f.partyId;
      verification.set(p, f.party.kind === "NATURAL"
        ? verified.has(p) ? ["Verified", "green"] : idvPending.has(p) ? ["Pending", "blue"] : ["Not verified", "grey"]
        : extracts.has(p) ? ["Register checked", "green"] : ["Not checked", "grey"]);
      const mine = results.filter((r) => r.partyId === p);
      screening.set(p, mine.some((r) => r.decision === "PENDING") ? ["Possible match", "red"] : mine.some((r) => r.decision === "TRUE_MATCH") ? ["Match", "red"] : mine.length ? ["Clear", "green"] : ["Not screened", "grey"]);
    }
    const open = files.filter((f) => f.status === "OPEN");
    const openItems = new Map<string, number>();
    // Worked out for the first in-progress files shown (it runs the full gate check per file).
    for (const f of open.slice(0, READY_CHECK_LIMIT)) openItems.set(f.id, openCddItems((await loadClientFile(tx, s.firm.id, f.id)).state).length);
    return { files, total, openItems, verification, screening };
  });
  const filtered = status !== "all" || type !== "all" || risk !== "all" || !!q;
  const bulkMsg = sp.bulk === "links" ? `Secure links sent: ${Number(sp.sent) || 0}. Skipped: ${Number(sp.skipped) || 0} (already decided, no email on file, or a link is already open).`
    : sp.bulk === "idonly" ? `${Number(sp.n) || 0} client(s) marked identification only.`
    : sp.bulk === "noreason" ? "Choose why the services are outside AMLR scope." : sp.bulk === "none" ? "Tick at least one client first." : null;
  const canBulkScope = can(s.user.roles, "gate.override");
  const select = "rounded-lg border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl">Clients</h1>
          <p className="text-sm text-muted">Your AML client register: {total} client{total === 1 ? "" : "s"}{filtered ? ` · ${files.length} shown` : ""}</p>
        </div>
        {can(s.user.roles, "client.edit") && (
          <div className="flex gap-2">
            <Link href="/app/remediation" className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-accent">Import Clients</Link>
            <Link href="/app/clients/new" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink hover:brightness-105">Add Client</Link>
          </div>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Search and filter clients">
        <input name="q" defaultValue={q} placeholder="Search by name" aria-label="Search clients" className="w-full max-w-xs rounded-lg border border-border bg-background px-3 py-2 text-sm" />
        <select name="type" defaultValue={type} aria-label="Client type" className={select}>{TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select name="risk" defaultValue={risk} aria-label="Risk level" className={select}>{RISKS.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select name="status" defaultValue={status} aria-label="Status" className={select}>{STATUSES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <select name="sort" defaultValue={sort} aria-label="Sort by" className={select}>{SORTS.map((x) => <option key={x.id} value={x.id}>Sort: {x.label}</option>)}</select>
        <button className="rounded-full border border-border px-4 py-2 text-sm hover:border-accent">Apply</button>
        {filtered && <Link href="/app/clients" className="px-2 py-2 text-sm text-accent underline">Clear</Link>}
      </form>

      {bulkMsg && <p role="status" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm" data-testid="bulk-result">{bulkMsg}</p>}

      {files.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border px-6 py-12 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/15 text-accent"><Users aria-hidden className="h-6 w-6" /></span>
          {total === 0 ? (
            <>
              <p className="font-semibold">No clients yet</p>
              <p className="max-w-md text-sm text-muted">Add a client with just a name and email, then send them a secure link: they fill in their details, upload documents and verify their identity.</p>
              {can(s.user.roles, "client.edit") && <Link href="/app/clients/new" className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-ink">Add your first client</Link>}
            </>
          ) : (
            <p className="text-sm text-muted">No clients match{q ? ` “${q}”` : ""} these filters.</p>
          )}
        </div>
      ) : (
        <form method="get" action="/api/registers/clients" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            <span><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-red-100 align-middle dark:bg-red-950" /> review overdue <span className="ml-3 mr-1 inline-block h-3 w-3 rounded-sm bg-sky-100 align-middle dark:bg-sky-950" /> review due within 30 days</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm" aria-label="Bulk actions" role="group">
            <span className="text-muted">With selected:</span>
            {can(s.user.roles, "approve.compliance") && <button type="submit" className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-accent">Export selected (CSV)</button>}
            {can(s.user.roles, "client.edit") && <button type="submit" formAction={bulkSendLinksAction} formMethod="post" className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-accent">Send secure links</button>}
            {canBulkScope && (
              <>
                <select name="bulkScopeReason" aria-label="Reason the service is outside AMLR scope" defaultValue="" className="max-w-[16rem] rounded-lg border border-border bg-background px-2 py-1.5">
                  <option value="">Outside AMLR scope because…</option>
                  {Object.entries(SCOPE_REASONS).filter(([k]) => k !== "other" && k !== "firm-default").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button type="submit" formAction={bulkIdOnlyAction} formMethod="post" className="rounded-full border border-border bg-background px-3 py-1.5 hover:border-accent">Mark identification only</button>
              </>
            )}
          </div>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface text-left text-muted">
                <tr>
                  <th className="w-8 px-3 py-2"><SelectAll name="id" label="Select all clients shown" /></th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Risk</th>
                  <th className="px-3 py-2 font-medium">Verification</th>
                  <th className="px-3 py-2 font-medium">Screening</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Next review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {files.map((f) => {
                  const items = openItems.get(f.id);
                  const overdue = !!f.nextRefreshOn && f.nextRefreshOn < now && f.status !== "OPEN";
                  const dueSoon = !overdue && !!f.nextRefreshOn && f.nextRefreshOn <= soon && f.status !== "OPEN";
                  const [vText, vTone] = verification.get(f.partyId)!;
                  const [sText, sTone] = screening.get(f.partyId)!;
                  return (
                    <tr key={f.id} className={overdue ? "bg-red-50 dark:bg-red-950/40" : dueSoon ? "bg-sky-50 dark:bg-sky-950/40" : "hover:bg-surface"} data-testid="client-row">
                      <td className="px-3 py-2.5"><input type="checkbox" name="id" value={f.id} aria-label={`Select ${f.party.displayName}`} /></td>
                      <td className="px-3 py-2.5">
                        <Link className="font-medium text-accent hover:underline" href={`/app/clients/${f.id}`}>{f.party.displayName}</Link>
                        <span className="block text-xs text-muted">{f.scope === "identification-only" ? "Identification only" : ""}{f.source === "back-book" ? `${f.scope === "identification-only" ? " · " : ""}existing client` : ""}{f.status === "OPEN" && items !== undefined ? `${f.scope === "identification-only" || f.source === "back-book" ? " · " : ""}${items === 0 ? "ready to decide" : `${items} open item(s)`}` : ""}</span>
                      </td>
                      <td className="px-3 py-2.5 text-muted">{f.party.kind === "NATURAL" ? "Individual" : "Entity"}</td>
                      <td className="px-3 py-2.5"><RiskChip level={f.riskAssessments[0]?.final} /></td>
                      <td className="px-3 py-2.5"><Chip tone={vTone}>{vText}</Chip></td>
                      <td className="px-3 py-2.5"><Chip tone={sTone}>{sText}</Chip></td>
                      <td className="px-3 py-2.5"><StatusChip status={f.status} ready={f.status === "OPEN" && items === 0} /></td>
                      <td className="px-3 py-2.5">{f.nextRefreshOn ? <span className={overdue ? "font-semibold text-red-800 dark:text-red-300" : dueSoon ? "font-semibold text-sky-800 dark:text-sky-300" : ""}>{f.nextRefreshOn.toISOString().slice(0, 10)}{overdue ? " (overdue)" : ""}</span> : <span className="text-muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </form>
      )}
    </div>
  );
}
