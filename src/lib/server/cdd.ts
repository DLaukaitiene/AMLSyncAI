import "server-only";
import type { CddFile, OwnershipLink, Party, Prisma } from "@prisma/client";
import type { Tx } from "./db";
import { audit } from "./audit";
import { currentProfile } from "./country-profile";
import { encryptField } from "./crypto";
import { calculateBeneficialOwnership, validateSmoFallback, type BoResult } from "@/lib/rules/beneficial-ownership";
import { assessSanctionsOwnership, type SanctionsOwnershipResult } from "@/lib/rules/sanctions-ownership";
import { scoreClientRisk, EDD_CHECKLIST, type RiskResult, type DeliveryChannel } from "@/lib/rules/risk-scoring";
import { openCddItems, decideGate, type CddFileState, type GateDecision, type Override } from "@/lib/rules/gates";
import { refreshDue, sddVerificationDue, formerPepUntil } from "@/lib/rules/deadlines";
import { EU_HIGH_RISK_THIRD_COUNTRIES, COUNTERMEASURE_COUNTRIES } from "@/lib/rules/high-risk-countries";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { toIsoDate } from "@/lib/rules/dates";
import { screenSubject } from "@/lib/screening/match";
import { partyCountries, SECTOR_PRODUCT_RISK } from "@/lib/cdd/party";
import { startRetentionClock } from "./retention";
import type { CountryProfile } from "@/lib/rules/country-profile";

type Details = Record<string, unknown>;
const det = (p: Party) => (p.details ?? {}) as Details;
const kindOf = (k: Party["kind"]) => (k === "NATURAL" ? "natural" : k === "LEGAL" ? "legal" : "arrangement") as "natural" | "legal" | "arrangement";

// ---------------------------------------------------------------------------
// Tasks (Compliance Calendar)
// ---------------------------------------------------------------------------

export async function upsertTask(
  tx: Tx,
  t: { firmId: string; kind: string; objectType: string; objectId: string; dueOn: string; article?: string },
) {
  const existing = await tx.task.findFirst({ where: { kind: t.kind, objectId: t.objectId, status: "OPEN" } });
  if (existing) {
    await tx.task.update({ where: { id: existing.id }, data: { dueOn: new Date(t.dueOn) } });
    return existing.id;
  }
  const row = await tx.task.create({
    data: { firmId: t.firmId, kind: t.kind, objectType: t.objectType, objectId: t.objectId, dueOn: new Date(t.dueOn), article: t.article },
  });
  return row.id;
}

export async function closeTasks(tx: Tx, objectId: string, kind?: string) {
  await tx.task.updateMany({ where: { objectId, status: "OPEN", ...(kind ? { kind } : {}) }, data: { status: "DONE" } });
}

// ---------------------------------------------------------------------------
// Ownership tree
// ---------------------------------------------------------------------------

export interface Tree {
  parties: Map<string, Party>;
  links: OwnershipLink[];
  /** Max number of corporate layers between the client and a natural person. */
  layers: number;
}

/** Everyone upstream of the party: shareholders, controllers, their owners… */
export async function loadTree(tx: Tx, rootId: string): Promise<Tree> {
  const parties = new Map<string, Party>();
  const links: OwnershipLink[] = [];
  const root = await tx.party.findUniqueOrThrow({ where: { id: rootId } });
  parties.set(root.id, root);
  let frontier = [rootId];
  const depth = new Map<string, number>([[rootId, 0]]);
  let layers = 0;
  while (frontier.length) {
    const ls = await tx.ownershipLink.findMany({ where: { ownedId: { in: frontier } }, include: { owner: true } });
    const next: string[] = [];
    for (const l of ls) {
      const { owner, ...link } = l;
      links.push(link);
      const d = (depth.get(l.ownedId) ?? 0) + 1;
      if (!parties.has(owner.id)) {
        parties.set(owner.id, owner);
        depth.set(owner.id, d);
        next.push(owner.id);
        if (owner.kind === "NATURAL") layers = Math.max(layers, d - 1);
      }
    }
    frontier = next;
  }
  return { parties, links, layers };
}

