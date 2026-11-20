import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { adminDb, withTenant } from "./db";
import { audit } from "./audit";
import { decryptField, encryptField } from "./crypto";
import { copyBlobToFirm, deleteBlob } from "./storage";
import { loadClientFile, persistRiskIfChanged, runScreening } from "./cdd";
import { notify } from "./email";
import { hit } from "./rate-limit";

/**
 * Client sharing between firms (decided 20 Nov 2026). A firm sends a client's
 * file — the client's data, ownership structure, check summary and documents —
 * to another AMLSync App firm that gave it its firm code. The receiving firm
 * decides whether to import it as a new client file; it then re-screens
 * everyone and keeps its own responsibility (Art. 48 AMLR: reliance on another
 * obliged entity's checks). Packages expire after 30 days.
 */

export const SHARE_DAYS = 30;
export const SHARE_BASES: Record<string, string> = {
  consent: "The client asked us or agreed in writing to share their file",
  reliance: "The receiving firm relies on our checks (Art. 48 AMLR) and the client was told",
  group: "Same group of firms, shared under our group-wide AML policy (Art. 16 AMLR)",
};
const MAX_DOCS = 20;
const MAX_BYTES = 40 * 1024 * 1024;

interface SharedParty { id: string; kind: "NATURAL" | "LEGAL" | "ARRANGEMENT"; displayName: string; details: Record<string, unknown> }
interface SharedLink { ownerId: string; ownedId: string; type: string; pct: number | null; controlDescription: string | null; source: string }
interface SharedDoc { key: string; fileName: string; kind: string; mimeType: string; sizeBytes: number; sha256: string; partyId: string | null }
export interface SharePackage {
  version: 1;
  fromFirm: string;
  sentAt: string;
  clientPartyId: string;
  purpose: string | null;
  parties: SharedParty[];
  links: SharedLink[];
  summary: string[];
}

const SHARE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const b = randomBytes(8);
  const s = [...b].map((x) => SHARE_CODE_ALPHABET[x % SHARE_CODE_ALPHABET.length]).join("");
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function ensureShareCode(firmId: string): Promise<string> {
  const f = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { shareCode: true } });
  if (f.shareCode) return f.shareCode;
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      await adminDb.firm.update({ where: { id: firmId }, data: { shareCode: code } });
      return code;
    } catch { /* collision: try another */ }
  }
  throw new Error("Couldn't create a firm code.");
}

/** Details safe to pass on: no encrypted blobs, no internal markers. */
function cleanDetails(d: unknown): Record<string, unknown> {
  const o = { ...((d ?? {}) as Record<string, unknown>) };
  for (const k of Object.keys(o)) if (/Enc$/.test(k) || k === "sample" || k === "receivedFrom") delete o[k];
  return o;
}

async function firmHandlers(firmId: string) {
  return adminDb.user.findMany({ where: { firmId, roles: { hasSome: ["OWNER", "COMPLIANCE_OFFICER"] }, deactivatedAt: null }, select: { email: true } });
}

