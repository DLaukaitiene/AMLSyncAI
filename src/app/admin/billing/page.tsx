import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { adminDb } from "@/lib/server/db";
import { ActionForm, Field, Submit, type ActionState } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { securityEvent } from "@/lib/server/audit";
import { issueMonthlyInvoices } from "@/lib/server/invoicing";
import { formatEur } from "@/lib/didit/map";
import { PLANS, planOf } from "@/lib/billing/plans";

async function guard(): Promise<{ email: string } | ActionState> {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/admin/billing" } };
  return { email: s.user.email };
}
const isErr = (g: unknown): g is ActionState => !!g && typeof g === "object" && "error" in g;
const firmByDomain = (fd: FormData) => adminDb.firm.findUnique({ where: { emailDomain: String(fd.get("domain") ?? "").trim().toLowerCase() } });

async function setTerms(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const g = await guard(); if (isErr(g)) return g;
  const firm = await firmByDomain(fd);
  if (!firm) return { error: "No firm uses that domain." };
  const num = (k: string) => (String(fd.get(k) ?? "").trim() === "" ? null : Number(fd.get(k)));
  const plan = String(fd.get("plan") ?? firm.plan).trim().toLowerCase();
  const fee = num("fee"), limit = num("limit"), perMinute = num("perMinute"), perDay = num("perDay"), perMonth = num("perMonth");
  if (!(plan in PLANS)) return { error: `Plan must be one of: ${Object.keys(PLANS).join(", ")}.` };
  if (fee !== null && !(fee >= 0 && fee <= 10_000)) return { error: "Custom fee: €0–10,000, or empty for the list price." };
  if (limit !== null && !(limit >= 0 && limit <= 100_000)) return { error: "Paid-check limit: €0–100,000." };
  for (const [v, max] of [[perMinute, 1000], [perDay, 100_000], [perMonth, 1_000_000]] as const) if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= max)) return { error: "Screening limits must be whole numbers." };
  await adminDb.firm.update({
    where: { id: firm.id },
    data: {
      plan, customFeeCents: fee === null ? null : Math.round(fee * 100),
      ...(limit !== null ? { spendLimitCents: Math.round(limit * 100) } : {}),
      ...(perMinute !== null ? { screenLimitMinute: perMinute } : {}),
      ...(perDay !== null ? { screenLimitDay: perDay } : {}),
      ...(perMonth !== null ? { screenLimitMonth: perMonth } : {}),
    },
  });
  await securityEvent({ firmId: firm.id, kind: "billing-terms", details: { by: g.email, plan, fee, limit, perMinute, perDay, perMonth } });
  revalidatePath("/admin/billing");
  return { message: `${firm.name} updated.` };
}

async function addCredit(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const g = await guard(); if (isErr(g)) return g;
  const firm = await firmByDomain(fd);
  const euros = Number(fd.get("euros")), ref = String(fd.get("reference") ?? "").trim();
  if (!firm) return { error: "No firm uses that domain." };
  if (!(euros > 0 && euros <= 10_000)) return { error: "Enter an amount between €1 and €10,000." };
  if (ref.length < 3) return { error: "Enter a reason or reference." };
  await adminDb.creditEntry.create({ data: { firmId: firm.id, amountCents: Math.round(euros * 100), kind: "topup", description: `Credit (${ref})`, reference: ref } });
  await securityEvent({ firmId: firm.id, kind: "credit-added", details: { by: g.email, euros, ref } });
  revalidatePath("/admin/billing");
  return { message: `Credit of €${euros.toFixed(2)} added for ${firm.name}; it is deducted on the next invoice.` };
}

async function markPaid(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const g = await guard(); if (isErr(g)) return g;
  const number = String(fd.get("number") ?? "").trim().toUpperCase();
  const paidOn = String(fd.get("paidOn") ?? "").trim();
  const ref = String(fd.get("paymentRef") ?? "").trim().slice(0, 100);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) return { error: "Enter the payment date as YYYY-MM-DD." };
  const inv = await adminDb.invoice.findUnique({ where: { number } });
  if (!inv) return { error: "No invoice with that number." };
  if (inv.status !== "issued") return { error: `Invoice ${number} is already ${inv.status}.` };
  await adminDb.invoice.update({ where: { id: inv.id }, data: { status: "paid", paidOn, paymentRef: ref || null } });
  await securityEvent({ firmId: inv.firmId, kind: "invoice-paid", details: { by: g.email, number, paidOn } });
  revalidatePath("/admin/billing");
  return { message: `Invoice ${number} marked paid.` };
}

async function reactivate(_: ActionState, fd: FormData): Promise<ActionState> {
  "use server";
  const g = await guard(); if (isErr(g)) return g;
  const firm = await firmByDomain(fd);
  if (!firm) return { error: "No firm uses that domain." };
  if (firm.status !== "cancelled") return { error: `${firm.name} is active.` };
  await adminDb.firm.update({ where: { id: firm.id }, data: { status: "active", cancelledAt: null, archiveUntil: null } });
  await securityEvent({ firmId: firm.id, kind: "subscription-reactivated", details: { by: g.email } });
  revalidatePath("/admin/billing");
  return { message: `${firm.name} is active again.` };
}

