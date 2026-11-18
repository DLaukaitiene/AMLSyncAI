import "server-only";
import { adminDb } from "../db";
import { leadScore } from "@/lib/backoffice/ops";

const domainOf = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

/** Leads with score, page views and the firm they became (matched by email domain). */
export async function listLeads(filter: { stage?: string; q?: string }) {
  const q = filter.q?.trim();
  const leads = await adminDb.lead.findMany({
    where: { ...(filter.stage ? { stage: filter.stage } : {}), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q.toLowerCase() } }, { company: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { createdAt: "desc" }, take: 300,
  });
  const domains = [...new Set(leads.map((l) => domainOf(l.email)))];
  const [firms, views] = await Promise.all([
    adminDb.firm.findMany({ where: { emailDomain: { in: domains } }, select: { id: true, name: true, emailDomain: true, status: true, trialEndsOn: true } }),
    adminDb.webEvent.groupBy({ by: ["visitor"], where: { visitor: { in: leads.map((l) => l.visitor).filter(Boolean) as string[] }, kind: "pageview" }, _count: true }),
  ]);
  const firmBy = new Map(firms.map((f) => [f.emailDomain, f]));
  const viewsBy = new Map(views.map((v) => [v.visitor, v._count]));
  const today = new Date().toISOString().slice(0, 10);
  return leads.map((l) => {
    const firm = firmBy.get(domainOf(l.email)) ?? null;
    const derived = firm && l.stage !== "lost" ? (firm.trialEndsOn && firm.trialEndsOn >= today ? "trial" : "customer") : null;
    const stage = derived && ["new", "contacted", "demo", "trial"].includes(l.stage) ? derived : l.stage;
    const pageviews = l.visitor ? viewsBy.get(l.visitor) ?? 0 : 0;
    return { ...l, stage, firm, pageviews, ...leadScore({ ...l, stage, pageviews }) };
  });
}

/** Sign-ups whose confirmation link was never used and whose domain has no firm (§7.4 drop-off). */
export async function unfinishedSignups() {
  const tokens = await adminDb.emailToken.findMany({ where: { purpose: "signup-confirm", usedAt: null }, orderBy: { createdAt: "desc" }, take: 100, select: { email: true, createdAt: true, expiresAt: true, data: true } });
  const known = new Set((await adminDb.lead.findMany({ where: { email: { in: tokens.map((t) => t.email) } }, select: { email: true } })).map((l) => l.email));
  const firms = new Set((await adminDb.firm.findMany({ where: { emailDomain: { in: tokens.map((t) => domainOf(t.email)) } }, select: { emailDomain: true } })).map((f) => f.emailDomain));
  const seen = new Set<string>();
  return tokens.filter((t) => !known.has(t.email) && !firms.has(domainOf(t.email)) && !seen.has(t.email) && seen.add(t.email)).map((t) => {
    // Only these fields leave this function (the token data also holds a password hash).
    const d = t.data as { companyName?: string; name?: string; memberState?: string } | null;
    return { email: t.email, name: d?.name ?? "", company: d?.companyName ?? "", country: d?.memberState ?? null, createdAt: t.createdAt, expired: t.expiresAt < new Date() };
  });
}
