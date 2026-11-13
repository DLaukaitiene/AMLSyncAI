"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { encryptField } from "@/lib/server/crypto";
import { formToObject, zodErrors } from "@/lib/server/form";
import { acceptClient, endRelationship, loadClientFile, persistRiskIfChanged, runScreening } from "@/lib/server/cdd";
import { currentProfile } from "@/lib/server/country-profile";
import { displayName, legalEntitySchema, naturalPersonSchema } from "@/lib/cdd/party";
import { EDD_CHECKLIST } from "@/lib/rules/risk-scoring";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { validateSmoFallback } from "@/lib/rules/beneficial-ownership";
import type { Prisma } from "@prisma/client";
import { createPortalLink, renewIfClean, revokePortalLink } from "@/lib/server/portal";
import { ensureSanctionsNotice, openDiscrepancy } from "@/lib/server/cases";
import { DOCUMENT_KINDS, storeDocument } from "@/lib/server/storage";

const STEP_UP = (path: string): ActionState => ({ error: "For security, confirm it's you first.", data: { stepUp: path } });

function readParty(fd: FormData, prefix = "") {
  const o = formToObject(fd);
  const get = (k: string) => o[prefix + k] ?? "";
  const kind = get("kind") === "LEGAL" ? "LEGAL" : "NATURAL";
  if (kind === "NATURAL") {
    return {
      kind,
      parsed: naturalPersonSchema.safeParse({
        firstNames: get("firstNames"), lastName: get("lastName"), birthDate: get("birthDate"), placeOfBirth: get("placeOfBirth"),
        nationalities: get("nationalities").split(/[,\s]+/).filter(Boolean), residenceCountry: get("residenceCountry"), address: get("address"),
        occupation: get("occupation"), email: get("email"), phone: get("phone"), isPep: o[prefix + "isPep"] === "on",
        pepFunction: get("pepFunction"), pepLeftOfficeOn: get("pepLeftOfficeOn"), isPepFamilyOrAssociate: o[prefix + "isPepFamilyOrAssociate"] === "on",
      }),
    } as const;
  }
  return {
    kind,
    parsed: legalEntitySchema.safeParse({
      name: get("name"), legalForm: get("legalForm"), registrationNumber: get("registrationNumber"), lei: get("lei"),
      registeredOffice: get("registeredOffice"), principalPlaceOfBusiness: get("principalPlaceOfBusiness"), countryOfCreation: get("countryOfCreation"),
      natureOfBusiness: get("natureOfBusiness"), bearerShares: o[prefix + "bearerShares"] === "on", nomineeArrangements: o[prefix + "nomineeArrangements"] === "on",
    }),
  } as const;
}

async function refresh(tx: Parameters<Parameters<typeof withTenant>[1]>[0], firmId: string, fileId: string) {
  const cf = await loadClientFile(tx, firmId, fileId);
  await persistRiskIfChanged(tx, firmId, cf);
}

// ---------------------------------------------------------------------------

