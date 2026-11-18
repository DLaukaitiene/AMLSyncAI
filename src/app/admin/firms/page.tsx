import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { listFirms, SAVED_VIEWS } from "@/lib/server/backoffice/firms";
import { Badge, bandTone, eur, fmtDate, Page, statusTone, Table } from "@/components/admin";
import { EXPORT_FOUR_EYES_ROWS } from "@/lib/backoffice/four-eyes";

type SP = { q?: string; status?: string; plan?: string; country?: string; sector?: string; view?: string };

export default async function FirmsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const a = await requireAdmin("firms.view");
  const sp = await searchParams;
  const rows = await listFirms(sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  const input = "rounded border border-border bg-background px-2 py-1";
  return (
    <Page title="Firms" intro="Every customer firm, with counts and health signals only. Open a firm for its 360° view.">
      <nav aria-label="Saved views" className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/firms" className={`rounded border px-2 py-1 ${!sp.view ? "border-accent" : "border-border"}`}>All</Link>
        {SAVED_VIEWS.map((v) => <Link key={v.id} href={`/admin/firms?view=${v.id}`} className={`rounded border px-2 py-1 ${sp.view === v.id ? "border-accent" : "border-border"}`}>{v.label}</Link>)}
      </nav>
      <form className="flex flex-wrap gap-2 text-sm" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Name, domain, VAT or company code" aria-label="Search firms" className={`${input} min-w-64`} />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className={input}><option value="">Any status</option>{["trial", "active", "paused", "suspended", "closed"].map((s) => <option key={s}>{s}</option>)}</select>
        <select name="plan" defaultValue={sp.plan ?? ""} aria-label="Plan" className={input}><option value="">Any plan</option>{["solo", "starter", "custom"].map((s) => <option key={s}>{s}</option>)}</select>
        <input name="country" defaultValue={sp.country} placeholder="Country (LT)" aria-label="Country" maxLength={2} className={`${input} w-28`} />
        <select name="sector" defaultValue={sp.sector ?? ""} aria-label="Sector" className={input}><option value="">Any sector</option>{["ACCOUNTANT", "ESTATE_AGENT", "HVG_TRADER", "PRECIOUS_METALS", "TCSP", "LEGAL", "ART_TRADER", "GAMBLING", "CROWDFUNDING", "CREDIT_INTERMEDIARY", "INVESTMENT_MIGRATION", "FOOTBALL", "OTHER"].map((s) => <option key={s}>{s}</option>)}</select>
        {sp.view && <input type="hidden" name="view" value={sp.view} />}
        <button className="rounded border border-border px-3 py-1">Filter</button>
      </form>
      <p className="text-sm text-muted">{rows.length} firm(s)</p>
      <Table testId="firm-list" head={["Firm", "Country", "Plan", "Status", "Users (30 d)", "Clients", "Screenings 30 d", "Paid checks (month)", "Health", "Last sign-in", "KYB", "Signed up"]}
        rows={rows.map((r) => [
          <span key="n"><Link href={`/admin/firms/${r.id}`} className="text-accent underline">{r.name}</Link><br /><span className="text-xs text-muted">{r.emailDomain}{r.meta?.tags.length ? ` · ${r.meta.tags.join(", ")}` : ""}</span></span>,
          r.homeState, r.planName,
          <Badge key="s" tone={statusTone(r.displayStatus)}>{r.displayStatus}</Badge>,
          `${r.m.users} (${r.m.activeUsers30d})`, r.m.clients, r.m.screenings30d,
          `${r.m.paidChecksMonth} · ${eur(r.m.spendMonthCents)}`,
          <Badge key="h" tone={bandTone(r.m.health.band)}>{r.m.health.score}</Badge>,
          fmtDate(r.m.lastLogin),
          <Badge key="k" tone={r.kybLabel === "clear" || r.kybLabel === "cleared" ? "ok" : r.kybLabel === "not checked" ? "neutral" : "bad"}>{r.kybLabel}</Badge>,
          fmtDate(r.createdAt),
        ])} empty="No firms match." />
      {a.can("firms.export") && (
        <form method="post" action={`/api/admin/firms-export${qs ? `?${qs}` : ""}`} className="flex flex-wrap items-end gap-3 text-sm">
          <label className="space-y-1"><span className="block font-medium">Export purpose (logged)</span>
            <input name="purpose" required minLength={5} className="rounded border border-border bg-transparent px-3 py-2" /></label>
          <button className="rounded border border-border px-4 py-2">Export CSV</button>
          <span className="text-xs text-muted">Above {EXPORT_FOUR_EYES_ROWS} rows an Owner must approve the export first.</span>
        </form>
      )}
    </Page>
  );
}