export function beneficialOwnership(rootId: string, tree: Tree): BoResult {
  const parties = [...tree.parties.values()].map((p) => ({ id: p.id, kind: kindOf(p.kind), name: p.displayName }));
  const shares = tree.links.filter((l) => l.type === "SHAREHOLDING" && l.pct !== null).map((l) => ({ ownerId: l.ownerId, ownedId: l.ownedId, pct: Number(l.pct) }));
  const control = tree.links
    .filter((l) => l.type === "CONTROL" && tree.parties.get(l.ownerId)?.kind === "NATURAL")
    .map((l) => ({ personId: l.ownerId, entityId: l.ownedId, type: "other" as const, description: l.controlDescription ?? "Control by other means" }));
  return calculateBeneficialOwnership(rootId, parties, shares, control);
}

// ---------------------------------------------------------------------------
// Screening (spec §4.4): every party in the tree, every active list
// ---------------------------------------------------------------------------

export async function runScreening(tx: Tx, firmId: string, partyIds: string[]) {
  const lists = await tx.screeningList.findMany({ where: { active: true }, include: { entries: true } });
  const now = new Date();
  let newHits = 0;
  for (const pid of partyIds) {
    const p = await tx.party.findUniqueOrThrow({ where: { id: pid } });
    const d = det(p);
    const subject = {
      name: p.displayName,
      entity: p.kind !== "NATURAL",
      birthDate: (d.birthDate as string | undefined) ?? undefined,
      countries: partyCountries(p.kind, d),
    };
    for (const list of lists) {
      const matches = screenSubject(
        subject,
        list.entries.map((e) => ({ id: e.id, entityType: e.entityType as "person" | "entity", names: e.names, birthDates: e.birthDates, countries: e.countries })),
      );
      if (matches.length === 0) {
        await tx.screeningResult.create({
          data: { firmId, partyId: pid, listKind: list.kind, listName: list.name, listVersion: list.version, matchData: { clear: true }, decision: "NO_MATCH", screenedAt: now },
        });
        continue;
      }
      for (const m of matches) {
        // Don't re-raise a hit that was already decided for the same list entry.
        const prior = await tx.screeningResult.findFirst({
          where: { partyId: pid, listName: list.name, matchData: { path: ["entryId"], equals: m.entryId }, decision: { not: "NO_MATCH" } },
        });
        if (prior) continue;
        const entry = list.entries.find((e) => e.id === m.entryId)!;
        await tx.screeningResult.create({
          data: {
            firmId, partyId: pid, listKind: list.kind, listName: list.name, listVersion: list.version, screenedAt: now, decision: "PENDING",
            matchData: { entryId: m.entryId, matchedName: m.matchedName, score: m.score, reasons: m.reasons, dobMismatch: m.dobMismatch, reference: entry.reference, listNames: entry.names, listBirthDates: entry.birthDates, listCountries: entry.countries } as Prisma.InputJsonValue,
          },
        });
        newHits++;
      }
    }
  }
  return { listsChecked: lists.length, newHits };
}

// ---------------------------------------------------------------------------
// Client file: everything needed for the screen, risk and gates
// ---------------------------------------------------------------------------

export interface ClientFile {
  file: CddFile;
  party: Party;
  tree: Tree;
  bo: BoResult | null;
  sanctions: SanctionsOwnershipResult;
  risk: RiskResult;
  profile: CountryProfile;
  profileVersion: number;
  isPep: boolean;
  state: CddFileState;
  screening: Awaited<ReturnType<Tx["screeningResult"]["findMany"]>>;
  verifications: Awaited<ReturnType<Tx["identityVerification"]["findMany"]>>;
  extracts: Awaited<ReturnType<Tx["registryExtract"]["findMany"]>>;
  approvals: { edd: boolean; pep: boolean };
  smoFallbackOk: boolean;
}

