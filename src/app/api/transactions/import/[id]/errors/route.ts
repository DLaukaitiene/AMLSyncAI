import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { errorCsv, type PreviewRow } from "@/lib/server/tx-import";

/** The rows of an import that were not saved (errors and duplicates), with an "error" column. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const batch = await withTenant(s.firm.id, (tx) => tx.txImportBatch.findUnique({ where: { id } }));
  if (!batch) return new NextResponse("Not found", { status: 404 });
  return new NextResponse("﻿" + errorCsv(batch.rows as unknown as PreviewRow[]), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="import-errors-${id.slice(0, 8)}.csv"`, "Cache-Control": "private, no-store" } });
}
