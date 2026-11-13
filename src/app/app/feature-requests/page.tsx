import Link from "next/link";
import { requireUser } from "@/lib/server/session";
import { listRequests, isPlatformAdmin } from "@/lib/server/feedback";
import { STATUS_LABELS, type Status } from "@/lib/feedback/rules";

export default async function FeatureRequestsPage({ searchParams }: { searchParams: Promise<{ mine?: string; status?: string; q?: string }> }) {
  const s = await requireUser();
  const sp = await searchParams;
  const rows = await listRequests(s, { mine: sp.mine === "1", status: sp.status, q: sp.q });
  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Feature requests</h1>
        <span className="flex gap-4 text-sm">
          {isPlatformAdmin(s.user.email) && <Link href="/admin/feature-requests" className="text-accent underline">Triage</Link>}
          <Link href="/app/feature-requests/new" className="rounded bg-accent px-4 py-2 font-medium text-white dark:text-black">Suggest a feature</Link>
        </span>
      </div>
      <nav className="flex gap-4 text-sm"><Link href="/app/feature-requests" className="underline">All</Link><Link href="/app/feature-requests?mine=1" className="underline">My requests and votes</Link></nav>
      <ul className="divide-y divide-border rounded-md border border-border text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
            <span>
              <Link href={`/app/feature-requests/${r.id}`} className="text-accent underline">{r.title}</Link>
              {r.regulatory && <span className="ml-2 rounded border border-border px-1 text-xs">regulatory</span>}
              {r.mine && <span className="ml-2 text-xs text-muted">yours</span>}
            </span>
            <span className="text-muted">{r.module} · {STATUS_LABELS[r.status as Status]} · {r._count.votes} vote(s){r.voted ? " (incl. yours)" : ""}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="px-4 py-2 text-muted">No requests yet.</li>}
      </ul>
    </div>
  );
}