export async function loadClientFile(tx: Tx, firmId: string, cddFileId: string, opts: { sdd?: boolean } = {}): Promise<ClientFile> {
  const file = await tx.cddFile.findUniqueOrThrow({ where: { id: cddFileId }, include: { party: true } });
  const { party, ...f } = file;
  const d = det(party);
  const { profile, version: profileVersion } = await currentProfile(tx, firmId);
  const tree = await loadTree(tx, party.id);
  const bo = party.kind === "NATURAL" ? null : beneficialOwnership(party.id, tree);

  const treeIds = [...tree.parties.keys()];
  const screening = await tx.screeningResult.findMany({ where: { partyId: { in: treeIds } }, orderBy: { screenedAt: "desc" } });
  const sanctionedIds = new Set(screening.filter((s) => s.listKind === "SANCTIONS" && s.decision === "TRUE_MATCH").map((s) => s.partyId));
  const sanctions = assessSanctionsOwnership(
    party.id,
    [...tree.parties.values()].map((p) => ({ id: p.id, kind: kindOf(p.kind), name: p.displayName })),
    tree.links.filter((l) => l.type === "SHAREHOLDING" && l.pct !== null).map((l) => ({ ownerId: l.ownerId, ownedId: l.ownedId, pct: Number(l.pct) })),
    sanctionedIds,
    tree.links.filter((l) => l.type === "CONTROL").map((l) => ({ personId: l.ownerId, entityId: l.ownedId, type: "other" as const, description: l.controlDescription ?? "" })),
  );
  const pepHit = screening.some((s) => s.listKind === "PEP" && s.decision === "TRUE_MATCH" && s.partyId === party.id);

  const verifications = await tx.identityVerification.findMany({ where: { partyId: party.id }, orderBy: { verifiedAt: "desc" } });
  const extracts = await tx.registryExtract.findMany({ where: { partyId: party.id }, orderBy: { retrievedAt: "desc" } });

  // Risk inputs come from data already collected (spec §4A.4) — no separate questionnaire.
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId } });
  const countries = new Set(partyCountries(party.kind, d));
  for (const b of bo?.beneficialOwners ?? []) for (const c of partyCountries("NATURAL", det(tree.parties.get(b.personId)!))) countries.add(c);
  const today = toIsoDate(new Date());
  const formerPep = !!d.pepLeftOfficeOn && formerPepUntil(String(d.pepLeftOfficeOn)).due >= today;
  const isPep = (!!d.isPep && !d.pepLeftOfficeOn) || pepHit;
  const lastVerification = verifications[0];
  const channel: DeliveryChannel = !lastVerification
    ? "remote-document"
    : lastVerification.method === "IN_PERSON" ? "face-to-face" : lastVerification.method === "EID" ? "remote-eid" : "remote-document";
  const matterIds = (await tx.matterParty.findMany({ where: { partyId: party.id }, select: { matterId: true } })).map((m) => m.matterId);
  const usesCash = (await tx.transaction.count({ where: { matterId: { in: matterIds }, method: "cash" } })) > 0;

  const risk = scoreClientRisk(
    {
      clientType: kindOf(party.kind),
      countries: [...countries],
      highRiskThirdCountries: EU_HIGH_RISK_THIRD_COUNTRIES,
      countermeasureCountries: COUNTERMEASURE_COUNTRIES,
      isPep,
      isFormerPepWithin12Months: formerPep,
      isPepFamilyOrAssociate: !!d.isPepFamilyOrAssociate,
      deliveryChannel: channel,
      usesCash,
      ownershipLayers: tree.layers,
      nomineeArrangements: !!d.nomineeArrangements,
      productRisk: SECTOR_PRODUCT_RISK[firm.sectors[0] ?? "OTHER"] ?? "medium",
      additionalEddCaseIds: ((d.additionalEddCaseIds as string[]) ?? []).filter((id) => profile.additionalEddCases.some((c) => c.id === id)),
    },
    profile,
    profileVersion,
  );

  const approvalsFor = async (kind: string) =>
    (await tx.approval.count({ where: { objectType: kind, objectId: f.id, decision: "APPROVED", role: "OWNER" } })) > 0;
  const approvals = { edd: await approvalsFor("CddFile:edd"), pep: await approvalsFor("CddFile:pep") };
  const smo = f.smoFallback as { officials: { personId: string; name: string; position: string }[]; stepsTaken: string } | null;
  const smoFallbackOk = !!smo && validateSmoFallback({ seniorManagingOfficials: smo.officials, stepsTaken: smo.stepsTaken }).length === 0;
  const checklist = new Set((f.eddChecklist as string[] | null) ?? []);

  const state: CddFileState = {
    partyId: party.id,
    role: f.role.toLowerCase() as CddFileState["role"],
    identityVerified: party.kind === "NATURAL" ? verifications.length > 0 : extracts.length > 0,
    hasBearerShares: party.bearerShares || !!d.bearerShares,
    boResolved: bo ? (bo.beneficialOwners.length > 0 && bo.unresolvedOwners.length === 0) || smoFallbackOk : undefined,
    purposeRecorded: !!f.purpose?.trim(),
    riskAssessed: true,
    eddRequired: risk.eddRequired,
    eddChecklistComplete: EDD_CHECKLIST.every((i) => checklist.has(i.id)),
    seniorApprovalRecorded: approvals.edd,
    isPep: isPep || formerPep || !!d.isPepFamilyOrAssociate,
    pepApprovalRecorded: approvals.pep,
    openScreeningMatches: screening.filter((s) => s.decision === "PENDING").length,
    trueSanctionsMatch: sanctions.affected,
    sddDelayedVerification: !!opts.sdd && risk.sddEligible,
  };

  return { file: f as CddFile, party, tree, bo, sanctions, risk, profile, profileVersion, isPep, state, screening, verifications, extracts, approvals, smoFallbackOk };
}

