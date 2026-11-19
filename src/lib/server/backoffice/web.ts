import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/** Origins allowed to send page views and leads: the website and the app itself. */
export const WEB_ORIGINS = ["https://amlsync.com", "https://www.amlsync.com"];

export function allowedOrigin(req: NextRequest): string | null {
  const o = req.headers.get("origin");
  if (!o) return null;
  const app = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
  return WEB_ORIGINS.includes(o) || o === app ? o : null;
}

export function cors(res: NextResponse, origin: string | null) {
  if (origin) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "content-type");
    res.headers.set("Access-Control-Max-Age", "86400");
  }
  return res;
}

export function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "0.0.0.0";
}

/** Daily-rotating visitor id: no cookie, no stored IP (consent-exempt audience measurement). */
export function visitorId(ip: string, ua: string, day = new Date().toISOString().slice(0, 10)): string {
  const salt = createHash("sha256").update(`${process.env.MASTER_KEY ?? "dev"}|web|${day}`).digest("hex");
  return createHash("sha256").update(`${salt}|${ip}|${ua}`).digest("hex").slice(0, 20);
}

export async function readJson(req: NextRequest, max = 8_000): Promise<Record<string, unknown> | null> {
  const t = await req.text();
  if (t.length > max) return null;
  try { const j = JSON.parse(t); return j && typeof j === "object" ? j : null; } catch { return null; }
}

export const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
