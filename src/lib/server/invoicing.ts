import "server-only";
import { adminDb, withTenant, type Tx } from "./db";
import { appUrl, sendEmail } from "./email";
import { securityEvent } from "./audit";
import { buildInvoice, invoiceNumber, OVERDUE_PAUSE_DAYS, PAYMENT_TERMS_DAYS, previousMonth, SELLER, type Customer } from "@/lib/billing/invoice";
import { formatEur } from "@/lib/didit/map";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => iso(new Date(Date.parse(isoDate + "T00:00:00Z") + n * 86_400_000));

export function customerOf(f: { name: string; homeState: string; billingName: string | null; billingAddress: string | null; billingCountry: string | null; vatId: string | null; billingCompanyCode: string | null }): Customer {
  return { name: f.billingName || f.name, address: f.billingAddress, country: f.billingCountry || f.homeState, vatId: f.vatId, companyCode: f.billingCompanyCode };
}

/** Bank transfer details printed on invoices (set in the server environment). */
export function paymentDetails(): { iban: string | null; bank: string | null } {
  return { iban: process.env.SELLER_IBAN || null, bank: process.env.SELLER_BANK || null };
}

/**
 * Paid checks are allowed unless an invoice is overdue by more than
 * OVERDUE_PAUSE_DAYS, or this month's net spend would pass the firm's limit.
 */
export async function assertCanSpend(tx: Tx, firmId: string, cents: number, today = new Date()): Promise<void> {
  const cutoff = addDays(iso(today), -OVERDUE_PAUSE_DAYS);
  const overdue = await tx.invoice.findFirst({ where: { status: "issued", dueOn: { lt: cutoff } }, orderBy: { dueOn: "asc" } });
  if (overdue) throw new SpendError(`Paid checks are paused: invoice ${overdue.number} was due on ${overdue.dueOn}. Once it is paid, checks resume.`);
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { spendLimitCents: true } });
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const spent = -((await tx.creditEntry.aggregate({ where: { kind: { in: ["charge", "refund"] }, createdAt: { gte: monthStart } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0);
  if (spent + cents > firm.spendLimitCents) {
    throw new SpendError(`This month's limit for paid checks (${formatEur(firm.spendLimitCents)}) is reached. Contact AMLSyncAI to raise it.`);
  }
}

export class SpendError extends Error {}

/**
 * Issues last month's invoices for every firm (idempotent: one invoice per firm and month).
 * Entries not yet invoiced are swept up, so late refunds land on the next invoice.
 */
export async function issueMonthlyInvoices(today = new Date()): Promise<{ issued: number; skipped: number }> {
  const period = previousMonth(today);
  const label = period.from.slice(0, 7);
  const firms = await adminDb.firm.findMany();
  let issued = 0, skipped = 0;
  for (const f of firms) {
    const done = await adminDb.$transaction(async (tx) => {
      if (await tx.invoice.findUnique({ where: { firmId_period: { firmId: f.id, period: label } } })) return false;
      const entries = await tx.creditEntry.findMany({ where: { firmId: f.id, invoiceId: null, createdAt: { lt: new Date(period.toExclusive + "T00:00:00Z") } }, orderBy: { createdAt: "asc" } });
      const customer = customerOf(f);
      const draft = buildInvoice(f.monthlyFeeCents, f.plan, entries, customer);
      if (draft.netBeforeCreditCents <= 0) return false; // nothing to bill; entries roll forward
      // Continuous numbering across all firms: serialise on an advisory lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
      const seq = ((await tx.invoice.aggregate({ _max: { seq: true } }))._max.seq ?? 0) + 1;
      const issuedOn = iso(today);
      const inv = await tx.invoice.create({
        data: {
          firmId: f.id, seq, number: invoiceNumber(today.getUTCFullYear(), seq), period: label, issuedOn, dueOn: addDays(issuedOn, PAYMENT_TERMS_DAYS),
          seller: { ...SELLER, ...paymentDetails() }, buyer: { ...customer }, lines: draft.lines as unknown as object,
          netCents: draft.netCents, vatRateBp: draft.rateBp, vatCents: draft.vatCents, totalCents: draft.totalCents, vatNote: draft.vatNote,
        },
      });
      await tx.creditEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { invoiceId: inv.id } });
      if (draft.carryCents > 0) {
        await tx.creditEntry.create({ data: { firmId: f.id, amountCents: draft.carryCents, kind: "carry", description: `Credit carried forward from invoice ${inv.number}`, reference: inv.id } });
      }
      return inv;
    });
    if (!done) { skipped++; continue; }
    issued++;
    const to = f.billingEmail || (await adminDb.user.findFirst({ where: { firmId: f.id, roles: { has: "OWNER" }, deactivatedAt: null }, orderBy: { createdAt: "asc" } }))?.email;
    if (to) await sendEmail(to, `AMLSyncAI invoice ${done.number} (${period.label})`, `Your invoice ${done.number} for ${period.label} is ready: ${formatEur(done.totalCents)} incl. VAT, due on ${done.dueOn}.\n\nDownload it in AMLSyncAI under Billing: ${appUrl("/app/billing")}\n\n${SELLER.name}`);
    await securityEvent({ firmId: f.id, kind: "invoice-issued", details: { number: done.number, total: done.totalCents } });
  }
  return { issued, skipped };
}

export async function firmInvoices(firmId: string) {
  return withTenant(firmId, (tx) => tx.invoice.findMany({ orderBy: { seq: "desc" } }));
}
