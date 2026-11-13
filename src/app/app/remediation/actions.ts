"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser } from "@/lib/server/session";
import { importBackBook } from "@/lib/server/remediation";
import { parseBackBook } from "@/lib/remediation/import";

export async function importAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("client.edit");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file." };
  if (file.size > 10 * 1024 * 1024) return { error: "The file is larger than 10 MB." };
  const { rows, errors } = parseBackBook(await file.text());
  if (errors.length && fd.get("skipErrors") !== "on") {
    return { error: `${errors.length} row(s) have problems. Fix them, or tick "Import the valid rows and skip the others".`, data: { errors: errors.slice(0, 50) } };
  }
  if (!rows.length) return { error: "No valid rows to import." };
  const t = Date.now();
  const n = await importBackBook(s.firm.id, s.user.id, rows);
  revalidatePath("/app/remediation");
  return { message: `Imported ${n} client(s) in ${Math.round((Date.now() - t) / 1000)} s${errors.length ? `; skipped ${errors.length} row(s)` : ""}. Each was screened and risk-scored; work through the list from the top.` };
}
