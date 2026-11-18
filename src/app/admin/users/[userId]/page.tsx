import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { ActionForm, Field, Submit } from "@/components/form";
import { StepUpLink } from "@/components/step-up";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import { secureUserAction } from "./actions";

const SIGN_IN = ["login", "login-failed", "mfa-failed", "new-device", "logout", "password-reset", "password-reset-requested", "mfa-enrolled", "mfa-reset", "mfa-recovered", "recovery-code-used", "sign-out-everywhere", "admin-lock", "admin-unlock", "admin-sessions-revoked"];

/** Short device label from a user agent, without storing more than the log already holds. */
const device = (ua: string | null) => !ua ? "—" : `${/Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "macOS" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Linux/.test(ua) ? "Linux" : "Other"} · ${/Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Other"}`;

export default async function UserPage({ params }: { params: Promise<{ userId: string }> }) {
  const a = await requireAdmin("users.view");
  const { userId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) notFound();
  const u = await adminDb.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, roles: true, external: true, mfaEnrolledAt: true, lockedUntil: true, deactivatedAt: true, failedLogins: true, createdAt: true, emailVerifiedAt: true, recoveryCodeHashes: true, firm: { select: { id: true, name: true } } } });
  if (!u) notFound();
  const now = new Date();
  const [events, sessions] = await Promise.all([
    adminDb.securityEvent.findMany({ where: { userId, kind: { in: SIGN_IN } }, orderBy: { at: "desc" }, take: 100, select: { at: true, kind: true, ip: true, userAgent: true } }),
    adminDb.session.findMany({ where: { userId, revokedAt: null, expiresAt: { gt: now } }, orderBy: { lastSeenAt: "desc" }, select: { createdAt: true, lastSeenAt: true, ip: true, userAgent: true, stage: true } }),
  ]);
  const failed24 = events.filter((e) => e.kind === "login-failed" && now.getTime() - e.at.getTime() < 86_400_000).length;
  const ips = new Set(sessions.map((s) => s.ip).filter(Boolean));
  const signals = [
    failed24 >= 5 && `${failed24} failed sign-ins in 24 h`,
    ips.size > 1 && `${ips.size} active sessions from different IP addresses (shared account?)`,
    !u.mfaEnrolledAt && !u.deactivatedAt && "Two-factor not set up",
    u.recoveryCodeHashes.length <= 2 && u.mfaEnrolledAt && `${u.recoveryCodeHashes.length} recovery code(s) left`,
  ].filter(Boolean) as string[];
  const locked = !!u.lockedUntil && u.lockedUntil > now;
  const ops = [
    { op: "revoke" as const, label: "Revoke all sessions" },
    locked ? { op: "unlock" as const, label: "Unlock account" } : { op: "lock" as const, label: "Lock account" },
  ];
  return (
    <Page title={u.name} intro={<>{u.email} · <Link href={`/admin/firms/${u.firm.id}`} className="underline">{u.firm.name}</Link> · {u.roles.map((r) => ROLE_LABELS[r as AppRole]).join(", ")}{u.external ? " · external" : ""} · created {fmtDateTime(u.createdAt)}</>}
      actions={<span className="flex gap-2">{u.mfaEnrolledAt ? <Badge tone="ok">two-factor on</Badge> : <Badge tone="bad">no two-factor</Badge>}{locked && <Badge tone="bad">locked</Badge>}{u.deactivatedAt && <Badge>removed</Badge>}</span>}>
      <Section title="Risk signals">
        {signals.length ? <ul className="list-disc pl-5 text-sm">{signals.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="text-sm text-muted">None.</p>}
      </Section>
      {a.can("users.secure") && (
        <Section title="Actions" note="Each action is logged in the admin log and the firm's security log. Two-factor resets are done by a colleague in the firm or by the user's 72-hour self-recovery, never by AMLSync.">
          <div className="grid gap-4 md:grid-cols-2">
            {ops.map((o, i) => (
              // Keyed by position so the result message stays visible when Lock turns into Unlock.
              <ActionForm key={i} action={secureUserAction.bind(null, u.id, o.op)} className="space-y-2">
                <Field label={`Reason (${o.label.toLowerCase()})`} name="reason" required />
                <Submit variant={o.op === "lock" ? "danger" : "secondary"}>{o.label}</Submit><StepUpLink />
              </ActionForm>
            ))}
          </div>
        </Section>
      )}
      <Section title={`Active sessions (${sessions.length})`}>
        <Table head={["Started", "Last seen", "IP", "Device", "Stage"]} rows={sessions.map((s) => [fmtDateTime(s.createdAt), fmtDateTime(s.lastSeenAt), s.ip ?? "—", device(s.userAgent), s.stage])} empty="No active sessions." />
      </Section>
      <Section title="Sign-in history">
        <Table head={["When", "Event", "IP", "Device"]} rows={events.map((e) => [fmtDateTime(e.at), e.kind === "login-failed" ? <Badge key="k" tone="warn">{e.kind}</Badge> : e.kind, e.ip ?? "—", device(e.userAgent)])} />
      </Section>
    </Page>
  );
}
