"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { cancelImport, confirmImport, previewImport, readTable, undoImport } from "@/lib/server/tx-import";
import { MAX_BYTES } from "@/lib/transactions/format";

export async function uploadTransactionsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a .csv or .xlsx file." };
  if (file.size > MAX_BYTES) return { error: "The file is larger than 5 MB. Split it into smaller files." };
  const table = await readTable(file.name, new Uint8Array(await file.arrayBuffer()));
  if ("error" in table) return { error: table.error };
  const r = await previewImport({ firmId: s.firm.id, userId: s.user.id }, file.name, table);
  if ("error" in r) return { error: r.error };
  redirect(`/app/transactions/import/${r.batchId}`);
}

export async function confirmImportAction(batchId: string): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const r = await confirmImport({ firmId: s.firm.id, userId: s.user.id }, batchId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/app/transactions");
  redirect(`/app/transactions/import/${batchId}`);
}

export async function cancelImportAction(batchId: string): Promise<ActionState> {
  const s = await requireUser("client.edit");
  await cancelImport({ firmId: s.firm.id, userId: s.user.id }, batchId);
  redirect("/app/transactions/import?cancelled=1");
}

export async function undoImportAction(batchId: string): Promise<ActionState> {
  const s = await requireUser("approve.compliance");
  const r = await undoImport({ firmId: s.firm.id, userId: s.user.id }, batchId);
  if ("error" in r) return { error: r.error };
  revalidatePath("/app/transactions");
  return { message: `Import undone: ${r.removed} transaction(s) removed.` };
}
