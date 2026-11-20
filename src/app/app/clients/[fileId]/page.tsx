import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { loadClientFile } from "@/lib/server/cdd";
import { openCddItems } from "@/lib/rules/gates";
import { EDD_CHECKLIST } from "@/lib/rules/risk-scoring";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { PartyFields } from "@/components/party-fields";
import {
  acceptAction, addOwnerAction, decideMatchAction, eddChecklistAction, endAction, recordExtractAction, recordVerificationAction,
  removeLinkAction, rescreenAction, riskOverrideAction, saveSmoAction, seniorApprovalAction, updatePurposeAction,
  revokePortalLinkAction, sendPortalLinkAction, staffUploadAction, openDiscrepancyAction, markRefreshedAction,
  diditIdvAction, diditRefreshAction, diditScreenAction,
  kybAddPersonAction, aiOwnershipDraftAction,
  setScopeAction,
  declareLookThroughAction,
  reopenLookThroughAction,
  kybRefreshAction,
} from "../actions";
import { raiseSuspicionAction } from "../../cases/actions";
import { RaiseSuspicion } from "@/components/raise-suspicion";
import { DOCUMENT_KINDS } from "@/lib/server/storage";
import { diditEnabled } from "@/lib/server/didit";
import { aiForFirm } from "@/lib/server/ai";
import { SHARE_BASES } from "@/lib/server/sharing";
import { shareClientAction } from "../shared/actions";
import { formatEur } from "@/lib/didit/map";
import { currentPricesOrNull } from "@/lib/server/prices";
import { KybSearch } from "./kyb-panel";
import { kybSearchStatus, searchLimitMessage } from "@/lib/server/kyb";
import { Chip, RiskChip, StatusChip } from "@/components/chips";
import { SCOPE_REASONS } from "@/lib/rules/cdd-scope";
import { LOOK_THROUGH_REASONS } from "@/lib/rules/ownership-branches";

const STATUS: Record<string, string> = { OPEN: "In progress", COMPLETE: "Accepted", SDD: "Accepted (SDD)", EDD: "Accepted (EDD)", REFUSED: "Refused", TERMINATED: "Terminated" };
const LABELS: Record<string, string> = {
  firstNames: "First names", lastName: "Surname", birthDate: "Date of birth", placeOfBirth: "Place of birth", otherNames: "Other names", nationalities: "Nationalities",
  residenceCountry: "Residence", address: "Address", occupation: "Occupation", email: "Email", phone: "Phone", pepFunction: "Public function",
  pepLeftOfficeOn: "Left office", name: "Legal name", legalForm: "Legal form", registrationNumber: "Registration no.", lei: "LEI",
  registeredOffice: "Registered office", principalPlaceOfBusiness: "Principal place of business", countryOfCreation: "Country of creation",
  natureOfBusiness: "Nature of business", sourceOfFunds: "Source of funds (declared)", sourceOfWealth: "Source of wealth (declared)",
  taxResidence: "Tax residence", actingForWhom: "Acting for", signatoryRole: "Signatory role",
};

const ROLE_TEXT: Record<string, string> = {
  client: "client", "beneficial-owner": "beneficial owner", "intermediate-owner": "owning company", "minority-owner": "shareholder below threshold",
  controller: "controls by other means", "senior-managing-official": "senior managing official", "trust-settlor": "settlor", trustee: "trustee",
  "trust-protector": "protector", "trust-beneficiary": "beneficiary", nominee: "nominee", unknown: "role not known",
};

function activityText(action: string, objectType: string, fields: string[], who?: string): string {
  const verb: Record<string, string> = { create: "added", update: "changed", accept: "accepted", refuse: "refused", export: "exported", purge: "deleted", view: "viewed" };
  const thing: Record<string, string> = { Party: who ?? "a person or company", CddFile: "the file", OwnershipLink: "ownership", RegistryExtract: "a register extract", IdentityVerification: "an identity verification", Document: "a document", DiditSession: "a provider check", ScreeningResult: "a screening result", ClientRiskAssessment: "the risk assessment", PortalLink: "a portal link" };
  const f = fields.filter((x) => !x.includes(":")).slice(0, 4).join(", ");
  return `${verb[action] ?? action} ${thing[objectType] ?? objectType}${f ? ` (${f})` : ""}`;
}

