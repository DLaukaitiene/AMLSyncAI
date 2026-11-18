import "server-only";
import type { Prisma } from "@prisma/client";
import { withTenant, type Tx } from "./db";
import { audit } from "./audit";
import { hit } from "./rate-limit";
import { charge, didit, DiditError, diditEnabled, refund } from "./didit";
import { loadClientFile, persistRiskIfChanged, runScreening, upsertTask } from "./cdd";
import { KYB_PRICE_CENTS, kybInactive, mapKybCompany, type KybCompany } from "@/lib/didit/map";
import { normalizeCountry } from "@/lib/geo/countries";
import { toIsoDate } from "@/lib/rules/dates";

/**
 * Company register checks through Didit (spec §4.2; AMLR Art. 22(7) register
 * extract). Search is free for the firm (rate-limited); retrieving the chosen
 * company (details, officers, shareholders, beneficial owners) is a paid check.
 * Register data fills blanks and flags differences; people from the register are
 * only added to the ownership structure when a person confirms each one.
 */

export interface Candidate { id: string; name: string; registrationNumber: string | null; status: string | null; type: string | null; address: string | null }

export async function searchCompanyRegister(firmId: string, q: { country: string; name?: string; registrationNumber?: string }): Promise<Candidate[]> {
  if (!diditEnabled()) throw new DiditError("Company register checks are not set up for this installation.");
  if (!(await hit(`kyb-search:${firmId}`, { limit: 30, windowSec: 86_400 }))) throw new DiditError("Too many register searches today. Try again tomorrow or contact contact@amlsync.com.");
  const country = normalizeCountry(q.country);
  if (!country || !/^[A-Z]{2}$/.test(country)) throw new DiditError("Choose the country where the company is registered.");
  if (!q.name?.trim() && !q.registrationNumber?.trim()) throw new DiditError("Enter the company name or registration number.");
  type Resp = { kyb_registry?: { companies?: Record<string, unknown>[]; search_resolved?: boolean } };
  const r = await didit<Resp>("POST", "/v3/kyb/search/", {
    country_code: country,
    ...(q.registrationNumber?.trim() ? { registration_number: q.registrationNumber.trim() } : {}),
    ...(q.name?.trim() ? { name: q.name.trim(), search_type: "contains" } : {}),
  });
  if (r.kyb_registry && r.kyb_registry.search_resolved === false) throw new DiditError("The register is answering slowly. Try the search again in a minute.");
  return (r.kyb_registry?.companies ?? []).slice(0, 25).map((c) => ({
    id: String(c.kyb_response_id), name: String(c.name ?? ""), registrationNumber: (c.registration_number as string) ?? null,
    status: (c.status as string) ?? null, type: (c.type as string) ?? null, address: (c.registered_address as string) ?? null,
  }));
}

/** Retrieves the chosen company with owners (UBO tier), charges the check, imports it when ready. */
export async function retrieveCompany(ctx: { firmId: string; userId: string }, fileId: string, kybResponseId: string): Promise<{ status: "imported" | "pending"; company?: KybCompany }> {
  if (!diditEnabled()) throw new DiditError("Company register checks are not set up for this installation.");
  const pre = await withTenant(ctx.firmId, async (tx) => {
    const file = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId }, include: { party: true } });
    if (file.party.kind === "NATURAL") throw new DiditError("Register checks are for companies and other legal entities.");
    const chargeId = await charge(tx, ctx.firmId, ctx.userId, "Company register check (details, officers, owners)", file.party.displayName, KYB_PRICE_CENTS);
    return { partyId: file.partyId, chargeId };
  });
  type Resp = { request_id: string; registry_tier_delivered?: string; kyb_registry?: Record<string, unknown> };
  let r: Resp;
  try {
    r = await didit<Resp>("POST", "/v3/kyb/ubo/", { kyb_response_id: kybResponseId, vendor_data: pre.partyId }, { "Idempotency-Key": `${pre.partyId}:${kybResponseId}` });
  } catch (e) {
    await withTenant(ctx.firmId, (tx) => refund(tx, ctx.firmId, pre.chargeId, "register could not be read"));
    throw e;
  }
  const company = r.kyb_registry ? mapKybCompany(r.kyb_registry, r.registry_tier_delivered) : null;
  const ready = !!company && company.fetchStatus !== "pending";
  return withTenant(ctx.firmId, async (tx) => {
    const row = await tx.diditSession.create({
      data: { firmId: ctx.firmId, partyId: pre.partyId, cddFileId: fileId, kind: "kyb", diditSessionId: r.request_id, status: ready ? "Approved" : "In Progress", sandbox: !!company?.sandbox, creditEntryId: pre.chargeId, createdVia: "staff", createdById: ctx.userId },
    });
    await tx.creditEntry.update({ where: { id: pre.chargeId }, data: { reference: r.request_id } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "DiditSession", objectId: row.id, fields: ["kyb"] });
    if (!ready || !company) return { status: "pending" as const };
    await importCompany(tx, ctx.firmId, { id: row.id, partyId: pre.partyId, cddFileId: fileId }, company, r.request_id);
    return { status: "imported" as const, company };
  }, { timeoutMs: 60_000 });
}

