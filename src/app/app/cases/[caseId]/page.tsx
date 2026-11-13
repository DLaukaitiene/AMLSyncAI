import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { decryptField } from "@/lib/server/crypto";
import { CASE_LABELS, readContent } from "@/lib/server/cases";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { ReportBlock } from "@/components/report-block";
import { toIsoDate } from "@/lib/rules/dates";
import { answerFiuAction, decideAction, fiuInstructionAction, noteAction, resolveDiscrepancyAction, sanctionsNoticeAction } from "../actions";

const PROFESSIONS = ["ACCOUNTANT", "LEGAL"];

export default async function CasePage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const s = await requireUser("case.view");
  const data = await withTenant(s.firm.id, async (tx) => {
    const c = await tx.case.findUnique({ where: { id: caseId } });
    if (!c) return null;
    const content = readContent(s.firm.id, c);
    const parties = await tx.party.findMany({ where: { id: { in: c.partyIds } }, include: { cddFiles: { select: { id: true, role: true } } } });
    const matters = await tx.matter.findMany({ where: { id: { in: c.matterIds } }, select: { id: true, title: true } });
    const reports = (await tx.report.findMany({ where: { caseId }, orderBy: { createdAt: "asc" } })).map((r) => ({
      ...r, ...(({ narrative, aiDrafted }) => ({ narrative, aiDrafted }))(JSON.parse(decryptField(s.firm.id, r.contentEnc)) as { narrative?: string; aiDrafted?: boolean }),
    }));
    const users = new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } });
    const { profile } = await currentProfile(tx, s.firm.id);
    return { c, content, parties, matters, reports, users, firm, profile };
  });
  if (!data) notFound();
  const { c, content, parties, matters, reports, users, firm, profile } = data;
  const today = toIsoDate(new Date());
  const holdActive = c.holdEndsOn && !c.fiuInstruction && toIsoDate(c.holdEndsOn) > today;

  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted">Case · {c.status}{c.decision ? ` · decision: ${c.decision}` : ""}</p>
        <h1 className="text-2xl font-semibold">{CASE_LABELS[c.type]}</h1>
        <p className="text-sm">Opened {c.createdAt.toISOString().slice(0, 10)}{c.dueOn ? ` · due ${toIsoDate(c.dueOn)}` : ""}</p>
      </div>

      <section className="space-y-2 rounded-md border border-border p-4 text-sm">
        <h2 className="font-semibold">Details</h2>
        {parties.length > 0 && (
          <p>Concerns: {parties.map((p, i) => (
            <span key={p.id}>{i > 0 && ", "}{p.cddFiles[0] ? <Link className="text-accent underline" href={`/app/clients/${p.cddFiles[0].id}`}>{p.displayName}</Link> : p.displayName}</span>
          ))}</p>
        )}
        {matters.length > 0 && <p>Matters: {matters.map((m) => <Link key={m.id} className="text-accent underline" href={`/app/matters/${m.id}`}>{m.title}</Link>)}</p>}
        {content.summary && <p><strong>What happened:</strong> {content.summary}</p>}
        {content.details && <p><strong>Why suspicious:</strong> {content.details}</p>}
        {content.amountEUR ? <p><strong>Amount:</strong> €{content.amountEUR.toLocaleString("en")}</p> : null}
        {content.attempted && <p>Attempted transaction (not carried out).</p>}
        {content.reason && <p><strong>Reason:</strong> {content.reason}</p>}
        {content.fiu && <p><strong>FIU request {content.fiu.reference}</strong> received {content.fiu.received}: {content.fiu.request}</p>}
        {content.discrepancy && <p><strong>{content.discrepancy.register}:</strong> {content.discrepancy.description}</p>}
        {typeof content.list === "string" && <p><strong>List:</strong> {content.list} (v{String(content.listVersion)}) — {String(content.comment ?? "")}</p>}
        <h3 className="pt-2 font-semibold">History</h3>
        <ul className="text-muted">
          {(content.log ?? []).map((l, i) => <li key={i}>{l.at.slice(0, 16).replace("T", " ")} · {users.get(l.by) ?? "—"} · {l.action}{l.text ? `: ${l.text}` : ""}</li>)}
        </ul>
        <ActionForm action={noteAction.bind(null, caseId)} className="flex items-end gap-2">
          <div className="flex-1"><Field label="Add a note" name="text" /></div>
          <Submit variant="secondary">Add</Submit>
        </ActionForm>
      </section>

      {c.type === "INTERNAL_SUSPICION" && c.status === "open" && (
        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="font-semibold">Decision (Art. 69)</h2>
          <ActionForm action={decideAction.bind(null, caseId)} className="space-y-3">
            <fieldset className="space-y-1 text-sm">
              <label className="flex items-center gap-2"><input type="radio" name="decision" value="report" /> Report to the FIU</label>
              <label className="flex items-center gap-2"><input type="radio" name="decision" value="no-report" /> Don&apos;t report (no grounds for suspicion)</label>
              {firm.sectors.some((x) => PROFESSIONS.includes(x)) && (
                <label className="flex items-center gap-2">
                  <input type="radio" name="decision" value="privilege" /> Don&apos;t report: privilege exemption applies (ascertaining the legal position or defending the client, Art. 70(2)){profile.privilegeNarrowing.enabled ? " — check the narrowed cases in your Country Profile" : ""}
                </label>
              )}
            </fieldset>
            {c.matterIds.length > 0 && (
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="hold" defaultChecked /> Hold the related transaction (3 working days unless the FIU instructs otherwise, Art. 71)</label>
            )}
            <Field label="Reasons" name="reasons" required hint="Kept for the supervisor, whatever the decision." />
            <Submit>Record decision</Submit>
            <StepUpLink />
          </ActionForm>
        </section>
      )}

      {c.holdEndsOn && (
        <section className="space-y-2 rounded-md border border-border p-4 text-sm">
          <h2 className="font-semibold">Transaction hold (Art. 71)</h2>
          <p>
            {c.fiuInstruction === "stop" ? "The FIU instructed you not to proceed. The matter stays blocked." :
              c.fiuInstruction === "proceed" ? "The FIU allowed the transaction to proceed." :
              holdActive ? `Held until ${toIsoDate(c.holdEndsOn)} (end of the 3rd working day). It may go ahead after that if the FIU gives no instruction.` :
              `The hold ended on ${toIsoDate(c.holdEndsOn)} without an FIU instruction.`}
          </p>
          {holdActive && (
            <ActionForm action={fiuInstructionAction.bind(null, caseId)} className="space-y-2">
              <fieldset className="flex gap-6">
                <label className="flex items-center gap-2"><input type="radio" name="instruction" value="proceed" defaultChecked /> FIU: may proceed</label>
                <label className="flex items-center gap-2"><input type="radio" name="instruction" value="stop" /> FIU: suspend</label>
              </fieldset>
              <Field label="How and when the FIU instructed you" name="note" required />
              <Submit variant="secondary">Record FIU instruction</Submit>
            </ActionForm>
          )}
        </section>
      )}

      {c.type === "FIU_REQUEST" && c.status === "open" && (
        <ActionForm action={answerFiuAction.bind(null, caseId)} className="space-y-2 rounded-md border border-border p-4">
          <h2 className="font-semibold">Answer</h2>
          <Field label="What you sent and how" name="note" required />
          <Submit>Mark as answered</Submit>
        </ActionForm>
      )}

      {c.type === "DISCREPANCY" && c.status === "open" && (
        <ActionForm action={resolveDiscrepancyAction.bind(null, caseId)} className="space-y-2 rounded-md border border-border p-4">
          <h2 className="font-semibold">Client corrected the register?</h2>
          <p className="text-sm text-muted">If the client corrects the register before the deadline, no report is needed. Otherwise submit the report below.</p>
          <Field label="How it was corrected" name="note" />
          <Submit variant="secondary">Mark resolved</Submit>
        </ActionForm>
      )}

      {c.type === "SANCTIONS_HIT" && !reports.some((r) => r.type === "SANCTIONS_NOTICE") && (
        <ActionButton action={sanctionsNoticeAction.bind(null, caseId)}>Draft notice to sanctions authority</ActionButton>
      )}

      {reports.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Reports</h2>
          {reports.map((r) => <ReportBlock key={r.id} r={r} narrative={r.narrative} aiDrafted={r.aiDrafted} profile={profile} back={`/app/cases/${caseId}`} />)}
        </section>
      )}
    </div>
  );
}
