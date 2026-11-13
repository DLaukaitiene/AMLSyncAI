import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { readBlob } from "@/lib/server/storage";
import { audit } from "@/lib/server/audit";
import { safeFileName } from "@/lib/files/validate";
import { can } from "@/lib/auth/permissions";

/** Serves a document to signed-in staff of the owning firm only; never a file that isn't scanned clean. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE" || !can(s.user.roles, "client.view")) return new NextResponse("Not found", { status: 404 });
  const doc = await withTenant(s.firm.id, async (tx) => {
    const d = await tx.document.findUnique({ where: { id } });
    if (d) await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "view", objectType: "Document", objectId: d.id });
    return d;
  });
  if (!doc) return new NextResponse("Not found", { status: 404 });
  if (doc.malwareScan !== "clean") return new NextResponse("This file has not passed the malware scan.", { status: 423 });
  const bytes = await readBlob(s.firm.id, doc.storageKey);
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${safeFileName(doc.fileName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
