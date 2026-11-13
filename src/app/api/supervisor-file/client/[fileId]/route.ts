import { NextResponse } from "next/server";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { clientSupervisorFile } from "@/lib/server/supervisor-file";
import { afterExport, guardExport, watermarkFor } from "@/lib/server/export-guard";

export async function GET(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const s = await guardExport(req, `/app/clients/${fileId}`);
  if (s instanceof NextResponse) return s;
  const out = await withTenant(s.firm.id, async (tx) => {
    if (!(await tx.cddFile.findUnique({ where: { id: fileId } }))) return null;
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "CddFile", objectId: fileId, fields: ["supervisor-file"] });
    return clientSupervisorFile(tx, s.firm.id, fileId, watermarkFor(s));
  });
  if (!out) return new NextResponse("Not found", { status: 404 });
  await afterExport(s, "a client supervisor file");
  return new NextResponse(new Uint8Array(out.zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${out.name}"`, "Cache-Control": "private, no-store" } });
}