/** Ownership data some registers deliver a few minutes later: fetch and import when ready. */
export async function refreshCompanyCheck(firmId: string, requestId: string): Promise<{ status: string; imported: boolean }> {
  const s = await withTenant(firmId, (tx) => tx.diditSession.findUnique({ where: { diditSessionId: requestId } }));
  if (!s || s.kind !== "kyb") throw new DiditError("Unknown check.");
  if (s.importedAt) return { status: s.status, imported: false };
  const d = await didit<{ registry_checks?: { company?: Record<string, unknown> }[] }>("GET", `/v3/session/${encodeURIComponent(requestId)}/decision/`);
  const c = d.registry_checks?.[0]?.company;
  if (!c) return { status: s.status, imported: false };
  const company = mapKybCompany(c);
  if (company.fetchStatus === "pending") return { status: "In Progress", imported: false };
  return withTenant(firmId, async (tx) => {
    await importCompany(tx, firmId, { id: s.id, partyId: s.partyId, cddFileId: s.cddFileId }, company, requestId);
    await tx.diditSession.update({ where: { id: s.id }, data: { status: "Approved" } });
    return { status: "Approved", imported: true };
  }, { timeoutMs: 60_000 });
}

async function importCompany(tx: Tx, firmId: string, s: { id: string; partyId: string; cddFileId: string | null }, k: KybCompany, requestId: string) {
  const now = new Date();
  const party = await tx.party.findUniqueOrThrow({ where: { id: s.partyId } });
  const d = (party.details ?? {}) as Record<string, unknown>;
  const x = await tx.registryExtract.create({
    data: {
      firmId, partyId: s.partyId, register: `Company register${k.country ? ` (${k.country})` : ""} via Didit`, source: "REGISTER", retrievedAt: now,
      data: { extractDate: toIsoDate(now), provider: "Didit", requestId, ...k, people: k.people.map((p) => ({ ...p, addedPartyId: null })) } as unknown as Prisma.InputJsonValue,
    },
  });
  await audit(tx, { firmId, userId: null, action: "create", objectType: "RegistryExtract", objectId: x.id, fields: ["register", "people"] });

  // Matching rule: fill blanks only; never overwrite; flag differences for a person.
  const fill: Record<string, unknown> = {};
  const mismatches: string[] = [];
  const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const cmp = (key: string, label: string, theirs: string | null) => {
    if (!theirs) return;
    const ours = d[key];
    if (ours === undefined || ours === null || ours === "") fill[key] = theirs;
    else if (norm(ours) !== norm(theirs)) mismatches.push(`${label}: file "${String(ours)}" vs register "${theirs}"`);
  };
  cmp("name", "Legal name", k.name);
  cmp("registrationNumber", "Registration number", k.registrationNumber);
  cmp("countryOfCreation", "Country", k.country);
  cmp("legalForm", "Legal form", k.legalForm);
  cmp("registeredOffice", "Registered office", k.registeredOffice);
  cmp("natureOfBusiness", "Nature of business", k.natureOfBusiness);
  cmp("lei", "LEI", k.lei);
  await tx.party.update({ where: { id: s.partyId }, data: { details: { ...d, ...fill, ...(mismatches.length ? { registerMismatches: mismatches } : {}) } as Prisma.InputJsonValue } });
  if (s.cddFileId) {
    if (mismatches.length) await upsertTask(tx, { firmId, kind: "kyb-mismatch", objectType: "CddFile", objectId: s.cddFileId, dueOn: toIsoDate(now), article: "Art. 22(7)" });
    if (kybInactive(k)) await upsertTask(tx, { firmId, kind: "kyb-inactive", objectType: "CddFile", objectId: s.cddFileId, dueOn: toIsoDate(now), article: "Art. 22" });
    if (k.people.some((p) => p.roles.includes("ubo") || (p.ownershipPct ?? 0) > 0)) await upsertTask(tx, { firmId, kind: "kyb-owners", objectType: "CddFile", objectId: s.cddFileId, dueOn: toIsoDate(now), article: "Art. 63" });
  }
  await tx.diditSession.update({ where: { id: s.id }, data: { importedAt: now } });
  if (s.cddFileId) await persistRiskIfChanged(tx, firmId, await loadClientFile(tx, firmId, s.cddFileId));
}

