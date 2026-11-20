"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createIdvSession, DiditError } from "@/lib/server/didit";
import type { ActionState } from "@/components/form";
import { requestMeta } from "@/lib/server/session";
import { confirmNoChange, portalContext, portalLegalSchema, portalNaturalSchema, saveDraft, sendPortalCode, submitPortal, verifyPortalCode } from "@/lib/server/portal";
import { withTenant } from "@/lib/server/db";
import { storeDocument } from "@/lib/server/storage";
import { formToObject, zodErrors } from "@/lib/server/form";
import { parseCompanyPeople, type DeclaredPerson } from "@/lib/portal/people";

const PORTAL_KINDS = ["id", "proof-of-address", "company-extract", "articles", "shareholder-register", "sof-evidence", "sow-evidence", "power-of-attorney", "other"];

export async function requestCodeAction(token: string): Promise<ActionState> {
  const { ip } = await requestMeta();
  const r = await sendPortalCode(token, ip);
  return r.ok ? { message: "We've sent a 6-digit code to your email. It expires in 10 minutes." } : { error: r.error };
}

export async function verifyCodeAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const { ip } = await requestMeta();
  const r = await verifyPortalCode(token, String(fd.get("code") ?? ""), ip);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/p/${token}`);
  return { message: "Verified." };
}

function readAnswers(fd: FormData, kind: string) {
  const o = formToObject(fd);
  return kind === "NATURAL" ? portalNaturalSchema.safeParse(o) : portalLegalSchema.safeParse(o);
}

export async function saveAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await portalContext(token);
  if (!ctx) return { error: "Your session has ended. Reload the page and request a new code." };
  const intent = fd.get("intent");
  if (intent !== "submit") {
    await saveDraft(token, formToObject(fd));
    return { message: "Saved. You can come back to this page until the link expires." };
  }
  const parsed = readAnswers(fd, ctx.party.kind);
  if (!parsed.success) return zodErrors(parsed.error);
  let people: DeclaredPerson[] | undefined;
  if (ctx.party.kind !== "NATURAL") {
    const pr = parseCompanyPeople(formToObject(fd));
    if (!pr.ok) return { error: "Check the people you listed.", fieldErrors: pr.fieldErrors };
    people = pr.people;
  }
  const signature = String(fd.get("signature") ?? "").trim();
  if (fd.get("confirm") !== "on" || signature.length < 3) {
    return { error: "Confirm the declaration and type your full name to sign.", fieldErrors: { signature: ["Type your full name."] } };
  }
  const { ip } = await requestMeta();
  const r = await submitPortal(token, parsed.data, { confirm: true, signature }, ip, people);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/p/${token}`);
  return { message: "Submitted." };
}

export async function uploadAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const ctx = await portalContext(token);
  if (!ctx || ctx.link.status === "SUBMITTED") return { error: "Your session has ended. Reload the page and request a new code." };
  const kind = String(fd.get("kind"));
  const file = fd.get("file");
  if (!PORTAL_KINDS.includes(kind)) return { error: "Choose what the document is." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  // Companies: whose ID or proof of address this is goes into the file name, so staff can match it to the person.
  const whose = String(fd.get("whose") ?? "").trim().replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 80);
  const fileName = whose && (kind === "id" || kind === "proof-of-address") ? `${whose} – ${file.name}` : file.name;
  const r = await withTenant(ctx.link.firmId, (tx) =>
    storeDocument(tx, { firmId: ctx.link.firmId, partyId: ctx.party.id, kind, fileName, bytes, uploadedBy: `portal:${ctx.link.id}` }),
  );
  if (!r.ok) return { error: r.error };
  revalidatePath(`/p/${token}`);
  return { message: "Uploaded." };
}

export async function noChangeAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const signature = String(fd.get("signature") ?? "").trim();
  if (fd.get("confirm") !== "on" || signature.length < 3) return { error: "Tick the box and type your full name to confirm.", fieldErrors: { signature: ["Type your full name."] } };
  const { ip } = await requestMeta();
  const r = await confirmNoChange(token, signature, ip);
  if (!r.ok) return { error: r.error };
  revalidatePath(`/p/${token}`);
  return { message: "Confirmed." };
}

/** Starts the Didit identity check from the portal (the firm pays; the client is never charged). */
export async function startIdvAction(token: string): Promise<ActionState> {
  const ctx = await portalContext(token);
  if (!ctx || ctx.link.status === "SUBMITTED") return { error: "Your session has ended. Reload the page and request a new code." };
  if (ctx.party.kind !== "NATURAL") return { error: "Identity checks are for people." };
  let url: string;
  try {
    url = (await withTenant(ctx.link.firmId, (tx) => createIdvSession(tx, { firmId: ctx.link.firmId, userId: null }, ctx.link.cddFileId, "portal", `/p/${token}/didit`), { timeoutMs: 90_000 })).url;
  } catch (e) {
    return { error: e instanceof DiditError && /credit/.test(e.message) ? `${ctx.firmName} can't start the identity check right now. Please contact them.` : "The identity check isn't available right now. Try again later." };
  }
  redirect(url);
}
