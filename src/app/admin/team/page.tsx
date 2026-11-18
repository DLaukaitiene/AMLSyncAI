import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDate, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { ADMIN_ROLE_LABELS, ADMIN_ROLES, envOwners } from "@/lib/backoffice/roles";
import { reviewAction, setRolesAction } from "./actions";

const QUARTER = 92 * 86_400_000;

export default async function TeamPage() {
  await requireAdmin("team.manage");
  const members = await adminDb.adminMember.findMany({ orderBy: { createdAt: "asc" } });
  const lastSeen = new Map((await adminDb.adminAuditEvent.groupBy({ by: ["adminEmail"], _max: { at: true } })).map((r) => [r.adminEmail, r._max.at]));
  const env = envOwners();
  return (
    <Page title="Admin team" intro="Narrow roles (least privilege). Every role change needs an Owner's approval. Review every admin each quarter and remove leavers the same day.">
      <Section title="Admins">
        <Table testId="admins" head={["Email", "Roles", "Added", "Last admin action", "Access review", ""]} rows={[
          ...env.map((e) => [e, "Owner (PLATFORM_ADMIN_EMAILS)", "configuration", fmtDateTime(lastSeen.get(e)), "—", ""]),
          ...members.filter((m) => !env.includes(m.email)).map((m) => {
            const due = !m.removedAt && (!m.reviewedAt || Date.now() - m.reviewedAt.getTime() > QUARTER);
            return [m.email, m.removedAt ? <Badge key="r">removed {fmtDate(m.removedAt)}</Badge> : m.roles.map((r) => ADMIN_ROLE_LABELS[r as keyof typeof ADMIN_ROLE_LABELS] ?? r).join(", "), `${fmtDate(m.createdAt)} by ${m.addedBy}`, fmtDateTime(lastSeen.get(m.email)),
              m.removedAt ? "—" : due ? <Badge key="d" tone="warn">due</Badge> : `${fmtDate(m.reviewedAt)} by ${m.reviewedBy}`,
              !m.removedAt && due ? <ActionButton key="b" action={reviewAction.bind(null, m.email)}>Confirm access</ActionButton> : ""];
          }),
        ]} />
      </Section>
      <Section title="Add, change or remove an admin" note="Leave every role unticked to remove someone. They need an AMLSyncAI account with two-factor first.">
        <ActionForm action={setRolesAction} className="max-w-3xl space-y-3">
          <Field label="Email" name="email" required />
          <fieldset className="grid gap-1 text-sm sm:grid-cols-3">
            <legend className="mb-1 font-medium">Roles</legend>
            {ADMIN_ROLES.map((r) => <label key={r} className="flex items-center gap-2"><input type="checkbox" name="roles" value={r} /> {ADMIN_ROLE_LABELS[r]}</label>)}
          </fieldset>
          <Field label="Reason" name="reason" required />
          <Submit>Request change</Submit><StepUpLink />
        </ActionForm>
      </Section>
    </Page>
  );
}
