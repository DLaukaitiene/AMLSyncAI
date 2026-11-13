import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { adminDb } from "@/lib/server/db";
import { MAX_HOURS } from "@/lib/server/support";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { requestAccessAction } from "./actions";

export default async function SupportPage() {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  const grants = await adminDb.supportGrant.findMany({ where: { requesterEmail: s.user.email }, orderBy: { createdAt: "desc" }, take: 50 });
  const firms = new Map((await adminDb.firm.findMany({ where: { id: { in: grants.map((g) => g.firmId) } }, select: { id: true, emailDomain: true } })).map((f) => [f.id, f.emailDomain]));
  const now = new Date();
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <h1 className="text-2xl font-semibold">Support access</h1>
      <p className="text-sm text-muted">No standing access to customer data. Ask the firm for time-limited, read-only access; every view appears in the firm&apos;s security log.</p>
      <ActionForm action={requestAccessAction} className="max-w-xl space-y-3">
        <Field label="Firm email domain" name="domain" required hint="e.g. jip.lt" />
        <Field label="Reason (shown to the firm)" name="reason" required />
        <Field label={`Hours (1–${MAX_HOURS})`} name="hours" type="number" defaultValue={1} />
        <Submit>Request access</Submit>
        <StepUpLink />
      </ActionForm>
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {grants.map((g) => {
          const active = g.status === "approved" && g.expiresAt && g.expiresAt > now;
          return (
            <li key={g.id} className="flex justify-between px-4 py-2" data-testid="grant">
              <span>{firms.get(g.firmId)} · {g.reason}</span>
              <span>{active ? <Link className="text-accent underline" href={`/admin/support/${g.id}`}>Open (until {g.expiresAt!.toISOString().slice(11, 16)} UTC)</Link> : g.status === "approved" ? "expired" : g.status}</span>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