export async function createShare(ctx: { firmId: string; userId: string }, fileId: string, input: { code: string; legalBasis: string; note: string }): Promise<{ toFirm: string; documents: number }> {
  if (!SHARE_BASES[input.legalBasis]) throw new Error("Choose the legal basis for sharing.");
  const code = input.code.trim().toUpperCase().replace(/\s/g, "");
  const to = await adminDb.firm.findFirst({ where: { shareCode: code }, select: { id: true, name: true, status: true } });
  if (!to || to.status !== "active") throw new Error("No firm has this code. Ask the firm for its code (Clients → Shared Files).");
  if (to.id === ctx.firmId) throw new Error("That is your own firm's code.");
  if (!(await hit(`share:${ctx.firmId}`, { limit: 30, windowSec: 86_400 }))) throw new Error("Too many files shared today. Try again tomorrow.");
  const from = await adminDb.firm.findUniqueOrThrow({ where: { id: ctx.firmId }, select: { name: true } });

  const { pkg, docs, fileName } = await withTenant(ctx.firmId, async (tx) => {
    const cf = await loadClientFile(tx, ctx.firmId, fileId);
    // Tipping-off (Art. 73): never send a file while an investigation about the client is open.
    if (await tx.case.count({ where: { partyIds: { hasSome: [...cf.tree.parties.keys()] }, status: { in: ["open", "decided"] } } })) throw new Error("This file can't be shared while an investigation about the client is open.");
    const parties = [...cf.tree.parties.values()].map((p) => ({ id: p.id, kind: p.kind, displayName: p.displayName.replace(/ \(sample\)$/, ""), details: cleanDetails(p.details) }));
    const links = cf.tree.links.map((l) => ({ ownerId: l.ownerId, ownedId: l.ownedId, type: l.type, pct: l.pct === null ? null : Number(l.pct), controlDescription: l.controlDescription, source: l.source }));
    const name = (id: string) => cf.tree.parties.get(id)?.displayName ?? "someone";
    const summary = [
      `Risk rating at ${from.name}: ${cf.risk.level.toLowerCase()} (${cf.risk.score} points).`,
      ["COMPLETE", "SDD", "EDD"].includes(cf.file.status) && cf.file.decidedAt ? `Accepted as a client on ${cf.file.decidedAt.toISOString().slice(0, 10)}.` : "Not yet accepted as a client.",
      ...cf.verifications.map((v) => `Identity of ${name(v.partyId)} verified on ${v.verifiedAt.toISOString().slice(0, 10)} (${v.method.replace(/_/g, " ").toLowerCase()}${v.provider ? `, ${v.provider}` : ""}).`),
      ...cf.extracts.map((x) => `Register extract: ${x.register}, ${x.retrievedAt.toISOString().slice(0, 10)}.`),
      ...cf.screening.filter((r) => r.decision && r.decision !== "PENDING").slice(0, 20).map((r) => `Screening of ${name(r.partyId)} against ${r.listName}: ${String(r.decision).replace(/_/g, " ").toLowerCase()}.`),
    ];
    const ids = [...cf.tree.parties.keys()];
    const documents = await tx.document.findMany({ where: { partyId: { in: ids }, malwareScan: "clean" }, orderBy: { uploadedAt: "desc" }, take: MAX_DOCS });
    return {
      pkg: { version: 1 as const, fromFirm: from.name, sentAt: new Date().toISOString(), clientPartyId: cf.party.id, purpose: cf.file.purpose, parties, links, summary },
      docs: documents,
      fileName: cf.party.displayName.replace(/ \(sample\)$/, ""),
    };
  }, { timeoutMs: 60_000 });

  const copied: SharedDoc[] = [];
  let total = 0;
  for (const d of docs) {
    if (total + d.sizeBytes > MAX_BYTES) break;
    copied.push({ key: await copyBlobToFirm(ctx.firmId, d.storageKey, to.id), fileName: d.fileName, kind: d.kind, mimeType: d.mimeType, sizeBytes: d.sizeBytes, sha256: d.sha256, partyId: d.partyId });
    total += d.sizeBytes;
  }
  const share = await adminDb.clientShare.create({
    data: {
      fromFirmId: ctx.firmId, toFirmId: to.id, sourceFileId: fileId, clientName: fileName.slice(0, 200), note: input.note.slice(0, 1000), legalBasis: input.legalBasis,
      packageEnc: encryptField(to.id, JSON.stringify(pkg)), documents: copied as unknown as Prisma.InputJsonValue, createdBy: ctx.userId,
      expiresAt: new Date(Date.now() + SHARE_DAYS * 86_400_000),
    },
  });
  await withTenant(ctx.firmId, (tx) => audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "export", objectType: "CddFile", objectId: fileId, fields: [`shared-with:${to.id}`, `share:${share.id}`, `basis:${input.legalBasis}`] }));
  for (const u of await firmHandlers(to.id)) {
    await notify(u.email, `AMLSync App: ${from.name} sent you a client file`, `${from.name} sent your firm the client file of ${fileName}.\n\nOpen Clients → Shared Files to import it or decline it. It expires in ${SHARE_DAYS} days.`);
  }
  return { toFirm: to.name, documents: copied.length };
}

async function dropDocs(documents: unknown) {
  for (const d of (documents as SharedDoc[]) ?? []) await deleteBlob(d.key).catch(() => {});
}

/** Incoming and outgoing shares for a firm. Expired pending shares are closed (and their copies deleted) here. */
export async function listShares(firmId: string) {
  const stale = await adminDb.clientShare.findMany({ where: { OR: [{ toFirmId: firmId }, { fromFirmId: firmId }], status: "pending", expiresAt: { lt: new Date() } }, select: { id: true, documents: true } });
  for (const s of stale) {
    await dropDocs(s.documents);
    await adminDb.clientShare.update({ where: { id: s.id }, data: { status: "expired", documents: [] } });
  }
  const select = { id: true, fromFirmId: true, toFirmId: true, clientName: true, note: true, legalBasis: true, status: true, createdAt: true, expiresAt: true, decidedAt: true, importedFileId: true, sourceFileId: true, documents: true } as const;
  const [incoming, outgoing] = await Promise.all([
    adminDb.clientShare.findMany({ where: { toFirmId: firmId }, orderBy: { createdAt: "desc" }, take: 100, select }),
    adminDb.clientShare.findMany({ where: { fromFirmId: firmId }, orderBy: { createdAt: "desc" }, take: 100, select }),
  ]);
  const firmIds = [...new Set([...incoming.map((s) => s.fromFirmId), ...outgoing.map((s) => s.toFirmId)])];
  const names = new Map((await adminDb.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, name: true } })).map((f) => [f.id, f.name]));
  const view = <T extends { documents: unknown }>(s: T) => ({ ...s, documents: ((s.documents as SharedDoc[]) ?? []).length });
  return {
    incoming: incoming.map((s) => ({ ...view(s), firm: names.get(s.fromFirmId) ?? "another firm" })),
    outgoing: outgoing.map((s) => ({ ...view(s), firm: names.get(s.toFirmId) ?? "another firm" })),
  };
}

