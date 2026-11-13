import "server-only";
import { zipSync, strToU8 } from "fflate";
import type { Tx } from "./db";
import { readBlob } from "./storage";
import { loadClientFile } from "./cdd";
import { riskAssessmentAsDoc } from "./firm-docs";
import { renderPdf } from "@/lib/docs/pdf";
import type { DocSection, GeneratedDoc } from "@/lib/docs/model";
import { safeFileName } from "@/lib/files/validate";
import { DOCUMENT_KINDS } from "./storage";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { countryProfileSchema } from "@/lib/rules/country-profile";

/**
 * One-click supervisor file (spec §4.7, §11.11): PDF summary + ZIP with the
 * documents and a machine-readable JSON. Exports are watermarked.
 * Suspicion cases and STRs are not part of a client file — they are need-to-know
 * and exported separately by the Compliance Officer.
 */

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "—");
const dt = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 16).replace("T", " ") : "—");

export async function clientSupervisorFile(tx: Tx, firmId: string, fileId: string, watermark: string): Promise<{ zip: Uint8Array; name: string }> {
  const cf = await loadClientFile(tx, firmId, fileId);
  const users = new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const risks = await tx.clientRiskAssessment.findMany({ where: { cddFileId: fileId }, orderBy: { createdAt: "asc" } });
  const approvals = await tx.approval.findMany({ where: { objectId: fileId }, orderBy: { createdAt: "asc" } });
  const docs = await tx.document.findMany({ where: { partyId: cf.party.id }, orderBy: { uploadedAt: "asc" } });
  const links = await tx.portalLink.findMany({ where: { cddFileId: fileId }, orderBy: { createdAt: "asc" } });
  const objectIds = [fileId, cf.party.id, ...cf.tree.links.map((l) => l.id), ...cf.verifications.map((v) => v.id), ...cf.extracts.map((x) => x.id), ...cf.screening.map((s) => s.id), ...docs.map((x) => x.id), ...risks.map((r) => r.id)];
  const auditTrail = await tx.auditEvent.findMany({ where: { objectId: { in: objectIds } }, orderBy: { at: "asc" } });
  const details = cf.party.details as Record<string, unknown>;

  const sections: DocSection[] = [
    {
      id: "status", heading: "1. Status",
      blocks: [{ kv: [
        ["Client", cf.party.displayName], ["Type", cf.party.kind === "NATURAL" ? "Natural person" : "Legal entity"], ["Role", cf.file.role.toLowerCase()],
        ["CDD status", cf.file.status], ["Purpose (Art. 25)", cf.file.purpose ?? "—"], ["Decided", `${dt(cf.file.decidedAt)}${cf.file.decidedById ? ` by ${users.get(cf.file.decidedById)}` : ""}`],
        ["Next refresh", d(cf.file.nextRefreshOn)], ["Retention until", d(cf.file.retentionUntil)], ["Legal hold until", d(cf.file.legalHoldUntil)],
        ...(cf.file.gateOverride ? [["Gate override", JSON.stringify(cf.file.gateOverride)] as [string, string]] : []),
      ] }],
    },
    {
      id: "data", heading: "2. Identification data (Art. 22)",
      blocks: [{ kv: Object.entries(details).filter(([k, v]) => k !== "portalDeclaration" && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)] as [string, string]) }],
    },
    {
      id: "verification", heading: "3. Verification",
      blocks: [
        { table: { head: ["Method", "Assurance", "Provider", "Why not eID", "Date"], rows: cf.verifications.map((v) => [v.method, v.assuranceLevel ?? "", v.provider ?? "", v.fallbackReason ?? "", d(v.verifiedAt)]) } },
        { table: { head: ["Register extract", "Source", "Retrieved"], rows: cf.extracts.map((x) => [x.register, x.source, dt(x.retrievedAt)]) } },
        ...(details.portalDeclaration ? [{ p: `Client declaration signed: ${JSON.stringify(details.portalDeclaration)}` }] : []),
        { table: { head: ["Portal link sent to", "Status", "Created", "Submitted"], rows: links.map((l) => [l.sentTo, l.status, d(l.createdAt), d(l.submittedAt)]) } },
      ],
    },
  ];
  if (cf.bo) {
    sections.push({
      id: "bo", heading: "4. Ownership and beneficial owners (Art. 51–62)",
      blocks: [
        { table: { head: ["Owner", "Of", "Type", "%", "Source"], rows: cf.tree.links.map((l) => [cf.tree.parties.get(l.ownerId)?.displayName ?? "", cf.tree.parties.get(l.ownedId)?.displayName ?? "", l.type, l.pct === null ? "" : String(Number(l.pct)), l.source]) } },
        { table: { head: ["Beneficial owner", "Effective %", "Reasons"], rows: cf.bo.beneficialOwners.map((b) => [b.name, String(b.effectivePct), b.reasons.join("; ")]) } },
        ...(cf.file.smoFallback ? [{ p: `No beneficial owner — senior managing officials recorded: ${JSON.stringify(cf.file.smoFallback)}` }] : []),
        { p: `Sanctioned ownership through the structure: ${cf.sanctions.sanctionedOwnershipPct}%${cf.sanctions.affected ? " — sanctions-affected" : ""}` },
      ],
    });
  }
  sections.push(
    {
      id: "screening", heading: "5. Screening (Art. 20(1)(d))",
      blocks: [{ table: { head: ["Person / company", "List", "Version", "Screened", "Result", "Comment"], rows: cf.screening.map((s) => [cf.tree.parties.get(s.partyId)?.displayName ?? "", s.listName, s.listVersion, dt(s.screenedAt), s.decision, s.comment ?? ""]) } }],
    },
    {
      id: "risk", heading: "6. Risk assessments (rule-based)",
      blocks: risks.map((r) => ({
        p: `${dt(r.createdAt)} · calculated ${r.calculated}, final ${r.final} (score ${r.score})${r.overrideReason ? ` · override by ${users.get(r.overrideById ?? "")}: ${r.overrideReason}` : ""} · rule set ${r.rulesetVersion}, EU Core ${r.euCoreVersion}, Country Profile v${r.countryProfileVersion} · factors: ${(r.factors as { label: string; points: number }[]).map((f) => `${f.label} (+${f.points})`).join("; ") || "none"}`,
      })),
    },
    {
      id: "approvals", heading: "7. Decisions and approvals",
      blocks: [{ table: { head: ["When", "What", "Who", "Role", "Reason", "Versions"], rows: approvals.map((a) => [dt(a.createdAt), a.objectType.replace("CddFile:", ""), users.get(a.userId) ?? "", a.role, a.reason ?? "", `EU ${a.euCoreVersion} / CP v${a.countryProfileVersion}`]) } }],
    },
    {
      id: "documents", heading: "8. Documents",
      blocks: [{ table: { head: ["Kind", "File", "Uploaded", "By", "SHA-256", "Scan"], rows: docs.map((x) => [DOCUMENT_KINDS[x.kind] ?? x.kind, x.fileName, dt(x.uploadedAt), x.uploadedBy.startsWith("portal") ? "client" : users.get(x.uploadedBy.replace("staff:", "")) ?? "staff", x.sha256.slice(0, 16) + "…", x.malwareScan]) } }],
    },
    {
      id: "audit", heading: "9. Audit trail",
      blocks: [{ table: { head: ["When", "Who", "Action", "Object", "Fields"], rows: auditTrail.map((e) => [dt(e.at), e.userId ? users.get(e.userId) ?? "" : "client / system", e.action, e.objectType, e.fields.join(", ")]) } }],
    },
  );

  const doc: GeneratedDoc = {
    title: "Supervisor file — client",
    subtitle: cf.party.displayName,
    meta: [`Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · EU Core ${EU_CORE_VERSION} · Country Profile v${cf.profileVersion}`, "Suspicion reports and STRs are need-to-know and not included; the Compliance Officer exports them separately."],
    sections,
  };
  const files: Record<string, Uint8Array> = {
    "summary.pdf": await renderPdf(doc, { watermark }),
    "data.json": strToU8(JSON.stringify({ file: cf.file, party: { ...cf.party, nationalIdEnc: undefined, taxIdEnc: undefined }, links: cf.tree.links, bo: cf.bo, screening: cf.screening, risks, approvals, documents: docs.map((x) => ({ ...x, storageKey: undefined })), audit: auditTrail.map((a) => ({ ...a, id: String(a.id) })) }, null, 2)),
  };
  for (const x of docs) {
    if (x.malwareScan !== "clean") continue;
    files[`documents/${x.kind}-${x.id.slice(0, 8)}-${safeFileName(x.fileName)}`] = new Uint8Array(await readBlob(firmId, x.storageKey));
  }
  return { zip: zipSync(files, { level: 6 }), name: `supervisor-file-${safeFileName(cf.party.displayName)}.zip` };
}

