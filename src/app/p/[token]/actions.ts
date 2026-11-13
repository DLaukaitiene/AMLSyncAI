"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requestMeta } from "@/lib/server/session";
import { portalContext, portalLegalSchema, portalNaturalSchema, saveDraft, sendPortalCode, submitPortal, verifyPortalCode } from "@/lib/server/portal";
import { withTenant } from "@/lib/server/db";
import { storeDocument } from "@/lib/server/storage";
import { formToObject, zodErrors } from "@/lib/server/form";

const PORTAL_KINDS = ["id", "proof-of-address", "company-extract", "sof-evidence", "sow-evidence", "power-of-attorney", "other"];

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
  return kind === "NATURAL" ? portalNaturalSchema.safeParse(o) : portalLegalSchema.safeParse({ ...o, noOwnerOver25: o.noOwnerOver25 === "on" });
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
  if (ctx.party.kind === "LEGAL") {
    const d = parsed.data as { owners: string; noOwnerOver25: boolean };
    if (!d.owners.trim() && !d.noOwnerOver25) return { error: "List the owners, or confirm that nobody owns 25% or more.", fieldErrors: { owners: ["Required."] } };
  }
  const signature = String(fd.get("signature") ?? "").trim();
  if (fd.get("confirm") !== "on" || signature.length < 3) {
    return { error: "Confirm the declaration and type your full name to sign.", fieldErrors: { signature: ["Type your full name."] } };
  }
  const { ip } = await requestMeta();
  const r = await submitPortal(token, parsed.data, { confirm: true, signature }, ip);
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
  const r = await withTenant(ctx.link.firmId, (tx) =>
    storeDocument(tx, { firmId: ctx.link.firmId, partyId: ctx.party.id, kind, fileName: file.name, bytes, uploadedBy: `portal:${ctx.link.id}` }),
  );
  if (!r.ok) return { error: r.error };
  revalidatePath(`/p/${token}`);
  return { message: "Uploaded." };
}