async function runInvoicing(): Promise<ActionState> {
  "use server";
  const g = await guard(); if (isErr(g)) return g;
  const r = await issueMonthlyInvoices();
  revalidatePath("/admin/billing");
  return { message: `Last month's invoices: ${r.issued} issued, ${r.skipped} skipped (already issued or nothing to bill).` };
}

export default async function BillingAdmin() {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  const [firms, invoices] = await Promise.all([
    adminDb.firm.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, emailDomain: true, plan: true, status: true, archiveUntil: true, customFeeCents: true, spendLimitCents: true, trialEndsOn: true, screenLimitMinute: true, screenLimitDay: true, screenLimitMonth: true } }),
    adminDb.invoice.findMany({ orderBy: { seq: "desc" }, take: 200 }),
  ]);
  const firmName = new Map(firms.map((f) => [f.id, f.name]));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold">Billing (AMLSync admin)</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Invoices</h2>
        <ActionForm action={runInvoicing}><Submit variant="secondary">Issue last month&apos;s invoices now</Submit><StepUpLink /></ActionForm>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted"><tr><th className="py-1 pr-3 font-normal">Number</th><th className="py-1 pr-3 font-normal">Firm</th><th className="py-1 pr-3 font-normal">Month</th><th className="py-1 pr-3 font-normal">Due</th><th className="py-1 pr-3 text-right font-normal">Total</th><th className="py-1 pr-3 font-normal">Status</th><th className="py-1 font-normal">PDF</th></tr></thead>
            <tbody className="divide-y divide-border">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="py-1 pr-3">{i.number}</td><td className="py-1 pr-3">{firmName.get(i.firmId) ?? "—"}</td><td className="py-1 pr-3">{i.period}</td><td className="py-1 pr-3">{i.dueOn}</td>
                  <td className="py-1 pr-3 text-right">{formatEur(i.totalCents)}</td>
                  <td className="py-1 pr-3">{i.status === "paid" ? `Paid ${i.paidOn}` : i.dueOn < today ? "Overdue" : "Open"}</td>
                  <td className="py-1"><a className="text-accent underline" href={`/api/invoices/${i.id}`}>PDF</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ActionForm action={markPaid} className="grid gap-3 sm:grid-cols-3">
          <Field label="Invoice number" name="number" required />
          <Field label="Paid on (YYYY-MM-DD)" name="paidOn" defaultValue={today} required />
          <Field label="Bank reference" name="paymentRef" />
          <div className="sm:col-span-3"><Submit>Mark paid</Submit><StepUpLink /></div>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Firm terms</h2>
        <ul className="text-sm">{firms.map((f) => <li key={f.id}>{f.name} ({f.emailDomain}){f.status === "cancelled" ? ` · CANCELLED, archive until ${f.archiveUntil}` : ""} · {planOf(f.plan).name}{f.trialEndsOn ? ` (trial until ${f.trialEndsOn})` : ""} · fee {f.customFeeCents !== null ? `${formatEur(f.customFeeCents)} (custom)` : planOf(f.plan).monthlyCents !== null ? formatEur(planOf(f.plan).monthlyCents!) : "not set"}/month · paid checks up to {formatEur(f.spendLimitCents)}/month · screenings {f.screenLimitMinute}/min, {f.screenLimitDay}/day, {f.screenLimitMonth}/month</li>)}</ul>
        <p className="text-sm text-muted">Leave a field empty to keep it. Raise screening limits within 1 business day of a request.</p>
        <ActionForm action={setTerms} className="grid gap-3 sm:grid-cols-4">
          <Field label="Firm email domain" name="domain" required />
          <Field label="Plan (solo, starter, custom)" name="plan" defaultValue="starter" required />
          <Field label="Custom monthly fee (EUR, excl. VAT)" name="fee" type="number" hint="Empty = list price" />
          <Field label="Paid-check limit per month (EUR)" name="limit" type="number" />
          <Field label="Screenings per minute" name="perMinute" type="number" />
          <Field label="Screenings per day" name="perDay" type="number" />
          <Field label="Screenings per month" name="perMonth" type="number" />
          <div className="sm:col-span-4"><Submit variant="secondary">Save terms</Submit><StepUpLink /></div>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Restart a cancelled subscription</h2>
        <ActionForm action={reactivate} className="grid gap-3 sm:grid-cols-3">
          <Field label="Firm email domain" name="domain" required />
          <div className="sm:col-span-3"><Submit variant="secondary">Reactivate</Submit><StepUpLink /></div>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Add credit</h2>
        <p className="text-sm text-muted">For goodwill or prepayments. Credit is deducted on the firm&apos;s next invoice.</p>
        <ActionForm action={addCredit} className="grid gap-3 sm:grid-cols-3">
          <Field label="Firm email domain" name="domain" required />
          <Field label="Amount (EUR, excl. VAT)" name="euros" type="number" required />
          <Field label="Reason / reference" name="reference" required />
          <div className="sm:col-span-3"><Submit variant="secondary">Add credit</Submit><StepUpLink /></div>
        </ActionForm>
      </section>
    </main>
  );
}
