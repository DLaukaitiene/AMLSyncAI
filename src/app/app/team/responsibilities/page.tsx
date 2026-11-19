import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can } from "@/lib/auth/permissions";
import { ActionForm, Submit } from "@/components/form";
import { RESPONSIBILITIES } from "@/lib/firm/responsibilities";
import { saveResponsibilitiesAction } from "../training-register/actions";

/** Who is accountable for each AML duty (ClearAML's Responsibilities table). */
export default async function ResponsibilitiesPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "approve.compliance");
  const data = await withTenant(s.firm.id, async (tx) => ({
    users: await tx.user.findMany({ where: { deactivatedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    map: ((await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { responsibilities: true } })).responsibilities ?? {}) as Record<string, string[]>,
  }));
  const unassigned = RESPONSIBILITIES.filter((r) => !(data.map[r.key] ?? []).some((id) => data.users.some((u) => u.id === id))).length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl">Responsibilities</h1>
        <p className="text-sm text-muted">Who is accountable for each AML duty. Supervisors check that every duty has a named person. {unassigned ? <strong className="text-amber-800 dark:text-amber-300">{unassigned} dut{unassigned === 1 ? "y has" : "ies have"} nobody assigned.</strong> : "Every duty has someone assigned."}</p>
      </div>
      <ActionForm action={saveResponsibilitiesAction}>
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-muted">
              <tr><th className="px-3 py-2 font-medium">Duty</th>{data.users.map((u) => <th key={u.id} className="px-3 py-2 text-center font-medium">{u.name}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {RESPONSIBILITIES.map((r) => {
                const ids = data.map[r.key] ?? [];
                return (
                  <tr key={r.key} data-testid="responsibility">
                    <td className="px-3 py-2"><span className="block font-medium">{r.label}</span><span className="block text-xs text-muted">{r.hint}</span></td>
                    {data.users.map((u) => (
                      <td key={u.id} className="px-3 py-2 text-center">
                        <input type="checkbox" name={`${r.key}`} value={u.id} defaultChecked={ids.includes(u.id)} disabled={!manage} aria-label={`${u.name}: ${r.label}`} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {manage && <Submit>Save responsibilities</Submit>}
      </ActionForm>
    </div>
  );
}