/** Stores a new client risk assessment when the result changed (spec §4.3: rule-set version stored). */
export async function persistRiskIfChanged(tx: Tx, firmId: string, cf: ClientFile) {
  const last = await tx.clientRiskAssessment.findFirst({ where: { cddFileId: cf.file.id }, orderBy: { createdAt: "desc" } });
  const level = cf.risk.level.toUpperCase() as "LOW" | "MEDIUM" | "HIGH";
  const factorIds = cf.risk.factors.map((f) => f.id).sort().join(",");
  if (last && last.calculated === level && last.score === cf.risk.score && (last.factors as { id: string }[]).map((f) => f.id).sort().join(",") === factorIds) {
    return last;
  }
  // A Compliance Officer's override stays unless the calculation now forces a higher level.
  const keepOverride = last?.overrideReason && !(level === "HIGH" && last.final !== "HIGH");
  return tx.clientRiskAssessment.create({
    data: {
      firmId, cddFileId: cf.file.id, calculated: level, final: keepOverride ? last!.final : level, score: cf.risk.score,
      factors: cf.risk.factors as unknown as Prisma.InputJsonValue, overrideReason: keepOverride ? last!.overrideReason : null,
      overrideById: keepOverride ? last!.overrideById : null, rulesetVersion: cf.risk.rulesetVersion, euCoreVersion: EU_CORE_VERSION,
      countryProfileVersion: cf.profileVersion,
    },
  });
}

// ---------------------------------------------------------------------------
// Decisions (never automated, §4A.9): accept / refuse / terminate
// ---------------------------------------------------------------------------

