import { NextResponse, type NextRequest } from "next/server";
import { saveWebsiteLead } from "@/lib/server/website-lead";
import { hit } from "@/lib/server/rate-limit";
import { allowedOrigin, clientIp, cors, readJson, str, visitorId } from "@/lib/server/backoffice/web";

/**
 * Website contact form → lead (§7.3). The form still sends its email through
 * Web3Forms; this keeps a copy as a lead in AMLSync's own database instead of a CRM.
 */
export async function OPTIONS(req: NextRequest) {
  return cors(new NextResponse(null, { status: 204 }), allowedOrigin(req));
}

export async function POST(req: NextRequest) {
  const origin = allowedOrigin(req);
  const reply = (status: number) => cors(new NextResponse(null, { status }), origin);
  if (!origin) return reply(403);
  const j = await readJson(req);
  if (!j || j.botcheck) return reply(204);
  const visitor = visitorId(clientIp(req), req.headers.get("user-agent") ?? "");
  if (!(await hit(`lead:${visitor}`, { limit: 5, windowSec: 3600 }))) return reply(429);
  const email = str(j.email, 200).toLowerCase();
  const name = str(j.name, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) return reply(400);
  const data = { name, company: str(j.company, 160) || null, need: str(j.need, 80) || null, message: str(j.message, 4000) || null, visitor, country: (req.headers.get("x-vercel-ip-country") ?? "").slice(0, 2).toUpperCase() || null };
  await saveWebsiteLead({ ...data, email });
  return reply(204);
}
