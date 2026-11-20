import "server-only";
import { TRUST_ROLE_LINK } from "@/lib/ai/ownership";
import type { Prisma } from "@prisma/client";
import { adminDb, withTenant, type Tx } from "./db";
import { audit } from "./audit";
import { hit } from "./rate-limit";
import { charge, didit, DiditError, diditEnabled, pricesOrError, refund } from "./didit";
import { loadClientFile, persistRiskIfChanged, runScreening, upsertTask } from "./cdd";
import { KYB_SEARCH_TIER, formatEur, kybBilledCents, kybInactive, mapKybCompany, type KybCompany, type KybLevel } from "@/lib/didit/map";
import { searchState, SEARCH_PACK } from "@/lib/didit/search-allowance";
import { notify } from "./email";
import { OPS_ALERT_EMAIL } from "@/lib/billing/plans";
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

/**
 * Each successful search costs AMLSync $0.50 at Didit. Searches are free for the
 * firm up to a run of free searches between orders (rules in didit/search-allowance),
 * run on the tier the firm intends to buy, and are kept in KybSearch.
 */
export async function kybSearchStatus(firmId: string) {
  return withTenant(firmId, async (tx) => {
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId }, select: { plan: true } });
    const since = new Date(Date.now() - 90 * 86_400_000);
    const searches = await tx.kybSearch.findMany({ where: { at: { gte: since } }, orderBy: { at: "desc" }, take: 200 });
    const orders = (await tx.diditSession.findMany({ where: { kind: "kyb", createdAt: { gte: since } }, select: { createdAt: true } })).map((o) => o.createdAt);
    const packs = (await tx.creditEntry.findMany({ where: { kind: "charge", clientRef: SEARCH_PACK_REF, createdAt: { gte: since } }, select: { createdAt: true } })).map((p) => p.createdAt);
    return { state: searchState(firm.plan, searches.map((x) => x.at), orders, packs), recent: searches.slice(0, 8) };
  });
}
export const SEARCH_PACK_REF = "Register searches";

export async function buySearchPack(ctx: { firmId: string; userId: string }) {
  await withTenant(ctx.firmId, (tx) => charge(tx, ctx.firmId, ctx.userId, `${SEARCH_PACK.searches} extra company register searches`, SEARCH_PACK_REF, SEARCH_PACK.cents));
}

export async function searchCompanyRegister(ctx: { firmId: string; userId: string }, q: { country: string; name?: string; registrationNumber?: string; level?: KybLevel }): Promise<Candidate[]> {
  const firmId = ctx.firmId;
  if (!diditEnabled()) throw new DiditError("Company register checks are not set up for this installation.");
  const st = (await kybSearchStatus(firmId)).state;
  if (st.blocked) throw new DiditError(searchLimitMessage(st.limit, st.blockedUntil!));
  // Hard safety net against automated abuse, on top of the free-search rule.
  if (!(await hit(`kyb-search:${firmId}`, { limit: 30, windowSec: 86_400 }))) throw new DiditError("For your security there is a limit of 30 register searches a day. Please reach out to contact@amlsync.com so we can adjust it within 1 business day.");
  const country = normalizeCountry(q.country);
  if (!country || !/^[A-Z]{2}$/.test(country)) throw new DiditError("Choose the country where the company is registered.");
  if (!q.name?.trim() && !q.registrationNumber?.trim()) throw new DiditError("Enter the company name or registration number.");
  type Resp = { kyb_registry?: { companies?: Record<string, unknown>[]; search_resolved?: boolean } };
  const r = await didit<Resp>("POST", "/v3/kyb/search/", {
    country_code: country,
    tier: KYB_SEARCH_TIER[q.level ?? "full"],
    ...(q.registrationNumber?.trim() ? { registration_number: q.registrationNumber.trim() } : {}),
    ...(q.name?.trim() ? { name: q.name.trim(), search_type: "contains" } : {}),
  });
  if (r.kyb_registry && r.kyb_registry.search_resolved === false) throw new DiditError("The register is answering slowly. Try the search again in a minute.");
  const out = (r.kyb_registry?.companies ?? []).slice(0, 25).map((c) => ({
    id: String(c.kyb_response_id), name: String(c.name ?? ""), registrationNumber: (c.registration_number as string) ?? null,
    status: (c.status as string) ?? null, type: (c.type as string) ?? null, address: (c.registered_address as string) ?? null,
  }));
  if (out.length) {
    // Only searches that return companies are charged by Didit, so only those count.
    await withTenant(firmId, (tx) => tx.kybSearch.create({ data: {
      firmId, userId: ctx.userId, country, level: q.level ?? "full", query: [q.name?.trim(), q.registrationNumber?.trim()].filter(Boolean).join(" · ").slice(0, 200),
      results: out.map((c) => ({ name: c.name, registrationNumber: c.registrationNumber, status: c.status })) as unknown as Prisma.InputJsonValue,
    } }));
    const after = (await kybSearchStatus(firmId)).state;
    if (after.blocked) {
      const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
      await notify(OPS_ALERT_EMAIL, `AMLSync App: ${firm.name} used its free register searches`, `${firm.name} made ${after.limit} company-register searches without ordering a check. Searching is paused until ${after.blockedUntil!.toISOString().slice(0, 10)} unless the firm buys ${SEARCH_PACK.searches} more searches (${formatEur(SEARCH_PACK.cents)}) or orders a check. Firm id ${firmId}.`);
    }
  }
  return out;
}

