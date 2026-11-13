import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { loadClientFile } from "@/lib/server/cdd";
import { openCddItems } from "@/lib/rules/gates";
import { EDD_CHECKLIST } from "@/lib/rules/risk-scoring";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { PartyFields } from "@/components/party-fields";
import {
  acceptAction, addOwnerAction, decideMatchAction, eddChecklistAction, endAction, recordExtractAction, recordVerificationAction,
  removeLinkAction, rescreenAction, riskOverrideAction, saveSmoAction, seniorApprovalAction, updatePurposeAction,
  revokePortalLinkAction, sendPortalLinkAction, staffUploadAction, openDiscrepancyAction,
} from "../actions";
import { raiseSuspicionAction } from "../../cases/actions";
import { RaiseSuspicion } from "@/components/raise-suspicion";
import { DOCUMENT_KINDS } from "@/lib/server/storage";

const STATUS: Record<string, string> = { OPEN: "In progress", COMPLETE: "Accepted", SDD: "Accepted (SDD)", EDD: "Accepted (EDD)", REFUSED: "Refused", TERMINATED: "Terminated" };
const LABELS: Record<string, string> = {
  firstNames: "First names", lastName: "Surname", birthDate: "Date of birth", placeOfBirth: "Place of birth", nationalities: "Nationalities",
  residenceCountry: "Residence", address: "Address", occupation: "Occupation", email: "Email", phone: "Phone", pepFunction: "Public function",
  pepLeftOfficeOn: "Left office", name: "Legal name", legalForm: "Legal form", registrationNumber: "Registration no.", lei: "LEI",
  registeredOffice: "Registered office", principalPlaceOfBusiness: "Principal place of business", countryOfCreation: "Country of creation",
  natureOfBusiness: "Nature of business", sourceOfFunds: "Source of funds (declared)", sourceOfWealth: "Source of wealth (declared)",
  taxResidence: "Tax residence", actingForWhom: "Acting for", signatoryRole: "Signatory role",
};

