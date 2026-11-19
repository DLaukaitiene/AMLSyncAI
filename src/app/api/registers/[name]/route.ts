import { NextResponse } from "next/server";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { afterExport, guardExport } from "@/lib/server/export-guard";
import { buildRegister, REGISTERS, toCsv, type RegisterId } from "@/lib/server/registers";

/** CSV export of one register (Reports page). Owner / Compliance Officer, fresh 2FA. */
export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const reg = REGISTERS.find((r) => r.id === name);
  if (!reg) return new NextResponse("Not found", { status: 404 });
  const s = await guardExport(req, reg.id === "clients" ? "/app/clients" : "/app/registers");
  if (s instanceof NextResponse) return s;
  const rows = await withTenant(s.firm.id, async (tx) => {
    const only = reg.id === "clients" ? new URL(req.url).searchParams.getAll("id").filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 500) : undefined;
    const r = await buildRegister(tx, reg.id as RegisterId, only);
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "Register", objectId: s.firm.id, fields: [reg.id, String(r.length - 1)] });
    return r;
  }, { timeoutMs: 60_000 });
  await afterExport(s, `the ${reg.title}`);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${reg.id}-register-${date}.csv"`, "Cache-Control": "private, no-store" },
  });
}
