import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { openMatterItems, requiredRoles } from "@/lib/rules/gates";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { PartyFields } from "@/components/party-fields";
import { addPartyAction, addTransactionAction, completeMatterAction, matterState } from "../actions";

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
const STATUS: Record<string, string> = { OPEN: "CDD in progress", COMPLETE: "Accepted", SDD: "Accepted (SDD)", EDD: "Accepted (EDD)", REFUSED: "Refused", TERMINATED: "Terminated" };

export default async function MatterPage({ params }: { params: Promise<{ matterId: string }> }) {
  const { matterId } = await params;
  const s = await requireUser("client.view");
  const data = await withTenant(s.firm.id, async (tx) => {
    const m = await tx.matter.findUnique({ where: { id: matterId }, include: { parties: { include: { party: true } }, transactions: { orderBy: { date: "desc" } } } });
    if (!m) return null;
    const files = await tx.cddFile.findMany({ where: { OR: m.parties.map((p) => ({ partyId: p.partyId, role: p.role })) } });
    const st = await matterState(tx, s.firm.id, matterId);
    const reports = await tx.report.findMany({ where: { matterId }, select: { id: true, type: true, status: true, createdAt: true } });
    const known = await tx.party.findMany({ where: { cddFiles: { some: {} } }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" }, take: 500 });
    return { m, files, st, reports, known };
  });
  if (!data) notFound();
  const { m, files, st, reports, known } = data;
  const items = openMatterItems(st);
  const edit = can(s.user.roles, "client.edit") && m.status !== "COMPLETED";
  const det = m.details as Record<string, string>;
  const isEstate = st.sector === "estate-agent";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted">Matter · {m.type.toLowerCase().replace("_", " ")} · {m.status.toLowerCase().replace("_", " ")}</p>
        <h1 className="text-2xl font-semibold">{m.title}</h1>
        <p className="text-sm text-muted">{Object.entries(det).filter(([k]) => k !== "transferApprovedAt").map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
        {m.status === "ON_HOLD" && <p className="text-sm text-red-700 dark:text-red-300">On hold: a sanctions match or a pending suspicion report blocks this matter.</p>}
      </div>

      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Parties</h2>
        <p className="text-xs text-muted">Required here: {requiredRoles(st.sector, st.type).join(", ")} (AMLR Art. 19(6)).</p>
        <ul className="divide-y divide-border text-sm">
          {m.parties.map((p) => {
            const f = files.find((x) => x.partyId === p.partyId && x.role === p.role);
            return (
              <li key={p.id} className="flex justify-between py-1">
                <span>{p.party.displayName} <span className="text-muted">· {p.role.toLowerCase()}</span></span>
                {f && <Link className="text-accent underline" href={`/app/clients/${f.id}`}>{STATUS[f.status]}</Link>}
              </li>
            );
          })}
        </ul>
        {edit && (
          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Add a party</summary>
            <ActionForm action={addPartyAction.bind(null, matterId)} className="mt-3 space-y-4">
              <Field label="Role" name="role">
                <select name="role" className={sel} aria-label="Role">
                  {["CLIENT", "BUYER", "SELLER", "LANDLORD", "TENANT", "SUPPLIER", "REPRESENTATIVE", "BENEFICIARY"].map((r) => <option key={r} value={r}>{r.toLowerCase()}</option>)}
                </select>
              </Field>
              <Field label="Existing party" name="existingPartyId" hint="Or leave empty and enter a new one below.">
                <select name="existingPartyId" className={sel} aria-label="Existing party" defaultValue="">
                  <option value="">— New party —</option>
                  {known.map((k) => <option key={k.id} value={k.id}>{k.displayName}</option>)}
                </select>
              </Field>
              <PartyFields compact />
              <Submit variant="secondary">Add party</Submit>
            </ActionForm>
          </details>
        )}
      </section>

      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="font-semibold">Payments and transactions</h2>
        {m.transactions.length ? (
          <ul className="text-sm">
            {m.transactions.map((t) => (
              <li key={t.id}>{t.date.toISOString().slice(0, 10)} · €{Number(t.amountEUR).toLocaleString("en")} · {t.method}{t.occasional ? " · occasional" : ""} · {m.parties.find((p) => p.partyId === t.customerId)?.party.displayName}</li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">None yet.</p>}
        {edit && m.parties.length > 0 && (
          <ActionForm action={addTransactionAction.bind(null, matterId)} className="grid gap-4 sm:grid-cols-2">
            <Field label="Paid by" name="customerId">
              <select name="customerId" className={sel} aria-label="Paid by">{m.parties.map((p) => <option key={p.id} value={p.partyId}>{p.party.displayName} ({p.role.toLowerCase()})</option>)}</select>
            </Field>
            <Field label="Date" name="date" type="date" />
            <Field label="Amount (EUR)" name="amountEUR" type="number" inputMode="decimal" />
            <Field label="Method" name="method">
              <select name="method" className={sel} aria-label="Method"><option value="bank-transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="crypto">Crypto-assets</option><option value="other">Other</option></select>
            </Field>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="occasional" defaultChecked /> Occasional transaction (no ongoing business relationship)</label>
            <div className="sm:col-span-2"><Submit variant="secondary">Record</Submit></div>
          </ActionForm>
        )}
        {reports.length > 0 && <p className="text-sm">Report drafts: {reports.map((r) => `${r.type.toLowerCase()} (${r.status.toLowerCase()})`).join(", ")}</p>}
      </section>

      {m.status !== "COMPLETED" && (
        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="font-semibold">{items.length ? "Open before completion" : "Ready"}</h2>
          {items.length > 0 && (
            <ul className="list-disc pl-5 text-sm">{items.map((i) => <li key={i.id}>{i.message} <span className="text-muted">({i.article})</span></li>)}</ul>
          )}
          {can(s.user.roles, "client.accept") && (
            <div className="flex flex-wrap gap-6">
              {isEstate && !det.transferApprovedAt && (
                <ActionForm action={completeMatterAction.bind(null, matterId, "transfer")} className="space-y-2">
                  <p className="text-sm text-muted">Estate agents: both parties must be verified after the offer is accepted and before funds or property move (Art. 23).</p>
                  {can(s.user.roles, "gate.override") && items.length > 0 && <Field label="Override reason (Compliance Officer)" name="overrideReason" />}
                  <Submit variant="secondary">Allow funds / property transfer</Submit>
                  <StepUpLink />
                </ActionForm>
              )}
              <ActionForm action={completeMatterAction.bind(null, matterId, "complete")} className="space-y-2">
                {can(s.user.roles, "gate.override") && items.length > 0 && <Field label="Override reason (Compliance Officer)" name="overrideReason" />}
                <Submit>Mark matter completed</Submit>
                <StepUpLink />
              </ActionForm>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
