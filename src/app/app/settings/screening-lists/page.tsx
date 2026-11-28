import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { autoClearAction, uploadListAction } from "./actions";

export default async function ScreeningListsPage() {
  const s = await requireUser("countryProfile.view");
  const { lists, autoClearBelow } = await withTenant(s.firm.id, async (tx) => ({
    lists: await tx.screeningList.findMany({ where: { active: true }, orderBy: [{ firmId: "asc" }, { name: "asc" }], include: { _count: { select: { entries: true } } } }),
    autoClearBelow: (await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { autoClearBelow: true } })).autoClearBelow,
  }));
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-3xl">Screening lists</h1>
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {lists.map((l) => (
          <li key={l.id} className="flex justify-between px-4 py-2">
            <span>{l.name} <span className="text-muted">· {l.kind.toLowerCase()} · {l.firmId ? "your firm" : "official"}</span></span>
            <span className="text-muted">{l._count.entries} entries · version {l.version}</span>
          </li>
        ))}
        {lists.length === 0 && <li className="px-4 py-2 text-muted">No lists loaded yet.</li>}
      </ul>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Automatic clearing of weak matches</h2>
        <p className="text-sm text-muted">
          Currently: <strong>{autoClearBelow === null ? "off — every possible match is reviewed by a person" : `non-sanctions hits under a match score of ${autoClearBelow} are cleared automatically`}</strong>.
          Sanctions hits are never cleared automatically. Each automatic clearance is recorded on the hit with the threshold used. The provider&apos;s own
          false-positive tags are ignored.
        </p>
        {can(s.user.roles, "countryProfile.edit") && (
          <ActionForm action={autoClearAction} className="flex flex-wrap items-end gap-2">
            <Field label="Auto-clear below match score (1–99, empty = off)" name="threshold" type="number" defaultValue={autoClearBelow ?? ""} />
            <Submit variant="secondary">Save</Submit>
          </ActionForm>
        )}
      </section>

      {can(s.user.roles, "countryProfile.edit") && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Upload a national list</h2>
          <p className="text-sm text-muted">
            CSV with a header row: <code>type,name,aliases,birth_dates,countries,reference</code>. type is person or entity; separate several
            aliases, dates or countries with |. Uploading a list with the same name replaces the previous version. All active clients are
            re-screened right away.
          </p>
          <ActionForm action={uploadListAction}>
            <Field label="List name" name="name" required />
            <Field label="Kind" name="kind">
              <select name="kind" aria-label="Kind" className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
                <option value="SANCTIONS">Sanctions list</option>
                <option value="PEP">National prominent public functions / PEP list</option>
              </select>
            </Field>
            <Field label="CSV file" name="file">
              <input type="file" name="file" accept=".csv,text/csv" aria-label="CSV file" className="text-sm" />
            </Field>
            <Submit>Upload and re-screen</Submit>
          </ActionForm>
        </section>
      )}
    </div>
  );
}
