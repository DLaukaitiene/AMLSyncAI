import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { todayData } from "@/lib/server/backoffice/dashboard";
import { Badge, bandTone, eur, fmtDateTime, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";

export default async function Today() {
  await requireAdmin("dashboard.view");
  const d = await todayData();
  const top = Math.max(1, ...d.funnel.map((f) => f.n));
  return (
    <Page title="Today" intro="What needs attention. Every number links to the records behind it.">
      <Section title="Alerts">
        {d.alerts.length ? (
          <ul className="space-y-1" data-testid="alerts">
            {d.alerts.map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone={a.severity}>{a.severity === "bad" ? "urgent" : "check"}</Badge>
                <Link href={a.href} className="text-accent underline">{a.label}</Link>
                <span className="text-xs text-muted">owner: {a.owner}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted" data-testid="alerts">No open alerts.</p>}
      </Section>

      <Tiles>
        <Tile label="Firms" value={d.firms.total} sub={`${d.firms.active} active · ${d.firms.trials} in trial · ${d.newToday.firms} new today`} href="/adminpage1&/firms" />
        <Tile label="MRR (subscriptions)" value={eur(d.revenue.mrrCents)} sub={`ARR ${eur(d.revenue.mrrCents * 12)}`} href="/adminpage1&/revenue" />
        <Tile label="Paid checks this month" value={d.revenue.paidChecksMonth} sub={`${eur(d.revenue.usageMonthCents)} usage revenue`} href="/adminpage1&/revenue" />
        <Tile label="Overdue invoices" value={d.revenue.overdueCount} sub={eur(d.revenue.overdueCents)} tone={d.revenue.overdueCount ? "warn" : "ok"} href="/adminpage1&/billing" />
        <Tile label="Failed sign-ins (24 h)" value={d.security.failed24} sub={`${d.security.locked} account(s) locked`} tone={d.security.failed24 > 50 ? "bad" : undefined} href="/adminpage1&/security" />
        <Tile label="Bot / rate-limit blocks (24 h)" value={d.security.bot24} href="/adminpage1&/abuse" />
        <Tile label="MFA adoption" value={`${d.security.mfaPct}%`} sub="Mandatory for every user" tone={d.security.mfaPct < 100 ? "warn" : "ok"} href="/adminpage1&/users?mfa=0" />
        <Tile label="Open support tickets" value={d.support.ticketsOpen} sub={`${d.support.pendingGrants} access request(s) · ${d.security.adminEvents24} admin action(s) in 24 h`} href="/adminpage1&/tickets" />
      </Tiles>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Sign-up funnel (7 days)" note="Website visitors from the cookieless measurement on amlsync.com and the app's public pages; the rest from product data.">
          <ol className="space-y-1 text-sm" data-testid="funnel">
            {d.funnel.map((f) => (
              <li key={f.step} className="grid grid-cols-[1fr_auto] items-center gap-2">
                <span>{f.step}</span><span className="tabular-nums">{f.n}</span>
                <span className="col-span-2 block h-1.5 rounded bg-accent/70" style={{ width: `${Math.round((100 * f.n) / top)}%` }} />
              </li>
            ))}
          </ol>
        </Section>
        <Section title="At-risk firms" note="Health score below 70 (amber or red).">
          <Table head={["Firm", "Health", "Why"]} rows={d.atRisk.map((f) => [
            <Link key="n" href={`/adminpage1&/firms/${f.id}`} className="text-accent underline">{f.name}</Link>,
            <Badge key="h" tone={bandTone(f.m.health.band)}>{f.m.health.score}</Badge>,
            <span key="w" className="text-xs text-muted">{f.m.health.reasons.filter((r) => r.points < r.weight).slice(0, 2).map((r) => r.detail).join("; ")}</span>,
          ])} empty="No at-risk firms." />
        </Section>
        <Section title="Feature requests (7 days)">
          <Table head={["Request", "Votes"]} rows={d.features7.map((f) => [<span key="t">{f.regulatory && <Badge tone="bad">regulatory</Badge>} {f.title}</span>, f._count.votes])} empty="No new requests." />
        </Section>
        <Section title="Regulatory content" note={`EU Core ${EU_CORE_VERSION}.`}>
          <Table head={["Official list", "Version", "Loaded"]} rows={d.lists.map((l) => [l.name, l.version, fmtDateTime(l.loadedAt)])} empty="No official list loaded." />
        </Section>
      </div>
    </Page>
  );
}
