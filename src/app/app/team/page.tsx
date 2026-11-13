import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { can, ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";
import { ActionForm, Field, Submit } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { StepUpLink } from "@/components/step-up";
import { inviteAction, removeUserAction, revokeInviteAction, signOutEverywhereAction } from "./actions";

export default async function TeamPage() {
  const s = await requireUser();
  const manage = can(s.user.roles, "team.invite");
  const { users, invites, domain } = await withTenant(s.firm.id, async (tx) => ({
    users: await tx.user.findMany({ where: { deactivatedAt: null }, orderBy: { createdAt: "asc" } }),
    invites: manage ? await tx.invitation.findMany({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }) : [],
    domain: (await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } })).emailDomain,
  }));

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold">Team</h1>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Users</h2>
        <ul className="divide-y divide-border rounded-md border border-border text-sm">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
              <span>
                <span className="font-medium">{u.name}</span> <span className="text-muted">{u.email}</span>
                {u.external && <span className="ml-2 rounded border border-border px-1 text-xs">external</span>}
                <span className="block text-muted">{u.roles.map((r) => ROLE_LABELS[r as AppRole]).join(", ")}{!u.mfaEnrolledAt && " · two-factor not set up yet"}</span>
              </span>
              {manage && u.id !== s.user.id && <ActionButton action={removeUserAction.bind(null, u.id)} variant="danger">Remove</ActionButton>}
            </li>
          ))}
        </ul>
        <ActionButton action={signOutEverywhereAction}>Sign out my other sessions</ActionButton>
      </section>

      {manage && (
        <>
          {invites.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-lg font-semibold">Pending invitations</h2>
              <ul className="divide-y divide-border rounded-md border border-border text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between px-4 py-2">
                    <span>
                      {i.name} <span className="text-muted">{i.email} · expires {i.expiresAt.toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                    </span>
                    <ActionButton action={revokeInviteAction.bind(null, i.id)}>Withdraw</ActionButton>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="max-w-md space-y-2">
            <h2 className="text-lg font-semibold">Invite a user</h2>
            <p className="text-sm text-muted">
              People join only by invitation. Invitations must use an @{domain} address unless you allow an external user (for example an AMLSync
              Expert reviewer). External users are labelled everywhere.
            </p>
            <ActionForm action={inviteAction}>
              <Field label="Name" name="name" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Role" name="role" required>
                <select name="role" defaultValue="STAFF" aria-label="Role" className="w-full rounded border border-border bg-background px-3 py-2 text-sm">
                  {(Object.keys(ROLE_LABELS) as AppRole[]).map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="allowExternal" /> Allow an email outside @{domain} (external user)
              </label>
              <Submit>Send invitation</Submit>
              <StepUpLink />
            </ActionForm>
          </section>
        </>
      )}
    </div>
  );
}
