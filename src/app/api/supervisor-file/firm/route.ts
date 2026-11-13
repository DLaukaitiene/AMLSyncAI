import { NextResponse } from "next/server";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { firmSupervisorFile } from "@/lib/server/supervisor-file";
import { afterExport, guardExport, watermarkFor } from "@/lib/server/export-guard";

export async function GET(req: Request) {
  const s = await guardExport(req, "/app/firm");
  if (s instanceof NextResponse) return s;
  const out = await withTenant(s.firm.id, async (tx) => {
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "Firm", objectId: s.firm.id, fields: ["supervisor-file"] });
    return firmSupervisorFile(tx, s.firm.id, watermarkFor(s));
  });
  await afterExport(s, "the firm supervisor file");
  return new NextResponse(new Uint8Array(out.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${out.name}"`, "Cache-Control": "private, no-store" } });
}