export async function createClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const { kind, parsed } = readParty(fd);
  if (!parsed.success) return zodErrors(parsed.error);
  const purpose = String(fd.get("purpose") ?? "").trim();
  const nationalId = String(fd.get("nationalId") ?? "").trim();
  const taxId = String(fd.get("taxId") ?? "").trim();

  const fileId = await withTenant(s.firm.id, async (tx) => {
    const party = await tx.party.create({
      data: {
        firmId: s.firm.id, kind, displayName: displayName(kind, parsed.data), details: parsed.data as Prisma.InputJsonValue,
        bearerShares: kind === "LEGAL" && "bearerShares" in parsed.data ? parsed.data.bearerShares : false,
        nationalIdEnc: nationalId ? encryptField(s.firm.id, nationalId) : null,
        taxIdEnc: taxId ? encryptField(s.firm.id, taxId) : null,
      },
    });
    const file = await tx.cddFile.create({ data: { firmId: s.firm.id, partyId: party.id, role: "CLIENT", purpose: purpose || null } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Party", objectId: party.id, fields: Object.keys(parsed.data) });
    await runScreening(tx, s.firm.id, [party.id]);
    await refresh(tx, s.firm.id, file.id);
    return file.id;
  });
  redirect(`/app/clients/${fileId}`);
}

export async function updatePurposeAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const purpose = String(fd.get("purpose") ?? "").trim();
  if (purpose.length < 5) return { fieldErrors: { purpose: ["Describe the purpose and intended nature (AMLR Art. 25)."] }, error: "Describe the purpose." };
  await withTenant(s.firm.id, async (tx) => {
    await tx.cddFile.update({ where: { id: fileId }, data: { purpose } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "CddFile", objectId: fileId, fields: ["purpose"] });
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Saved." };
}

export async function recordVerificationAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const method = String(fd.get("method"));
  if (!["EID", "IN_PERSON", "DOCUMENT_NFC_LIVENESS"].includes(method)) return { error: "Choose how identity was verified." };
  const documentType = String(fd.get("documentType") ?? "").trim();
  const documentNumber = String(fd.get("documentNumber") ?? "").trim();
  const fallbackReason = String(fd.get("fallbackReason") ?? "").trim();
  if (method !== "EID" && fallbackReason.length < 5) {
    return { error: "Explain why national eID wasn't used.", fieldErrors: { fallbackReason: ["Required when eID isn't used (AMLA CDD RTS order of preference)."] } };
  }
  if (method !== "EID" && (!documentType || !documentNumber)) return { error: "Enter the ID document type and number.", fieldErrors: { documentNumber: ["Required."] } };
  await withTenant(s.firm.id, async (tx) => {
    const file = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId } });
    const v = await tx.identityVerification.create({
      data: {
        firmId: s.firm.id, partyId: file.partyId, method: method as "EID" | "IN_PERSON" | "DOCUMENT_NFC_LIVENESS",
        assuranceLevel: String(fd.get("assuranceLevel") ?? "") || null, provider: String(fd.get("provider") ?? "") || null,
        providerRef: documentType ? `${documentType}` : null, fallbackReason: method === "EID" ? null : fallbackReason, verifiedAt: new Date(),
      },
    });
    if (documentNumber) {
      await tx.party.update({ where: { id: file.partyId }, data: { nationalIdEnc: encryptField(s.firm.id, documentNumber) } });
    }
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "IdentityVerification", objectId: v.id, fields: ["method"] });
    await refresh(tx, s.firm.id, fileId);
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Identity verification recorded." };
}

export async function recordExtractAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const register = String(fd.get("register") ?? "").trim();
  const extractDate = String(fd.get("extractDate") ?? "").trim();
  const notes = String(fd.get("notes") ?? "").trim();
  if (!register) return { error: "Enter which register the extract is from.", fieldErrors: { register: ["Required."] } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(extractDate)) return { error: "Enter the extract date.", fieldErrors: { extractDate: ["Use YYYY-MM-DD."] } };
  await withTenant(s.firm.id, async (tx) => {
    const file = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId } });
    const x = await tx.registryExtract.create({
      data: { firmId: s.firm.id, partyId: file.partyId, register, source: "UPLOADED_EXTRACT", data: { extractDate, notes }, retrievedAt: new Date() },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "RegistryExtract", objectId: x.id, fields: ["register"] });
    await refresh(tx, s.firm.id, fileId);
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Register extract recorded. Compare it with the client's declaration; a mismatch opens a discrepancy." };
}

/** Adds a shareholder or controller to any entity in the tree (spec §4.2 BO tree). */
export async function addOwnerAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const ownedId = String(fd.get("ownedId"));
  const linkType = fd.get("linkType") === "CONTROL" ? "CONTROL" : "SHAREHOLDING";
  const pctRaw = String(fd.get("pct") ?? "").trim();
  const pct = pctRaw === "" ? null : Number(pctRaw);
  if (linkType === "SHAREHOLDING" && (pct === null || !(pct > 0 && pct <= 100))) {
    return { error: "Enter the percentage held (more than 0, at most 100).", fieldErrors: { pct: ["0–100"] } };
  }
  const controlDescription = String(fd.get("controlDescription") ?? "").trim();
  if (linkType === "CONTROL" && controlDescription.length < 5) {
    return { error: "Describe how control is exercised.", fieldErrors: { controlDescription: ["e.g. appoints the majority of the board"] } };
  }
  const { kind, parsed } = readParty(fd, "owner.");
  if (!parsed.success) return zodErrors(parsed.error);
  if (linkType === "CONTROL" && kind !== "NATURAL") return { error: "Control by other means is held by a natural person." };

  try {
   await withTenant(s.firm.id, async (tx) => {
    const tree = await loadClientFile(tx, s.firm.id, fileId).then((cf) => cf.tree);
    if (!tree.parties.has(ownedId)) throw new Error("Not in this client's structure");
    const existing = tree.links.filter((l) => l.ownedId === ownedId && l.type === "SHAREHOLDING").reduce((a, l) => a + Number(l.pct ?? 0), 0);
    if (pct !== null && existing + pct > 100.0001) throw new Error(`Shareholdings would add up to ${existing + pct}%.`);
    const owner = await tx.party.create({
      data: { firmId: s.firm.id, kind, displayName: displayName(kind, parsed.data), details: parsed.data as Prisma.InputJsonValue, bearerShares: kind === "LEGAL" && "bearerShares" in parsed.data ? parsed.data.bearerShares : false },
    });
    const link = await tx.ownershipLink.create({
      data: { firmId: s.firm.id, ownerId: owner.id, ownedId, type: linkType, pct, controlDescription: controlDescription || null, source: "DECLARATION" },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "OwnershipLink", objectId: link.id, fields: ["type", "pct"] });
    await runScreening(tx, s.firm.id, [owner.id]);
    await refresh(tx, s.firm.id, fileId);
   });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Added. Beneficial owners and screening were updated." };
}

