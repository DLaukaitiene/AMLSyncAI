import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { modulesForFirm } from "@/lib/training/built-in";
import { ActionForm, Submit } from "@/components/form";
import { assignTrainingAction, completeTrainingAction } from "../records-actions";
import { PageTitle } from "@/components/help";

export default async function TrainingPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => ({
    mine: await tx.trainingAssignment.findMany({ where: { userId: s.user.id }, include: { module: true }, orderBy: { assignedAt: "desc" } }),
    all: manage ? await tx.trainingAssignment.findMany({ include: { module: { select: { title: true } } }, orderBy: { assignedAt: "desc" }, take: 300 }) : [],
    users: await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true } }),
    sectors: (await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { sectors: true } })).sectors as string[],
  }));
  const names = new Map(data.users.map((u) => [u.id, u.name]));
  return (
    <div className="max-w-3xl space-y-8">
      <PageTitle className="text-3xl" help={<>Completion records are part of the supervisor file.</>}>My Training</PageTitle>
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">My training</h2>
        {data.mine.length === 0 && <p className="text-sm text-muted">Nothing assigned to you.</p>}
        {data.mine.map((a) => (
          <div key={a.id} className="space-y-2 rounded-xl border border-border p-4 text-sm">
            <p><strong>{a.module.title}</strong> · {a.module.minutes} min · due {a.dueOn.toISOString().slice(0, 10)}{a.completedAt ? ` · completed ${a.completedAt.toISOString().slice(0, 10)}` : ""}</p>
            {!a.completedAt && (
              <>
                <div className="space-y-2 whitespace-pre-wrap">{a.module.content}</div>
                <ActionForm action={completeTrainingAction.bind(null, a.id)} className="space-y-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="attest" /> I completed this training and understood it</label>
                  <Submit>Complete</Submit>
                </ActionForm>
              </>
            )}
          </div>
        ))}
      </section>
      {manage && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Assign training</h2>
          <p className="text-sm text-muted">Built-in modules in plain words. Everyone completes them on joining and every year; completion is recorded with a signed attestation.</p>
          <ActionForm action={assignTrainingAction} className="space-y-3">
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Modules</legend>
              {modulesForFirm(data.sectors).map((m) => <label key={m.key} className="flex items-center gap-2"><input type="checkbox" name="module" value={m.key} defaultChecked /> {m.title} <span className="text-muted">({m.minutes} min)</span></label>)}
            </fieldset>
            <p className="text-sm font-medium">People</p>
            <div className="flex flex-wrap gap-4 text-sm">{data.users.map((u) => <label key={u.id} className="flex items-center gap-2"><input type="checkbox" name="userId" value={u.id} defaultChecked /> {u.name}</label>)}</div>
            <Submit variant="secondary">Assign</Submit>
          </ActionForm>
          <ul className="divide-y divide-border rounded-xl border border-border text-sm">
            {data.all.map((a) => <li key={a.id} className="flex justify-between px-4 py-2"><span>{names.get(a.userId) ?? "former user"} · {a.module.title}</span><span className="text-muted">{a.completedAt ? `completed ${a.completedAt.toISOString().slice(0, 10)}` : `due ${a.dueOn.toISOString().slice(0, 10)}`}</span></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}