/**
 * Adds one person or company from the register to the ownership structure,
 * after a person confirmed it: direct shareholders as shareholdings, beneficial
 * owners without a direct stake as control ("beneficial owner per register").
 */
export async function addPersonFromRegister(ctx: { firmId: string; userId: string }, fileId: string, extractId: string, index: number): Promise<string> {
  return withTenant(ctx.firmId, async (tx) => {
    const x = await tx.registryExtract.findUniqueOrThrow({ where: { id: extractId } });
    const data = x.data as unknown as { people: (KybCompany["people"][number] & { addedPartyId: string | null })[] } & Record<string, unknown>;
    const p = data.people?.[index];
    if (!p) throw new Error("Not found.");
    if (p.addedPartyId) throw new Error(`${p.name} is already in the structure.`);
    const file = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId } });
    if (file.partyId !== x.partyId) throw new Error("This extract belongs to another client.");
    const direct = p.ownershipPct !== null && p.ownershipPct > 0;
    if (!direct && !p.roles.includes("ubo")) throw new Error("Only owners and beneficial owners can be added to the ownership structure.");
    if (!direct && p.entityType === "company") throw new Error("Add the company's own owners instead.");
    const kind = p.entityType === "company" ? "LEGAL" : "NATURAL";
    const details: Record<string, unknown> = kind === "NATURAL"
      ? { firstNames: p.firstName ?? p.name.split(" ").slice(0, -1).join(" ") ?? p.name, lastName: p.lastName ?? p.name.split(" ").slice(-1)[0], nationalities: p.nationality ? [normalizeCountry(p.nationality)].filter(Boolean) : [], ...(p.birthDate ? { birthDate: p.birthDate } : {}), source: "register" }
      : { name: p.name, ...(p.registrationNumber ? { registrationNumber: p.registrationNumber } : {}), source: "register" };
    const owner = await tx.party.create({ data: { firmId: ctx.firmId, kind, displayName: p.name, details: details as Prisma.InputJsonValue } });
    if (direct) {
      const existing = (await tx.ownershipLink.findMany({ where: { ownedId: x.partyId, type: "SHAREHOLDING" } })).reduce((a, l) => a + Number(l.pct ?? 0), 0);
      if (existing + p.ownershipPct! > 100.0001) throw new Error(`Shareholdings would add up to ${existing + p.ownershipPct!}%. Check the structure first.`);
    }
    await tx.ownershipLink.create({
      data: {
        firmId: ctx.firmId, ownerId: owner.id, ownedId: x.partyId, source: "REGISTER",
        ...(direct
          ? { type: "SHAREHOLDING", pct: p.ownershipPct }
          : { type: "CONTROL", controlDescription: `Beneficial owner per company register${p.effectivePct ? ` (indirect, about ${p.effectivePct}%)` : ""}` }),
      },
    });
    p.addedPartyId = owner.id;
    await tx.registryExtract.update({ where: { id: x.id }, data: { data: data as unknown as Prisma.InputJsonValue } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "OwnershipLink", objectId: owner.id, fields: ["source:register"] });
    await runScreening(tx, ctx.firmId, [owner.id]);
    await persistRiskIfChanged(tx, ctx.firmId, await loadClientFile(tx, ctx.firmId, fileId));
    return p.name;
  }, { timeoutMs: 60_000 });
}
