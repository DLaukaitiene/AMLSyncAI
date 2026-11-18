import "server-only";
import { adminDb, withTenant, type Tx } from "./db";
import { appUrl, sendEmail } from "./email";
import { securityEvent } from "./audit";
import { buildInvoice, invoiceNumber, OVERDUE_PAUSE_DAYS, PAYMENT_TERMS_DAYS, previousMonth, SELLER, type Customer } from "@/lib/billing/invoice";
import { formatEur } from "@/lib/didit/map";
import { monthlyFeeFor, planOf } from "@/lib/billing/plans";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (isoDate: string, n: number) => iso(new Date(Date.parse(isoDate + "T00:00:00Z") + n * 86_400_000));

export function customerOf(f: { name: string; homeState: string; billingName: string | null; billingAddress: string | null; billingCountry: string | null; vatId: string | null; billingCompanyCode: string | null }): Customer {
  return { name: f.billingName || f.name, address: f.billingAddress, country: f.billingCountry || f.homeState, vatId: f.vatId, companyCode: f.billingCompanyCode };
}


/**
 * Paid checks are allowed unless an invoice is overdue by more than
 * OVERDUE_PAUSE_DAYS, or this month's net spend would pass the firm's limit.
 */
export async function assertCanSpend(tx: Tx, firmId: string, cents: number, today = new Date()): Promise<void> {
  const blocked = await serviceBlock(tx, firmId);
  if (blocked) throw new SpendError(blocked);
  const cutoff = addDays(iso(today), -OVERDUE_PAUSE_DAYS);
  const overdue = await tx.invoice.findFirst({ where: { status: "issued", dueOn: { lt: cutoff } }, orderBy: { dueOn: "asc" } });
  if (overdue) throw new SpendError(`Paid checks are paused: invoice ${overdue.number} was due on ${overdue.dueOn}. Once it is paid, checks resume.`);
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { spendLimitCents: true } });
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const spent = -((await tx.creditEntry.aggregate({ where: { kind: { in: ["charge", "refund"] }, createdAt: { gte: monthStart } }, _sum: { amountCents: true } }))._sum.amountCents ?? 0);
  if (spent + cents > firm.spendLimitCents) {
    throw new SpendError(`This month's limit for paid checks (${formatEur(firm.spendLimitCents)}) is reached. Contact AMLSync to raise it.`);
  }
}

export class SpendError extends Error {}

/**
 * Firm status set by AMLSyncAI (Backoffice §6.2): paused, suspended and closed
 * firms keep read access and their records, but cannot start new checks or screenings.
 */
export async function serviceBlock(tx: Tx, firmId: string): Promise<string | null> {
  const f = await tx.firm.findUnique({ where: { id: firmId }, select: { status: true } });
  if (!f || f.status === "active") return null;
  return f.status === "closed"
    ? "This account is closed. Your records stay available for export until their retention period ends."
    : `New checks and screenings are ${f.status === "paused" ? "paused" : "suspended"} for your firm. Your records stay available. Contact contact@amlsync.com.`;
}

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
      const draft = buildInvoice(monthlyFeeFor(f.plan, f.customFeeCents, f.trialEndsOn, period.from, period.toExclusive, f.cancelledAt ? f.cancelledAt.toISOString().slice(0, 10) : null), planOf(f.plan).name, entries, customer);
      if (draft.netBeforeCreditCents <= 0) return false; // nothing to bill; entries roll forward
      // Continuous numbering across all firms: serialise on an advisory lock.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(424242)`;
      const seq = ((await tx.invoice.aggregate({ _max: { seq: true } }))._max.seq ?? 0) + 1;
      const issuedOn = iso(today);
      const inv = await tx.invoice.create({
        data: {
          firmId: f.id, seq, number: invoiceNumber(today.getUTCFullYear(), seq), period: label, issuedOn, dueOn: addDays(issuedOn, PAYMENT_TERMS_DAYS),
          seller: { ...SELLER }, buyer: { ...customer }, lines: draft.lines as unknown as object,
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
    if (to) await sendEmail(to, `AMLSync invoice ${done.number} (${period.label})`, `Your invoice ${done.number} for ${period.label} is ready: ${formatEur(done.totalCents)} incl. VAT, due on ${done.dueOn}.\n\nDownload it in AMLSync App under Billing: ${appUrl("/app/billing")}\n\n${SELLER.name}`);
    await securityEvent({ firmId: f.id, kind: "invoice-issued", details: { number: done.number, total: done.totalCents } });
  }
  return { issued, skipped };
}

export async function firmInvoices(firmId: string) {
  return withTenant(firmId, (tx) => tx.invoice.findMany({ orderBy: { seq: "desc" } }));
}