/** Country whose register is checked: the company's country of creation, else the firm's home state. */
export async function kybCountry(tx: Tx, party: { details: unknown }): Promise<string> {
  const c = String((party.details as { countryOfCreation?: string } | null)?.countryOfCreation ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(c)) return c;
  return (await tx.firm.findFirstOrThrow({ select: { homeState: true } })).homeState;
}

export function searchLimitMessage(limit: number, until: Date) {
  return `You've reached the limit of ${limit} free register searches without ordering a check. Searching is paused until ${until.toISOString().slice(0, 10)}. To continue now, buy ${SEARCH_PACK.searches} more searches for ${formatEur(SEARCH_PACK.cents)}, or order a company check: the count then starts again.`;
}

/** Retrieves the chosen company at the chosen level, charges the check, imports it when ready. */
export async function retrieveCompany(ctx: { firmId: string; userId: string }, fileId: string, kybResponseId: string, level: KybLevel = "full"): Promise<{ status: "imported" | "pending"; company?: KybCompany; refundedCents?: number; chargedCents: number }> {
  if (!diditEnabled()) throw new DiditError("Company register checks are not set up for this installation.");
  const prices = await pricesOrError();
  const pre = await withTenant(ctx.firmId, async (tx) => {
    const file = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId }, include: { party: true } });
    if (file.party.kind === "NATURAL") throw new DiditError("Register checks are for companies and other legal entities.");
    const country = await kybCountry(tx, file.party);
    const chargeId = level === "full"
      ? await charge(tx, ctx.firmId, ctx.userId, "Company register check: full ownership (details, officers, owners)", file.party.displayName, prices.kybFull(country))
      : await charge(tx, ctx.firmId, ctx.userId, "Company register check: company and status", file.party.displayName, prices.kybLite);
    return { partyId: file.partyId, chargeId, chargedCents: level === "full" ? prices.kybFull(country) : prices.kybLite };
  });
  type Resp = { request_id: string; registry_tier_delivered?: string; kyb_registry?: Record<string, unknown> };
  let r: Resp;
  try {
    r = await didit<Resp>("POST", level === "full" ? "/v3/kyb/ubo/" : "/v3/kyb/select/", { kyb_response_id: kybResponseId, vendor_data: pre.partyId }, { "Idempotency-Key": `${pre.partyId}:${kybResponseId}:${level}` });
  } catch (e) {
    await withTenant(ctx.firmId, (tx) => refund(tx, ctx.firmId, pre.chargeId, "register could not be read"));
    throw e;
  }
  const company = r.kyb_registry ? mapKybCompany(r.kyb_registry, r.registry_tier_delivered) : null;
  const ready = !!company && company.fetchStatus !== "pending";
  const out = await withTenant(ctx.firmId, async (tx) => {
    const row = await tx.diditSession.create({
      data: { firmId: ctx.firmId, partyId: pre.partyId, cddFileId: fileId, kind: "kyb", diditSessionId: r.request_id, status: ready ? "Approved" : "In Progress", sandbox: !!company?.sandbox, creditEntryId: pre.chargeId, createdVia: "staff", createdById: ctx.userId },
    });
    await tx.creditEntry.update({ where: { id: pre.chargeId }, data: { reference: r.request_id } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "DiditSession", objectId: row.id, fields: ["kyb"] });
    if (!ready || !company) return { status: "pending" as const };
    await importCompany(tx, ctx.firmId, { id: row.id, partyId: pre.partyId, cddFileId: fileId }, company, r.request_id, { level, kybResponseId });
    const refunded = await settleKybCharge(tx, ctx.firmId, pre.chargeId, company);
    return { status: "imported" as const, company, refundedCents: refunded };
  }, { timeoutMs: 60_000 });
  return { ...out, chargedCents: pre.chargedCents };
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
    if (s.creditEntryId) await settleKybCharge(tx, firmId, s.creditEntryId, company);
    await tx.diditSession.update({ where: { id: s.id }, data: { status: "Approved" } });
    return { status: "Approved", imported: true };
  }, { timeoutMs: 60_000 });
}

/**
 * Didit bills the tier it delivered, not the one requested (e.g. no ownership
 * data → Lite). Refund the firm the difference, once. Returns the cents refunded.
 */
