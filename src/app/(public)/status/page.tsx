import type { Metadata } from "next";
import { adminDb } from "@/lib/server/db";

export const metadata: Metadata = { title: "Status · AMLSync App" };
export const dynamic = "force-dynamic";

const SEV: Record<string, string> = { sev1: "Major outage", sev2: "Partial outage", sev3: "Minor issue", sev4: "Notice" };

/** Public status page (Backoffice §10.4): incidents the AMLSync team chose to publish, last 90 days. */
export default async function StatusPage() {
  const since = new Date(Date.now() - 90 * 86_400_000);
  const incidents = await adminDb.incident.findMany({ where: { public: true, detectedAt: { gte: since } }, orderBy: { detectedAt: "desc" }, select: { id: true, title: true, severity: true, status: true, detectedAt: true, resolvedAt: true, publicSummary: true } });
  const open = incidents.filter((i) => i.status === "open" || i.status === "contained");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-3xl font-semibold">AMLSync App status</h1>
      <p className={`rounded-xl border p-4 text-lg font-semibold ${open.length ? "border-orange" : "border-brand"}`} data-testid="status-summary">
        {open.length ? `${open.length} ongoing incident(s)` : "All systems operational"}
      </p>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Last 90 days</h2>
        {incidents.map((i) => (
          <article key={i.id} className="rounded-xl border border-border p-4 text-sm">
            <p className="text-xs text-muted">{SEV[i.severity] ?? i.severity} · {i.detectedAt.toISOString().slice(0, 16).replace("T", " ")} UTC{i.resolvedAt ? ` · resolved ${i.resolvedAt.toISOString().slice(0, 16).replace("T", " ")} UTC` : " · ongoing"}</p>
            <h3 className="font-semibold">{i.title}</h3>
            {i.publicSummary && <p className="mt-1 whitespace-pre-wrap">{i.publicSummary}</p>}
          </article>
        ))}
        {!incidents.length && <p className="text-sm text-muted">No incidents reported.</p>}
      </section>
      <p className="text-sm text-muted">Questions: contact@amlsync.com. Customers are notified directly of any incident affecting their data.</p>
    </div>
  );
}
