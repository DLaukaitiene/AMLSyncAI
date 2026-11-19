import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/server/db";
import { hit } from "@/lib/server/rate-limit";
import { allowedOrigin, clientIp, cors, readJson, str, visitorId, WEB_ORIGINS } from "@/lib/server/backoffice/web";
import { classifyUa, cleanPath, referrerHost } from "@/lib/backoffice/web";

/** Page-view beacon from amlsync.com and the app's public pages (Backoffice §7.5). */
export async function OPTIONS(req: NextRequest) {
  return cors(new NextResponse(null, { status: 204 }), allowedOrigin(req));
}

export async function POST(req: NextRequest) {
  const origin = allowedOrigin(req);
  const done = () => cors(new NextResponse(null, { status: 204 }), origin);
  if (!origin || req.headers.get("dnt") === "1" || req.headers.get("sec-gpc") === "1") return done();
  const j = await readJson(req, 2_000);
  if (!j) return done();
  const ua = req.headers.get("user-agent") ?? "";
  const visitor = visitorId(clientIp(req), ua);
  if (!(await hit(`web:${visitor}`, { limit: 120, windowSec: 3600 }))) return done();
  const info = classifyUa(ua);
  const name = str(j.name, 40) || null;
  await adminDb.webEvent.create({
    data: {
      site: WEB_ORIGINS.includes(origin) ? "web" : "app",
      kind: name ? "event" : "pageview", name,
      path: cleanPath(str(j.path, 300)), referrer: referrerHost(str(j.ref, 500)),
      utmSource: str(j.us, 60) || null, utmMedium: str(j.um, 60) || null, utmCampaign: str(j.uc, 80) || null,
      country: (req.headers.get("x-vercel-ip-country") ?? "").slice(0, 2).toUpperCase() || null,
      device: info.device, browser: info.browser, lang: str(j.lang, 10) || null, visitor, bot: info.bot,
    },
  });
  return done();
}
