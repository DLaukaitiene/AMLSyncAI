import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { complianceHealth, firmMetrics, firmUsage, MILESTONES } from "@/lib/server/backoffice/metrics";
import { Badge, bandTone, eur, fmtDate, fmtDateTime, Page, Section, statusTone, Table, Tabs, Tile, Tiles } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { planOf } from "@/lib/billing/plans";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import { CREDIT_FOUR_EYES_CENTS } from "@/lib/backoffice/four-eyes";
import { addNoteAction, decideKybAction, extendTrialAction, grantCreditAction, requestCloseAction, runKybAction, saveMetaAction, setStatusAction } from "./actions";

const TABS = [
  { id: "overview", label: "Overview" }, { id: "kyb", label: "Firm KYB" }, { id: "users", label: "Users" }, { id: "usage", label: "Usage" },
  { id: "compliance", label: "Compliance health" }, { id: "billing", label: "Billing" }, { id: "support", label: "Support" },
  { id: "features", label: "Feature requests" }, { id: "timeline", label: "Timeline" }, { id: "admin", label: "Admin actions" },
];
const area = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";
const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

export default async function Firm360({ params, searchParams }: { params: Promise<{ firmId: string }>; searchParams: Promise<{ tab?: string }> }) {
  const a = await requireAdmin("firms.view");
  const { firmId } = await params;
  const want = (await searchParams).tab;
  const tab = TABS.some((t) => t.id === want) ? want! : "overview";
  if (!/^[0-9a-f-]{36}$/i.test(firmId)) notFound();
  const found = await adminDb.firm.findUnique({ where: { id: firmId }, include: { offices: { select: { name: true, memberState: true, isHome: true } } } });
  if (!found) notFound();
  const firm: NonNullable<typeof found> = found;
  const m = (await firmMetrics([firmId])).get(firmId)!;
  const meta = await adminDb.firmAdminMeta.findUnique({ where: { firmId } });
  const today = new Date().toISOString().slice(0, 10);
  const inTrial = !!firm.trialEndsOn && firm.trialEndsOn >= today;
  const shown = firm.status === "active" && inTrial ? "trial" : firm.status;
  const base = `/admin/firms/${firmId}`;

  return (
    <Page title={firm.name} intro={<>{firm.emailDomain} · {firm.homeState} · {firm.sectors.join(", ")} · {planOf(firm.plan).name} · signed up {fmtDate(firm.createdAt)}</>}
      actions={<span className="flex items-center gap-2"><Badge tone={statusTone(shown)}>{shown}</Badge><Badge tone={bandTone(m.health.band)}>health {m.health.score}</Badge></span>}>
      <Tabs base={base} tabs={TABS} current={tab} />
      {tab === "overview" && <Overview />}
      {tab === "kyb" && <Kyb />}
      {tab === "users" && <Users />}
      {tab === "usage" && <Usage />}
      {tab === "compliance" && <Compliance />}
      {tab === "billing" && <Billing />}
      {tab === "support" && <Support />}
      {tab === "features" && <Features />}
      {tab === "timeline" && <Timeline />}
      {tab === "admin" && <AdminActions />}
    </Page>
  );

  async function Overview() {
    const notes = await adminDb.firmNote.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, take: 50 });
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Profile">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {([
              ["Legal / billing name", firm.billingName ?? firm.name], ["Company code", firm.billingCompanyCode ?? "—"], ["VAT ID", firm.vatId ?? "— (no VIES check without a VAT ID)"],
              ["Billing country", firm.billingCountry ?? firm.homeState], ["Billing email", firm.billingEmail ?? "—"], ["Size", firm.size ?? "—"],
              ["Offices", firm.offices.map((o) => `${o.name} (${o.memberState}${o.isHome ? ", home" : ""})`).join("; ") || "—"],
              ["Uses cash", firm.usesCash ? "yes" : "no"], ["Trial", firm.trialEndsOn ? `until ${firm.trialEndsOn}` : "—"],
              ["Status", `${firm.status}${firm.statusReason ? ` — ${firm.statusReason}` : ""}${firm.statusChangedAt ? ` (${fmtDate(firm.statusChangedAt)})` : ""}`],
              ["Account manager", meta?.accountManager ?? "—"], ["Tags", meta?.tags.join(", ") || "—"],
            ] as [string, React.ReactNode][]).map(([k, v]) => [<dt key={k + "k"} className="text-muted">{k}</dt>, <dd key={k + "v"}>{v}</dd>])}
          </dl>
        </Section>
        <Section title="Health score" note="Recalculated on every view from counts (§6.4). Red triggers a CS follow-up.">
          <Table head={["Signal", "Points", "Detail"]} rows={m.health.reasons.map((r) => [r.signal, `${r.points} / ${r.weight}`, <span key="d" className="text-xs">{r.detail}</span>])} />
          <p className="text-sm">Activation: {MILESTONES.map((x, i) => <Badge key={x} tone={m.milestones[i] ? "ok" : "neutral"}>{x}</Badge>)}</p>
        </Section>
        {a.can("firms.manage") && (
          <>
            <Section title="Service status" note="Paused and suspended firms keep read access and their records but cannot start checks or screenings.">
              <ActionForm action={setStatusAction.bind(null, firmId)} className="space-y-2">
                <Field label="Status" name="status"><select name="status" aria-label="Status" defaultValue={firm.status === "closed" ? "active" : firm.status} className={sel}><option>active</option><option>paused</option><option>suspended</option></select></Field>
                <Field label="Reason" name="reason" required />
                <Submit variant="secondary">Set status</Submit><StepUpLink />
              </ActionForm>
              <ActionForm action={extendTrialAction.bind(null, firmId)} className="mt-4 grid gap-2 sm:grid-cols-2">
                <Field label="Trial ends on (YYYY-MM-DD)" name="until" defaultValue={firm.trialEndsOn ?? today} required />
                <Field label="Reason" name="reason" required />
                <div className="sm:col-span-2"><Submit variant="secondary">Change trial</Submit><StepUpLink /></div>
              </ActionForm>
            </Section>
            <Section title="Tags and account manager">
              <ActionForm action={saveMetaAction.bind(null, firmId)} className="space-y-2">
                <Field label="Tags (comma-separated)" name="tags" defaultValue={meta?.tags.join(", ")} />
                <Field label="Account manager (admin email)" name="accountManager" defaultValue={meta?.accountManager ?? ""} />
                <Submit variant="secondary">Save</Submit><StepUpLink />
              </ActionForm>
              <details className="mt-4 text-sm">
                <summary className="cursor-pointer">Close this firm (four-eyes)</summary>
                <ActionForm action={requestCloseAction.bind(null, firmId)} className="mt-2 space-y-2">
                  <Field label="Reason for closing" name="reason" required />
                  <Submit variant="danger">Request closure</Submit><StepUpLink />
                </ActionForm>
              </details>
            </Section>
          </>
        )}
        <Section title="Internal notes" note="Visible to AMLSync admins only. Never write client names or case details.">
          {a.can("firms.notes") && (
            <ActionForm action={addNoteAction.bind(null, firmId)} className="space-y-2">
              <Field label="Note" name="text"><textarea name="text" aria-label="Note" rows={3} className={area} /></Field>
              <Submit variant="secondary">Add note</Submit><StepUpLink />
            </ActionForm>
          )}
          <ul className="space-y-2 text-sm" data-testid="notes">{notes.map((n) => <li key={n.id} className="rounded border border-border p-2"><p className="whitespace-pre-wrap">{n.text}</p><p className="text-xs text-muted">{n.authorEmail} · {fmtDateTime(n.createdAt)}</p></li>)}</ul>
        </Section>
      </div>
    );
  }

  async function Kyb() {
    const checks = await adminDb.firmKyb.findMany({ where: { firmId }, orderBy: { checkedAt: "desc" }, take: 20 });
    const last = checks[0];
    const lists = await adminDb.screeningList.count({ where: { firmId: null, active: true } });
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Run KYB" note={`Screens the firm's name, directors and beneficial owners against the ${lists} official sanctions list(s) loaded. Enter names from the registry extract.`}>
          {a.can("firms.kyb") ? (
            <ActionForm action={runKybAction.bind(null, firmId)} className="space-y-2">
              <Field label="Registry extract reference" name="registryRef" defaultValue={last?.registryRef ?? ""} hint="e.g. JAR extract no. and date" />
              <Field label="Directors (one per line)" name="directors"><textarea name="directors" aria-label="Directors" rows={3} defaultValue={last?.directors.join("\n")} className={area} /></Field>
              <Field label="Beneficial owners (one per line)" name="bos"><textarea name="bos" aria-label="Beneficial owners" rows={3} defaultValue={last?.beneficialOwners.join("\n")} className={area} /></Field>
              <Field label="Russia / Belarus link (Reg. 833/2014, 765/2006 [verify])" name="russiaBelarus">
                <select name="russiaBelarus" aria-label="Russia / Belarus link" defaultValue="none" className={sel}><option value="none">No link found</option><option value="link-found">Link found (suspends the firm)</option><option value="not-checked">Not checked</option></select>
              </Field>
              <Submit>Run KYB screening</Submit><StepUpLink />
            </ActionForm>
          ) : <p className="text-sm text-muted">You can view KYB results only.</p>}
        </Section>
        <Section title="Results">
          {checks.map((k) => (
            <div key={k.id} className="space-y-2 rounded border border-border p-3 text-sm" data-testid="kyb-result">
              <p><Badge tone={k.result === "clear" || k.decision === "cleared" ? "ok" : "bad"}>{k.decision ?? k.result}</Badge> {fmtDateTime(k.checkedAt)} by {k.checkedBy} · Russia/Belarus: {k.russiaBelarus}{k.registryRef ? ` · ${k.registryRef}` : ""}</p>
              <p className="text-xs text-muted">Directors: {k.directors.join(", ") || "—"} · BOs: {k.beneficialOwners.join(", ") || "—"}</p>
              {(k.matches as { subject: string; role: string; matchedName: string; list: string; score: number }[]).map((x, i) => <p key={i} className="text-xs">{x.role} “{x.subject}” ≈ “{x.matchedName}” ({x.score}%) on {x.list}</p>)}
              {k.decisionNote && <p className="text-xs">Decision: {k.decisionNote}</p>}
              {k.result === "possible-match" && !k.decision && a.can("firms.kyb") && (
                <ActionForm action={decideKybAction.bind(null, firmId, k.id)} className="space-y-2">
                  <Field label="Decision" name="decision"><select name="decision" aria-label="Decision" className={sel}><option value="cleared">False positive (clear)</option><option value="blocked">Confirmed hit (suspend)</option></select></Field>
                  <Field label="Reasoning" name="note" required />
                  <Submit variant="secondary">Record decision</Submit><StepUpLink />
                </ActionForm>
              )}
            </div>
          ))}
          {!checks.length && <p className="text-sm text-muted">Not checked yet.</p>}
        </Section>
      </div>
    );
  }

  async function Users() {
    const users = await adminDb.user.findMany({ where: { firmId }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, roles: true, external: true, mfaEnrolledAt: true, lockedUntil: true, deactivatedAt: true, createdAt: true } });
    const seen = new Map((await adminDb.session.groupBy({ by: ["userId"], where: { firmId }, _max: { lastSeenAt: true } })).map((s) => [s.userId, s._max.lastSeenAt]));
    const invites = await adminDb.invitation.count({ where: { firmId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    return (
      <Section title={`Users (${users.length})`} note={`${invites} pending invitation(s).`}>
        <Table head={["Name", "Email", "Roles", "Two-factor", "Last seen", "State"]} rows={users.map((u) => [
          a.can("users.view") ? <Link key="n" href={`/admin/users/${u.id}`} className="text-accent underline">{u.name}</Link> : u.name, u.email,
          u.roles.map((r) => ROLE_LABELS[r as AppRole]).join(", ") + (u.external ? " (external)" : ""),
          u.mfaEnrolledAt ? <Badge key="m" tone="ok">on</Badge> : <Badge key="m" tone="bad">not set up</Badge>,
          fmtDateTime(seen.get(u.id)), u.deactivatedAt ? "removed" : u.lockedUntil && u.lockedUntil > new Date() ? <Badge key="l" tone="bad">locked</Badge> : "active",
        ])} />
      </Section>
    );
  }

  async function Usage() {
    const rows = await firmUsage(firmId);
    return (
      <>
        <Tiles>
          <Tile label="Client files" value={m.clients} sub={`${m.clients30d} in 30 days`} />
          <Tile label="Screenings this month" value={m.screeningsMonth} sub={`limits ${firm.screenLimitDay}/day, ${firm.screenLimitMonth}/month`} />
          <Tile label="Paid checks this month" value={m.paidChecksMonth} sub={`${eur(m.spendMonthCents)} of ${eur(firm.spendLimitCents)} limit`} tone={m.spendMonthCents > 0.9 * firm.spendLimitCents ? "warn" : undefined} />
          <Tile label="Active users (30 d)" value={`${m.activeUsers30d} / ${m.users}`} />
        </Tiles>
        <Section title="Per month" note="Metadata only: counts of records, never their content.">
          <Table head={["Month", "Clients", "Matters", "Screenings", "Paid checks", "Portal links sent", "Portal completed", "AI drafts"]} rows={rows.map((r) => [r.month, r.clients, r.matters, r.screenings, r.paidChecks, r.portalSent, r.portalSubmitted, r.aiCalls])} />
        </Section>
      </>
    );
  }

  async function Compliance() {
    const c = await complianceHealth(firmId);
    return (
      <Section title="Compliance health (counts only)" note="Helps CS spot under-compliance without seeing client data. Suspicion reports and cases are never counted (STR wall).">
        <Tiles>
          <Tile label="Open client files" value={c.openFiles} />
          <Tile label="Overdue refreshes" value={c.overdueRefreshes} tone={c.overdueRefreshes ? "warn" : "ok"} />
          <Tile label="Overdue discrepancy reports" value={c.overdueDiscrepancy} tone={c.overdueDiscrepancy ? "bad" : "ok"} />
          <Tile label="Training completed" value={c.trainingPct === null ? "—" : `${c.trainingPct}%`} />
          <Tile label="Policies in force" value={c.policiesInForce} tone={c.policiesInForce ? "ok" : "warn"} />
          <Tile label="Firm risk assessment age" value={c.riskAssessmentAgeDays === null ? "none" : `${c.riskAssessmentAgeDays} days`} tone={c.riskAssessmentAgeDays === null || c.riskAssessmentAgeDays > 365 ? "warn" : "ok"} />
        </Tiles>
      </Section>
    );
  }

  async function Billing() {
    const [invoices, entries] = await Promise.all([
      adminDb.invoice.findMany({ where: { firmId }, orderBy: { seq: "desc" }, take: 24, select: { id: true, number: true, period: true, dueOn: true, totalCents: true, status: true, paidOn: true, vatNote: true } }),
      adminDb.creditEntry.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, take: 50, select: { kind: true, amountCents: true, createdAt: true, reference: true, invoiceId: true } }),
    ]);
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Invoices">
          <Table head={["Number", "Month", "Due", "Total", "Status", "VAT"]} rows={invoices.map((i) => [
            a.can("billing.view") ? <a key="n" className="text-accent underline" href={`/api/invoices/${i.id}`}>{i.number}</a> : i.number, i.period, i.dueOn, eur(i.totalCents),
            i.status === "paid" ? `paid ${i.paidOn}` : i.dueOn < today ? <Badge key="o" tone="bad">overdue</Badge> : i.status, i.vatNote ? "reverse charge" : "21% LT",
          ])} />
          <p className="text-sm text-muted">Terms: {planOf(firm.plan).name}{firm.customFeeCents !== null ? `, custom fee ${eur(firm.customFeeCents)}` : ""} · paid-check limit {eur(firm.spendLimitCents)}/month. Change terms in <Link href="/admin/billing" className="underline">Billing ops</Link>.</p>
        </Section>
        <Section title="Ledger" note="Charges, refunds and credits. Client references on receipts are not shown.">
          <Table head={["Date", "Kind", "Amount", "Reference", "Invoiced"]} rows={entries.map((e) => [fmtDate(e.createdAt), e.kind, eur(e.amountCents), e.kind === "charge" ? "—" : e.reference ?? "—", e.invoiceId ? "yes" : "no"])} />
          {a.can("credits.grant") && (
            <ActionForm action={grantCreditAction.bind(null, firmId)} className="grid gap-2 sm:grid-cols-2">
              <Field label="Credit (EUR, excl. VAT)" name="euros" type="number" required hint={`Above ${eur(CREDIT_FOUR_EYES_CENTS)} an Owner must approve.`} />
              <Field label="Reason / reference" name="reference" required />
              <div className="sm:col-span-2"><Submit variant="secondary">Grant credit</Submit><StepUpLink /></div>
            </ActionForm>
          )}
        </Section>
      </div>
    );
  }

  async function Support() {
    const grants = await adminDb.supportGrant.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, take: 50 });
    return (
      <Section title="Consented support access" note="AMLSync has no standing access. The firm approves each request; every view is in the firm's security log and the admin log.">
        <Table head={["Requested", "By", "Reason", "Hours", "Status", "Expires"]} rows={grants.map((g) => [fmtDateTime(g.createdAt), g.requesterEmail, g.reason, g.hours, g.status, fmtDateTime(g.expiresAt)])} />
        {a.can("support.access") && <Link href="/admin/support" className="text-sm text-accent underline">Request access</Link>}
      </Section>
    );
  }

  async function Features() {
    const reqs = await adminDb.featureRequest.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, select: { id: true, title: true, status: true, regulatory: true, createdAt: true, _count: { select: { votes: true } } } });
    return <Section title="Feature requests from this firm"><Table head={["Request", "Status", "Votes", "Date"]} rows={reqs.map((r) => [<Link key="t" href={`/app/feature-requests/${r.id}`} className="text-accent underline">{r.title}</Link>, r.status, r._count.votes, fmtDate(r.createdAt)])} /></Section>;
  }

  async function Timeline() {
    const [sec, adm, inv] = await Promise.all([
      adminDb.securityEvent.findMany({ where: { firmId }, orderBy: { at: "desc" }, take: 150, select: { at: true, kind: true, userId: true } }),
      adminDb.adminAuditEvent.findMany({ where: { targetId: firmId }, orderBy: { at: "desc" }, take: 50, select: { at: true, action: true, adminEmail: true } }),
      adminDb.invoice.findMany({ where: { firmId }, orderBy: { createdAt: "desc" }, take: 24, select: { createdAt: true, number: true } }),
    ]);
    const events = [
      ...sec.map((e) => ({ at: e.at, what: e.kind, who: e.userId ? "firm user" : "system" })),
      ...adm.map((e) => ({ at: e.at, what: `admin: ${e.action}`, who: e.adminEmail })),
      ...inv.map((e) => ({ at: e.createdAt, what: `invoice ${e.number} issued`, who: "billing" })),
      { at: firm.createdAt, what: "signed up", who: "firm" },
    ].sort((x, y) => y.at.getTime() - x.at.getTime()).slice(0, 200);
    return <Section title="Timeline" note="Event types only; event details stay in the firm's own security log."><Table head={["When", "Event", "By"]} rows={events.map((e) => [fmtDateTime(e.at), e.what, e.who])} /></Section>;
  }

  async function AdminActions() {
    const rows = await adminDb.adminAuditEvent.findMany({ where: { targetId: firmId }, orderBy: { id: "desc" }, take: 100 });
    return <Section title="Admin actions on this firm"><Table head={["When", "Admin", "Action", "Reason", "Approved by"]} rows={rows.map((r) => [fmtDateTime(r.at), r.adminEmail, r.action, r.reason ?? "—", r.approverEmail ?? "—"])} /></Section>;
  }
}
