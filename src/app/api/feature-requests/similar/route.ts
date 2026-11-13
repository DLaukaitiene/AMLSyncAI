import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { similarTitles } from "@/lib/server/feedback";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s || s.stage !== "ACTIVE") return NextResponse.json([], { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const rows = await similarTitles(q.slice(0, 150));
  return NextResponse.json(rows.map((r) => ({ id: r.id, title: r.title, status: r.status, votes: r._count.votes })));
}