export async function firmSupervisorFile(tx: Tx, firmId: string, watermark: string): Promise<{ zip: Uint8Array; name: string }> {
  const firm = await tx.firm.findUniqueOrThrow({ where: { id: firmId } });
  const users = await tx.user.findMany({ orderBy: { createdAt: "asc" } });
  const name = (id: string | null | undefined) => users.find((u) => u.id === id)?.name ?? "—";
  const appts = await tx.appointment.findMany({ orderBy: { fromDate: "asc" } });
  const ras = await tx.firmRiskAssessment.findMany({ where: { status: { in: ["IN_FORCE", "SUPERSEDED"] } }, orderBy: { version: "asc" } });
  const policies = await tx.policyDocument.findMany({ where: { status: { in: ["IN_FORCE", "SUPERSEDED"] } }, orderBy: [{ kind: "asc" }, { version: "asc" }], include: { acknowledgements: true } });
  const approvals = await tx.approval.findMany({ where: { objectType: { in: ["FirmRiskAssessment", "PolicyDocument:policy", "PolicyDocument:procedure", "PolicyDocument:annual-report", "CountryProfileVersion"] } } });
  const training = await tx.trainingAssignment.findMany({ include: { module: { select: { title: true } } }, orderBy: { assignedAt: "asc" } });
  const integrity = await tx.integrityDeclaration.findMany({ orderBy: { declaredAt: "asc" } });
  const outsourcing = await tx.outsourcingArrangement.findMany({ orderBy: { createdAt: "asc" } });
  const cps = await tx.countryProfileVersion.findMany({ orderBy: { version: "asc" } });
  const whistle = await tx.whistleblowingReport.count();
  const approvedBy = (objectId: string) => { const a = approvals.find((x) => x.objectId === objectId); return a ? `${name(a.userId)} on ${d(a.createdAt)}` : "—"; };

  const summary: GeneratedDoc = {
    title: "Supervisor file — firm",
    subtitle: `${firm.name} · ${firm.sectors.join(", ")} · ${firm.homeState}`,
    meta: [`Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · EU Core ${EU_CORE_VERSION}`],
    sections: [
      { id: "firm", heading: "1. Firm", blocks: [{ kv: [["Name", firm.name], ["Email domain", firm.emailDomain], ["Member state", firm.homeState], ["Sectors", firm.sectors.join(", ")], ["Services", firm.services.join("; ") || "—"], ["Staff", String(firm.size ?? users.filter((u) => !u.deactivatedAt).length)], ["Accepts cash", firm.usesCash ? "yes" : "no"]] }] },
      { id: "governance", heading: "2. Governance (Art. 11)", blocks: [{ table: { head: ["Function", "Person", "From", "To", "Reason"], rows: appts.map((a) => [a.function, name(a.userId), d(a.fromDate), d(a.toDate), a.reason ?? ""]) } }, { table: { head: ["User", "Roles", "External", "Active"], rows: users.map((u) => [u.name, u.roles.join(", "), u.external ? "yes" : "", u.deactivatedAt ? `left ${d(u.deactivatedAt)}` : "yes"]) } }] },
      { id: "ra", heading: "3. Business-wide risk assessments (Art. 10)", blocks: [{ table: { head: ["Version", "Status", "Residual risk", "Approved"], rows: ras.map((r) => [String(r.version), r.status, (r.result as { overallResidual?: string }).overallResidual ?? "", approvedBy(r.id)]) } }] },
      { id: "policies", heading: "4. Policies, procedures and annual reports (Art. 9, 11)", blocks: [{ table: { head: ["Document", "Version", "Status", "Approved", "Acknowledged by"], rows: policies.map((p) => [p.kind, String(p.version), p.status, approvedBy(p.id), p.acknowledgements.map((a) => name(a.userId)).join(", ")]) } }] },
      { id: "training", heading: "5. Training (Art. 12)", blocks: [{ table: { head: ["Person", "Module", "Assigned", "Completed", "Attestation"], rows: training.map((t) => [name(t.userId), t.module.title, d(t.assignedAt), d(t.completedAt), t.attestation ?? ""]) } }] },
      { id: "integrity", heading: "6. Integrity declarations (Art. 13)", blocks: [{ table: { head: ["Person", "Kind", "Date", "Conflicts"], rows: integrity.map((i) => [name(i.userId), i.kind, d(i.declaredAt), i.conflicts ?? ""]) } }] },
      { id: "whistle", heading: "7. Internal reporting channel (Art. 14)", blocks: [{ p: `Channel in place. Reports received to date: ${whistle}. Contents are confidential and not included.` }] },
      { id: "outsourcing", heading: "8. Outsourcing register (Art. 18)", blocks: [{ table: { head: ["Provider", "Tasks", "Agreement", "Supervisor notified", "Start"], rows: outsourcing.map((o) => [o.provider, o.tasks, d(o.agreementSignedOn), d(o.supervisorNotifiedOn), d(o.startOn)]) } }] },
      { id: "cp", heading: "9. Country Profile versions", blocks: [{ table: { head: ["Version", "Created", "Entered by", "Source", "Approved"], rows: cps.map((c) => [String(c.version), d(c.createdAt), name(c.enteredById), c.source ?? "", approvedBy(c.id)]) } }] },
    ],
  };
  const files: Record<string, Uint8Array> = { "firm-summary.pdf": await renderPdf(summary, { watermark }) };
  for (const r of ras) files[`risk-assessment-v${r.version}.pdf`] = await renderPdf(await riskAssessmentAsDoc(tx, firmId, r.id), { watermark });
  for (const p of policies) files[`${p.kind}-v${p.version}.pdf`] = await renderPdf(p.content as unknown as GeneratedDoc, { watermark });
  files["country-profile-current.json"] = strToU8(JSON.stringify(cps.length ? countryProfileSchema.parse(cps[cps.length - 1].data) : {}, null, 2));
  return { zip: zipSync(files, { level: 6 }), name: `supervisor-file-${safeFileName(firm.name)}.zip` };
}
