import { requireAdmin, ownerCount } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { FOUR_EYES_LABELS, SELF_APPROVAL_COOL_OFF_MS, type FourEyesAction } from "@/lib/backoffice/four-eyes";
import { approveAction, rejectAction } from "./actions";

export default async function ApprovalsPage() {
  const a = await requireAdmin("dashboard.view");
  const now = new Date();
  await adminDb.adminApproval.updateMany({ where: { status: "pending", expiresAt: { lte: now } }, data: { status: "expired" } });
  const [pending, done, owners] = await Promise.all([
    adminDb.adminApproval.findMany({ where: { status: "pending", ...(a.can("approvals.decide") ? {} : { requestedBy: a.email }) }, orderBy: { createdAt: "asc" } }),
    adminDb.adminApproval.findMany({ where: { status: { not: "pending" }, ...(a.can("approvals.decide") ? {} : { requestedBy: a.email }) }, orderBy: { createdAt: "desc" }, take: 50 }),
    ownerCount(),
  ]);
  return (
    <Page title="Four-eyes approvals" intro={`Credit grants above €100, admin role changes, firm closures and exports above 500 rows need an Owner's approval. ${owners === 1 ? `Only one Owner exists, so you may confirm your own request after ${SELF_APPROVAL_COOL_OFF_MS / 60_000} minutes; add a second Owner for real four-eyes control.` : `${owners} Owners: nobody approves their own request.`}`}>
      <Section title={`Waiting (${pending.length})`}>
        <ul className="space-y-3" data-testid="pending-approvals">
          {pending.map((p) => (
            <li key={p.id} className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p><Badge tone="warn">{FOUR_EYES_LABELS[p.action as FourEyesAction] ?? p.action}</Badge> <strong>{p.summary}</strong></p>
              <p className="text-muted">Requested by {p.requestedBy} at {fmtDateTime(p.createdAt)} UTC · reason: {p.reason} · expires {fmtDateTime(p.expiresAt)}</p>
              {a.can("approvals.decide") && (
                <div className="flex flex-wrap items-start gap-4">
                  <ActionButton action={approveAction.bind(null, p.id)} variant="primary">Approve and run</ActionButton>
                  <ActionForm action={rejectAction.bind(null, p.id)} className="flex flex-wrap items-end gap-2">
                    <Field label="Reason for rejecting" name="reason" />
                    <Submit variant="secondary">Reject</Submit>
                  </ActionForm>
                </div>
              )}
            </li>
          ))}
        </ul>
        {!pending.length && <p className="text-sm text-muted">Nothing waiting.</p>}
      </Section>
      <Section title="Decided">
        <Table head={["Requested", "Action", "Summary", "By", "Status", "Decided by", "Result"]} rows={done.map((d) => [fmtDateTime(d.createdAt), d.action, d.summary, d.requestedBy, d.status, d.decidedBy ?? "—", d.result ?? "—"])} empty="None yet." />
      </Section>
    </Page>
  );
}
