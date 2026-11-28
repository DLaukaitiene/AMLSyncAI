import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";
import { ActionButton } from "@/components/action-button";
import { supportDecisionAction } from "./actions";
import { revokeSessionAction, signOutEverywhereAction } from "../team/actions";
import { can } from "@/lib/auth/permissions";

export default async function SecurityLogPage() {
  // Everyone sees their own sessions here; the firm's security log and support access need securityLog.view.
  const s = await requireUser();
  const log = can(s.user.roles, "securityLog.view");
  const sessions = await adminDb.session.findMany({ where: { userId: s.user.id, revokedAt: null, stage: "ACTIVE", expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } });
  // SecurityEvent is read through the owner connection, always filtered to this firm.
  const events = log ? await adminDb.securityEvent.findMany({ where: { firmId: s.firm.id }, orderBy: { at: "desc" }, take: 200 }) : [];
  const users = new Map((await adminDb.user.findMany({ where: { firmId: s.firm.id }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const grants = log ? await adminDb.supportGrant.findMany({ where: { firmId: s.firm.id }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
  const now = new Date();
  return (
    <div className="space-y-4">
      <h1 className="text-3xl">Security</h1>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">My sessions</h2>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {sessions.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span>
                {x.userAgent?.slice(0, 80) ?? "Unknown device"} · {x.ip ?? "—"}
                <span className="block text-muted">Signed in {x.createdAt.toISOString().slice(0, 16).replace("T", " ")} · last active {x.lastSeenAt.toISOString().slice(0, 16).replace("T", " ")} UTC{x.id === s.sessionId ? " · this session" : ""}</span>
              </span>
              {x.id !== s.sessionId && <ActionButton action={revokeSessionAction.bind(null, x.id)}>Sign out</ActionButton>}
            </li>
          ))}
        </ul>
        <ActionButton action={signOutEverywhereAction}>Sign out my other sessions</ActionButton>
      </section>

      {log && (<>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">AMLSync support access</h2>
        <p className="text-sm text-muted">AMLSync staff can see nothing unless you approve a time-limited, read-only request. They never see cases, reports or documents.</p>
        {grants.length === 0 && <p className="text-sm text-muted">No requests.</p>}
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {grants.map((g) => {
            const active = g.status === "approved" && g.expiresAt && g.expiresAt > now;
            return (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2" data-testid="support-grant">
                <span>{g.requesterEmail} · {g.hours} h · {g.reason}<span className="block text-muted">{active ? `active until ${g.expiresAt!.toISOString().slice(0, 16).replace("T", " ")} UTC` : g.status === "approved" ? "expired" : g.status}</span></span>
                <span className="flex gap-2">
                  {g.status === "requested" && <><ActionButton action={supportDecisionAction.bind(null, g.id, "approved")} variant="primary">Approve</ActionButton><ActionButton action={supportDecisionAction.bind(null, g.id, "denied")}>Deny</ActionButton></>}
                  {active && <ActionButton action={supportDecisionAction.bind(null, g.id, "revoked")} variant="danger">Revoke now</ActionButton>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-sm text-muted">Sign-ins, failed sign-ins, new devices, exports, role changes and AMLSync staff access for your firm (latest 200).</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr><th className="py-1 pr-4 font-normal">Time (UTC)</th><th className="py-1 pr-4 font-normal">Event</th><th className="py-1 pr-4 font-normal">User</th><th className="py-1 font-normal">IP</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {events.map((e) => (
              <tr key={String(e.id)}>
                <td className="py-1 pr-4 whitespace-nowrap">{e.at.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="py-1 pr-4">{e.kind}</td>
                <td className="py-1 pr-4">{e.userId ? users.get(e.userId) ?? "—" : "—"}</td>
                <td className="py-1">{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>)}
    </div>
  );
}
