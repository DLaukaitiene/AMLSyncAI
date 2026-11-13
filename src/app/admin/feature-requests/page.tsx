import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { isPlatformAdmin, triageList } from "@/lib/server/feedback";
import { STATUSES, STATUS_LABELS, type Status } from "@/lib/feedback/rules";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { hideAction, mergeAction, statusAction } from "@/app/app/feature-requests/actions";

/** AMLSyncAI internal triage. Shows request text only — never firm names or client data. */
export default async function TriagePage({ searchParams }: { searchParams: Promise<{ module?: string; status?: string; regulatory?: string }> }) {
  const s = await requireUser();
  if (!isPlatformAdmin(s.user.email)) redirect("/app");
  const sp = await searchParams;
  const rows = await triageList({ module: sp.module, status: sp.status, regulatory: sp.regulatory === "1" });
  const sel = "w-full rounded border border-border bg-background px-2 py-1 text-sm";
  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <h1 className="text-2xl font-semibold">Feature request triage</h1>
      <form className="flex flex-wrap gap-2 text-sm">
        <input name="module" defaultValue={sp.module} placeholder="Module" aria-label="Module" className="rounded border border-border bg-transparent px-2 py-1" />
        <select name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="rounded border border-border bg-background px-2 py-1"><option value="">Any status</option>{STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}</select>
        <label className="flex items-center gap-1"><input type="checkbox" name="regulatory" value="1" defaultChecked={sp.regulatory === "1"} /> Regulatory only</label>
        <button className="rounded border border-border px-3 py-1">Filter</button>
      </form>
      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className={`space-y-2 rounded-md border border-border p-3 text-sm ${r.hidden ? "opacity-60" : ""}`} data-testid="triage-row">
            <div className="flex flex-wrap justify-between gap-2">
              <span>{r.regulatory && <strong className="mr-2 rounded border border-red-500 px-1 text-xs">regulatory</strong>}<Link className="text-accent underline" href={`/app/feature-requests/${r.id}`}>{r.title}</Link></span>
              <span className="text-muted">{r.module} · {r.firm.homeState} · {r.firm.sectors.join(", ")} · {r.importance} · {r._count.votes} vote(s) · {STATUS_LABELS[r.status as Status]}</span>
            </div>
            <details>
              <summary className="cursor-pointer">Manage</summary>
              <div className="mt-2 grid gap-4 md:grid-cols-3">
                <ActionForm action={statusAction.bind(null, r.id)} className="space-y-2">
                  <Field label="Status" name="status"><select name="status" aria-label="Status" defaultValue={r.status} className={sel}>{STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABELS[x]}</option>)}</select></Field>
                  <Field label="Reason (required for Not planned)" name="reason" />
                  <Field label="Release-note link (required for Released)" name="releaseNoteUrl" />
                  <Submit variant="secondary">Update status</Submit>
                  <StepUpLink />
                </ActionForm>
                <ActionForm action={mergeAction.bind(null, r.id)} className="space-y-2">
                  <Field label="Merge into" name="targetId"><select name="targetId" aria-label="Merge into" className={sel}>{rows.filter((x) => x.id !== r.id).map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></Field>
                  <Submit variant="secondary">Merge duplicate</Submit>
                </ActionForm>
                <div><ActionButton action={hideAction.bind(null, r.id, !r.hidden)} variant={r.hidden ? "secondary" : "danger"}>{r.hidden ? "Show again" : "Hide (abusive)"}</ActionButton></div>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </main>
  );
}
