"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { FIRM_FOLDERS, storeDocument } from "@/lib/server/storage";

export async function uploadFirmDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const kind = String(fd.get("kind") ?? "");
  if (!FIRM_FOLDERS.some((f) => f.kind === kind)) return { error: "Choose the folder." };
  const files = fd.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { error: "Choose at least one file." };
  if (files.length > 10) return { error: "Up to 10 files at a time." };
  const results: string[] = [];
  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const r = await withTenant(s.firm.id, async (tx) => {
      const res = await storeDocument(tx, { firmId: s.firm.id, partyId: null, kind, fileName: file.name, bytes, uploadedBy: `staff:${s.user.id}` });
      if (res.ok) await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Document", objectId: res.documentId, fields: ["kind"] });
      return res;
    });
    results.push(r.ok ? `${file.name}: uploaded` : `${file.name}: ${r.error}`);
  }
  revalidatePath("/app/firm/documents");
  return { message: results.join(" · ") };
}
