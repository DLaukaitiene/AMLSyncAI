import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, eur, fmtDateTime, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { CHECK_TYPES, currentPrices, marginByMonth } from "@/lib/server/backoffice/vendor-costs";
import { recordInvoiceAction, setPriceAction } from "./actions";

const DAY = 86_400_000;

/** Vendor and AI health (§13, §15). Counts, statuses and token use only: AI prompts and outputs stay encrypted. */
export default async function VendorsPage() {
  const a = await requireAdmin("vendors.view");
  const d30 = new Date(Date.now() - 30 * DAY), d7 = new Date(Date.now() - 7 * DAY);
  const [didit, diditSandbox, webhooksRejected, mediaFailed, aiByPurpose, aiErrors, emailFails, lists] = await Promise.all([
    adminDb.diditSession.groupBy({ by: ["kind", "status"], where: { createdAt: { gte: d30 } }, _count: true }),
    adminDb.diditSession.count({ where: { createdAt: { gte: d30 }, sandbox: true } }),
    adminDb.securityEvent.count({ where: { kind: "webhook-rejected", at: { gte: d7 } } }),
    adminDb.securityEvent.count({ where: { kind: "idv-media-download-failed", at: { gte: d7 } } }),
    adminDb.aiCall.groupBy({ by: ["purpose", "provider", "model"], where: { createdAt: { gte: d30 } }, _count: true, _sum: { inputTokens: true, outputTokens: true } }),
    adminDb.aiCall.count({ where: { createdAt: { gte: d30 }, error: { not: null } } }),
    adminDb.securityEvent.count({ where: { kind: "email-failed", at: { gte: d7 } } }),
    adminDb.screeningList.findMany({ where: { firmId: null }, orderBy: { loadedAt: "desc" }, select: { name: true, kind: true, version: true, loadedAt: true, active: true, _count: { select: { entries: true } } } }),
  ]);
  const total = (kind: string) => didit.filter((d) => d.kind === kind).reduce((s, d) => s + d._count, 0);
  const st = (kind: string, re: RegExp) => didit.filter((d) => d.kind === kind && re.test(d.status)).reduce((s, d) => s + d._count, 0);
  const idvOk = st("idv", /Approved/i), idvDeclined = st("idv", /Declined/i), idvOpen = st("idv", /Not Started|In Progress|In Review/i);
  const aiCalls = aiByPurpose.reduce((s, r) => s + r._count, 0);
  return (
    <Page title="Vendors and AI" intro="Health of identity, screening, list, email and AI providers. Latency and vendor invoices need provider dashboards for now.">
      <Tiles>
        <Tile label="Didit identity checks (30 d)" value={total("idv")} sub={`${idvOk} approved · ${idvDeclined} declined · ${idvOpen} open`} />
        <Tile label="Didit AML screenings (30 d)" value={total("aml")} sub={diditSandbox ? `${diditSandbox} sandbox session(s)` : "live"} />
        <Tile label="Webhook / media errors (7 d)" value={webhooksRejected + mediaFailed} sub={`${webhooksRejected} rejected webhooks · ${mediaFailed} media downloads failed`} tone={webhooksRejected + mediaFailed ? "warn" : "ok"} />
        <Tile label="Email delivery failures (7 d)" value={emailFails} sub="Portal links depend on email" tone={emailFails ? "warn" : "ok"} />
      </Tiles>
      <Section title="Didit sessions by status (30 d)">
        <Table head={["Kind", "Status", "Sessions"]} rows={didit.map((d) => [d.kind, d.status, d._count])} empty="No sessions." />
      </Section>
      <Section title="Sanctions and screening lists" note="Official lists shared by all firms. Alert when a list is older than 24 h (§22).">
        <Table head={["List", "Kind", "Version", "Entries", "Loaded", "State"]} rows={lists.map((l) => [l.name, l.kind, l.version, l._count.entries, fmtDateTime(l.loadedAt), !l.active ? "inactive" : Date.now() - l.loadedAt.getTime() > DAY ? <Badge key="s" tone="warn">stale</Badge> : <Badge key="s" tone="ok">fresh</Badge>])} empty="No official list loaded." />
      </Section>
      <CostSection manage={a.can("vendors.manage")} />
      {a.can("ai.view") && (
        <Section title="AI operations (30 d)" note={`${aiCalls} call(s), ${aiErrors} error(s). Prompts and outputs are encrypted per firm and never shown here. Quality metrics (draft acceptance, edits) are tracked in each firm's records.`}>
          <Table head={["Purpose", "Provider", "Model", "Calls", "Input tokens", "Output tokens"]} rows={aiByPurpose.map((r) => [r.purpose, r.provider, r.model, r._count, r._sum.inputTokens ?? 0, r._sum.outputTokens ?? 0])} empty="No AI calls." />
        </Section>
      )}
    </Page>
  );
}

async function CostSection({ manage }: { manage: boolean }) {
  const [months, prices] = await Promise.all([marginByMonth(), currentPrices()]);
  const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
  return (
    <Section title="Didit cost, margin and reconciliation" note="Revenue is the price charged when each live check was sent (before refunds). Expected cost uses the unit costs below; enter Didit's monthly invoice to see the difference.">
      <Table head={["Month", "Live checks", "Revenue", "Expected cost", "Gross margin", "Didit invoice", "Difference"]} rows={months.map((m) => {
        const diff = m.invoice ? m.invoice.amountCents - m.cost : null;
        return [m.month, m.checks, eur(m.revenue), m.missingCost ? <Badge key="c" tone="warn">set unit costs</Badge> : eur(m.cost),
          m.revenue ? `${eur(m.revenue - m.cost)} (${Math.round((100 * (m.revenue - m.cost)) / m.revenue)}%)` : "—",
          m.invoice ? eur(m.invoice.amountCents) : "—",
          diff === null ? "—" : Math.abs(diff) > Math.max(500, 0.05 * m.cost) ? <Badge key="d" tone="bad">{eur(diff)}</Badge> : eur(diff)];
      })} />
      <Table head={["Check type", "Unit cost", "Valid from"]} rows={prices.map((p) => [p.label, p.price ? eur(p.price.unitCostCents) : <Badge key="m" tone="warn">not set</Badge>, p.price?.validFrom ?? "—"])} />
      {manage && (
        <div className="grid gap-6 md:grid-cols-2">
          <ActionForm action={setPriceAction} className="grid gap-2 sm:grid-cols-3">
            <Field label="Check type" name="checkType"><select name="checkType" aria-label="Check type" className={sel}>{CHECK_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
            <Field label="Unit cost (EUR)" name="cost" type="number" required />
            <Field label="Valid from" name="validFrom" defaultValue={new Date().toISOString().slice(0, 10)} required />
            <div className="sm:col-span-3"><Submit variant="secondary">Save unit cost</Submit><StepUpLink /></div>
          </ActionForm>
          <ActionForm action={recordInvoiceAction} className="grid gap-2 sm:grid-cols-3">
            <Field label="Month (YYYY-MM)" name="period" required />
            <Field label="Didit invoice total (EUR, excl. VAT)" name="amount" type="number" required />
            <Field label="Invoice number" name="reference" />
            <div className="sm:col-span-3"><Submit variant="secondary">Record invoice</Submit><StepUpLink /></div>
          </ActionForm>
        </div>
      )}
    </Section>
  );
}