function Card({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-3 rounded-md border border-border p-4">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";
const area = "w-full rounded border border-border bg-transparent px-3 py-2 text-sm";

export default async function ClientFilePage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const s = await requireUser("client.view");
  const data = await withTenant(s.firm.id, async (tx) => {
    const exists = await tx.cddFile.findUnique({ where: { id: fileId } });
    if (!exists) return null;
    const cf = await loadClientFile(tx, s.firm.id, fileId);
    const lastRisk = await tx.clientRiskAssessment.findFirst({ where: { cddFileId: fileId }, orderBy: { createdAt: "desc" } });
    const approvals = await tx.approval.findMany({ where: { objectId: fileId }, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } });
    const hasCase = (await tx.case.count({ where: { partyIds: { has: cf.party.id } } })) > 0;
    const links = await tx.portalLink.findMany({ where: { cddFileId: fileId }, orderBy: { createdAt: "desc" }, take: 5 });
    const documents = await tx.document.findMany({ where: { partyId: cf.party.id }, orderBy: { uploadedAt: "desc" } });
    return { cf, lastRisk, approvals, hasCase, links, documents };
  });
  if (!data) notFound();
  const { cf, lastRisk, approvals, hasCase, links, documents } = data;
  const activeLink = links.find((l) => l.status === "SENT" || l.status === "OPENED");
  const r = s.user.roles;
  const edit = can(r, "client.edit") && cf.file.status === "OPEN";
  const items = openCddItems(cf.state);
  const d = cf.party.details as Record<string, unknown>;
  const decided = cf.file.status !== "OPEN";
  const entityOptions = [...cf.tree.parties.values()].filter((p) => p.kind !== "NATURAL");
  const pending = cf.screening.filter((x) => x.decision === "PENDING");
  const decidedHits = cf.screening.filter((x) => x.decision === "TRUE_MATCH" || x.decision === "FALSE_POSITIVE");
  const latestChecks = new Map<string, (typeof cf.screening)[number]>();
  for (const x of cf.screening) if (!latestChecks.has(`${x.partyId}:${x.listName}`)) latestChecks.set(`${x.partyId}:${x.listName}`, x);
  const checklist = new Set((cf.file.eddChecklist as string[] | null) ?? []);
  const smo = cf.file.smoFallback as { officials: { name: string; position: string }[]; stepsTaken: string } | null;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <p className="text-sm text-muted">{cf.party.kind === "NATURAL" ? "Person" : "Company"} · Client</p>
        <h1 className="text-2xl font-semibold">{cf.party.displayName}</h1>
        <p className="text-sm">
          <strong>{STATUS[cf.file.status]}</strong> · Risk <strong>{lastRisk?.final ?? cf.risk.level.toUpperCase()}</strong>
          {lastRisk?.overrideReason ? ` (calculated ${lastRisk.calculated}, overridden)` : ""}
          {cf.file.nextRefreshOn && ` · Next refresh ${cf.file.nextRefreshOn.toISOString().slice(0, 10)}`}
          {cf.file.retentionUntil && ` · Delete after ${cf.file.retentionUntil.toISOString().slice(0, 10)}`}
        </p>
        {can(r, "approve.compliance") && <a className="text-sm text-accent underline" href={`/api/supervisor-file/client/${fileId}`}>Download supervisor file (PDF + documents, ZIP)</a>}
      </div>

      {hasCase && (
        <p role="note" className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Don&apos;t tell the client about any internal compliance review of this file (tipping-off is prohibited, AMLR Art. 73).
        </p>
      )}

      {!decided && (
        <Card title={items.length ? "What to do next" : "Ready to decide"}>
          {items.length ? (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {items.map((i) => (
                <li key={i.id}>{i.message} <span className="text-muted">({i.article})</span></li>
              ))}
            </ol>
          ) : (
            <p className="text-sm">All mandatory items are complete. Review the file and accept the client below.</p>
          )}
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Client data">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {Object.entries(d).filter(([k]) => k !== "portalDeclaration" && k !== "additionalEddCaseIds").filter(([, v]) => v !== undefined && v !== "" && v !== false && !(Array.isArray(v) && v.length === 0) && typeof v !== "boolean").map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{LABELS[k] ?? k}</dt>
                <dd>{Array.isArray(v) ? v.join(", ") : String(v)}</dd>
              </div>
            ))}
            <dt className="text-muted">ID number</dt><dd>{cf.party.nationalIdEnc ? "Recorded (encrypted)" : "—"}</dd>
            {cf.isPep && (<><dt className="text-muted">PEP</dt><dd>Yes</dd></>)}
            {!!d.isPepFamilyOrAssociate && (<><dt className="text-muted">PEP family / associate</dt><dd>Yes</dd></>)}
            {cf.state.hasBearerShares && (<><dt className="text-muted">Bearer shares</dt><dd className="text-red-700 dark:text-red-300">Yes — cannot be accepted (Art. 79)</dd></>)}
          </dl>
          <ActionForm action={updatePurposeAction.bind(null, fileId)}>
            <Field label="Purpose and intended nature (Art. 25)" name="purpose" defaultValue={cf.file.purpose ?? ""} />
            {edit && <Submit variant="secondary">Save purpose</Submit>}
          </ActionForm>
        </Card>

        {cf.party.kind === "NATURAL" ? (
          <Card title="Identity verification (Art. 22)">
            {cf.verifications.length ? (
              <ul className="text-sm">
                {cf.verifications.map((v) => (
                  <li key={v.id}>
                    {v.method === "EID" ? "National eID" : v.method === "IN_PERSON" ? "In person with ID document" : "ID document + NFC chip + liveness"}
                    {v.assuranceLevel ? ` (${v.assuranceLevel})` : ""} · {v.verifiedAt.toISOString().slice(0, 10)}
                    {v.fallbackReason && <span className="block text-muted">Why not eID: {v.fallbackReason}</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Not verified yet. Order of preference: national eID (eIDAS substantial/high), in person, remote document + NFC + liveness.</p>
            )}
            {edit && (
              <ActionForm action={recordVerificationAction.bind(null, fileId)}>
                <Field label="Method" name="method" required>
                  <select name="method" className={sel} aria-label="Method" defaultValue="IN_PERSON">
                    <option value="EID">National eID (eIDAS)</option>
                    <option value="IN_PERSON">In person with ID document</option>
                    <option value="DOCUMENT_NFC_LIVENESS">Remote: document + NFC chip + liveness</option>
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Document type" name="documentType" hint="e.g. ID card, passport" />
                  <Field label="Document number" name="documentNumber" hint="Stored encrypted." autoComplete="off" />
                  <Field label="eID scheme / assurance level" name="assuranceLevel" hint="e.g. Smart-ID, high" />
                  <Field label="Provider" name="provider" />
                </div>
                <Field label="Why national eID wasn't used" name="fallbackReason" hint="Required for in-person or remote document checks." />
                <Submit variant="secondary">Record verification</Submit>
              </ActionForm>
            )}
            <p className="text-xs text-muted">eID broker and NFC/liveness vendor integrations are not connected yet. Record the result of the check here.</p>
          </Card>
        ) : (
          <Card title="Register extract (Art. 22(7), 23(4))">
            {cf.extracts.length ? (
              <ul className="text-sm">
                {cf.extracts.map((x) => (
                  <li key={x.id}>{x.register} · {String((x.data as { extractDate?: string }).extractDate ?? "")}{(x.data as { notes?: string }).notes ? ` · ${(x.data as { notes?: string }).notes}` : ""}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No register extract yet. Get the company and BO register extract and compare it with what the client declared.</p>
            )}
            {edit && (
              <ActionForm action={recordExtractAction.bind(null, fileId)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Register" name="register" defaultValue={cf.profile.boRegister?.name ?? ""} hint="Business or BO register" />
                  <Field label="Extract date" name="extractDate" type="date" />
                </div>
                <Field label="Notes / differences found" name="notes" />
                <Submit variant="secondary">Record extract</Submit>
              </ActionForm>
            )}
            {can(r, "client.edit") && cf.extracts.length > 0 && (
              <details className="rounded border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">The register differs from what the client declared</summary>
                <ActionForm action={openDiscrepancyAction.bind(null, fileId)} className="mt-2 space-y-2">
                  <Field label="Describe the difference" name="description" required />
                  <Submit variant="secondary">Open discrepancy (14-day clock)</Submit>
                </ActionForm>
              </details>
            )}
            <p className="text-xs text-muted">BRIS and KYB aggregator lookups are not connected yet.</p>
          </Card>
        )}
      </div>

      <Card title="Client portal and documents">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3 text-sm">
            {links.length > 0 && (
              <ul>
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {l.sentTo} · {l.status.toLowerCase()}
                      {l.submittedAt ? ` ${l.submittedAt.toISOString().slice(0, 10)}` : ` · expires ${l.expiresAt.toISOString().slice(0, 10)}`}
                      {l.remindersSent ? ` · ${l.remindersSent} reminder(s)` : ""}
                    </span>
                    {edit && (l.status === "SENT" || l.status === "OPENED") && <ActionButton action={revokePortalLinkAction.bind(null, fileId, l.id)}>Revoke</ActionButton>}
                  </li>
                ))}
              </ul>
            )}
            {!!(d.portalDeclaration as { signedName?: string } | undefined)?.signedName && (
              <p>Declaration signed by {(d.portalDeclaration as { signedName: string; signedAt: string }).signedName} on {(d.portalDeclaration as { signedAt: string }).signedAt.slice(0, 10)}.</p>
            )}
            {edit && (
              <ActionForm action={sendPortalLinkAction.bind(null, fileId)}>
                <Field label={activeLink ? "Send a new link (the current one stops working)" : "Send the client a secure link to fill in their details"} name="email" type="email" defaultValue={String(d.email ?? activeLink?.sentTo ?? "")} hint="The client answers the questions, uploads documents and signs. Links expire after 14 days." />
                <Submit variant="secondary">Send link</Submit>
              </ActionForm>
            )}
          </div>
          <div className="space-y-3 text-sm">
            {documents.length ? (
              <ul>
                {documents.map((doc) => (
                  <li key={doc.id}>
                    {DOCUMENT_KINDS[doc.kind] ?? doc.kind}:{" "}
                    {doc.malwareScan === "clean" ? (
                      <a className="text-accent underline" href={`/api/files/${doc.id}`}>{doc.fileName}</a>
                    ) : (
                      <span>{doc.fileName} <span className="text-muted">({doc.malwareScan === "quarantined" ? "blocked by malware scan" : "waiting for malware scan"})</span></span>
                    )}
                    <span className="text-muted"> · {doc.uploadedBy.startsWith("portal") ? "from client" : "staff"} · {doc.uploadedAt.toISOString().slice(0, 10)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted">No documents yet.</p>
            )}
            {edit && (
              <ActionForm action={staffUploadAction.bind(null, fileId)}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Kind of document" name="kind">
                    <select name="kind" className={sel} aria-label="Kind of document">{Object.entries(DOCUMENT_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  </Field>
                  <Field label="File" name="file">
                    <input type="file" name="file" aria-label="File" accept=".pdf,.jpg,.jpeg,.png,.heic,.docx" className="text-sm" />
                  </Field>
                </div>
                <Submit variant="secondary">Upload</Submit>
              </ActionForm>
            )}
          </div>
        </div>
      </Card>

      {cf.bo && (
        <Card title="Ownership and beneficial owners (Art. 51–60)" id="ownership">
          {cf.tree.links.length === 0 ? (
            <p className="text-sm text-muted">No shareholders or controllers recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {cf.tree.links.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-1">
                  <span>
                    {cf.tree.parties.get(l.ownerId)?.displayName} → {cf.tree.parties.get(l.ownedId)?.displayName}:{" "}
                    {l.type === "SHAREHOLDING" ? `${Number(l.pct)}%` : `control — ${l.controlDescription}`}
                  </span>
                  {edit && <ActionButton action={removeLinkAction.bind(null, fileId, l.id)}>Remove</ActionButton>}
                </li>
              ))}
            </ul>
          )}
          <div>
            <h3 className="text-sm font-semibold">Beneficial owners (calculated)</h3>
            {cf.bo.beneficialOwners.length ? (
              <ul className="text-sm">
                {cf.bo.beneficialOwners.map((b) => (
                  <li key={b.personId}><strong>{b.name}</strong> — {b.effectivePct}% <span className="text-muted">{b.reasons.join("; ")}</span></li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Nobody reaches 25% or has control by other means.</p>
            )}
            {cf.bo.candidates.filter((c) => !c.isBeneficialOwner).length > 0 && (
              <p className="text-xs text-muted">Below threshold: {cf.bo.candidates.filter((c) => !c.isBeneficialOwner).map((c) => `${c.name} ${c.effectivePct}%`).join(", ")}</p>
            )}
            {cf.bo.unresolvedOwners.length > 0 && (
              <p className="text-sm text-red-700 dark:text-red-300">
                Find the owners of: {cf.bo.unresolvedOwners.map((id) => cf.tree.parties.get(id)?.displayName).join(", ")}
              </p>
            )}
            {cf.sanctions.sanctionedOwnershipPct > 0 && (
              <p className="text-sm">Sanctioned ownership through the structure: {cf.sanctions.sanctionedOwnershipPct}%{cf.sanctions.affected ? " — client is sanctions-affected" : ""}</p>
            )}
          </div>
          {edit && (
            <details className="rounded border border-border p-3">
              <summary className="cursor-pointer text-sm font-medium">Add a shareholder or controller</summary>
              <ActionForm action={addOwnerAction.bind(null, fileId)} className="mt-3 space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Of entity" name="ownedId">
                    <select name="ownedId" className={sel} aria-label="Of entity">
                      {entityOptions.map((p) => <option key={p.id} value={p.id}>{p.displayName}</option>)}
                    </select>
                  </Field>
                  <Field label="Link" name="linkType">
                    <select name="linkType" className={sel} aria-label="Link">
                      <option value="SHAREHOLDING">Shareholding</option>
                      <option value="CONTROL">Control by other means</option>
                    </select>
                  </Field>
                  <Field label="% held" name="pct" type="number" inputMode="decimal" />
                </div>
                <Field label="How control is exercised (for control)" name="controlDescription" />
                <PartyFields prefix="owner." compact />
                <Submit variant="secondary">Add</Submit>
              </ActionForm>
            </details>
          )}
          {cf.bo.requiresSmoFallback && (
            <div className="space-y-2">
              {smo && cf.smoFallbackOk ? (
                <p className="text-sm">No BO — SMO recorded: {smo.officials.map((o) => `${o.name} (${o.position})`).join(", ")}.</p>
              ) : null}
              {edit && (
                <details className="rounded border border-border p-3" open={!smo}>
                  <summary className="cursor-pointer text-sm font-medium">No beneficial owner found? Record senior managing officials (Art. 22(2))</summary>
                  <ActionForm action={saveSmoAction.bind(null, fileId)} className="mt-3 space-y-4">
                    <Field label="Senior managing officials (one per line: name, position)" name="officials">
                      <textarea name="officials" rows={3} className={area} aria-label="Senior managing officials" defaultValue={smo?.officials.map((o) => `${o.name}, ${o.position}`).join("\n")} />
                    </Field>
                    <Field label="Steps taken to identify a beneficial owner" name="stepsTaken">
                      <textarea name="stepsTaken" rows={3} className={area} aria-label="Steps taken" defaultValue={smo?.stepsTaken} />
                    </Field>
                    <Submit variant="secondary">Record</Submit>
                  </ActionForm>
                </details>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Screening (sanctions, PEP)">
        <p className="text-xs text-muted">
          Every person and company in the structure is screened. Screening can&apos;t be reduced for low-risk clients. The PEP/RCA data provider is
          not connected yet; record known PEP status on the client data.
        </p>
        {pending.map((x) => {
          const m = x.matchData as { matchedName: string; score: number; reasons: string[]; reference?: string };
          return (
            <div key={x.id} className="space-y-2 rounded border border-amber-400 p-3 text-sm">
              <p>
                <strong>Possible match</strong> for {cf.tree.parties.get(x.partyId)?.displayName}: &quot;{m.matchedName}&quot; on {x.listName} (version {x.listVersion}){m.reference ? `, ref. ${m.reference}` : ""}
              </p>
              <ul className="list-disc pl-5 text-muted">{m.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
              {can(r, "client.edit") && (
                <ActionForm action={decideMatchAction.bind(null, fileId, x.id)} className="space-y-2">
                  <div className="flex gap-4">
                    <label className="flex items-center gap-1"><input type="radio" name="decision" value="FALSE_POSITIVE" defaultChecked /> False positive</label>
                    <label className="flex items-center gap-1"><input type="radio" name="decision" value="TRUE_MATCH" /> True match</label>
                  </div>
                  <Field label="Reason for your decision" name="comment" required />
                  <Submit variant="secondary">Record decision</Submit>
                </ActionForm>
              )}
            </div>
          );
        })}
        <ul className="text-sm">
          {[...latestChecks.values()].map((x) => (
            <li key={x.id} className="text-muted">
              {cf.tree.parties.get(x.partyId)?.displayName}: {x.listName} v{x.listVersion} · {x.screenedAt.toISOString().slice(0, 16).replace("T", " ")} ·{" "}
              {x.decision === "NO_MATCH" ? "no match" : x.decision.toLowerCase().replace("_", " ")}
            </li>
          ))}
          {latestChecks.size === 0 && <li className="text-muted">No screening lists are loaded. Ask AMLSyncAI to load the EU and UN lists, or upload your national list.</li>}
        </ul>
        {decidedHits.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">Decided matches ({decidedHits.length})</summary>
            <ul>{decidedHits.map((x) => <li key={x.id}>{(x.matchData as { matchedName: string }).matchedName} — {x.decision === "TRUE_MATCH" ? "true match" : "false positive"}: {x.comment}</li>)}</ul>
          </details>
        )}
        {can(r, "client.edit") && <ActionButton action={rescreenAction.bind(null, fileId)}>Screen again now</ActionButton>}
      </Card>

      <Card title={`Risk: ${cf.risk.level} (score ${cf.risk.score})`}>
        {cf.risk.factors.length ? (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {cf.risk.factors.map((f) => (
                <tr key={f.id}>
                  <td className="py-1 pr-4">{f.label}{f.forcesHigh ? " — requires EDD" : ""}</td>
                  <td className="py-1 pr-4 text-right">+{f.points}</td>
                  <td className="py-1 text-muted">{f.article ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted">No risk factors found in the data collected.</p>
        )}
        <p className="text-xs text-muted">
          Rule set {cf.risk.rulesetVersion} · Country Profile v{cf.profileVersion}. Low = SDD possible; High = EDD. Calculated from collected data; AI never sets a risk rating.
        </p>
        {lastRisk?.overrideReason && <p className="text-sm">Override to {lastRisk.final}: {lastRisk.overrideReason}</p>}
        {can(r, "risk.override") && (
          <details className="rounded border border-border p-3">
            <summary className="cursor-pointer text-sm font-medium">Override the risk level (Compliance Officer)</summary>
            <ActionForm action={riskOverrideAction.bind(null, fileId)} className="mt-3 space-y-3">
              <Field label="New level" name="level">
                <select name="level" className={sel} aria-label="New level" defaultValue="HIGH">
                  <option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option>
                </select>
              </Field>
              <Field label="Written reason" name="reason" required />
              <Submit variant="secondary">Override</Submit>
            </ActionForm>
          </details>
        )}
      </Card>

      {(cf.risk.eddRequired || cf.state.isPep) && (
        <Card title="Enhanced due diligence (Art. 34, 42)">
          {cf.risk.eddRequired && (
            <ActionForm action={eddChecklistAction.bind(null, fileId)} className="space-y-2">
              {EDD_CHECKLIST.map((i) => (
                <label key={i.id} className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name={`edd.${i.id}`} defaultChecked={checklist.has(i.id)} disabled={!edit} className="mt-1" /> {i.label}
                </label>
              ))}
              {edit && <Submit variant="secondary">Save checklist</Submit>}
            </ActionForm>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {cf.risk.eddRequired && (
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">Senior management approval (EDD)</h3>
                {cf.approvals.edd ? <p>Approved.</p> : can(r, "approve.management") ? (
                  <ActionForm action={seniorApprovalAction.bind(null, fileId, "edd")}>
                    <Field label="Reasons" name="reason" required />
                    <Submit variant="secondary">Approve</Submit>
                    <StepUpLink />
                  </ActionForm>
                ) : <p className="text-muted">Needs an Owner (management body).</p>}
              </div>
            )}
            {cf.state.isPep && (
              <div className="space-y-2 text-sm">
                <h3 className="font-semibold">PEP: approval to establish or continue</h3>
                {cf.approvals.pep ? <p>Approved.</p> : can(r, "approve.management") ? (
                  <ActionForm action={seniorApprovalAction.bind(null, fileId, "pep")}>
                    <Field label="Reasons, incl. source of wealth and funds" name="reason" required />
                    <Submit variant="secondary">Approve PEP relationship</Submit>
                    <StepUpLink />
                  </ActionForm>
                ) : <p className="text-muted">Needs an Owner (management body).</p>}
              </div>
            )}
          </div>
        </Card>
      )}

      {!decided && can(r, "client.accept") && (
        <Card title="Decision">
          <div className="grid gap-6 sm:grid-cols-2">
            <ActionForm action={acceptAction.bind(null, fileId)} className="space-y-3">
              <h3 className="text-sm font-semibold">Accept the client</h3>
              {cf.risk.sddEligible && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="sdd" className="mt-1" /> Apply simplified due diligence: verification may be completed within 60 days (Art. 33)
                </label>
              )}
              {can(r, "gate.override") && items.length > 0 && (
                <Field label="Override open items — written reason (Compliance Officer only)" name="overrideReason" hint="Sanctions, anonymity and bearer shares can never be overridden." />
              )}
              <Submit>Accept client</Submit>
              <StepUpLink />
            </ActionForm>
            <ActionForm action={endAction.bind(null, fileId)} className="space-y-3">
              <h3 className="text-sm font-semibold">Refuse (CDD can&apos;t be completed, Art. 21)</h3>
              <input type="hidden" name="kind" value="REFUSED" />
              <Field label="Reason" name="reason" required />
              <fieldset className="space-y-1 text-sm">
                <legend className="font-medium">Is there a suspicion of money laundering or terrorist financing?</legend>
                <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="none" /> No — record the assessment</label>
                <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="raise" /> Yes — report internally to the Compliance Officer</label>
              </fieldset>
              <Submit variant="danger">Refuse client</Submit>
              <StepUpLink />
            </ActionForm>
          </div>
        </Card>
      )}

      {decided && cf.file.status !== "REFUSED" && cf.file.status !== "TERMINATED" && can(r, "client.accept") && (
        <Card title="End the relationship">
          <ActionForm action={endAction.bind(null, fileId)} className="max-w-xl space-y-3">
            <input type="hidden" name="kind" value="TERMINATED" />
            <Field label="Reason" name="reason" required hint="e.g. engagement ended, or CDD could no longer be kept up to date." />
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Is there a suspicion?</legend>
              <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="none" /> No</label>
              <label className="flex items-center gap-2"><input type="radio" name="suspicion" value="raise" /> Yes — report internally</label>
            </fieldset>
            <Submit variant="danger">End relationship</Submit>
            <StepUpLink />
          </ActionForm>
        </Card>
      )}

      {can(r, "case.raise") && <RaiseSuspicion action={raiseSuspicionAction.bind(null, { partyIds: [cf.party.id], matterIds: [] })} />}

      {approvals.length > 0 && (
        <Card title="Decisions and approvals">
          <ul className="text-sm">
            {approvals.map((a) => (
              <li key={a.id}>
                {a.createdAt.toISOString().slice(0, 16).replace("T", " ")} · {a.objectType.replace("CddFile:", "")} · {a.user.name} ({a.role.toLowerCase().replace("_", " ")})
                {a.reason ? ` — ${a.reason}` : ""} <span className="text-muted">· EU Core {a.euCoreVersion}, Country Profile v{a.countryProfileVersion}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
