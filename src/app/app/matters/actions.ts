"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { requireUser, confirmFirst } from "@/lib/server/session";
import { withTenant, type Tx } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { formToObject, zodErrors } from "@/lib/server/form";
import { currentProfile } from "@/lib/server/country-profile";
import { loadClientFile, persistRiskIfChanged, runScreening, upsertTask } from "@/lib/server/cdd";
import { displayName, legalEntitySchema, naturalPersonSchema } from "@/lib/cdd/party";
import { evaluateCddTriggers, checkCashPayment, thresholdReportRequired, type GoodsCategory, type Sector } from "@/lib/rules/cdd-triggers";
import { canCompleteMatter, canTransferFundsOrProperty, type MatterState } from "@/lib/rules/gates";
import { thresholdReportDue, cashReportDue } from "@/lib/rules/deadlines";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { toIsoDate } from "@/lib/rules/dates";
import { encryptField } from "@/lib/server/crypto";
import { matterHeld } from "@/lib/server/cases";
import { applyTransactionFlags } from "@/lib/server/transactions";
import { toEur, validateRow } from "@/lib/transactions/format";
import { normalizeCountry } from "@/lib/geo/countries";

const ROLES = ["CLIENT", "BUYER", "SELLER", "LANDLORD", "TENANT", "SUPPLIER", "REPRESENTATIVE", "BENEFICIARY", "OTHER"] as const;
const TYPES = ["ENGAGEMENT", "PROPERTY_SALE", "LETTING", "GOODS_SALE", "COMPANY_FORMATION", "TRANSACTION", "OTHER"] as const;
const SECTOR_KEY: Record<string, Sector> = {
  ACCOUNTANT: "accountant", ESTATE_AGENT: "estate-agent", HVG_TRADER: "hvg-trader", PRECIOUS_METALS: "precious-metals", TCSP: "tcsp", LEGAL: "legal",
  ART_TRADER: "art-trader", GAMBLING: "gambling", CROWDFUNDING: "crowdfunding", CREDIT_INTERMEDIARY: "credit-intermediary", INVESTMENT_MIGRATION: "investment-migration",
};

export async function createMatterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const o = formToObject(fd);
  const type = TYPES.find((t) => t === o.type);
  const sector = o.sector;
  if (!type) return { error: "Choose the case type.", fieldErrors: { type: ["Required."] } };
  if (type === "OTHER" && !String(o.typeOther ?? "").trim()) return { error: "Describe the type of case.", fieldErrors: { typeOther: ["Describe it."] } };
  if (o.goodsCategory === "other" && !String(o.goodsCategoryOther ?? "").trim()) return { error: "Describe the goods category.", fieldErrors: { goodsCategoryOther: ["Describe it."] } };
  if (!o.title || o.title.trim().length < 3) return { error: "Give the case a title.", fieldErrors: { title: ["Required."] } };
  const details: Record<string, string> = {};
  for (const k of ["property", "price", "financing", "item", "goodsCategory", "goodsCategoryOther", "typeOther", "value", "engagementType", "monthlyRent"]) if (o[k]) details[k] = String(o[k]).slice(0, 500);
  const id = await withTenant(s.firm.id, async (tx) => {
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } });
    const officeId = o.officeId ? (await tx.office.findUnique({ where: { id: o.officeId } }))?.id ?? null : null;
    const m = await tx.matter.create({
      data: {
        firmId: s.firm.id, officeId, type, sector: (sector && firm.sectors.includes(sector as never) ? sector : firm.sectors[0] ?? "OTHER") as never,
        title: o.title.trim(), details,
      },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Matter", objectId: m.id, fields: ["type", ...Object.keys(details)] });
    return m.id;
  });
  redirect(`/app/matters/${id}`);
}

async function ensureFile(tx: Tx, firmId: string, partyId: string, role: (typeof ROLES)[number]) {
  const f = await tx.cddFile.upsert({
    where: { partyId_role: { partyId, role } },
    create: { firmId, partyId, role },
    update: {},
  });
  return f.id;
}

