import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Table, Tile, Tiles } from "@/components/admin";

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("tickets.manage");
  const sp = await searchParams;
  const status = sp.status ?? "active";
  const now = new Date(), d30 = new Date(now.getTime() - 30 * 86_400_000);
  const [tickets, closed30] = await Promise.all([
    adminDb.ticket.findMany({ where: status === "active" ? { status: { in: ["open", "waiting-customer"] } } : status === "all" ? {} : { status }, orderBy: [{ slaDueAt: "asc" }], take: 200 }),
    adminDb.ticket.findMany({ where: { createdAt: { gte: d30 } }, select: { createdAt: true, firstResponseAt: true, slaDueAt: true, csat: true } }),
  ]);
  const firms = new Map((await adminDb.firm.findMany({ where: { id: { in: tickets.map((t) => t.firmId) } }, select: { id: true, name: true, plan: true } })).map((f) => [f.id, f]));
  const responded = closed30.filter((t) => t.firstResponseAt);
  const inSla = responded.filter((t) => t.firstResponseAt! <= t.slaDueAt).length;
  const rated = closed30.filter((t) => t.csat);
  const median = (xs: number[]) => (xs.length ? xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
  const breached = tickets.filter((t) => !t.firstResponseAt && t.slaDueAt < now && t.status === "open").length;
  return (
    <Page title="Support tickets" intro="Requests firms raise under Help & support. First-response targets: P1 1 hour, P2 4 hours, P3 next business day.">
      <Tiles>
        <Tile label="Waiting for us" value={tickets.filter((t) => t.status === "open").length} sub={`${breached} past first-response target`} tone={breached ? "bad" : "ok"} />
        <Tile label="First response in SLA (30 d)" value={responded.length ? `${Math.round((100 * inSla) / responded.length)}%` : "—"} />
        <Tile label="Median first response (30 d)" value={responded.length ? `${Math.round(median(responded.map((t) => (t.firstResponseAt!.getTime() - t.createdAt.getTime()) / 60_000)))} min` : "—"} />
        <Tile label="CSAT (30 d)" value={rated.length ? (rated.reduce((s, t) => s + t.csat!, 0) / rated.length).toFixed(1) : "—"} sub={`${rated.length} rating(s)`} />
      </Tiles>
      <nav className="flex gap-2 text-sm">{["active", "resolved", "closed", "all"].map((s) => <Link key={s} href={`/adminpage1&/tickets?status=${s}`} className={`rounded border px-2 py-1 ${status === s ? "border-accent" : "border-border"}`}>{s}</Link>)}</nav>
      <Table testId="ticket-list" head={["#", "Subject", "Firm", "Priority", "Status", "First response due", "Opened"]} rows={tickets.map((t) => [
        t.number, <Link key="s" href={`/adminpage1&/tickets/${t.id}`} className="text-accent underline">{t.subject}</Link>, firms.get(t.firmId)?.name ?? "—",
        <Badge key="p" tone={t.priority === "P1" ? "bad" : t.priority === "P2" ? "warn" : "neutral"}>{t.priority}</Badge>, t.status,
        t.firstResponseAt ? "answered" : <Badge key="d" tone={t.slaDueAt < now ? "bad" : "neutral"}>{fmtDateTime(t.slaDueAt)}</Badge>, fmtDateTime(t.createdAt),
      ])} empty="No tickets." />
    </Page>
  );
}
