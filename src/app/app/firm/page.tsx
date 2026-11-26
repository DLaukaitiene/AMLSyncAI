import Link from "next/link";
import { BadgeCheck, BookOpen, Building2, CalendarClock, Download, GraduationCap, Handshake, Lock, Megaphone, Scale } from "lucide-react";
import { Chip, type Tone } from "@/components/chips";
import { hubStatuses, type HubKey } from "@/lib/server/hub";
import type { ObligationState } from "@/lib/obligations/evaluate";
import { requireUser } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { aiEnabled, aiProviderLabel, aiUsageThisMonth } from "@/lib/server/ai";
import { setAiDraftingAction } from "./actions";
import { can } from "@/lib/auth/permissions";
import { SECTORS } from "@/lib/server/auth/flows";
import { ActionForm, Field, Submit } from "@/components/form";
import { saveFirmProfileAction } from "./actions";
import { setDefaultScopeAction } from "../clients/actions";

const CLIENT_TYPES = ["Individuals", "Companies", "Trusts and arrangements", "Non-profit organisations", "Non-EU clients"];

export default async function FirmPage() {
  const s = await requireUser();
  const { firm, hub, aiUsage } = await withTenant(s.firm.id, async (tx) => ({
    firm: await tx.firm.findUniqueOrThrow({ where: { id: s.firm.id } }),
    hub: await hubStatuses(tx, s.firm.id),
    aiUsage: await aiUsageThisMonth(tx, s.firm.id),
  }));
  const edit = can(s.user.roles, "approve.compliance");
  const parts: { key: HubKey; href: string; icon: typeof Scale; title: string }[] = [
    { key: "risk-assessment", href: "/app/firm/risk-assessment", icon: Scale, title: "Business-wide risk assessment" },
    { key: "policies", href: "/app/firm/policies", icon: BookOpen, title: "Policies and procedures" },
    { key: "governance", href: "/app/firm/governance", icon: Building2, title: "Roles and duties" },
    { key: "training", href: "/app/firm/training", icon: GraduationCap, title: "Training" },
    { key: "integrity", href: "/app/firm/integrity", icon: BadgeCheck, title: "Integrity and conflicts" },
    { key: "whistleblowing", href: "/app/firm/whistleblowing", icon: Megaphone, title: "Whistleblowing channel" },
    { key: "outsourcing", href: "/app/firm/outsourcing", icon: Handshake, title: "Outsourcing register" },
    { key: "privacy", href: "/app/firm/privacy", icon: Lock, title: "Privacy notice and DPIA" },
  ];
  const done = parts.filter((p) => hub[p.key].state === "done" || hub[p.key].state === "na").length;
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="text-3xl">Compliance Hub</h1>
      <p className="text-sm text-muted">Your firm&apos;s own AML obligations. Each part generates its document and keeps the approvals and history for your supervisor.</p>
      <p className="text-sm font-medium" data-testid="hub-summary">{done} of {parts.length} in order{parts.some((p) => hub[p.key].state === "overdue") ? " · some need action now" : ""}</p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {parts.map(({ key, href, icon: Icon, title }) => {
          const h = hub[key];
          const border = h.state === "overdue" ? "border-red-300 dark:border-red-800" : h.state === "todo" ? "border-amber-300 dark:border-amber-800" : "border-border";
          return (
            <li key={href} data-testid={`hub-${key}`} data-state={h.state}>
              <Link href={href} className={`flex h-full gap-3 rounded-2xl border bg-background p-4 shadow-[var(--shadow)] transition hover:border-accent ${border}`}>
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-accent"><Icon aria-hidden className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-start justify-between gap-2">
                    <span className="font-semibold">{title}</span>
                    <HubBadge state={h.state} />
                  </span>
                  <span className="block text-sm text-muted">{h.detail}</span>
                  {h.next && (
                    <span className={`flex items-center gap-1 text-xs font-medium ${h.next.tone === "overdue" ? "text-red-700 dark:text-red-300" : h.next.tone === "soon" ? "text-amber-800 dark:text-amber-300" : "text-muted"}`}>
                      <CalendarClock aria-hidden className="h-3.5 w-3.5" />{h.next.text}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
        <li>
          <a href="/api/supervisor-file/firm" className="flex h-full gap-3 rounded-2xl border border-dashed border-border p-4 transition hover:border-accent">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-accent"><Download aria-hidden className="h-5 w-5" /></span>
            <span><span className="block font-semibold">Download the firm supervisor file</span><span className="block text-xs text-muted">Everything a supervisor asks for, as PDF + ZIP</span></span>
          </a>
        </li>
      </ul>
      <section className="space-y-2 rounded-2xl border border-border p-4" data-testid="ai-drafting">
        <h2 className="text-lg font-semibold">AI drafting</h2>
        <p className="text-sm text-muted">AI can write a first draft of a suspicious transaction report narrative, help redraft your policy sections, and read a client&apos;s shareholder register or trust deed to propose the owners. A person always reviews and approves the text; AI never decides anything. The text you ask it to draft is sent to the AI provider ({aiProviderLabel()}) and is not used to train AI models. Your plan includes {aiUsage.strCap} report drafts a month; used this month: {aiUsage.str}. Ownership drafts from documents: {Math.round((aiUsage.ownershipCents / aiUsage.ownershipCapCents) * 100)}% of this month&apos;s allowance used.</p>
        {!aiEnabled() ? (
          <p className="text-sm">AI drafting isn&apos;t available yet. We&apos;ll let you know when it is.</p>
        ) : edit ? (
          <ActionForm action={setAiDraftingAction.bind(null, !firm.aiDrafting)}>
            <p className="text-sm">AI drafting is <strong>{firm.aiDrafting ? "on" : "off"}</strong> for your firm.</p>
            <Submit variant="secondary">{firm.aiDrafting ? "Switch AI drafting off" : "Switch AI drafting on"}</Submit>
          </ActionForm>
        ) : (
          <p className="text-sm">AI drafting is <strong>{firm.aiDrafting ? "on" : "off"}</strong> for your firm. The Owner or Compliance Officer can change this.</p>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Due diligence for new clients</h2>
        <p className="text-sm text-muted">If most of your clients only receive services outside AMLR scope, new client files can start as identification only (identification and sanctions screening). Switch a client to full due diligence as soon as an AMLR service starts.</p>
        <ActionForm action={setDefaultScopeAction}>
          <fieldset disabled={!can(s.user.roles, "gate.override")} className="space-y-3">
            <Field label="New client files start with" name="defaultCddScope">
              <select name="defaultCddScope" defaultValue={firm.defaultCddScope} className="w-full rounded border border-border bg-background px-3 py-2 text-sm" aria-label="Default scope">
                <option value="full">Full due diligence (AMLR)</option>
                <option value="identification-only">Identification only (services outside AMLR scope)</option>
              </select>
            </Field>
            <Submit variant="secondary">Save default</Submit>
          </fieldset>
        </ActionForm>
      </section>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Firm profile</h2>
        <ActionForm action={saveFirmProfileAction}>
          <fieldset disabled={!edit} className="space-y-4">
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Sectors</legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {SECTORS.map(([v, l]) => <label key={v} className="flex items-center gap-2"><input type="checkbox" name="sectors" value={v} defaultChecked={firm.sectors.includes(v as never)} /> {l}</label>)}
              </div>
            </fieldset>
            <Field label="Services (one per line)" name="services">
              <textarea name="services" rows={3} aria-label="Services" defaultValue={firm.services.join("\n")} className="w-full rounded border border-border bg-transparent px-3 py-2 text-sm" />
            </Field>
            <fieldset className="space-y-1 text-sm">
              <legend className="font-medium">Client types</legend>
              <div className="flex flex-wrap gap-4">{CLIENT_TYPES.map((t) => <label key={t} className="flex items-center gap-2"><input type="checkbox" name="clientTypes" value={t} defaultChecked={firm.clientTypes.includes(t)} /> {t}</label>)}</div>
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Number of staff" name="size" type="number" defaultValue={firm.size ?? ""} />
              <Field label="Cross-border business (%)" name="crossBorderPct" type="number" defaultValue={firm.crossBorderPct ?? ""} />
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="usesCash" defaultChecked={firm.usesCash} /> We accept cash</label>
          </fieldset>
          {edit && <Submit>Save firm profile</Submit>}
        </ActionForm>
      </section>
    </div>
  );
}

const HUB_BADGE: Record<ObligationState, { label: string; tone: Tone }> = {
  done: { label: "Done", tone: "green" },
  todo: { label: "To do", tone: "amber" },
  pending: { label: "Awaiting approval", tone: "blue" },
  overdue: { label: "Act now", tone: "red" },
  na: { label: "Not needed", tone: "grey" },
};

function HubBadge({ state }: { state: ObligationState }) {
  const b = HUB_BADGE[state];
  return <Chip tone={b.tone}>{b.label}</Chip>;
}
