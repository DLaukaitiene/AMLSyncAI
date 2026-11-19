import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { misuseSignals } from "@/lib/server/backoffice/metrics";
import { Badge, fmtDateTime, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { SPIKE_FACTOR, SPIKE_MIN } from "@/lib/backoffice/misuse";

const DAY = 86_400_000;
const BOT = ["bot-block", "bot-challenge-failed", "rate-limit"];

export default async function AbusePage() {
  await requireAdmin("abuse.view");
  const d7 = new Date(Date.now() - 7 * DAY);
  const [byKind, byDay, ips, signupsStarted, signupsConfirmed, limits, unusual, misuse] = await Promise.all([
    adminDb.securityEvent.groupBy({ by: ["kind"], where: { kind: { in: BOT }, at: { gte: d7 } }, _count: true }),
    adminDb.$queryRaw<{ day: Date; n: bigint }[]>`SELECT date_trunc('day', at) AS day, count(*) AS n FROM "SecurityEvent" WHERE kind = ANY(${BOT}) AND at >= ${d7} GROUP BY 1 ORDER BY 1`,
    adminDb.securityEvent.groupBy({ by: ["ip"], where: { kind: { in: BOT }, at: { gte: d7 }, ip: { not: null } }, _count: true, orderBy: { _count: { ip: "desc" } }, take: 10 }),
    adminDb.securityEvent.count({ where: { kind: "signup-started", at: { gte: d7 } } }),
    adminDb.securityEvent.count({ where: { kind: "signup-confirmed", at: { gte: d7 } } }),
    adminDb.securityEvent.findMany({ where: { kind: { startsWith: "screening-limit-" }, at: { gte: d7 } }, orderBy: { at: "desc" }, take: 50, select: { at: true, kind: true, firmId: true } }),
    adminDb.securityEvent.findMany({ where: { kind: "screening-unusual-volume", at: { gte: d7 } }, orderBy: { at: "desc" }, take: 50, select: { at: true, firmId: true } }),
    misuseSignals(),
  ]);
  const firmIds = [...new Set([...limits, ...unusual].map((x) => x.firmId).filter(Boolean))] as string[];
  const names = new Map((await adminDb.firm.findMany({ where: { id: { in: firmIds } }, select: { id: true, name: true } })).map((f) => [f.id, f.name]));
  const firm = (id: string | null) => (id ? <Link href={`/adminpage1&/firms/${id}`} className="underline">{names.get(id) ?? id}</Link> : "—");
  const k = (n: string) => byKind.find((x) => x.kind === n)?._count ?? 0;
  return (
    <Page title="Bots and abuse" intro="Bot defences in the app (proof-of-work challenge, honeypot, rate limits), fake sign-ups and misuse of checks. Cloudflare bot scores, AI-crawler traffic and WAF events need the Cloudflare integration (not connected).">
      <Tiles>
        <Tile label="Bot blocks (7 d)" value={k("bot-block")} sub="honeypot / scripted forms" />
        <Tile label="Challenges failed (7 d)" value={k("bot-challenge-failed")} />
        <Tile label="Rate-limit blocks (7 d)" value={k("rate-limit")} />
        <Tile label="Sign-ups started → confirmed (7 d)" value={`${signupsStarted} → ${signupsConfirmed}`} sub="Unconfirmed sign-ups are often fake" />
      </Tiles>
      <Section title="Misuse of checks (§11.3)" note={`Rules: today's checks > ${SPIKE_FACTOR}× the 30-day daily median (min ${SPIKE_MIN}); ≥ ${SPIKE_MIN} checks within 3 days of sign-up; many checks with few client files. Review: no issue / ask the firm / suspend / terminate under the Terms.`}>
        <Table testId="misuse" head={["Firm", "Signals"]} rows={misuse.map((m) => [firm(m.firmId), <ul key="f" className="text-xs">{m.flags.map((f) => <li key={f.rule}><Badge tone="warn">{f.rule}</Badge> {f.detail}</li>)}</ul>])} empty="No firm matches a misuse rule." />
      </Section>
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Blocks per day"><Table head={["Day", "Blocks"]} rows={byDay.map((r) => [r.day.toISOString().slice(0, 10), Number(r.n)])} empty="None." /></Section>
        <Section title="Top blocked IPs (7 d)"><Table head={["IP", "Blocks"]} rows={ips.map((r) => [r.ip ?? "—", r._count])} empty="None." /></Section>
        <Section title="Screening limits reached (7 d)"><Table head={["When", "Firm", "Limit"]} rows={[...limits.map((l) => [fmtDateTime(l.at), firm(l.firmId), l.kind.replace("screening-limit-", "")]), ...unusual.map((u) => [fmtDateTime(u.at), firm(u.firmId), "unusual volume"])]} empty="None." /></Section>
      </div>
    </Page>
  );
}