export async function acceptClient(
  tx: Tx,
  ctx: { firmId: string; userId: string; roles: string[] },
  cddFileId: string,
  opts: { sdd: boolean; override?: Override },
): Promise<GateDecision> {
  const cf = await loadClientFile(tx, ctx.firmId, cddFileId, { sdd: opts.sdd });
  if (opts.sdd && !cf.risk.sddEligible) return { allowed: false, openItems: [], overridden: false, error: "Simplified due diligence is only allowed for Low risk." };
  const decision = decideGate(openCddItems(cf.state), opts.override);
  if (!decision.allowed) return decision;

  const today = toIsoDate(new Date());
  const edd = cf.risk.eddRequired;
  const status = edd ? "EDD" : opts.sdd ? "SDD" : "COMPLETE";
  const next = refreshDue(today, edd).due;
  await tx.cddFile.update({
    where: { id: cddFileId },
    data: {
      status, nextRefreshOn: new Date(next), decidedAt: new Date(), decidedById: ctx.userId,
      sddVerifyBy: opts.sdd ? new Date(sddVerificationDue(today).due) : null,
      gateOverride: decision.overridden ? ({ byUserId: ctx.userId, reason: opts.override!.reason, at: new Date().toISOString(), items: decision.openItems.map((i) => i.id) } as Prisma.InputJsonValue) : undefined,
      decisionReason: decision.overridden ? opts.override!.reason : null,
    },
  });
  await tx.approval.create({
    data: {
      firmId: ctx.firmId, objectType: "CddFile:accept", objectId: cddFileId, decision: "APPROVED", reason: decision.overridden ? opts.override!.reason : null,
      userId: ctx.userId, role: ctx.roles.includes("COMPLIANCE_OFFICER") ? "COMPLIANCE_OFFICER" : ctx.roles.includes("OWNER") ? "OWNER" : "STAFF",
      euCoreVersion: EU_CORE_VERSION, countryProfileVersion: cf.profileVersion,
    },
  });
  await upsertTask(tx, { firmId: ctx.firmId, kind: "refresh", objectType: "CddFile", objectId: cddFileId, dueOn: next, article: "Art. 26(2)" });
  if (opts.sdd) await upsertTask(tx, { firmId: ctx.firmId, kind: "sdd-verification", objectType: "CddFile", objectId: cddFileId, dueOn: sddVerificationDue(today).due, article: "Art. 33" });
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "approve", objectType: "CddFile", objectId: cddFileId, fields: ["status", ...(decision.overridden ? ["gateOverride"] : [])] });
  return decision;
}

export async function endRelationship(
  tx: Tx,
  ctx: { firmId: string; userId: string; roles: string[] },
  cddFileId: string,
  kind: "REFUSED" | "TERMINATED",
  reason: string,
  raiseSuspicion: boolean,
) {
  const today = toIsoDate(new Date());
  const file = await tx.cddFile.findUniqueOrThrow({ where: { id: cddFileId } });
  const { version } = await currentProfile(tx, ctx.firmId);
  await tx.cddFile.update({ where: { id: cddFileId }, data: { status: kind, decidedAt: new Date(), decidedById: ctx.userId, decisionReason: reason } });
  await startRetentionClock(tx, ctx.firmId, cddFileId, today);
  await closeTasks(tx, cddFileId);
  await tx.approval.create({
    data: {
      firmId: ctx.firmId, objectType: kind === "REFUSED" ? "CddFile:refuse" : "CddFile:terminate", objectId: cddFileId, decision: "APPROVED", reason,
      userId: ctx.userId, role: ctx.roles.includes("COMPLIANCE_OFFICER") ? "COMPLIANCE_OFFICER" : ctx.roles.includes("OWNER") ? "OWNER" : "STAFF",
      euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version,
    },
  });
  let caseId: string | null = null;
  if (raiseSuspicion) {
    const c = await tx.case.create({
      data: {
        firmId: ctx.firmId, type: "INTERNAL_SUSPICION", partyIds: [file.partyId], matterIds: [], createdById: ctx.userId,
        contentEnc: encryptField(ctx.firmId, JSON.stringify({ source: kind === "REFUSED" ? "refused-cdd" : "terminated", reason, raisedAt: new Date().toISOString() })),
      },
    });
    caseId = c.id;
    await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "Case", objectId: c.id });
  }
  await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "CddFile", objectId: cddFileId, fields: ["status", "decisionReason", "retentionUntil"] });
  return { caseId };
}
