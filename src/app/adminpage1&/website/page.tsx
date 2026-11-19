import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { channelOf } from "@/lib/backoffice/web";

const DAY = 86_400_000;

/**
 * Website and audience (§7.5): amlsync.com and the app's public pages, measured
 * first-party without cookies. Visitors are counted per day (the visitor code
 * changes daily), so "visitors" over a period is the sum of daily visitors.
 */
export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ days?: string; site?: string }> }) {
  await requireAdmin("web.view");
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const site = sp.site === "web" || sp.site === "app" ? sp.site : undefined;
  const since = new Date(Date.now() - days * DAY);
  const human = { at: { gte: since }, bot: null, ...(site ? { site } : {}) };
  const [daily, pages, refs, utm, countries, devices, events, bots, leads, signups] = await Promise.all([
    adminDb.$queryRaw<{ day: Date; views: bigint; visitors: bigint }[]>`SELECT date_trunc('day', at) AS day, count(*) FILTER (WHERE kind = 'pageview') AS views, count(DISTINCT visitor) AS visitors FROM "WebEvent" WHERE at >= ${since} AND bot IS NULL AND (${site ?? null}::text IS NULL OR site = ${site ?? null}) GROUP BY 1 ORDER BY 1`,
    adminDb.webEvent.groupBy({ by: ["site", "path"], where: { ...human, kind: "pageview" }, _count: true, orderBy: { _count: { path: "desc" } }, take: 20 }),
    adminDb.webEvent.groupBy({ by: ["referrer", "utmMedium"], where: { ...human, kind: "pageview" }, _count: true }),
    adminDb.webEvent.groupBy({ by: ["utmSource", "utmMedium", "utmCampaign"], where: { ...human, kind: "pageview", utmSource: { not: null } }, _count: true, orderBy: { _count: { utmSource: "desc" } }, take: 15 }),
    adminDb.webEvent.groupBy({ by: ["country"], where: { ...human, kind: "pageview" }, _count: true, orderBy: { _count: { country: "desc" } }, take: 15 }),
    adminDb.webEvent.groupBy({ by: ["device"], where: { ...human, kind: "pageview" }, _count: true }),
    adminDb.webEvent.groupBy({ by: ["name"], where: { ...human, kind: "event" }, _count: true }),
    adminDb.webEvent.groupBy({ by: ["bot"], where: { at: { gte: since }, bot: { not: null } }, _count: true, orderBy: { _count: { bot: "desc" } } }),
    adminDb.lead.count({ where: { createdAt: { gte: since }, source: "website-form" } }),
    adminDb.securityEvent.count({ where: { kind: "signup-started", at: { gte: since } } }),
  ]);
  const views = daily.reduce((s, d) => s + Number(d.views), 0);
  const visitors = daily.reduce((s, d) => s + Number(d.visitors), 0);
  const channels = new Map<string, number>();
  for (const r of refs) { const c = channelOf(r.referrer, r.utmMedium); channels.set(c, (channels.get(c) ?? 0) + r._count); }
  const refHosts = new Map<string, number>();
  for (const r of refs) if (r.referrer) refHosts.set(r.referrer, (refHosts.get(r.referrer) ?? 0) + r._count);
  const ev = (n: string) => events.find((e) => e.name === n)?._count ?? 0;
  const max = Math.max(1, ...daily.map((d) => Number(d.views)));
  const botTotal = bots.reduce((s, b) => s + b._count, 0);
  const link = (d: number, s?: string) => `/adminpage1&/website?days=${d}${s ? `&site=${s}` : ""}`;
  return (
    <Page title="Website and audience" intro="amlsync.com and the app's public pages. Cookieless and without stored IP addresses, so no consent banner is needed; Do Not Track is respected. Crawlers that don't run scripts (most AI crawlers) aren't seen here.">
      <nav className="flex flex-wrap gap-2 text-sm">
        {[7, 30, 90].map((d) => <a key={d} href={link(d, site)} className={`rounded border px-2 py-1 ${d === days ? "border-accent" : "border-border"}`}>{d} days</a>)}
        <span className="mx-2 text-muted">|</span>
        {[undefined, "web", "app"].map((s) => <a key={s ?? "all"} href={link(days, s)} className={`rounded border px-2 py-1 ${s === site ? "border-accent" : "border-border"}`}>{s === "web" ? "amlsync.com" : s === "app" ? "app public pages" : "both sites"}</a>)}
      </nav>
      <Tiles>
        <Tile label="Visitors (sum of daily)" value={visitors} sub={`${views} page views`} />
        <Tile label="Contact form → leads" value={leads} sub={`${ev("contact_submit")} form submissions measured`} href="/adminpage1&/leads" />
        <Tile label="Clicks to the app" value={ev("app_click") + ev("app_signup_click")} sub={`${ev("app_signup_click")} to sign-up`} />
        <Tile label="Sign-ups started" value={signups} sub={visitors ? `${((100 * signups) / visitors).toFixed(1)}% of visitors` : undefined} href="/adminpage1&/firms" />
      </Tiles>
      <Section title="Page views per day">
        <div className="flex h-32 items-end gap-0.5 rounded-md border border-border p-2" role="img" aria-label={`Page views per day, ${days} days, total ${views}`}>
          {daily.map((d) => <div key={d.day.toISOString()} title={`${d.day.toISOString().slice(0, 10)}: ${d.views} views, ${d.visitors} visitors`} className="flex-1 rounded-t bg-accent/70" style={{ height: `${Math.max(2, (100 * Number(d.views)) / max)}%` }} />)}
          {!daily.length && <p className="text-sm text-muted">No visits recorded yet.</p>}
        </div>
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Top pages"><Table head={["Site", "Page", "Views"]} rows={pages.map((p) => [p.site === "web" ? "amlsync.com" : "app", p.path, p._count])} empty="No data." /></Section>
        <Section title="Channels" note="AI assistants (ChatGPT, Perplexity, Claude, Copilot, Gemini) are listed separately."><Table head={["Channel", "Views"]} rows={[...channels].sort((a, b) => b[1] - a[1])} empty="No data." /></Section>
        <Section title="Referring websites"><Table head={["Website", "Views"]} rows={[...refHosts].sort((a, b) => b[1] - a[1]).slice(0, 15)} empty="No referrers." /></Section>
        <Section title="Campaigns (UTM)"><Table head={["Source", "Medium", "Campaign", "Views"]} rows={utm.map((u) => [u.utmSource, u.utmMedium ?? "—", u.utmCampaign ?? "—", u._count])} empty="No tagged campaigns. Add ?utm_source=…&utm_medium=…&utm_campaign=… to links you share." /></Section>
        <Section title="Countries"><Table head={["Country", "Views"]} rows={countries.map((c) => [c.country ?? "unknown", c._count])} empty="No data." /></Section>
        <Section title="Devices"><Table head={["Device", "Views"]} rows={devices.map((d) => [d.device, d._count])} empty="No data." /></Section>
        <Section title="Automated traffic (excluded above)" note={`${botTotal} event(s) from bots and automation that ran the script.`}><Table head={["Bot", "Events"]} rows={bots.map((b) => [b.bot, b._count])} empty="None." /></Section>
      </div>
    </Page>
  );
}
