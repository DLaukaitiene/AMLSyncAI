import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { setupChecklist } from "@/lib/rules/country-profile";
import { toIsoDate, addCalendarDays } from "@/lib/rules/dates";

export default async function Dashboard() {
  const s = await requireUser();
  const today = toIsoDate(new Date());
  const data = await withTenant(s.firm.id, async (tx) => {
    const { profile, version } = await currentProfile(tx, s.firm.id);
    const [clients, openMatters, overdue, due30] = await Promise.all([
      tx.cddFile.count({ where: { role: "CLIENT", status: { notIn: ["REFUSED", "TERMINATED"] } } }),
      tx.matter.count({ where: { status: { in: ["OPEN", "ON_HOLD"] } } }),
      tx.task.count({ where: { status: "OPEN", dueOn: { lt: new Date(today) } } }),
      tx.task.count({ where: { status: "OPEN", dueOn: { gte: new Date(today), lte: new Date(addCalendarDays(today, 30)) } } }),
    ]);
    return { checklist: setupChecklist(profile), version, clients, openMatters, overdue, due30 };
  });
  const missing = data.checklist.filter((c) => c.status === "required-missing" || c.status === "not-yet-reviewed");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          ["Active clients", data.clients, "/app/clients"],
          ["Open matters", data.openMatters, "/app/matters"],
          ["Overdue", data.overdue, "/app/calendar"],
          ["Due in 30 days", data.due30, "/app/calendar"],
        ].map(([label, value, href]) => (
          <li key={label as string}>
            <Link href={href as string} className="block rounded-md border border-border p-4 hover:border-accent">
              <span className="block text-sm text-muted">{label}</span>
              <span className={`block text-2xl font-semibold ${label === "Overdue" && (value as number) > 0 ? "text-red-700 dark:text-red-300" : ""}`}>{value}</span>
            </Link>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Finish setting up your Country Profile</h2>
          <p className="text-sm text-muted">
            AMLSyncAI ships the general EU rules. National details are entered by your firm (spec §3A). Missing required items only block
            the workflows that depend on them.
          </p>
          <ul className="divide-y divide-border rounded-md border border-border text-sm">
            {missing.map((m) => (
              <li key={m.parameter} className="flex justify-between gap-4 px-4 py-2">
                <span>{m.label}</span>
                <span className="text-muted">{m.status === "required-missing" ? `Required · blocks: ${m.blocks}` : "Not yet reviewed"}</span>
              </li>
            ))}
          </ul>
          <Link href="/app/settings/country-profile" className="inline-block text-sm text-accent underline">Open Country Profile (version {data.version})</Link>
        </section>
      )}
    </div>
  );
}
