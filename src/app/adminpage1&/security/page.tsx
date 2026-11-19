import Link from "next/link";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section, Table, Tile, Tiles } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { breachClock } from "@/lib/backoffice/deadlines";
import { createIncidentAction } from "./actions";

const DAY = 86_400_000;
const sel = "w-full rounded border border-border bg-background px-3 py-2 text-sm";

export default async function SecurityPage() {
  const a = await requireAdmin("security.view");
  const now = new Date(), d1 = new Date(now.getTime() - DAY), d7 = new Date(now.getTime() - 7 * DAY);
  const [byKind, topIps, locked, sessions, users, mfa, admins, exports, incidents] = await Promise.all([
    adminDb.securityEvent.groupBy({ by: ["kind"], where: { at: { gte: d7 } }, _count: true, orderBy: { _count: { kind: "desc" } } }),
    adminDb.securityEvent.groupBy({ by: ["ip"], where: { at: { gte: d1 }, kind: { in: ["login-failed", "mfa-failed"] }, ip: { not: null } }, _count: true, orderBy: { _count: { ip: "desc" } }, take: 10 }),
    adminDb.user.count({ where: { lockedUntil: { gt: now } } }),
    adminDb.session.count({ where: { revokedAt: null, expiresAt: { gt: now }, stage: "ACTIVE" } }),
    adminDb.user.count({ where: { deactivatedAt: null } }),
    adminDb.user.count({ where: { deactivatedAt: null, mfaEnrolledAt: { not: null } } }),
    adminDb.adminAuditEvent.findMany({ orderBy: { id: "desc" }, take: 15, select: { at: true, adminEmail: true, action: true, targetType: true } }),
    adminDb.securityEvent.count({ where: { kind: { in: ["export", "bulk-export"] }, at: { gte: d7 } } }),
    adminDb.incident.findMany({ orderBy: { detectedAt: "desc" }, take: 50 }),
  ]);
  const k = (name: string) => byKind.find((x) => x.kind === name)?._count ?? 0;
  // Password spraying: one IP, many accounts.
  const spray = await adminDb.$queryRaw<{ ip: string; accounts: bigint }[]>`SELECT ip, count(DISTINCT "userId") AS accounts FROM "SecurityEvent" WHERE kind = 'login-failed' AND at >= ${d1} AND ip IS NOT NULL GROUP BY ip HAVING count(DISTINCT "userId") >= 5 ORDER BY 2 DESC LIMIT 10`;
  return (
    <Page title="Security" intro="Sign-in events, account-takeover signals, admin access and incidents. WAF and Cloudflare bot data appear here once that integration is connected.">
      <Tiles>
        <Tile label="Sign-ins (7 d)" value={k("login")} sub={`${k("login-failed")} failed · ${k("mfa-failed")} failed two-factor`} />
        <Tile label="Locked accounts" value={locked} href="/adminpage1&/users?locked=1" tone={locked ? "warn" : "ok"} />
        <Tile label="Two-factor adoption" value={`${users ? Math.round((100 * mfa) / users) : 100}%`} sub={`${users - mfa} user(s) not set up`} href="/adminpage1&/users?mfa=0" />
        <Tile label="Active sessions" value={sessions} sub={`${exports} data export(s) in 7 days`} />
      </Tiles>
      {a.can("team.manage") && (
        <Section title="Backups" note="An encrypted copy of the whole database is emailed to operations every Monday. It can only be opened with BACKUP_KEY (keep a copy of the key outside Vercel). Restore steps: scripts/restore-backup.mts.">
          <a href="/api/admin/backup" className="inline-block rounded-full border border-border px-4 py-2 text-sm hover:border-accent" data-testid="download-backup">Download backup now</a>
        </Section>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Failed sign-ins by IP (24 h)"><Table head={["IP", "Failures"]} rows={topIps.map((r) => [r.ip ?? "—", r._count])} empty="None." /></Section>
        <Section title="Password spraying (one IP, ≥ 5 accounts, 24 h)"><Table head={["IP", "Accounts"]} rows={spray.map((r) => [r.ip, Number(r.accounts)])} empty="None detected." /></Section>
        <Section title="Security events (7 d)"><Table head={["Event", "Count"]} rows={byKind.map((r) => [r.kind, r._count])} /></Section>
        <Section title="Recent admin actions" note={<Link href="/adminpage1&/audit" className="underline">Full admin log and chain check</Link>}><Table head={["When", "Admin", "Action"]} rows={admins.map((r) => [fmtDateTime(r.at), r.adminEmail, `${r.action} (${r.targetType})`])} /></Section>
      </div>
      <Section title="Incidents and personal-data breaches" note="As processor, AMLSync notifies affected firms without undue delay (target ≤ 24 h). For data AMLSync controls, the 72-hour DPA clock starts at awareness.">
        <Table testId="incidents" head={["Detected", "Severity", "Title", "Status", "Breach clocks"]} rows={incidents.map((i) => [
          fmtDateTime(i.detectedAt), <Badge key="s" tone={i.severity === "sev1" ? "bad" : i.severity === "sev2" ? "warn" : "neutral"}>{i.severity}</Badge>,
          <Link key="t" href={`/adminpage1&/security/incidents/${i.id}`} className="text-accent underline">{i.title}</Link>, i.status,
          <span key="c" className="text-xs">{breachClock(i).map((c) => <span key={c.label} className={`block ${c.overdue ? "text-red-700 dark:text-red-300" : ""}`}>{c.label}</span>)}</span>,
        ])} empty="No incidents recorded." />
        {a.can("incidents.manage") && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Record an incident</summary>
            <ActionForm action={createIncidentAction} className="mt-2 grid gap-3 md:grid-cols-2">
              <Field label="Title" name="title" required />
              <Field label="Severity" name="severity"><select name="severity" aria-label="Severity" defaultValue="sev3" className={sel}><option value="sev1">sev1 — outage or data breach</option><option value="sev2">sev2 — major degradation</option><option value="sev3">sev3 — minor</option><option value="sev4">sev4 — near miss</option></select></Field>
              <Field label="Detected at (UTC, YYYY-MM-DDTHH:MM; empty = now)" name="detectedAt" />
              <Field label="Systems (comma-separated)" name="systems" />
              <Field label="Affected firms (email domains)" name="firms" />
              <Field label="Summary" name="summary"><textarea name="summary" aria-label="Summary" rows={3} className="w-full rounded border border-border bg-transparent px-3 py-2" /></Field>
              <label className="flex items-center gap-2"><input type="checkbox" name="personalData" /> Personal data affected (GDPR breach workflow)</label>
              <label className="flex items-center gap-2"><input type="checkbox" name="controllerData" /> Includes data AMLSync controls (visitors, leads, own users)</label>
              <div className="md:col-span-2"><Submit>Record incident</Submit><StepUpLink /></div>
            </ActionForm>
          </details>
        )}
      </Section>
    </Page>
  );
}