export async function removeLinkAction(fileId: string, linkId: string): Promise<ActionState> {
  const s = await requireUser("client.edit");
  await withTenant(s.firm.id, async (tx) => {
    await tx.ownershipLink.delete({ where: { id: linkId } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "delete", objectType: "OwnershipLink", objectId: linkId });
    await refresh(tx, s.firm.id, fileId);
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Removed." };
}

export async function saveSmoAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const officials = String(fd.get("officials") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => {
      const [name, ...pos] = l.split(",");
      return { personId: `smo-${i}`, name: name.trim(), position: pos.join(",").trim() || "Senior managing official" };
    });
  const stepsTaken = String(fd.get("stepsTaken") ?? "").trim();
  const errors = validateSmoFallback({ seniorManagingOfficials: officials, stepsTaken });
  if (errors.length) return { error: errors.join(" ") };
  await withTenant(s.firm.id, async (tx) => {
    await tx.cddFile.update({ where: { id: fileId }, data: { smoFallback: { officials, stepsTaken } } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "CddFile", objectId: fileId, fields: ["smoFallback"] });
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Recorded: no beneficial owner — senior managing officials identified." };
}

export async function rescreenAction(fileId: string): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const r = await withTenant(s.firm.id, async (tx) => {
    const cf = await loadClientFile(tx, s.firm.id, fileId);
    const res = await runScreening(tx, s.firm.id, [...cf.tree.parties.keys()]);
    await refresh(tx, s.firm.id, fileId);
    return res;
  });
  revalidatePath(`/app/clients/${fileId}`);
  if (r.capped) return { error: `Today's screening limit for your plan was reached; ${r.capped} party(ies) were not screened. Try again tomorrow or contact AMLSyncAI.` };
  return { message: `Screened against ${r.listsChecked} list(s). ${r.newHits} new possible match(es).` };
}

export async function decideMatchAction(fileId: string, resultId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const decision = fd.get("decision") === "TRUE_MATCH" ? "TRUE_MATCH" : "FALSE_POSITIVE";
  const comment = String(fd.get("comment") ?? "").trim();
  if (comment.length < 10) return { error: "Explain your decision (this is what supervisors look for).", fieldErrors: { comment: ["At least 10 characters."] } };
  await withTenant(s.firm.id, async (tx) => {
    const r = await tx.screeningResult.findUniqueOrThrow({ where: { id: resultId } });
    if (r.decision !== "PENDING") throw new Error("Already decided");
    await tx.screeningResult.update({ where: { id: resultId }, data: { decision, comment, reviewerId: s.user.id, decidedAt: new Date() } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "ScreeningResult", objectId: resultId, fields: ["decision", "comment"] });
    if (decision === "TRUE_MATCH" && r.listKind === "SANCTIONS") {
      // Sanctions hit workflow (§4.4): stop, freeze, notify the sanctions authority. Separate from STR.
      const c = await tx.case.create({
        data: {
          firmId: s.firm.id, type: "SANCTIONS_HIT", partyIds: [r.partyId], matterIds: [], createdById: s.user.id,
          contentEnc: encryptField(s.firm.id, JSON.stringify({ screeningResultId: r.id, list: r.listName, listVersion: r.listVersion, comment })),
        },
      });
      await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Case", objectId: c.id });
      await ensureSanctionsNotice(tx, s.firm.id, c.id);
      const matters = await tx.matterParty.findMany({ where: { partyId: r.partyId }, select: { matterId: true } });
      await tx.matter.updateMany({ where: { id: { in: matters.map((m) => m.matterId) }, status: "OPEN" }, data: { status: "ON_HOLD" } });
    }
    await refresh(tx, s.firm.id, fileId);
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: decision === "TRUE_MATCH" ? "Recorded as a true match." : "Recorded as a false positive." };
}

export async function eddChecklistAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const done = EDD_CHECKLIST.map((i) => i.id).filter((id) => fd.get(`edd.${id}`) === "on");
  await withTenant(s.firm.id, async (tx) => {
    await tx.cddFile.update({ where: { id: fileId }, data: { eddChecklist: done } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "CddFile", objectId: fileId, fields: ["eddChecklist"] });
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: `EDD checklist saved (${done.length}/${EDD_CHECKLIST.length}).` };
}

/** Senior management approval (Owner = member of the management body) for EDD or a PEP relationship. */
export async function seniorApprovalAction(fileId: string, kind: "edd" | "pep", _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.management");
  if (!hasRecentMfa(s)) return STEP_UP(`/app/clients/${fileId}`);
  const reason = String(fd.get("reason") ?? "").trim();
  if (reason.length < 10) return { error: "Record the reasons for approving.", fieldErrors: { reason: ["At least 10 characters."] } };
  await withTenant(s.firm.id, async (tx) => {
    const { version } = await currentProfile(tx, s.firm.id);
    await tx.approval.create({
      data: { firmId: s.firm.id, objectType: `CddFile:${kind}`, objectId: fileId, decision: "APPROVED", reason, userId: s.user.id, role: "OWNER", euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "approve", objectType: "CddFile", objectId: fileId, fields: [kind] });
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: kind === "pep" ? "PEP relationship approved." : "EDD approved by senior management." };
}

export async function riskOverrideAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("risk.override");
  const level = String(fd.get("level"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!["LOW", "MEDIUM", "HIGH"].includes(level)) return { error: "Choose a level." };
  if (reason.length < 10) return { error: "Give a written reason for the override.", fieldErrors: { reason: ["At least 10 characters."] } };
  return withTenant(s.firm.id, async (tx) => {
    const cf = await loadClientFile(tx, s.firm.id, fileId);
    if (cf.risk.factors.some((f) => f.forcesHigh) && level !== "HIGH") return { error: "This client has a factor that legally requires EDD; the level can't be lowered below High." };
    const last = await persistRiskIfChanged(tx, s.firm.id, cf);
    await tx.clientRiskAssessment.create({
      data: {
        firmId: s.firm.id, cddFileId: fileId, calculated: last.calculated, final: level as "LOW" | "MEDIUM" | "HIGH", score: last.score, factors: last.factors as Prisma.InputJsonValue,
        overrideReason: reason, overrideById: s.user.id, rulesetVersion: last.rulesetVersion, euCoreVersion: EU_CORE_VERSION, countryProfileVersion: cf.profileVersion,
      },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "ClientRiskAssessment", objectId: fileId, fields: ["final", "overrideReason"] });
    revalidatePath(`/app/clients/${fileId}`);
    return { message: "Override recorded. Both the calculated and the final level are kept." };
  });
}

export async function acceptAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.accept");
  if (!hasRecentMfa(s)) return STEP_UP(`/app/clients/${fileId}`);
  const overrideReason = String(fd.get("overrideReason") ?? "").trim();
  const override = overrideReason ? { byRole: s.user.roles.includes("COMPLIANCE_OFFICER") ? "compliance-officer" : "staff", reason: overrideReason } : undefined;
  const r = await withTenant(s.firm.id, (tx) =>
    acceptClient(tx, { firmId: s.firm.id, userId: s.user.id, roles: s.user.roles }, fileId, { sdd: fd.get("sdd") === "on", override }),
  );
  if (!r.allowed) return { error: r.error ?? `Can't accept yet: ${r.openItems.map((i) => i.message).join(" ")}` };
  revalidatePath(`/app/clients/${fileId}`);
  return { message: r.overridden ? "Accepted with a Compliance Officer override (logged)." : "Client accepted." };
}

export async function endAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.accept");
  if (!hasRecentMfa(s)) return STEP_UP(`/app/clients/${fileId}`);
  const kind = fd.get("kind") === "TERMINATED" ? "TERMINATED" : "REFUSED";
  const reason = String(fd.get("reason") ?? "").trim();
  const suspicion = String(fd.get("suspicion") ?? "");
  if (reason.length < 10) return { error: "Record the reason.", fieldErrors: { reason: ["At least 10 characters."] } };
  if (!["none", "raise"].includes(suspicion)) {
    return { error: "Assess whether there is a suspicion (AMLR Art. 21).", fieldErrors: { suspicion: ["Choose one."] } };
  }
  await withTenant(s.firm.id, (tx) =>
    endRelationship(tx, { firmId: s.firm.id, userId: s.user.id, roles: s.user.roles }, fileId, kind, reason, suspicion === "raise"),
  );
  revalidatePath(`/app/clients/${fileId}`);
  return { message: `${kind === "REFUSED" ? "Refusal" : "Termination"} recorded. The 5-year retention clock has started.${suspicion === "raise" ? " An internal suspicion report was sent to the Compliance Officer." : ""}` };
}

// ---------------------------------------------------------------------------
// Client portal and documents
// ---------------------------------------------------------------------------

export async function sendPortalLinkAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the client's email address.", fieldErrors: { email: ["Valid email required."] } };
  await withTenant(s.firm.id, (tx) => createPortalLink(tx, { firmId: s.firm.id, userId: s.user.id }, fileId, email));
  revalidatePath(`/app/clients/${fileId}`);
  return { message: `Secure link sent to ${email}. Reminders go out on day 1, 3 and 7.` };
}

export async function revokePortalLinkAction(fileId: string, linkId: string): Promise<ActionState> {
  const s = await requireUser("client.edit");
  await withTenant(s.firm.id, (tx) => revokePortalLink(tx, { firmId: s.firm.id, userId: s.user.id }, linkId));
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Link revoked." };
}

export async function staffUploadAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const kind = String(fd.get("kind"));
  const file = fd.get("file");
  if (!(kind in DOCUMENT_KINDS)) return { error: "Choose the document type." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const r = await withTenant(s.firm.id, async (tx) => {
    const cdd = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId } });
    const res = await storeDocument(tx, { firmId: s.firm.id, partyId: cdd.partyId, kind, fileName: file.name, bytes, uploadedBy: `staff:${s.user.id}` });
    if (res.ok) await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Document", objectId: res.documentId, fields: ["kind"] });
    return res;
  });
  if (!r.ok) return { error: r.error };
  revalidatePath(`/app/clients/${fileId}`);
  return { message: r.scan === "clean" ? "Uploaded." : "Uploaded. The file can be opened once the malware scan has finished." };
}

