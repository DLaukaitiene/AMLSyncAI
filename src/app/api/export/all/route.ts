import { NextResponse } from "next/server";
import { zipSync } from "fflate";
import { withTenant } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import { clientSupervisorFile, firmSupervisorFile } from "@/lib/server/supervisor-file";
import { afterExport, guardExport, watermarkFor } from "@/lib/server/export-guard";

export const maxDuration = 300;

/**
 * Full export (competitor review, recommendation 6): the firm file and every
 * client's file with its documents, in one ZIP. Works while active and in the
 * read-only archive after cancellation. Owner / Compliance Officer, fresh 2FA.
 */
export async function GET(req: Request) {
  const s = await guardExport(req, "/app/billing");
  if (s instanceof NextResponse) return s;
  const wm = watermarkFor(s);
  const files: Record<string, Uint8Array> = {};
  await withTenant(s.firm.id, async (tx) => {
    const firm = await firmSupervisorFile(tx, s.firm.id, wm);
    files[`firm/${firm.name}`] = firm.zip;
    const clientFiles = await tx.cddFile.findMany({ where: { role: "CLIENT" }, include: { party: { select: { displayName: true } } }, orderBy: { createdAt: "asc" } });
    for (const f of clientFiles) {
      const c = await clientSupervisorFile(tx, s.firm.id, f.id, wm);
      const safe = f.party.displayName.normalize("NFKD").replace(/[^\w.-]+/g, "_").slice(0, 60);
      files[`clients/${safe}-${f.id.slice(0, 8)}.zip`] = c.zip;
    }
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "export", objectType: "Firm", objectId: s.firm.id, fields: ["full-export", String(clientFiles.length)] });
  }, { timeoutMs: 240_000 });
  await afterExport(s, "the full export (firm and all client files)");
  const zip = zipSync(files, { level: 0 }); // contents are already compressed
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="amlsync-export-${date}.zip"`, "Cache-Control": "private, no-store" } });
}
