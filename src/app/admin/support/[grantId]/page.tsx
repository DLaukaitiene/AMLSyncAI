import { notFound, redirect } from "next/navigation";
import { requireUser, requestMeta } from "@/lib/server/session";
import { isPlatformAdmin } from "@/lib/server/feedback";
import { supportSummary } from "@/lib/server/support";

export default async function SupportView({ params }: { params: Promise<{ grantId: string }> }) {
  const { grantId } = await params;
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  const { ip } = await requestMeta();
  const d = await supportSummary(s.user.email, grantId, ip);
  if (!d) notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <p className="rounded border border-amber-400 px-3 py-2 text-sm">Read-only support view for {d.firm.name}, granted until {d.grant.expiresAt!.toISOString().slice(0, 16).replace("T", " ")} UTC. Every view is logged in the firm&apos;s security log.</p>
      <h1 className="text-2xl font-semibold">{d.firm.name}</h1>
      <p className="text-sm text-muted">{d.firm.homeState} · {d.firm.sectors.join(", ")} · plan {d.firm.plan} · Country Profile v{d.profileVersion}</p>
      <section>
        <h2 className="mb-2 font-semibold">Setup checklist</h2>
        <ul className="text-sm">{d.checklist.map((c) => <li key={c.parameter}>{c.label}: {c.status}</li>)}</ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Open tasks</h2>
        <ul className="text-sm">{d.openTasks.map((t) => <li key={t.kind}>{t.kind}: {t._count}</li>)}</ul>
      </section>
      <section>
        <h2 className="mb-2 font-semibold">Clients (latest 200)</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-border">
            {d.clients.map((c, i) => <tr key={i}><td className="py-1 pr-3">{c.party.displayName}</td><td className="py-1 pr-3">{c.status}</td><td className="py-1 pr-3">{c.riskAssessments[0]?.final ?? "—"}</td><td className="py-1">{c.nextRefreshOn?.toISOString().slice(0, 10) ?? "—"}</td></tr>)}
          </tbody>
        </table>
      </section>
    </main>
  );
}