export async function addPartyAction(matterId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const o = formToObject(fd);
  const role = ROLES.find((r) => r === o.role);
  if (!role) return { error: "Choose the role.", fieldErrors: { role: ["Required."] } };
  const roleOther = role === "OTHER" ? String(o.roleOther ?? "").trim().slice(0, 200) : null;
  if (role === "OTHER" && !roleOther) return { error: "Describe the role.", fieldErrors: { roleOther: ["Describe it."] } };
  return withTenant(s.firm.id, async (tx) => {
    let partyId = o.existingPartyId;
    if (!partyId) {
      const kind = o.kind === "LEGAL" ? "LEGAL" : "NATURAL";
      const parsed = kind === "NATURAL"
        ? naturalPersonSchema.safeParse({ firstNames: o.firstNames, lastName: o.lastName, birthDate: o.birthDate, nationalities: o.nationalities ?? "", residenceCountry: o.residenceCountry, isPep: o.isPep === "on", isPepFamilyOrAssociate: o.isPepFamilyOrAssociate === "on" })
        : legalEntitySchema.safeParse({ name: o.name, legalForm: o.legalForm, registrationNumber: o.registrationNumber, countryOfCreation: o.countryOfCreation, bearerShares: o.bearerShares === "on", nomineeArrangements: o.nomineeArrangements === "on", riskFlags: fd.getAll("riskFlags").map(String) });
      if (!parsed.success) return zodErrors(parsed.error);
      const p = await tx.party.create({ data: { firmId: s.firm.id, kind, displayName: displayName(kind, parsed.data), details: parsed.data as Prisma.InputJsonValue } });
      await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Party", objectId: p.id, fields: Object.keys(parsed.data) });
      await runScreening(tx, s.firm.id, [p.id]);
      partyId = p.id;
    }
    const exists = await tx.matterParty.findFirst({ where: { matterId, partyId, role } });
    if (exists) return { error: "This party already has that role in the case." };
    const review = o.existingPartyId ? await compareWithProfile(tx, s.firm.id, matterId, partyId) : null;
    await tx.matterParty.create({ data: { firmId: s.firm.id, matterId, partyId, role, roleOther } });
    const fileId = await ensureFile(tx, s.firm.id, partyId, role);
    await persistRiskIfChanged(tx, s.firm.id, await loadClientFile(tx, s.firm.id, fileId));
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Matter", objectId: matterId, fields: ["parties"] });
    revalidatePath(`/app/matters/${matterId}`);
    return { message: `Party added. Each party has its own CDD file.${review ? ` Review needed: ${review}` : ""}` };
  });
}

