import { NextResponse } from "next/server";
import { issueChallenge } from "@/lib/server/pow";
import { hit } from "@/lib/server/rate-limit";
import { requestMeta } from "@/lib/server/session";
import type { PowPurpose } from "@/lib/security/pow";

const PURPOSES: PowPurpose[] = ["signup", "login", "reset", "recover", "invite"];

export async function GET(req: Request) {
  const purpose = new URL(req.url).searchParams.get("purpose") as PowPurpose;
  if (!PURPOSES.includes(purpose)) return NextResponse.json({ error: "bad purpose" }, { status: 400 });
  const { ip } = await requestMeta();
  if (!(await hit(`challenge:${ip}`, { limit: 120, windowSec: 600 }))) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  return NextResponse.json({ token: await issueChallenge(purpose, ip) }, { headers: { "Cache-Control": "no-store" } });
}