/** The receiving firm imports the package as a new client file. */
export async function acceptShare(ctx: { firmId: string; userId: string }, shareId: string): Promise<string> {
  const s = await adminDb.clientShare.findUnique({ where: { id: shareId } });
  if (!s || s.toFirmId !== ctx.firmId) throw new Error("Not found.");
  if (s.status !== "pending" || s.expiresAt < new Date()) throw new Error("This file can no longer be imported.");
  const claimed = await adminDb.clientShare.updateMany({ where: { id: s.id, status: "pending" }, data: { status: "importing" } });
  if (!claimed.count) throw new Error("This file is already being imported.");
  const pkg = JSON.parse(decryptField(ctx.firmId, s.packageEnc)) as SharePackage;
  const docs = (s.documents as unknown as SharedDoc[]) ?? [];
  try {
    const fileId = await withTenant(ctx.firmId, async (tx) => {
      const ids = new Map<string, string>();
      const receivedAt = new Date().toISOString().slice(0, 10);
      for (const p of pkg.parties) {
        const details = { ...p.details, ...(p.id === pkg.clientPartyId ? { receivedFrom: { firm: pkg.fromFirm, sentAt: pkg.sentAt.slice(0, 10), receivedAt, summary: pkg.summary.slice(0, 60), shareId: s.id } } : {}) };
        const created = await tx.party.create({ data: { firmId: ctx.firmId, kind: p.kind, displayName: p.displayName, details: details as Prisma.InputJsonValue } });
        ids.set(p.id, created.id);
      }
      for (const l of pkg.links) {
        const ownerId = ids.get(l.ownerId), ownedId = ids.get(l.ownedId);
        if (!ownerId || !ownedId) continue;
        await tx.ownershipLink.create({ data: { firmId: ctx.firmId, ownerId, ownedId, type: l.type as Prisma.OwnershipLinkCreateInput["type"], pct: l.pct, controlDescription: l.controlDescription, source: l.source as Prisma.OwnershipLinkCreateInput["source"] } });
      }
      const file = await tx.cddFile.create({ data: { firmId: ctx.firmId, partyId: ids.get(pkg.clientPartyId)!, role: "CLIENT", purpose: pkg.purpose } });
      for (const d of docs) {
        await tx.document.create({ data: { firmId: ctx.firmId, partyId: d.partyId ? ids.get(d.partyId) ?? null : null, kind: d.kind, storageKey: d.key, mimeType: d.mimeType, sizeBytes: d.sizeBytes, sha256: d.sha256, malwareScan: "clean", fileName: d.fileName, uploadedBy: `shared:${s.id}` } });
      }
      await runScreening(tx, ctx.firmId, [...ids.values()]);
      await persistRiskIfChanged(tx, ctx.firmId, await loadClientFile(tx, ctx.firmId, file.id));
      await audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "create", objectType: "CddFile", objectId: file.id, fields: [`received-from:${s.fromFirmId}`, `share:${s.id}`] });
      return file.id;
    }, { timeoutMs: 120_000 });
    await adminDb.clientShare.update({ where: { id: s.id }, data: { status: "accepted", decidedAt: new Date(), decidedBy: ctx.userId, importedFileId: fileId } });
    const me = await adminDb.firm.findUniqueOrThrow({ where: { id: ctx.firmId }, select: { name: true } });
    for (const u of await firmHandlers(s.fromFirmId)) await notify(u.email, `AMLSync App: ${me.name} imported the file you shared`, `${me.name} imported the client file of ${s.clientName} that you shared on ${s.createdAt.toISOString().slice(0, 10)}.`);
    return fileId;
  } catch (e) {
    await adminDb.clientShare.update({ where: { id: s.id }, data: { status: "pending" } });
    throw e;
  }
}

/** Declined by the receiver, or withdrawn by the sender while still pending: the copies are deleted. */
export async function closeShare(ctx: { firmId: string; userId: string }, shareId: string, how: "declined" | "withdrawn"): Promise<void> {
  const s = await adminDb.clientShare.findUnique({ where: { id: shareId } });
  if (!s || (how === "declined" ? s.toFirmId : s.fromFirmId) !== ctx.firmId) throw new Error("Not found.");
  if (s.status !== "pending") throw new Error("This file is no longer pending.");
  await dropDocs(s.documents);
  await adminDb.clientShare.update({ where: { id: s.id }, data: { status: how, decidedAt: new Date(), decidedBy: ctx.userId, documents: [], packageEnc: Buffer.alloc(0) } });
  await withTenant(ctx.firmId, (tx) => audit(tx, { firmId: ctx.firmId, userId: ctx.userId, action: "update", objectType: "ClientShare", objectId: s.id, fields: [`share-${how}`] }));
}