/** Records a payment / occasional transaction and runs the CDD triggers, cash cap and threshold rules. */
export async function addTransactionAction(matterId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const o = formToObject(fd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.date ?? "")) return { error: "Enter the date.", fieldErrors: { date: ["YYYY-MM-DD"] } };
  // The same validation as the transaction import (src/lib/transactions/format.ts).
  const currency = String(o.currency ?? "EUR").trim().toUpperCase() || "EUR";
  const v = validateRow({
    date: o.date, client_code: o.customerId ?? "", amount: String(o.amountEUR ?? o.amount ?? "").trim(), currency, fx_rate: String(o.fxRate ?? ""),
    method: o.method || "bank-transfer", direction: String(o.direction ?? ""), counterparty_name: String(o.counterpartyName ?? ""),
    from_country: normalizeCountry(o.fromCountry) ?? "", third_party_payer: o.thirdPartyPayer === "on" ? "yes" : "no", occasional: o.occasional === "on" ? "yes" : "no",
    description: String(o.description ?? ""), external_id: String(o.externalId ?? ""),
  });
  if (!v.ok) return { error: `Check the transaction: ${v.error}.` };
  if (currency !== "EUR" && !v.row.fxRate) return { error: `Enter the exchange rate (euros per 1 ${currency}).`, fieldErrors: { fxRate: ["Required for other currencies."] } };
  const amount = currency === "EUR" ? v.row.originalAmount : toEur(v.row.originalAmount, v.row.fxRate!);
  const method = v.row.method as "cash";
  const methodStored = o.method === "other" && String(o.methodOther ?? "").trim() ? `other: ${String(o.methodOther).trim().slice(0, 100)}` : method;
  if (!o.customerId || !/^[0-9a-f-]{36}$/i.test(o.customerId)) return { error: "Choose who pays." };

  return withTenant(s.firm.id, async (tx) => {
    const matter = await tx.matter.findUniqueOrThrow({ where: { id: matterId } });
    // The payer must be one of this matter's parties.
    if (!(await tx.matterParty.count({ where: { matterId, partyId: o.customerId } }))) return { error: "The payer must be a party to this matter." };
    // A matter of an office in another member state uses that office's Country Profile.
    const { profile, version } = await currentProfile(tx, s.firm.id, matter.officeId);
    const messages: string[] = [];

    if (method === "cash") {
      const c = checkCashPayment(amount, profile);
      if (c.blocked) return { error: c.message! };
      if (c.nationalReportRequired) messages.push("A national cash report is required: a draft was created.");
    }

    const matterIds = (await tx.matterParty.findMany({ where: { partyId: o.customerId }, select: { matterId: true } })).map((m) => m.matterId);
    const history = (await tx.transaction.findMany({ where: { customerId: o.customerId, matterId: { in: matterIds } } })).map((t) => ({
      id: t.id, customerId: t.customerId, date: toIsoDate(t.date), amountEUR: Number(t.amountEUR), method: t.method as "cash", occasional: t.occasional,
    }));
    const t = await tx.transaction.create({
      data: {
        firmId: s.firm.id, matterId, customerId: o.customerId, date: new Date(o.date), amountEUR: amount, method: methodStored, occasional: o.occasional === "on",
        description: v.row.description, thirdPartyPayer: v.row.thirdPartyPayer, fromCountry: v.row.fromCountry,
        originalAmount: v.row.originalAmount, originalCurrency: currency, fxRate: currency === "EUR" ? null : v.row.fxRate,
        direction: v.row.direction, counterpartyName: v.row.counterpartyName, externalId: v.row.externalId,
      },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Transaction", objectId: t.id, fields: ["amountEUR", "method"] });

    const triggers = evaluateCddTriggers({
      sector: SECTOR_KEY[matter.sector] ?? "other",
      profile,
      history,
      newTransaction: { id: t.id, customerId: o.customerId, date: o.date, amountEUR: amount, method, occasional: o.occasional === "on" },
    });
    for (const tr of triggers) {
      messages.push(`CDD required: ${tr.explanation} (${tr.article})`);
      const role = (await tx.matterParty.findFirst({ where: { matterId, partyId: o.customerId } }))?.role ?? "CLIENT";
      const fileId = await ensureFile(tx, s.firm.id, o.customerId, role);
      const file = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId } });
      if (file.status === "OPEN") await upsertTask(tx, { firmId: s.firm.id, kind: "cdd-required", objectType: "CddFile", objectId: fileId, dueOn: o.date, article: tr.article });
    }

    if (method === "cash" && profile.nationalCashReport.enabled && profile.nationalCashReport.thresholdEUR && amount >= profile.nationalCashReport.thresholdEUR) {
      await tx.report.create({
        data: { firmId: s.firm.id, matterId, type: "CASH", format: "draft", contentEnc: encryptField(s.firm.id, JSON.stringify({ transactionId: t.id, amount, date: o.date })), euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version },
      });
      const due = cashReportDue(o.date, profile);
      if (due) {
        await upsertTask(tx, { firmId: s.firm.id, kind: "cash-report", objectType: "Matter", objectId: matterId, dueOn: due.due, article: due.article });
        messages.push(`Report it to your FIU by ${due.due} (${profile.nationalCashReport.deadlineWorkingDays} working days).`);
      }
    }

    const category = (matter.details as { goodsCategory?: GoodsCategory }).goodsCategory;
    if (category) {
      const total = Number((await tx.transaction.aggregate({ where: { matterId }, _sum: { amountEUR: true } }))._sum.amountEUR ?? 0);
      const tr = thresholdReportRequired(category, total);
      if (tr.required && (await tx.report.count({ where: { matterId, type: "THRESHOLD" } })) === 0) {
        const rep = await tx.report.create({
          data: { firmId: s.firm.id, matterId, type: "THRESHOLD", format: "draft", contentEnc: encryptField(s.firm.id, JSON.stringify({ category, total, date: o.date })), euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version },
        });
        const due = thresholdReportDue(o.date, profile);
        if (due) await upsertTask(tx, { firmId: s.firm.id, kind: "threshold-report", objectType: "Matter", objectId: matterId, dueOn: due.due, article: "Art. 74" });
        await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Report", objectId: rep.id });
        messages.push(tr.explanation!);
      }
    }
    const flags = await applyTransactionFlags(tx, { firmId: s.firm.id, userId: s.user.id }, t.id);
    if (flags.length) messages.push(`Flagged for review in Transaction Monitoring: ${flags.map((f) => f.message).join(" ")}`);
    revalidatePath(`/app/matters/${matterId}`);
    revalidatePath("/app/transactions");
    return { message: messages.length ? messages.join(" ") : "Transaction recorded. No CDD trigger, report or red flag." };
  });
}

