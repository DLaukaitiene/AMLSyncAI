import "server-only";
import type { Prisma, Sector } from "@prisma/client";
import type { Tx } from "./db";
import { audit } from "./audit";
import { loadClientFile, persistRiskIfChanged, runScreening } from "./cdd";
import { applyTransactionFlags } from "./transactions";

/**
 * Sample data for trials: a few fictitious clients, an ownership structure, a
 * case with payments that trip the red-flag rules. Everything is marked
 * `sample: true` and named "(sample)", and can be removed in one click.
 */
const SAMPLE = " (sample)";
type Ctx = { firmId: string; userId: string };

async function person(tx: Tx, ctx: Ctx, first: string, last: string, extra: Record<string, unknown> = {}) {
  return tx.party.create({ data: { firmId: ctx.firmId, kind: "NATURAL", displayName: `${first} ${last}${SAMPLE}`, details: { firstNames: first, lastName: last + SAMPLE, sample: true, nationalities: ["LT"], residenceCountry: "LT", ...extra } as Prisma.InputJsonValue } });
}

export async function hasSampleData(tx: Tx): Promise<boolean> {
  return (await tx.party.count({ where: { details: { path: ["sample"], equals: true } } })) > 0;
}

export async function loadSampleData(tx: Tx, ctx: Ctx): Promise<void> {
  if (await hasSampleData(tx)) throw new Error("Sample data is already loaded.");
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: ctx.firmId }, select: { sectors: true } });
  const ona = await person(tx, ctx, "Ona", "Pavyzdytė", { birthDate: "1985-04-12", occupation: "Pharmacist", email: "ona@example.com" });
  const jonas = await person(tx, ctx, "Jonas", "Ministras", { birthDate: "1968-09-30", isPep: "on", pepFunction: "Deputy minister" });
  const tomas = await person(tx, ctx, "Tomas", "Akcininkas", { birthDate: "1979-01-05" });
  const company = await tx.party.create({ data: { firmId: ctx.firmId, kind: "LEGAL", displayName: `Pavyzdys Holding UAB${SAMPLE}`, details: { name: `Pavyzdys Holding UAB${SAMPLE}`, legalForm: "Private limited company", registrationNumber: "300000000", countryOfCreation: "LT", sample: true } as Prisma.InputJsonValue } });
  for (const [owner, pct] of [[ona.id, 60], [tomas.id, 40]] as const) {
    await tx.ownershipLink.create({ data: { firmId: ctx.firmId, ownerId: owner, ownedId: company.id, type: "SHAREHOLDING", pct, source: "DECLARATION" } });
  }
  const files = [];
  for (const [p, purpose] of [[ona, "Annual accounts and tax returns"], [jonas, "Purchase of a holiday home"], [company, "Bookkeeping and payroll"]] as const) {
    files.push(await tx.cddFile.create({ data: { firmId: ctx.firmId, partyId: p.id, role: "CLIENT", purpose } }));
  }
  await runScreening(tx, ctx.firmId, [ona.id, jonas.id, tomas.id, company.id], undefined, { system: true });
  for (const f of files) await persistRiskIfChanged(tx, ctx.firmId, await loadClientFile(tx, ctx.firmId, f.id));
  // A case with payments: ordinary, cash over the threshold, and two just under €10,000.
  const sector: Sector = (firm.sectors[0] as Sector) ?? "OTHER";
  const matter = await tx.matter.create({ data: { firmId: ctx.firmId, type: "PROPERTY_SALE", sector, title: `Sale of Pavyzdžio g. 1${SAMPLE}`, details: { price: 185000, sample: true } as Prisma.InputJsonValue } });
  await tx.matterParty.create({ data: { firmId: ctx.firmId, matterId: matter.id, partyId: jonas.id, role: "BUYER" } });
  const day = (n: number) => new Date(Date.now() - n * 86_400_000);
  for (const [amount, method, d, desc] of [[2000, "bank-transfer", 20, "Reservation fee"], [4500, "cash", 12, "Cash deposit at the office"], [9800, "bank-transfer", 8, "Instalment 1"], [9600, "bank-transfer", 3, "Instalment 2"]] as const) {
    const t = await tx.transaction.create({ data: { firmId: ctx.firmId, matterId: matter.id, customerId: jonas.id, date: day(d), amountEUR: amount, method, occasional: true, description: `${desc}${SAMPLE}` } });
    await applyTransactionFlags(tx, ctx, t.id);
  }
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "Firm", objectId: ctx.firmId, fields: ["sample-data"] });
}

export async function removeSampleData(tx: Tx, ctx: Ctx): Promise<number> {
  const parties = (await tx.party.findMany({ where: { details: { path: ["sample"], equals: true } }, select: { id: true } })).map((p) => p.id);
  const matters = (await tx.matter.findMany({ where: { details: { path: ["sample"], equals: true } }, select: { id: true } })).map((m) => m.id);
  const files = (await tx.cddFile.findMany({ where: { partyId: { in: parties } }, select: { id: true } })).map((f) => f.id);
  await tx.task.deleteMany({ where: { objectId: { in: [...files, ...matters] } } });
  await tx.portalLink.deleteMany({ where: { cddFileId: { in: files } } });
  await tx.transaction.deleteMany({ where: { matterId: { in: matters } } });
  await tx.matterParty.deleteMany({ where: { matterId: { in: matters } } });
  await tx.matter.deleteMany({ where: { id: { in: matters } } });
  await tx.ownershipLink.deleteMany({ where: { OR: [{ ownerId: { in: parties } }, { ownedId: { in: parties } }] } });
  await tx.party.deleteMany({ where: { id: { in: parties } } });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "delete", objectType: "Firm", objectId: ctx.firmId, fields: ["sample-data"] });
  return parties.length;
}
