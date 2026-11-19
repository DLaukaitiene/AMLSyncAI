import { GraduationCap, Download } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, SelectWithOther, Submit } from "@/components/form";
import { EmptyState } from "@/components/empty-state";
import { addExternalTrainingAction } from "./actions";
import { TRAINING_TYPES } from "@/lib/firm/responsibilities";

/** External training events (ClearAML's Training tab); in-app modules live under My Compliance. */
export default async function TrainingRegisterPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => ({
    rows: await tx.externalTraining.findMany({ orderBy: { date: "desc" }, take: 300 }),
    users: await tx.user.findMany({ select: { id: true, name: true, deactivatedAt: true }, orderBy: { name: "asc" } }),
  }));
  const names = new Map(data.users.map((u) => [u.id, u.name]));
  const label = (t: string) => TRAINING_TYPES.find(([k]) => k === t)?.[1] ?? t.replace(/^other: /, "");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">Training Register</h1>
          <p className="text-sm text-muted">Workshops, seminars, courses and internal sessions your team attended outside the app (AMLR Art. 12). Training done in the app is recorded automatically under My Compliance.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not navigation */}
        {manage && <a href="/api/registers/training" className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-sm hover:border-accent"><Download aria-hidden className="h-4 w-4" />Export CSV</a>}
      </div>
      {manage && (
        <details className="rounded-2xl border border-border p-4">
          <summary className="cursor-pointer font-semibold">Record training</summary>
          <ActionForm action={addExternalTrainingAction} className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Title" name="title" required />
            <Field label="Provider" name="provider" hint="E.g. the bar association, an external trainer" />
            <SelectWithOther label="Type" name="type" defaultValue="workshop" otherValue="other" options={TRAINING_TYPES.filter(([k]) => k !== "other").map(([k, v]) => [k, v])} />
            <Field label="Date" name="date" type="date" required />
            <Field label="Duration (minutes)" name="durationMinutes" type="number" required />
            <Field label="Notes" name="notes" />
            <fieldset className="space-y-1 sm:col-span-2">
              <legend className="text-sm font-medium">Attendees</legend>
              <div className="flex flex-wrap gap-4 text-sm">{data.users.filter((u) => !u.deactivatedAt).map((u) => <label key={u.id} className="flex items-center gap-2"><input type="checkbox" name="attendees" value={u.id} /> {u.name}</label>)}</div>
            </fieldset>
            <div className="sm:col-span-2"><Submit>Record training</Submit></div>
          </ActionForm>
        </details>
      )}
      {data.rows.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No external training recorded" text="Record workshops, seminars and courses so you can show the supervisor your team's training history." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted"><tr><th className="px-3 py-2 font-medium">Date</th><th className="px-3 py-2 font-medium">Title</th><th className="px-3 py-2 font-medium">Provider</th><th className="px-3 py-2 font-medium">Type</th><th className="px-3 py-2 font-medium">Duration</th><th className="px-3 py-2 font-medium">Attendees</th></tr></thead>
            <tbody className="divide-y divide-border">
              {data.rows.map((r) => (
                <tr key={r.id} data-testid="training-row">
                  <td className="whitespace-nowrap px-3 py-2">{r.date.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 font-medium">{r.title}</td>
                  <td className="px-3 py-2 text-muted">{r.provider ?? "—"}</td>
                  <td className="px-3 py-2">{label(r.type)}</td>
                  <td className="px-3 py-2">{r.durationMinutes >= 60 ? `${Math.floor(r.durationMinutes / 60)} h${r.durationMinutes % 60 ? ` ${r.durationMinutes % 60} min` : ""}` : `${r.durationMinutes} min`}</td>
                  <td className="px-3 py-2 text-muted">{r.attendeeIds.map((id) => names.get(id) ?? "former user").join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