export async function openDiscrepancyAction(fileId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const description = String(fd.get("description") ?? "").trim();
  if (description.length < 10) return { error: "Describe the difference between the register and what the client declared.", fieldErrors: { description: ["At least 10 characters."] } };
  await withTenant(s.firm.id, async (tx) => {
    const f = await tx.cddFile.findUniqueOrThrow({ where: { id: fileId } });
    const { profile } = await currentProfile(tx, s.firm.id);
    await openDiscrepancy(tx, { firmId: s.firm.id, userId: s.user.id }, f.partyId, profile.boRegister?.name ?? "Central BO register", description);
  });
  revalidatePath(`/app/clients/${fileId}`);
  return { message: "Discrepancy opened. Ask the client to correct the register; otherwise report it within 14 days (Art. 24). The Compliance Officer has the case." };
}

/** Staff completes a periodic refresh (Art. 26): renews the date if nothing is open. */
export async function markRefreshedAction(fileId: string): Promise<ActionState> {
  const s = await requireUser("client.accept");
  const r = await withTenant(s.firm.id, async (tx) => {
    const res = await renewIfClean(tx, s.firm.id, fileId, "refreshed by staff");
    if (res.renewed) await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "approve", objectType: "CddFile", objectId: fileId, fields: ["nextRefreshOn"] });
    return res;
  });
  revalidatePath(`/app/clients/${fileId}`);
  return r.renewed ? { message: "CDD refreshed. Next refresh date updated." } : { error: `Not yet: ${r.reasons.join(" ")} If the risk level changed, review it and accept the client again.` };
}
