import { requireUser } from "@/lib/server/session";
import { adminDb } from "@/lib/server/db";

export default async function SecurityLogPage() {
  const s = await requireUser("securityLog.view");
  // SecurityEvent is read through the owner connection, always filtered to this firm.
  const events = await adminDb.securityEvent.findMany({ where: { firmId: s.firm.id }, orderBy: { at: "desc" }, take: 200 });
  const users = new Map((await adminDb.user.findMany({ where: { firmId: s.firm.id }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Security log</h1>
      <p className="text-sm text-muted">Sign-ins, failed sign-ins, new devices, exports, role changes and AMLSyncAI staff access for your firm (latest 200).</p>
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
    </div>
  );
}
