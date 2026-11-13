"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { importList, rescreenFirm } from "@/lib/server/screening-lists";
import { parseAmlSyncList, ListFormatError } from "@/lib/screening/csv";

const MAX_BYTES = 10 * 1024 * 1024;

export async function uploadListAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("countryProfile.edit");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/app/settings/screening-lists" } };
  const file = fd.get("file");
  const name = String(fd.get("name") ?? "").trim();
  const kind = fd.get("kind") === "PEP" ? "PEP" : "SANCTIONS";
  if (!name) return { error: "Name the list.", fieldErrors: { name: ["e.g. LT national sanctions list"] } };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > MAX_BYTES) return { error: "The file is larger than 10 MB." };
  if (!/\.(csv|txt)$/i.test(file.name)) return { error: "Upload a .csv file." };
  let entries;
  try {
    entries = parseAmlSyncList(await file.text());
  } catch (e) {
    if (e instanceof ListFormatError) return { error: e.message };
    throw e;
  }
  const version = new Date().toISOString().slice(0, 19).replace("T", " ");
  await withTenant(s.firm.id, async (tx) => {
    const list = await importList(tx, { firmId: s.firm.id, kind, name, version, entries });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "ScreeningList", objectId: list.id, fields: ["entries"] });
  });
  const r = await rescreenFirm(s.firm.id);
  revalidatePath("/app/settings/screening-lists");
  return { message: `Loaded ${entries.length} entries. All active clients were re-screened: ${r.newHits} new possible match(es).` };
}
