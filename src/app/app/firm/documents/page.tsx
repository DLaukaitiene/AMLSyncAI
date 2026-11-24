import { FolderOpen } from "lucide-react";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Submit } from "@/components/form";
import { FIRM_FOLDERS } from "@/lib/server/storage";
import { uploadFirmDocumentAction } from "./actions";

/** "My Firm Compliance" (ClearAML): the firm's own evidence library, the first thing a supervisor asks for. */
export default async function FirmDocumentsPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "approve.compliance");
  const folders = FIRM_FOLDERS.filter((f) => !f.restricted || manage);
  const data = await withTenant(s.firm.id, async (tx) => ({
    docs: await tx.document.findMany({ where: { partyId: null, kind: { in: folders.map((f) => f.kind) } }, orderBy: { uploadedAt: "desc" } }),
    names: new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name])),
  }));
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Firm Documents</h1>
        <p className="text-sm text-muted">Your firm&apos;s own compliance evidence in one place. Supervisors usually ask for these first: keep them filed and current before an inspection notice arrives.</p>
      </div>
      {manage && (
        <ActionForm action={uploadFirmDocumentAction} className="grid gap-3 rounded-2xl border border-border p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="space-y-1 text-sm"><span className="block font-medium">Folder</span>
            <select name="kind" className="w-full rounded border border-border bg-background px-3 py-2 text-sm">{folders.map((f) => <option key={f.kind} value={f.kind}>{f.label}</option>)}</select>
          </label>
          <label className="space-y-1 text-sm"><span className="block font-medium">Files (up to 10)</span><input type="file" name="file" multiple className="block w-full text-sm" /></label>
          <Submit>Upload</Submit>
        </ActionForm>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {folders.map((f) => {
          const docs = data.docs.filter((d) => d.kind === f.kind);
          return (
            <section key={f.kind} className="space-y-2 rounded-2xl border border-border bg-background p-5 shadow-[var(--shadow)]" data-testid="firm-folder">
              <h2 className="flex items-center gap-2 font-semibold"><FolderOpen aria-hidden className="h-5 w-5 text-accent" />{f.label} <span className="text-sm font-normal text-muted">({docs.length})</span></h2>
              <p className="text-xs text-muted">{f.hint}{f.restricted ? " · visible to the Owner and Compliance Officer only" : ""}</p>
              {docs.length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : (
                <ul className="divide-y divide-border text-sm">
                  {docs.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      {d.malwareScan === "clean" ? <a href={`/api/files/${d.id}`} className="text-accent hover:underline">{d.fileName}</a> : <span>{d.fileName} <span className="text-xs text-muted">(scan {d.malwareScan})</span></span>}
                      <span className="text-xs text-muted">{d.uploadedAt.toISOString().slice(0, 10)} · {data.names.get(d.uploadedBy.replace("staff:", "")) ?? "staff"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