async function settleKybCharge(tx: Tx, firmId: string, chargeId: string, k: KybCompany): Promise<number> {
  const c = await tx.creditEntry.findUnique({ where: { id: chargeId } });
  if (!c || (await tx.creditEntry.count({ where: { kind: "refund", reference: chargeId } }))) return 0;
  const charged = -c.amountCents;
  const prices = await pricesOrError();
  const country = (k.country ?? "").toUpperCase() || "LT";
  const billed = kybBilledCents(charged, k.tierDelivered, k.ownershipStatus, { lite: prices.kybLite, shareholders: prices.kybShareholders(country) });
  if (billed === null || billed >= charged) return 0;
  const diff = charged - billed;
  await tx.creditEntry.create({
    data: { firmId, amountCents: diff, kind: "refund", reference: chargeId, clientRef: c.clientRef,
      description: `Refund: the register had no ${billed <= prices.kybLite ? "ownership data" : "beneficial-owner data"} for this company, so you pay ${formatEur(billed)} instead of ${formatEur(charged)}` },
  });
  return diff;
}

async function importCompany(tx: Tx, firmId: string, s: { id: string; partyId: string; cddFileId: string | null }, k: KybCompany, requestId: string, meta: { level?: KybLevel; kybResponseId?: string } = {}) {
  const now = new Date();
  const party = await tx.party.findUniqueOrThrow({ where: { id: s.partyId } });
  const d = (party.details ?? {}) as Record<string, unknown>;
  const x = await tx.registryExtract.create({
    data: {
      firmId, partyId: s.partyId, register: `Company register${k.country ? ` (${k.country})` : ""} via Didit`, source: "REGISTER", retrievedAt: now,
      data: { extractDate: toIsoDate(now), provider: "Didit", requestId, level: meta.level ?? "full", kybResponseId: meta.kybResponseId ?? null, ...k, people: k.people.map((p) => ({ ...p, addedPartyId: null })) } as unknown as Prisma.InputJsonValue,
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
    const fromAi = (data as { provider?: string }).provider === "AI";
    const trustRole = (Object.keys(TRUST_ROLE_LINK) as (keyof typeof TRUST_ROLE_LINK)[]).find((r) => p.roles.includes(r));
    if (!direct && !trustRole && !p.roles.includes("ubo")) throw new Error("Only owners, beneficial owners and trust parties can be added to the ownership structure.");
    if (!direct && !trustRole && p.entityType === "company") throw new Error("Add the company's own owners instead.");
    const kind = p.entityType === "company" ? "LEGAL" : "NATURAL";
    const details: Record<string, unknown> = kind === "NATURAL"
      ? { firstNames: p.firstName ?? p.name.split(" ").slice(0, -1).join(" ") ?? p.name, lastName: p.lastName ?? p.name.split(" ").slice(-1)[0], nationalities: p.nationality ? [normalizeCountry(p.nationality)].filter(Boolean) : [], ...(p.birthDate ? { birthDate: p.birthDate } : {}), source: fromAi ? "document" : "register" }
      : { name: p.name, ...(p.registrationNumber ? { registrationNumber: p.registrationNumber } : {}), source: fromAi ? "document" : "register" };
    const owner = await tx.party.create({ data: { firmId: ctx.firmId, kind, displayName: p.name, details: details as Prisma.InputJsonValue } });
    if (direct) {
      const existing = (await tx.ownershipLink.findMany({ where: { ownedId: x.partyId, type: "SHAREHOLDING" } })).reduce((a, l) => a + Number(l.pct ?? 0), 0);
      if (existing + p.ownershipPct! > 100.0001) throw new Error(`Shareholdings would add up to ${existing + p.ownershipPct!}%. Check the structure first.`);
    }
    await tx.ownershipLink.create({
      data: {
        firmId: ctx.firmId, ownerId: owner.id, ownedId: x.partyId, source: fromAi ? "UPLOADED_EXTRACT" : "REGISTER",
        ...(direct
          ? { type: "SHAREHOLDING", pct: p.ownershipPct }
          : trustRole
            ? { type: TRUST_ROLE_LINK[trustRole], controlDescription: `${trustRole[0].toUpperCase()}${trustRole.slice(1)} per ${fromAi ? x.register.replace(/^Drafted by AI from /, "") : "register"}` }
            : { type: "CONTROL", controlDescription: `Beneficial owner per ${fromAi ? x.register.replace(/^Drafted by AI from /, "") : "company register"}${p.effectivePct ? ` (indirect, about ${p.effectivePct}%)` : ""}` }),
      },
    });
    p.addedPartyId = owner.id;
    await tx.registryExtract.update({ where: { id: x.id }, data: { data: data as unknown as Prisma.InputJsonValue } });
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "OwnershipLink", objectId: owner.id, fields: [fromAi ? "source:ai-draft" : "source:register"] });
    await runScreening(tx, ctx.firmId, [owner.id]);
    await persistRiskIfChanged(tx, ctx.firmId, await loadClientFile(tx, ctx.firmId, fileId));
    return p.name;
  }, { timeoutMs: 60_000 });
}
