import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { countryName } from "@/lib/geo/countries";
import { regulatorNotice, emailOf, ROLE_NAME, type AppointmentFn } from "@/lib/firm/regulator-notice";
import { ActionButton } from "@/components/action-button";
import { CopyButton } from "@/components/copy-button";
import { PageTitle } from "@/components/help";
import { markRegulatorInformedAction } from "../../../records-actions";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Inform the Regulator: where to send it, the subject and the email, ready to copy. */
export default async function InformRegulatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireUser("approve.compliance");
  const d = await withTenant(s.firm.id, async (tx) => {
    const a = await tx.appointment.findUnique({ where: { id } });
    if (!a) return null;
    const fn = a.function as AppointmentFn;
    const prev = await tx.appointment.findFirst({ where: { function: fn, toDate: { not: null }, fromDate: { lte: a.fromDate }, id: { not: a.id } }, orderBy: { toDate: "desc" } });
    const otherFn: AppointmentFn = fn === "compliance-officer" ? "compliance-manager" : "compliance-officer";
    const other = await tx.appointment.findFirst({ where: { function: otherFn, toDate: null } });
    const ids = [a.userId, prev?.userId, other?.userId, a.notifiedBy].filter((x): x is string => !!x);
    const users = new Map((await tx.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } })).map((u) => [u.id, u]));
    const firm = await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id }, select: { name: true, homeState: true, sectors: true } });
    let supervisors: { name: string; channel: string; notes?: string; sector: string }[] = [];
    try { supervisors = (await currentProfile(tx, s.firm.id)).profile.supervisors; } catch { /* no country profile yet */ }
    return { a, fn, prev, other, users, firm, supervisors };
  });
  if (!d) notFound();
  const { a, fn, prev, other, users, firm } = d;
  const who = (x: { userId: string | null; name: string | null; email: string | null }) => (x.userId ? users.get(x.userId) : null) ?? (x.name ? { name: x.name, email: x.email ?? "" } : null);
  const person = who(a);
  if (!person) notFound();
  // Prefer the supervisors for the firm's own sectors; show all if none match.
  const mine = d.supervisors.filter((x) => firm.sectors.some((sec) => x.sector.toUpperCase().replace(/\W+/g, "_").includes(sec)));
  const supervisors = mine.length ? mine : d.supervisors;
  const prevUser = prev ? who(prev) : null;
  const otherUser = other ? who(other) : null;
  const { subject, body } = regulatorNotice({
    fn,
    firm: { name: firm.name, country: countryName(firm.homeState) },
    person: { name: person.name, email: person.email },
    fromDate: iso(a.fromDate),
    previous: prev && prevUser ? { name: prevUser.name, fromDate: iso(prev.fromDate), toDate: iso(prev.toDate!), reason: prev.reason } : null,
    other: otherUser ? { name: otherUser.name, email: otherUser.email } : null,
    sender: { name: s.user.name, email: s.user.email },
  });
  return (
    <div className="max-w-3xl space-y-6" data-testid="inform-regulator">
      <div className="space-y-1">
        <Link href="/app/firm/governance" className="text-sm text-accent underline">← Roles and duties</Link>
        <PageTitle className="text-3xl" help={<>The AML rules require your firm to inform its AML supervisor who your Compliance Officer and your Compliance Manager are, and to inform them when either changes. When the Compliance Officer is replaced, give the reason.</>}>Inform the Regulator</PageTitle>
        <p className="text-muted">{person.name}, {ROLE_NAME[fn]}, from {iso(a.fromDate)}.</p>
      </div>

      {a.notifiedAt ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-300 bg-green-50 p-4 text-sm dark:border-green-800 dark:bg-green-950">
          <p><strong>Regulator informed</strong> on {iso(a.notifiedAt)}{a.notifiedBy && users.get(a.notifiedBy) ? ` (recorded by ${users.get(a.notifiedBy)!.name})` : ""}.</p>
          <ActionButton action={markRegulatorInformedAction.bind(null, a.id, false)}>Undo</ActionButton>
        </section>
      ) : null}

      <section className="space-y-2 rounded-2xl border border-border p-4 text-sm">
        <h2 className="text-lg font-semibold">1. Where to send it</h2>
        {supervisors.length ? (
          <ul className="space-y-2">
            {supervisors.map((x, i) => {
              const email = emailOf(x.channel);
              return (
                <li key={i} className="rounded-xl bg-surface p-3">
                  <p className="font-semibold">{x.name}</p>
                  <p>{email ? <a className="text-accent underline" href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>{x.channel}</a> : /^https?:\/\//.test(x.channel) ? <a className="text-accent underline" href={x.channel} target="_blank" rel="noreferrer">{x.channel}</a> : x.channel}</p>
                  {x.notes ? <p className="text-muted">{x.notes}</p> : null}
                  <p className="text-xs text-muted">Supervises: {x.sector}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p>Your AML supervisor isn&apos;t in your Country Profile yet. Add it in <Link href="/app/settings/country-profile" className="text-accent underline">Settings → Country Profile</Link> (supervisors), then come back here. It is the authority that supervises your sector for AML in {countryName(firm.homeState)}.</p>
        )}
        <p className="text-muted">Send it by email, or through the supervisor&apos;s portal if they ask for that. Some supervisors also want a signed letter: if so, attach this text as a PDF signed by management.</p>
      </section>

      <section className="space-y-3 rounded-2xl border border-border p-4 text-sm">
        <h2 className="text-lg font-semibold">2. Email</h2>
        <div className="flex items-center justify-between gap-3"><span className="font-medium">Subject</span><CopyButton text={subject} label="Copy subject" /></div>
        <p className="rounded-xl bg-surface p-3 font-medium">{subject}</p>
        <div className="flex items-center justify-between gap-3"><span className="font-medium">Email text</span><CopyButton text={body} label="Copy email text" /></div>
        <pre className="whitespace-pre-wrap rounded-xl bg-surface p-3 font-[inherit]">{body}</pre>
        <p className="text-muted">Check the text before you send it, and keep a copy of what you sent.</p>
      </section>

      {!a.notifiedAt && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4 text-sm">
          <p><strong>3. Sent it?</strong> Record it here so the reminder goes away and your records show when the regulator was informed.</p>
          <ActionButton action={markRegulatorInformedAction.bind(null, a.id, true)} variant="primary">I&apos;ve informed the regulator</ActionButton>
        </section>
      )}
    </div>
  );
}