export async function matterState(tx: Tx, firmId: string, matterId: string): Promise<MatterState> {
  const m = await tx.matter.findUniqueOrThrow({ where: { id: matterId }, include: { parties: true } });
  const files = [];
  for (const mp of m.parties) {
    const f = await tx.cddFile.findUnique({ where: { partyId_role: { partyId: mp.partyId, role: mp.role } } });
    if (!f) continue;
    const cf = await loadClientFile(tx, firmId, f.id);
    // An accepted file counts as complete for the matter.
    const accepted = ["COMPLETE", "SDD", "EDD"].includes(f.status);
    files.push(accepted ? { ...cf.state, identityVerified: true, boResolved: true, purposeRecorded: true, eddChecklistComplete: true, seniorApprovalRecorded: true, pepApprovalRecorded: true } : cf.state);
  }
  const held = await matterHeld(tx, matterId);
  return {
    sector: SECTOR_KEY[m.sector] ?? "other",
    type: m.type.toLowerCase().replace("_", "-") as MatterState["type"],
    files,
    transactionHold: held,
    sanctionsBlocked: m.status === "ON_HOLD",
  };
}

export async function completeMatterAction(matterId: string, step: "transfer" | "complete", _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.accept");
  const reason = String(fd.get("overrideReason") ?? "").trim();
  const override = reason ? { byRole: s.user.roles.includes("COMPLIANCE_OFFICER") ? "compliance-officer" : "staff", reason } : undefined;
  { const c = override && confirmFirst(fd, "This overrides the missing checks and lets the case go ahead. Your name and reason are recorded for the supervisor."); if (c) return c; }
  return withTenant(s.firm.id, async (tx) => {
    const st = await matterState(tx, s.firm.id, matterId);
    const d = step === "transfer" ? canTransferFundsOrProperty(st, override) : canCompleteMatter(st, override);
    if (!d.allowed) return { error: d.error ?? `Not yet: ${d.openItems.map((i) => i.message).join(" ")}` };
    const m = await tx.matter.findUniqueOrThrow({ where: { id: matterId } });
    const details = { ...(m.details as Record<string, unknown>), ...(step === "transfer" ? { transferApprovedAt: new Date().toISOString() } : {}) };
    await tx.matter.update({ where: { id: matterId }, data: { details: details as Prisma.InputJsonValue, ...(step === "complete" ? { status: "COMPLETED" } : {}) } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "Matter", objectId: matterId, fields: [step === "complete" ? "status" : "transferApprovedAt", ...(d.overridden ? ["gateOverride"] : [])] });
    revalidatePath(`/app/matters/${matterId}`);
    return { message: step === "transfer" ? "Funds / property transfer can go ahead." : "Case completed." };
  });
}

/**
 * Per-matter monitoring (spec §4.5, §11.9): a new matter for an existing client
 * is compared with what we know (earlier matter values, countries). A mismatch
 * creates a review task.
 */
async function compareWithProfile(tx: Tx, firmId: string, matterId: string, partyId: string): Promise<string | null> {
  const accepted = await tx.cddFile.findFirst({ where: { partyId, status: { in: ["COMPLETE", "SDD", "EDD"] } } });
  if (!accepted) return null;
  const value = (m: { details: unknown }) => Number((m.details as { price?: string; value?: string }).price ?? (m.details as { value?: string }).value ?? 0);
  const matter = await tx.matter.findUniqueOrThrow({ where: { id: matterId } });
  const earlier = await tx.matter.findMany({ where: { id: { not: matterId }, parties: { some: { partyId } } } });
  const reasons: string[] = [];
  const max = Math.max(0, ...earlier.map(value));
  if (value(matter) > 0 && max > 0 && value(matter) > 2 * max) reasons.push(`value €${value(matter).toLocaleString("en")} is more than twice the largest earlier case (€${max.toLocaleString("en")})`);
  const party = await tx.party.findUniqueOrThrow({ where: { id: partyId } });
  const declared = (party.details as { sourceOfFunds?: string }).sourceOfFunds;
  if (value(matter) >= 100_000 && !declared) reasons.push("large case and no source of funds on file");
  if (!reasons.length) return null;
  await upsertTask(tx, { firmId, kind: "matter-review", objectType: "Matter", objectId: matterId, dueOn: toIsoDate(new Date()), article: "Art. 26" });
  return reasons.join("; ") + ".";
}