function Card({ title, children, id, hide }: { title: string; children: React.ReactNode; id?: string; hide?: boolean }) {
  if (hide) return null;
  return (
    <section id={id} className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
const area = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";

/** Profile tabs (ClearAML's layout). "Overview" shows the whole file; the others show one part of it. */
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "directors", label: "Directors / UBOs", entityOnly: true },
  { id: "verification", label: "Verification" },
  { id: "screening", label: "Screening results" },
  { id: "risk", label: "Risk reports" },
  { id: "documents", label: "Documents" },
  { id: "transactions", label: "Transactions" },
  { id: "matters", label: "Cases" },
  { id: "activity", label: "Activity" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const IN_TAB: Record<string, TabId[]> = {
  "client-data": [], identity: ["verification"], extract: ["verification", "directors"], documents: ["documents"], ownership: ["directors"],
  checks: ["directors", "verification"], screening: ["screening"], risk: ["risk"], edd: ["risk"], approvals: ["risk"],
};

export default async function ClientFilePage({ params, searchParams }: { params: Promise<{ fileId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { fileId } = await params;
  const wantedTab = (await searchParams).tab;
  const tab: TabId = (TABS.find((t) => t.id === wantedTab)?.id ?? "overview") as TabId;
  const show = (k: string) => tab === "overview" || (IN_TAB[k] ?? []).includes(tab);
  const s = await requireUser("client.view");
  const data = await withTenant(s.firm.id, async (tx) => {
    const exists = await tx.cddFile.findUnique({ where: { id: fileId } });
    if (!exists) return null;
    const cf = await loadClientFile(tx, s.firm.id, fileId);
    const lastRisk = await tx.clientRiskAssessment.findFirst({ where: { cddFileId: fileId }, orderBy: { createdAt: "desc" } });
    const approvals = await tx.approval.findMany({ where: { objectId: fileId }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } });
    const hasCase = (await tx.case.count({ where: { partyIds: { has: cf.party.id } } })) > 0;
    const links = await tx.portalLink.findMany({ where: { cddFileId: fileId }, orderBy: { createdAt: "desc" }, take: 5 });
    const documents = await tx.document.findMany({ where: { partyId: cf.party.id }, orderBy: { uploadedAt: "desc" } });
    const didit = await tx.diditSession.findMany({ where: { partyId: { in: [...cf.tree.parties.keys()] } }, orderBy: { createdAt: "desc" }, take: 20 });
    // Activity timeline: the audit trail of this file and the people in its structure.
    // Never cases or reports (they must not be visible to everyone who sees the file).
    const activity = await tx.auditEvent.findMany({
      where: { objectId: { in: [fileId, ...cf.tree.parties.keys()] }, objectType: { notIn: ["Case", "Report"] } },
      orderBy: { at: "desc" }, take: 40,
    });
    const userIds = [...new Set(activity.map((a) => a.userId).filter((x): x is string => !!x))];
    const names = new Map((await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const riskHistory = await tx.clientRiskAssessment.findMany({ where: { cddFileId: fileId }, orderBy: { createdAt: "desc" }, take: 50 });
    const matters = await tx.matterParty.findMany({ where: { partyId: cf.party.id }, include: { matter: { select: { id: true, title: true, status: true, type: true, createdAt: true } } } });
    const transactions = await tx.transaction.findMany({ where: { customerId: cf.party.id }, orderBy: { date: "desc" }, take: 100, include: { matter: { select: { id: true, title: true } } } });
    const aiOn = cf.party.kind !== "NATURAL" && (await aiForFirm(tx, s.firm.id));
    return { cf, lastRisk, approvals, hasCase, links, documents, didit, activity, names, riskHistory, matters, transactions, aiOn };
  });
  if (!data) notFound();
  const kybStatus = data.cf.party.kind !== "NATURAL" && diditEnabled() ? await kybSearchStatus(s.firm.id) : null;
  const pr = diditEnabled() ? await currentPricesOrNull() : null;
  const priceOf = (c: number | undefined) => (c === undefined ? "price updating" : formatEur(c));
  const kybCountryCode = String((data.cf.party.details as { countryOfCreation?: string }).countryOfCreation ?? s.firm.homeState).toUpperCase();
  const { cf, lastRisk, approvals, hasCase, links, documents, didit, activity, names, riskHistory, matters, transactions, aiOn } = data;
  const flaggedTx = transactions.filter((t) => t.monitorStatus === "flagged").length;
  const idvSessions = didit.filter((x) => x.kind === "idv" && x.partyId === cf.party.id);
  const kybSessions = didit.filter((x) => x.kind === "kyb" && x.partyId === cf.party.id);
  const mismatches = (cf.party.details as { idCheckMismatches?: string[] }).idCheckMismatches;
  const activeLink = links.find((l) => l.status === "SENT" || l.status === "OPENED");
  const r = s.user.roles;
  const edit = can(r, "client.edit") && cf.file.status === "OPEN";
  const items = openCddItems(cf.state);
  const d = cf.party.details as Record<string, unknown>;
  const decided = cf.file.status !== "OPEN";
  const entityOptions = [...cf.tree.parties.values()].filter((p) => p.kind !== "NATURAL");
  const pending = cf.screening.filter((x) => x.decision === "PENDING");
  const decidedHits = cf.screening.filter((x) => x.decision === "TRUE_MATCH" || x.decision === "FALSE_POSITIVE");
  const latestChecks = new Map<string, (typeof cf.screening)[number]>();
  for (const x of cf.screening) if (!latestChecks.has(`${x.partyId}:${x.listName}`)) latestChecks.set(`${x.partyId}:${x.listName}`, x);
  const checklist = new Set((cf.file.eddChecklist as string[] | null) ?? []);
  const smo = cf.file.smoFallback as { officials: { name: string; position: string }[]; stepsTaken: string } | null;
  const idOnly = cf.file.scope === "identification-only";
  const st = cf.state;
  const steps = [
    { label: "Identity", anchor: "identity", done: idOnly ? st.clientIdentified !== false : st.identityVerified || !!st.sddDelayedVerification, na: false },
    ...(cf.party.kind !== "NATURAL" ? [{ label: "Ownership", anchor: "ownership", done: st.boResolved !== false, na: idOnly }] : []),
    { label: "People checks", anchor: "checks", done: !(st.missingChecks?.length), na: idOnly || cf.checks.length <= 1 },
    { label: "Screening", anchor: "screening", done: !st.openScreeningMatches && !st.unscreenedParties && !st.trueSanctionsMatch, na: false },
    { label: "Purpose", anchor: "client-data", done: st.purposeRecorded, na: idOnly },
    { label: "Risk & EDD", anchor: st.eddRequired ? "edd" : "risk", done: !st.eddRequired || (!!st.eddChecklistComplete && !!st.seniorApprovalRecorded), na: idOnly },
    { label: "Decision", anchor: "decision", done: decided, na: false },
  ].map((x) => ({ ...x, done: x.done && !x.na }));
  const ANCHOR_FOR: Record<string, string> = {
    identity: "identity", identification: "client-data", "beneficial-owners": "ownership", "people-checks": "checks", purpose: "client-data", risk: "risk",
    unscreened: "screening", screening: "screening", sanctions: "screening", edd: "edd", "senior-approval": "edd", "pep-approval": "edd", discrepancy: "identity",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm text-muted">{cf.party.kind === "NATURAL" ? "Individual" : String(d.legalForm ?? "") || "Entity"} · Client · ID {fileId.slice(0, 8)}</p>
          <h1 className="text-2xl font-semibold">{cf.party.displayName}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <StatusChip status={cf.file.status} ready={!decided && items.length === 0} />
            <RiskChip level={lastRisk?.final ?? cf.risk.level} />
            {cf.file.scope === "identification-only" && <Chip tone="grey">Identification only</Chip>}
            <span className="sr-only">{STATUS[cf.file.status]} · Risk {lastRisk?.final ?? cf.risk.level.toUpperCase()}</span>
            {lastRisk?.overrideReason ? <span className="text-muted">(calculated {lastRisk.calculated}, overridden)</span> : null}
            {cf.file.nextRefreshOn && <span className="text-muted">Next refresh {cf.file.nextRefreshOn.toISOString().slice(0, 10)}</span>}
            {cf.file.retentionUntil && <span className="text-muted">Delete after {cf.file.retentionUntil.toISOString().slice(0, 10)}</span>}
          </p>
          <p className="text-xs text-muted">
            {cf.party.kind === "NATURAL" && d.birthDate ? <>Born {String(d.birthDate)} · </> : null}Added {cf.file.createdAt.toISOString().slice(0, 10)}
          </p>
        </div>
        <nav aria-label="Actions" className="flex flex-wrap gap-2 text-sm" data-testid="action-strip">
          <Link href={`/app/clients/${fileId}?tab=screening#screening`} className="rounded-full border border-border px-3 py-1.5 hover:border-accent">Run Screening</Link>
          <Link href={`/app/clients/${fileId}?tab=verification#identity`} className="rounded-full border border-border px-3 py-1.5 hover:border-accent">{cf.party.kind === "NATURAL" ? "Verify identity" : "Company check"}</Link>
          {edit && <Link href={`/app/clients/${fileId}?tab=documents#documents`} className="rounded-full border border-border px-3 py-1.5 hover:border-accent">Send secure link</Link>}
          {can(r, "approve.compliance") && <a className="rounded-full border border-border px-3 py-1.5 hover:border-accent" href={`/api/supervisor-file/client/${fileId}`}>Download PDF<span className="sr-only"> file pack (summary PDF and documents, ZIP)</span></a>}
        </nav>
      </div>
      {can(r, "approve.compliance") && !hasCase && (
        <span className="flex flex-wrap gap-4 text-sm">
          <a className="text-accent underline" href={`/api/explain/${fileId}`}>Explanation of the decision for the client (Art. 76(5))</a>
        </span>
      )}

      <nav aria-label="Completion checklist">
        <ol className="flex flex-wrap gap-2">
          {steps.map((st, i) => (
            <li key={st.label}>
              <a href={`#${st.anchor}`} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition hover:border-accent ${st.done ? "border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-100" : st.na ? "border-border text-muted" : "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"}`}>
                <span aria-hidden className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${st.done ? "bg-green-600 text-white" : st.na ? "bg-slate-300 text-slate-700" : "bg-amber-500 text-white"}`}>{st.done ? "✓" : i + 1}</span>
                {st.label}<span className="sr-only">{st.done ? " — done" : st.na ? " — not needed" : " — to do"}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {(d.receivedFrom as { firm: string; sentAt: string; receivedAt: string; summary: string[] } | undefined) && (() => {
        const rf = d.receivedFrom as { firm: string; sentAt: string; receivedAt: string; summary: string[] };
        return (
          <details className="rounded-2xl border border-sky-300 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-50" data-testid="received-from">
            <summary className="cursor-pointer font-medium">Received from {rf.firm} on {rf.receivedAt}. Review it before you accept the client: your firm is responsible for its own checks (Art. 48 AMLR).</summary>
            <ul className="mt-2 list-disc pl-5">{rf.summary.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </details>
        );
      })()}

      <nav aria-label="Profile tabs" className="overflow-x-auto border-b border-border">
        <ul className="flex min-w-max gap-1">
          {TABS.filter((t) => !("entityOnly" in t) || cf.party.kind !== "NATURAL").map((t) => (
            <li key={t.id}>
              <Link href={t.id === "overview" ? `/app/clients/${fileId}` : `/app/clients/${fileId}?tab=${t.id}`} aria-current={tab === t.id ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-3 py-2 text-sm ${tab === t.id ? "border-accent font-semibold text-foreground" : "border-transparent text-muted hover:text-foreground"}`}>
                {t.label}{t.id === "documents" ? ` (${documents.length})` : t.id === "matters" ? ` (${matters.length})` : t.id === "transactions" ? (flaggedTx ? ` (${flaggedTx} flagged)` : ` (${transactions.length})`) : ""}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "risk" && (
        <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" data-testid="risk-history">
          <h2 className="font-semibold">Risk assessment history</h2>
          {riskHistory.length === 0 ? <p className="text-sm text-muted">No assessments yet.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {riskHistory.map((ra) => (
                <li key={ra.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="flex items-center gap-2"><RiskChip level={ra.final} /><span className="text-muted">score {ra.score}{ra.overrideReason ? ` · changed from ${ra.calculated.toLowerCase()}: ${ra.overrideReason}` : ""}</span></span>
                  <span className="flex items-center gap-3 text-muted">{ra.createdAt.toISOString().slice(0, 16).replace("T", " ")}<a href={`/api/risk-report/${ra.id}`} className="text-accent underline">Download PDF<span className="sr-only"> of the risk assessment of {ra.createdAt.toISOString().slice(0, 10)}</span></a></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "transactions" && (
        <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" data-testid="client-transactions">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Transactions</h2><Link href={`/app/transactions?client=${cf.party.id}`} className="text-sm text-accent underline">Open in Transaction Monitoring</Link></div>
          {transactions.length === 0 ? <p className="text-sm text-muted">No transactions recorded for this client. Record them on a case or with Log Transaction.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {transactions.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span><span className="font-semibold">€{Number(t.amountEUR).toLocaleString("en-IE")}</span> <span className="text-muted">· {t.method} · {t.date.toISOString().slice(0, 10)} · <Link href={`/app/matters/${t.matter.id}`} className="hover:underline">{t.matter.title}</Link></span>
                    {(t.flags as { text: string }[]).length > 0 && <span className="block text-xs text-red-800 dark:text-red-300">{(t.flags as { text: string }[]).map((f) => f.text).join("; ")}</span>}
                  </span>
                  <Chip tone={t.monitorStatus === "flagged" ? "red" : t.monitorStatus === "investigated" ? "amber" : t.monitorStatus === "cleared" ? "green" : "grey"}>{t.monitorStatus === "flagged" ? "Flagged" : t.monitorStatus === "investigated" ? "Investigated" : t.monitorStatus === "cleared" ? "Cleared" : "Pending"}</Chip>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "matters" && (
        <section className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Cases</h2>{can(r, "client.edit") && <Link href="/app/matters/new" className="text-sm text-accent underline">New Case</Link>}</div>
          {matters.length === 0 ? <p className="text-sm text-muted">No cases for this client yet.</p> : (
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {matters.map((m) => (
                <li key={m.matter.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <Link href={`/app/matters/${m.matter.id}`} className="font-medium text-accent hover:underline">{m.matter.title}</Link>
                  <span className="text-muted">{m.matter.status.toLowerCase().replace("_", " ")} · opened {m.matter.createdAt.toISOString().slice(0, 10)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {cf.file.source === "back-book" && cf.file.status === "OPEN" && (
        <p role="note" className="rounded border border-border px-3 py-2 text-sm">
          Existing client being brought up to the new CDD standard. Gaps found at import:{" "}
          {((cf.file.remediation as { gaps?: { label: string }[] } | null)?.gaps ?? []).map((g) => g.label).join("; ") || "none"}. Accept the client again when nothing is open.
        </p>
      )}

      {hasCase && (
        <p role="note" className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Don&apos;t tell the client about any internal compliance review of this file (tipping-off is prohibited, AMLR Art. 73).
        </p>
      )}

      {!decided && (
        <Card title={items.length ? "What to do next" : "Ready to decide"} hide={tab !== "overview"}>
          {items.length ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {items.map((i) => (
                <li key={i.id}>{ANCHOR_FOR[i.id] ? <a className="hover:underline" href={`#${ANCHOR_FOR[i.id]}`}>{i.message}</a> : i.message} <span className="text-muted">({i.article})</span></li>
              ))}
            </ol>
          ) : (
            <p className="text-sm">All mandatory items are complete. Review the file and accept the client below.</p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Client data" id="client-data" hide={!show("client-data")}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(d).filter(([k]) => k !== "portalDeclaration" && k !== "additionalEddCaseIds").filter(([, v]) => v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && v.length === 0) && typeof v !== "boolean").map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{LABELS[k] ?? k}</dt>
                <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
              </div>
            ))}
            <dt className="text-muted">ID number</dt><dd>{cf.party.nationalIdEnc ? "Recorded (encrypted)" : "—"}</dd>
            {cf.isPep && (<><dt className="text-muted">PEP</dt><dd>Yes</dd></>)}
            {!!d.isPepFamilyOrAssociate && (<><dt className="text-muted">PEP family / associate</dt><dd>Yes</dd></>)}
            {cf.state.hasBearerShares && (<><dt className="text-muted">Bearer shares</dt><dd className="text-red-700 dark:text-red-300">Yes — cannot be accepted (Art. 79)</dd></>)}
          </dl>
          <ActionForm action={updatePurposeAction.bind(null, fileId)}>
            <Field label="Purpose and intended nature (Art. 25)" name="purpose" defaultValue={cf.file.purpose ?? ""} />
            {edit && <Submit variant="secondary">Save purpose</Submit>}
          </ActionForm>
        </Card>

        {cf.party.kind === "NATURAL" ? (
          <Card title="Identity verification (Art. 22)" id="identity" hide={!show("identity")}>
            {cf.verifications.length ? (
              <ul className="text-sm">
                {cf.verifications.map((v) => (
                  <li key={v.id}>
                    {v.method === "EID" ? "National eID" : v.method === "IN_PERSON" ? "In person with ID document" : "ID document + NFC chip + liveness"}
                    {v.assuranceLevel ? ` (${v.assuranceLevel})` : ""} · {v.verifiedAt.toISOString().slice(0, 10)}
                    {v.fallbackReason && <span className="block text-muted">Why not eID: {v.fallbackReason}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not verified yet. Order of preference: national eID (eIDAS substantial/high), in person, remote document + NFC + liveness.</p>
            )}
            {diditEnabled() ? (
              <div className="space-y-2 rounded border border-border p-3" data-testid="didit-idv">
                <p className="text-sm font-medium">Remote identity check (Didit, EU)</p>
                <p className="text-xs text-muted">National eID where available, otherwise ID document with chip read, liveness and face match. Images, video and the report are saved to this file.</p>
                {idvSessions.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span>{x.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {x.status}{x.sandbox ? " · sandbox" : ""}{x.importedAt ? " · imported" : ""}</span>
                    {!x.importedAt && <ActionButton action={diditRefreshAction.bind(null, fileId, x.diditSessionId)}>Refresh result</ActionButton>}
                  </div>
                ))}
                {mismatches?.length ? <p className="text-sm text-red-700 dark:text-red-300">ID check differs from the file: {mismatches.join("; ")}. Correct the file or ask the client.</p> : null}
                {edit && <ActionButton action={diditIdvAction.bind(null, fileId)} variant="primary">{`Send identity check (${priceOf(pr?.idv)})`}</ActionButton>}
              </div>
            ) : (
              <p className="text-xs text-muted">Remote identity checks aren&apos;t set up for this installation. Record the result of the check here.</p>
            )}
            {edit && (
              <details className="rounded border border-border p-3" open={!diditEnabled()}>
                <summary className="cursor-pointer text-sm font-medium">Record a check done another way (in person, eID)</summary>
                <div className="mt-3">
              <ActionForm action={recordVerificationAction.bind(null, fileId)}>
                <Field label="Method" name="method" required>
                  <select name="method" className={sel} aria-label="Method" defaultValue="IN_PERSON">
                    <option value="EID">National eID (eIDAS)</option>
                    <option value="IN_PERSON">In person with ID document</option>
                    <option value="DOCUMENT_NFC_LIVENESS">Remote: document + NFC chip + liveness</option>
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Document type" name="documentType" hint="e.g. ID card, passport" />
                  <Field label="Document number" name="documentNumber" hint="Stored encrypted." autoComplete="off" />
                  <Field label="eID scheme / assurance level" name="assuranceLevel" hint="e.g. Smart-ID, high" />
                  <Field label="Provider" name="provider" />
                </div>
                <Field label="Why national eID wasn't used" name="fallbackReason" hint="Required for in-person or remote document checks." />
                <Submit variant="secondary">Record verification</Submit>
              </ActionForm>
                </div>
              </details>
            )}

          </Card>
        ) : (
          <Card title="Register extract (Art. 22(7), 23(4))" id="identity" hide={!show("extract")}>
            {cf.extracts.length ? (
              <ul className="space-y-3 text-sm">
                {cf.extracts.map((x) => {
                  const xd = x.data as { level?: string; kybResponseId?: string | null; extractDate?: string; notes?: string; provider?: string; registryStatus?: string | null; tierDelivered?: string | null; ownershipStatus?: string | null; sandbox?: boolean; warnings?: string[]; people?: { name: string; entityType: string; roles: string[]; designation?: string; ownershipPct: number | null; effectivePct: number | null; addedPartyId: string | null; active: boolean }[] };
                  return (
                    <li key={x.id} className="space-y-2">
                      <p>
                        <span className="font-medium">{x.register}</span> · {String(xd.extractDate ?? "")}
                        {xd.registryStatus && <> · status <span className={/^(active|registered|live)$/i.test(xd.registryStatus) ? "" : "font-semibold text-red-700 dark:text-red-300"}>{xd.registryStatus}</span></>}
                        {xd.sandbox && " · sandbox"}
                        {xd.notes ? ` · ${xd.notes}` : ""}
                      </p>
                      {xd.provider === "Didit" && xd.level === "lite" && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>Company and status check — ownership not included.</span>
                          {edit && <span>Need the owners? Search the register again and choose <strong>Full ownership</strong> ({priceOf(pr?.kybFull(kybCountryCode))}).</span>}
                        </div>
                      )}
                      {xd.provider === "Didit" && xd.level !== "lite" && xd.ownershipStatus && xd.ownershipStatus !== "delivered" && <p className="text-xs text-muted">The register gave no ownership data ({xd.ownershipStatus}). Ask the client for the shareholder register and declare the owners below.</p>}
                      {xd.provider === "AI" && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100" data-testid="ai-ownership-note">
                          <p className="font-medium">Drafted by AI. Check every name and percentage against the document before you add it.</p>
                          {xd.warnings?.length ? <ul className="mt-1 list-disc pl-4">{xd.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul> : null}
                        </div>
                      )}
                      {xd.people?.length ? (
                        <ul className="divide-y divide-border rounded-lg border border-border" data-testid="register-people">
                          {xd.people.map((p, i) => {
                            const canAdd = !p.addedPartyId && ((p.ownershipPct ?? 0) > 0 || (p.roles.includes("ubo") && p.entityType === "person") || p.roles.some((r) => ["trustee", "settlor", "protector", "beneficiary", "nominee"].includes(r)));
                            return (
                              <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                                <span>
                                  {p.name}
                                  <span className="text-muted"> · {[p.entityType === "company" ? "company" : null, ...p.roles.filter((r) => r !== "officer").map((r) => (r === "ubo" ? "beneficial owner" : r)), p.designation, p.ownershipPct !== null ? `${p.ownershipPct}% direct` : null, p.effectivePct !== null && p.effectivePct !== p.ownershipPct ? `${p.effectivePct}% effective` : null, p.active ? null : "former"].filter(Boolean).join(" · ")}</span>
                                </span>
                                {p.addedPartyId ? <span className="text-xs text-muted">In the structure</span> : canAdd && edit ? <ActionButton action={kybAddPersonAction.bind(null, fileId, x.id, i)}>Add to ownership</ActionButton> : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted">No register extract yet. Check the company register below, or record an extract you obtained yourself.</p>
            )}
            {edit && aiOn && (
              <details className="rounded border border-border p-3" data-testid="ai-ownership">
                <summary className="cursor-pointer text-sm font-medium">Draft the owners from a document (AI)</summary>
                <div className="mt-3 space-y-2 text-sm">
                  <p className="text-muted">Upload the shareholder register, articles or trust deed under Documents first. The AI reads it and lists the owners and controllers it names; you then check each one and add it. Nothing is added automatically.</p>
                  {documents.filter((doc) => ["application/pdf", "image/png", "image/jpeg"].includes(doc.mimeType) && doc.malwareScan !== "quarantined").length ? (
                    <ActionForm action={aiOwnershipDraftAction.bind(null, fileId)}>
                      <Field label="Document" name="documentId" required>
                        <select name="documentId" className={sel} aria-label="Document">
                          {documents.filter((doc) => ["application/pdf", "image/png", "image/jpeg"].includes(doc.mimeType) && doc.malwareScan !== "quarantined").map((doc) => <option key={doc.id} value={doc.id}>{doc.fileName} · {doc.kind} · {doc.uploadedAt.toISOString().slice(0, 10)}</option>)}
                        </select>
                      </Field>
                      <Submit variant="secondary">Draft the owners</Submit>
                    </ActionForm>
                  ) : <p>No PDF or image documents yet. <Link className="underline" href={`/app/clients/${fileId}?tab=documents#documents`}>Upload one</Link>.</p>}
                </div>
              </details>
            )}
            {kybSessions.filter((k) => !k.importedAt).map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-2 text-sm">
                <span>Register check of {k.createdAt.toISOString().slice(0, 10)} · {k.status}</span>
                <ActionButton action={kybRefreshAction.bind(null, fileId, k.diditSessionId)}>Refresh</ActionButton>
              </div>
            ))}
            {edit && diditEnabled() && (
              <KybSearch
                fileId={fileId}
                name={String((cf.party.details as { name?: string }).name ?? cf.party.displayName)}
                registrationNumber={String((cf.party.details as { registrationNumber?: string }).registrationNumber ?? "")}
                country={String((cf.party.details as { countryOfCreation?: string }).countryOfCreation ?? s.firm.homeState)}
                litePrice={priceOf(pr?.kybLite)}
                fullPrice={priceOf(pr?.kybFull(kybCountryCode))}
                ownersRecorded={cf.tree.links.some((l) => l.ownedId === cf.party.id)}
                search={kybStatus ? { blocked: kybStatus.state.blocked, remaining: kybStatus.state.remaining, message: kybStatus.state.blocked ? searchLimitMessage(kybStatus.state.limit, kybStatus.state.blockedUntil!) : null, recent: kybStatus.recent.map((r) => ({ at: r.at.toISOString().slice(0, 16).replace("T", " "), query: r.query, country: r.country, results: (r.results as { name: string; registrationNumber: string | null }[]).slice(0, 5) })) } : null}
              />
            )}
            {edit && (
              <details className="rounded border border-border p-3" open={!diditEnabled()}>
                <summary className="cursor-pointer text-sm font-medium">Record an extract you obtained yourself</summary>
                <div className="mt-3">
              <ActionForm action={recordExtractAction.bind(null, fileId)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Register" name="register" defaultValue={cf.profile.boRegister?.name ?? ""} hint="Business or BO register" />
                  <Field label="Extract date" name="extractDate" type="date" />
                </div>
                <Field label="Notes / differences found" name="notes" />
                <Submit variant="secondary">Record extract</Submit>
              </ActionForm>
                </div>
              </details>
            )}
            {can(r, "client.edit") && cf.extracts.length > 0 && (
              <details className="rounded border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">The register differs from what the client declared</summary>
                <ActionForm action={openDiscrepancyAction.bind(null, fileId)} className="mt-2 space-y-2">
                  <Field label="Describe the difference" name="description" required />
                  <Submit variant="secondary">Open discrepancy (14-day clock)</Submit>
                </ActionForm>
              </details>
            )}
            
          </Card>
        )}
      </div>

      <Card title="Client portal and documents" id="documents" hide={!show("documents")}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            {links.length > 0 && (
              <ul>
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {l.sentTo} · {l.status.toLowerCase()}
                      {l.submittedAt ? ` ${l.submittedAt.toISOString().slice(0, 10)}` : ` · expires ${l.expiresAt.toISOString().slice(0, 10)}`}
                      {l.remindersSent ? ` · ${l.remindersSent} reminder(s)` : ""}
                    </span>
                    {edit && (l.status === "SENT" || l.status === "OPENED") && <ActionButton action={revokePortalLinkAction.bind(null, fileId, l.id)}>Revoke</ActionButton>}
                  </li>
                ))}
              </ul>
            )}
            {!!(d.portalDeclaration as { signedName?: string } | undefined)?.signedName && (
              <p>Declaration signed by {(d.portalDeclaration as { signedName: string; signedAt: string }).signedName} on {(d.portalDeclaration as { signedAt: string }).signedAt.slice(0, 10)}.</p>
            )}
            {edit && (
              <ActionForm action={sendPortalLinkAction.bind(null, fileId)}>
                <Field label={activeLink ? "Send a new link (the current one stops working)" : "Send the client a secure link to fill in their details"} name="email" type="email" defaultValue={String(d.email ?? activeLink?.sentTo ?? "")} hint="The client answers the questions, uploads documents and signs. Links expire after 14 days." />
                <Submit variant="secondary">Send link</Submit>
              </ActionForm>
            )}
          </div>
          <div className="space-y-3 text-sm">
            {documents.length ? (
              <ul>
                {documents.map((doc) => (
                  <li key={doc.id}>
                    {DOCUMENT_KINDS[doc.kind] ?? doc.kind}:{" "}
                    {doc.malwareScan === "clean" ? (
                      <a className="text-accent underline" href={`/api/files/${doc.id}`}>{doc.fileName}</a>
                    ) : (
                      <span>{doc.fileName} <span className="text-muted">({doc.malwareScan === "quarantined" ? "blocked by malware scan" : "waiting for malware scan"})</span></span>
                    )}
                    <span className="text-muted"> · {doc.uploadedBy.startsWith("portal") ? "from client" : "staff"} · {doc.uploadedAt.toISOString().slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No documents yet.</p>
            )}
            {edit && (
              <ActionForm action={staffUploadAction.bind(null, fileId)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Kind of document" name="kind">
                    <select name="kind" className={sel} aria-label="Kind of document">{Object.entries(DOCUMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </Field>
                  <Field label="File" name="file">
                    <input type="file" name="file" aria-label="File" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx" className="text-sm" />
                  </Field>
                </div>
                <Submit variant="secondary">Upload</Submit>
              </ActionForm>
            )}
          </div>
        </div>
        {can(r, "approve.compliance") && (
          <details className="mt-4 rounded border border-border p-3" data-testid="share-file">
            <summary className="cursor-pointer text-sm font-medium">Share with another firm</summary>
            <div className="mt-3 space-y-2 text-sm">
              <p className="text-muted">Sends a copy of this client&apos;s data, ownership structure, check summary and documents to another firm that uses AMLSync App. Ask them for their firm code (Clients → Shared Files). Nothing is shared until they import it, and you can withdraw it until then. Never share a file when the client is under an internal suspicion report: that could tip them off (Art. 73).</p>
              <ActionForm action={shareClientAction.bind(null, fileId)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Their firm code" name="code" required hint="e.g. ABCD-EFGH" autoComplete="off" />
                  <Field label="Legal basis" name="legalBasis" required>
                    <select name="legalBasis" className={sel} aria-label="Legal basis">{Object.entries(SHARE_BASES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </Field>
                </div>
                <Field label="Note to the other firm" name="note" hint="Optional, e.g. why you are sending it." />
                <label className="flex items-start gap-2"><input type="checkbox" name="confirm" className="mt-1" /> <span>I confirm we may share this file on the basis above, and the client is not the subject of a suspicion report.</span></label>
                <Submit variant="secondary">Send the file</Submit>
              </ActionForm>
            </div>
          </details>
        )}
      </Card>

      {cf.bo && (
        <Card title="Ownership and beneficial owners (Art. 51–60)" id="ownership" hide={!show("ownership")}>
          {cf.tree.links.length === 0 ? (
            <p className="text-sm text-muted">No shareholders or controllers recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {cf.tree.links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span>
                    {cf.tree.parties.get(l.ownerId)?.displayName} → {cf.tree.parties.get(l.ownedId)?.displayName}:{" "}
                    {l.type === "SHAREHOLDING" ? `${Number(l.pct)}%` : `control — ${l.controlDescription}`}
                  </span>
                  {edit && <ActionButton action={removeLinkAction.bind(null, fileId, l.id)}>Remove</ActionButton>}
                </li>
              ))}
            </ul>
          )}
          <div>
            <h3 className="text-sm font-semibold">Beneficial owners (calculated)</h3>
            {cf.bo.beneficialOwners.length ? (
              <ul className="text-sm">
                {cf.bo.beneficialOwners.map((b) => (
                  <li key={b.personId}><strong>{b.name}</strong> — {b.effectivePct}% <span className="text-muted">{b.reasons.join("; ")}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nobody reaches 25% or has control by other means.</p>
            )}
            {cf.bo.candidates.filter((c) => !c.isBeneficialOwner).length > 0 && (
              <p className="text-xs text-muted">Below threshold: {cf.bo.candidates.filter((c) => !c.isBeneficialOwner).map((c) => `${c.name} ${c.effectivePct}%`).join(", ")}</p>
            )}
            {cf.branches && cf.branches.branches.length > 0 && (
              <div className="space-y-2" data-testid="ownership-branches">
                <p className="text-sm font-medium">
                  Ownership still to trace{cf.branches.openCount ? ` — ${cf.branches.openCount} open branch(es), ${cf.branches.openPct}% of the client` : " — all branches closed"}
                </p>
                <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                  {cf.branches.branches.map((b) => {
                    const name = cf.tree.parties.get(b.entityId)?.displayName ?? "?";
                    return (
                      <li key={`${b.entityId}-${b.gap}`} className="space-y-2 px-3 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span>
                            <span className="font-medium">{name}</span>
                            <span className="text-muted"> · {b.gap === "no-owners" ? "no owners recorded" : `${b.unaccountedPct}% of its shares not accounted for`} · {b.effectivePct}% of the client</span>
                          </span>
                          {b.status === "open" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Open</span>}
                          {b.status === "below-threshold" && <span className="text-xs text-muted">Closed: open branches together are below {cf.bo!.thresholdPct}%</span>}
                          {b.status === "declared" && (
                            <span className="flex items-center gap-2 text-xs text-muted">
                              Closed: {LOOK_THROUGH_REASONS[b.reason ?? ""] ?? b.reason}
                              {edit && <ActionButton action={reopenLookThroughAction.bind(null, fileId, b.entityId)}>Reopen</ActionButton>}
                            </span>
                          )}
                        </div>
                        {b.status === "open" && edit && (
                          <details className="rounded border border-border p-2">
                            <summary className="cursor-pointer text-xs font-medium">No further look-through needed</summary>
                            <ActionForm action={declareLookThroughAction.bind(null, fileId, b.entityId)} className="mt-2 space-y-2">
                              <Field label="Reason" name="reason" required>
                                <select name="reason" defaultValue="" className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Reason">
                                  <option value="" disabled>Choose…</option>
                                  {Object.entries(LOOK_THROUGH_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                </select>
                              </Field>
                              <Field label="Basis / steps taken" name="note" hint="Source (register, client declaration, stock exchange) or the steps you took." />
                              <Submit variant="secondary">Close branch</Submit>
                            </ActionForm>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {cf.branches.openCount > 0 && <p className="text-xs text-muted">Add the owners of an open branch below, or record why no further look-through is needed.</p>}
              </div>
            )}
            {cf.sanctions.sanctionedOwnershipPct > 0 && (
              <p className="text-sm">Sanctioned ownership through the structure: {cf.sanctions.sanctionedOwnershipPct}%{cf.sanctions.affected ? " — client is sanctions-affected" : ""}</p>
            )}
          </div>
          {edit && (
            <details className="rounded border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add a shareholder or controller</summary>
              <ActionForm action={addOwnerAction.bind(null, fileId)} className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Of entity" name="ownedId">
                    <select name="ownedId" className={sel} aria-label="Of entity">
                      {entityOptions.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                    </select>
                  </Field>
                  <Field label="Link" name="linkType">
                    <select name="linkType" className={sel} aria-label="Link">
                      <option value="SHAREHOLDING">Shareholding</option>
                      <option value="CONTROL">Control by other means</option>
                    </select>
                  </Field>
                  <Field label="% held" name="pct" type="number" inputMode="decimal" />
                </div>
                <Field label="How control is exercised (for control)" name="controlDescription" />
                <PartyFields prefix="owner." compact />
                <Submit variant="secondary">Add</Submit>
              </ActionForm>
            </details>
          )}
          {cf.bo.requiresSmoFallback && (
            <div className="space-y-2">
              {smo && cf.smoFallbackOk ? (
                <p className="text-sm">No BO — SMO recorded: {smo.officials.map((o) => `${o.name} (${o.position})`).join(", ")}.</p>
              ) : null}
              {edit && (
                <details className="rounded border border-border p-3" open={!smo}>
                  <summary className="cursor-pointer text-sm font-medium">No beneficial owner found? Record senior managing officials (Art. 22(2))</summary>
                  <ActionForm action={saveSmoAction.bind(null, fileId)} className="mt-3 space-y-4">
                    <Field label="Senior managing officials (one per line: name, position)" name="officials">
                      <textarea name="officials" rows={3} className={area} aria-label="Senior managing officials" defaultValue={smo?.officials.map((o) => `${o.name}, ${o.position}`).join("\n")} />
                    </Field>
                    <Field label="Steps taken to identify a beneficial owner" name="stepsTaken">
                      <textarea name="stepsTaken" rows={3} className={area} aria-label="Steps taken" defaultValue={smo?.stepsTaken} />
                    </Field>
                    <Submit variant="secondary">Record</Submit>
                  </ActionForm>
                </details>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Checks per person (Art. 20, 22, 58)" id="checks" hide={!show("checks")}>
        <p className="text-xs text-muted">What each person or company in the structure needs, from their role. Several roles: the strictest applies. Unknown role: the strictest check.</p>
        <ul className="divide-y divide-border rounded-lg border border-border text-sm" data-testid="checks-per-person">
          {cf.checks.map((c) => (
            <li key={c.partyId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span>
                <span className="font-medium">{c.name}</span>
                <span className="text-muted"> · {c.roles.map((r) => ROLE_TEXT[r] ?? r).join(", ")}</span>
                <span className="block text-xs text-muted" title={`${c.required.why} (${c.required.article})`}>{c.required.label}{c.evidence.screened ? " · screened" : " · not screened yet"}</span>
              </span>
              <span className="flex items-center gap-2">
                {c.done ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-900 dark:bg-green-900/40 dark:text-green-200">Done</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Needed</span>}
                {!c.done && edit && diditEnabled() && c.kind === "NATURAL" && c.partyId !== cf.party.id && (c.required.level === "full" || c.required.level === "reasonable") && (
                  <ActionButton action={diditIdvAction.bind(null, fileId, c.partyId)}>{`Send identity check (${priceOf(pr?.idv)})`}</ActionButton>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Screening (sanctions, PEP)" id="screening" hide={!show("screening")}>
        <p className="text-xs text-muted">
          Every person and company in the structure is screened. Screening can&apos;t be reduced for low-risk clients. The PEP/RCA data provider is
          not connected yet; record known PEP status on the client data.
        </p>
        {pending.map((x) => {
          const m = x.matchData as { matchedName: string; score: number; reasons: string[]; reference?: string };
          return (
            <div key={x.id} className="space-y-2 rounded border border-amber-400 p-3 text-sm">
              <p>
                <strong>Possible match</strong> for {cf.tree.parties.get(x.partyId)?.displayName}: &quot;{m.matchedName}&quot; on {x.listName} (version {x.listVersion}){m.reference ? `, ref. ${m.reference}` : ""}
              </p>
              <ul className="list-disc pl-5 text-muted">{m.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              {can(r, "client.edit") && (
                <ActionForm action={decideMatchAction.bind(null, fileId, x.id)} className="space-y-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1"><input type="radio" name="decision" value="FALSE_POSITIVE" defaultChecked /> False positive</label>
                    <label className="flex items-center gap-1"><input type="radio" name="decision" value="TRUE_MATCH" /> True match</label>
                  </div>
                  <Field label="Reason for your decision" name="comment" required />
                  <Submit variant="secondary">Record decision</Submit>
                </ActionForm>
              )}
            </div>
          );
        })}
        <ul className="text-sm">
          {[...latestChecks.values()].map((x) => (
            <li key={x.id} className="text-muted">
              {cf.tree.parties.get(x.partyId)?.displayName}: {x.listName} v{x.listVersion} · {x.screenedAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
              {x.decision === "NO_MATCH" ? "no match" : x.decision.toLowerCase().replace("_", " ")}
            </li>
          ))}
          {latestChecks.size === 0 && <li className="text-muted">No screening lists are loaded. Ask AMLSync to load the EU and UN lists, or upload your national list.</li>}
        </ul>
        {decidedHits.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Decided matches ({decidedHits.length})</summary>
            <ul>{decidedHits.map((x) => <li key={x.id}>{(x.matchData as { matchedName: string }).matchedName} — {x.decision === "TRUE_MATCH" ? "true match" : "false positive"}: {x.comment}</li>)}</ul>
          </details>
        )}
        {can(r, "client.edit") && <ActionButton action={rescreenAction.bind(null, fileId)}>Screen again now (EU/UN lists, free)</ActionButton>}
        {can(r, "client.edit") && diditEnabled() && (
          <details className="rounded border border-border p-3" data-testid="didit-screen">
            <summary className="cursor-pointer text-sm font-medium">PEP, sanctions and adverse-media screening with Didit ({priceOf(pr?.screen)} per person or company)</summary>
            <ul className="mt-2 space-y-1 text-sm">
              {[...cf.tree.parties.values()].map((p) => {
                const last = didit.find((x) => x.kind === "aml" && x.partyId === p.id);
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>{p.displayName}{last ? <span className="text-muted"> · screened {last.createdAt.toISOString().slice(0, 10)}</span> : null}</span>
                    <ActionButton action={diditScreenAction.bind(null, fileId, p.id)}>{`Screen (${priceOf(pr?.screen)})`}</ActionButton>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </Card>

      <Card title={`Risk: ${cf.risk.level} (score ${cf.risk.score})`} id="risk" hide={!show("risk")}>
        {cf.risk.factors.length ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {cf.risk.factors.map((f) => (
                <tr key={f.id}>
                  <td className="py-1 pr-4">{f.label}{f.forcesHigh ? " — requires EDD" : ""}</td>
                  <td className="py-1 pr-4 text-right">+{f.points}</td>
                  <td className="py-1 text-muted">{f.article ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No risk factors found in the data collected.</p>
        )}
        <p className="text-xs text-muted">
          Rule set {cf.risk.rulesetVersion} · Country Profile v{cf.profileVersion}. Low = SDD possible; High = EDD. Calculated from collected data; AI never sets a risk rating.
        </p>
        {lastRisk?.overrideReason && <p className="text-sm">Override to {lastRisk.final}: {lastRisk.overrideReason}</p>}
        {can(r, "risk.override") && (
          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Override the risk level (Compliance Officer)</summary>
            <ActionForm action={riskOverrideAction.bind(null, fileId)} className="mt-3 space-y-3">
              <Field label="New level" name="level">
                <select name="level" className={sel} aria-label="New level" defaultValue="HIGH">
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                </select>
              </Field>
              <Field label="Written reason" name="reason" required />
              <Submit variant="secondary">Override</Submit>
            </ActionForm>
          </details>
        )}
      </Card>

      {(cf.risk.eddRequired || cf.state.isPep) && (
        <Card title="Enhanced due diligence (Art. 34, 42)" id="edd" hide={!show("edd")}>
          {cf.risk.eddRequired && (
            <ActionForm action={eddChecklistAction.bind(null, fileId)} className="space-y-2">
              {EDD_CHECKLIST.map((i) => (
                <label key={i.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={`edd.${i.id}`} defaultChecked={checklist.has(i.id)} disabled={!edit} className="mt-1" /> {i.label}
                </label>
              ))}
              {edit && <Submit variant="secondary">Save checklist</Submit>}
            </ActionForm>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {cf.risk.eddRequired && (
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">Senior management approval (EDD)</h3>
                {cf.approvals.edd ? <p>Approved.</p> : can(r, "approve.management") ? (
                  <ActionForm action={seniorApprovalAction.bind(null, fileId, "edd")}>
                    <Field label="Reasons" name="reason" required />
                    <Submit variant="secondary">Approve</Submit>
                    <StepUpLink />
                  </ActionForm>
                ) : <p className="text-muted">Needs an Owner (management body).</p>}
              </div>
            )}
            {cf.state.isPep && (
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">PEP: approval to establish or continue</h3>
                {cf.approvals.pep ? <p>Approved.</p> : can(r, "approve.management") ? (
                  <ActionForm action={seniorApprovalAction.bind(null, fileId, "pep")}>
                    <Field label="Reasons, incl. source of wealth and funds" name="reason" required />
                    <Submit variant="secondary">Approve PEP relationship</Submit>
                    <StepUpLink />
                  </ActionForm>
                ) : <p className="text-muted">Needs an Owner (management body).</p>}
              </div>
            )}
          </div>
        </Card>
      )}

      <Card title="Scope of due diligence" id="scope" hide={!show("scope")}>
        {cf.file.scope === "identification-only" ? (
          <p className="text-sm">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">Identification only</span>{" "}
            {SCOPE_REASONS[cf.file.scopeReason ?? ""]?.label ?? "Outside AMLR scope"}{cf.file.scopeNote ? `: ${cf.file.scopeNote}` : ""}. Identification and sanctions screening still apply; a case that is an AMLR service can&apos;t complete until you switch to full due diligence.
          </p>
        ) : (
          <p className="text-sm text-muted">Full due diligence (AMLR).{decided ? "" : " If this client only receives services outside AMLR scope, a Compliance Officer can record them as identification only."}</p>
        )}
        {cf.file.scope === "identification-only" && can(r, "client.edit") && (
          <ActionForm action={setScopeAction.bind(null, fileId)}>
            <input type="hidden" name="scope" value="full" />
            <Submit variant="secondary">Switch to full due diligence</Submit>
          </ActionForm>
        )}
        {cf.file.scope !== "identification-only" && !decided && can(r, "gate.override") && (
          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Record as identification only (outside AMLR scope)</summary>
            <ActionForm action={setScopeAction.bind(null, fileId)} className="mt-3 space-y-3">
              <input type="hidden" name="scope" value="identification-only" />
              <Field label="Why the service is outside AMLR scope" name="scopeReason" required>
                <select name="scopeReason" defaultValue="" className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Reason">
                  <option value="" disabled>Choose…</option>
                  {Object.entries(SCOPE_REASONS).filter(([k]) => k !== "firm-default").map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </Field>
              <Field label="Details" name="scopeNote" hint="Required for “Other”. Recorded in the file." />
              <Submit variant="secondary">Record as identification only</Submit>
            </ActionForm>
          </details>
        )}
      </Card>

      {!decided && can(r, "client.accept") && (
        <Card title="Decision" id="decision" hide={!show("decision")}>
          <div className="grid gap-6 sm:grid-cols-2">
            <ActionForm action={acceptAction.bind(null, fileId)} className="space-y-3">
              <h3 className="text-sm font-semibold">Accept the client</h3>
              {cf.risk.sddEligible && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="sdd" className="mt-1" /> Apply simplified due diligence: verification may be completed within 60 days (Art. 33)
                </label>
              )}
              {can(r, "gate.override") && items.length > 0 && (
                <Field label="Override open items — written reason (Compliance Officer only)" name="overrideReason" hint="Sanctions, anonymity and bearer shares can never be overridden." />
              )}
              <Submit>Accept client</Submit>
              <StepUpLink />
            </ActionForm>
            <ActionForm action={endAction.bind(null, fileId)} className="space-y-3">
              <h3 className="text-sm font-semibold">Refuse (CDD can&apos;t be completed, Art. 21)</h3>
              <input type="hidden" name="kind" value="REFUSED" />
              <Field label="Reason" name="reason" required />
              <fieldset className="space-y-1 text-sm">
                <legend className="font-medium">Is there a suspicion of money laundering or terrorist financing?</legend>
                <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="none" /> No — record the assessment</label>
                <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="raise" /> Yes — report internally to the Compliance Officer</label>
              </fieldset>
              <Submit variant="danger">Refuse client</Submit>
              <StepUpLink />
            </ActionForm>
          </div>
        </Card>
      )}

      {decided && cf.file.status !== "REFUSED" && cf.file.status !== "TERMINATED" && can(r, "client.accept") && (
        <Card title="Periodic refresh (Art. 26)" hide={!show("refresh")}>
          <p className="text-sm text-muted">
            Due {cf.file.nextRefreshOn?.toISOString().slice(0, 10) ?? "—"}. 30 days before, the client automatically gets a link to confirm nothing changed; screening re-runs in the
            background. You can also refresh now after updating the file.
          </p>
          <ActionButton action={markRefreshedAction.bind(null, fileId)}>Mark CDD refreshed</ActionButton>
        </Card>
      )}

      {decided && cf.file.status !== "REFUSED" && cf.file.status !== "TERMINATED" && can(r, "client.accept") && (
        <Card title="End the relationship" hide={!show("end")}>
          <ActionForm action={endAction.bind(null, fileId)} className="max-w-xl space-y-3">
            <input type="hidden" name="kind" value="TERMINATED" />
            <Field label="Reason" name="reason" required hint="e.g. engagement ended, or CDD could no longer be kept up to date." />
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Is there a suspicion?</legend>
              <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="none" /> No</label>
              <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="raise" /> Yes — report internally</label>
            </fieldset>
            <Submit variant="danger">End relationship</Submit>
            <StepUpLink />
          </ActionForm>
        </Card>
      )}

      {can(r, "case.raise") && <RaiseSuspicion action={raiseSuspicionAction.bind(null, { partyIds: [cf.party.id], matterIds: [] })} />}

      {approvals.length > 0 && (
        <Card title="Decisions and approvals" hide={!show("approvals")}>
          <ul className="text-sm">
            {approvals.map((a) => (
              <li key={a.id}>
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {a.objectType.replace("CddFile:", "")} · {a.user.name} ({a.role.toLowerCase().replace("_", " ")})
                {a.reason ? ` — ${a.reason}` : ""} <span className="text-muted">· EU Core {a.euCoreVersion}, Country Profile v{a.countryProfileVersion}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(tab === "overview" || tab === "activity") && (
      <details className="rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" id="activity" open={tab === "activity"}>
        <summary className="cursor-pointer font-semibold">Activity ({activity.length})</summary>
        <ol className="mt-3 space-y-1 text-sm">
          {activity.map((a) => (
            <li key={String(a.id)} className="flex flex-wrap gap-x-2">
              <span className="text-muted tabular-nums">{a.at.toISOString().slice(0, 16).replace("T", " ")}</span>
              <span>{a.userId ? names.get(a.userId) ?? "A colleague" : "AMLSync App"}</span>
              <span className="text-muted">{activityText(a.action, a.objectType, a.fields, cf.tree.parties.get(a.objectId)?.displayName)}</span>
            </li>
          ))}
          {activity.length === 0 && <li className="text-muted">Nothing yet.</li>}
        </ol>
      </details>
      )}
    </div>
  );
}
