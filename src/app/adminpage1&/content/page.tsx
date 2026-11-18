import { requireAdmin } from "@/lib/server/backoffice/access";
import { adminDb } from "@/lib/server/db";
import { Badge, fmtDateTime, Page, Section, Table } from "@/components/admin";
import { EU_CORE, EU_CORE_VERSION } from "@/lib/rules/eu-core";
import { countryProfileSchema, setupChecklist } from "@/lib/rules/country-profile";

const EU = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"];
/** Parameters marked [verify] in src/lib/rules/eu-core.ts (§3A.4 provisional parameters). */
const PROVISIONAL = new Set(["cdd.linkedTransactionWindowDays"]);

function flatten(o: Record<string, unknown>, prefix = ""): [string, string][] {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" && !Array.isArray(v) ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)] as [string, string]]));
}

/**
 * Rules content (§14): the EU Core catalogue (in code, versioned, changed by
 * pull request with review), Country Profile coverage across firms (counts of
 * filled parameters, never firm data), and official list freshness.
 */
export default async function ContentPage() {
  await requireAdmin("content.view");
  const [profiles, lists] = await Promise.all([
    adminDb.countryProfileVersion.findMany({ orderBy: { version: "desc" }, distinct: ["firmId", "officeId"], select: { memberState: true, data: true } }),
    adminDb.screeningList.findMany({ where: { firmId: null }, orderBy: { loadedAt: "desc" }, select: { name: true, version: true, loadedAt: true, active: true, _count: { select: { entries: true } } } }),
  ]);
  const byState = new Map<string, { profiles: number; required: number; requiredMissing: number; reviewed: number }>();
  for (const p of profiles) {
    const parsed = countryProfileSchema.safeParse(p.data);
    if (!parsed.success) continue;
    const c = setupChecklist(parsed.data);
    const s = byState.get(p.memberState) ?? { profiles: 0, required: 0, requiredMissing: 0, reviewed: 0 };
    s.profiles++;
    s.required += c.filter((x) => x.status === "filled" || x.status === "required-missing").length;
    s.requiredMissing += c.filter((x) => x.status === "required-missing").length;
    if (parsed.data.nationalRiskAssessmentReviewed) s.reviewed++;
    byState.set(p.memberState, s);
  }
  const rules = flatten(EU_CORE as unknown as Record<string, unknown>).filter(([k]) => k !== "version");
  return (
    <Page title="Rules content" intro={`EU Core ${EU_CORE_VERSION}. Rule changes are made in src/lib/rules/ through a reviewed pull request (four eyes) with tests, then released with release notes. Firms fill in Country Profiles themselves; AMLSync-maintained Country Packs are not built yet.`}>
      <Section title="Country Profile coverage" note="Per member state: firm profiles in use and how many required parameters are still empty. A state is ready to sell when AMLSync has a legally reviewed Country Pack for it [decide].">
        <Table testId="coverage" head={["State", "Profiles in use", "Required parameters missing", "National risk assessment reviewed", "State"]} rows={EU.map((st) => {
          const s = byState.get(st);
          const tone = !s ? "neutral" : s.requiredMissing === 0 ? "ok" : s.requiredMissing < s.required / 2 ? "warn" : "bad";
          return [st, s?.profiles ?? 0, s ? `${s.requiredMissing} of ${s.required}` : "—", s ? `${s.reviewed} of ${s.profiles}` : "—", <Badge key="b" tone={tone}>{!s ? "no firms" : tone === "ok" ? "complete" : tone === "warn" ? "partial" : "gaps"}</Badge>];
        })} />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="EU Core catalogue" note="AMLR (EU) 2024/1624 unless stated. Application date 10 July 2027.">
          <Table head={["Parameter", "Value", ""]} rows={rules.map(([k, v]) => [<code key="k" className="text-xs">{k}</code>, v, PROVISIONAL.has(k) ? <Badge key="p" tone="warn">provisional [verify]</Badge> : ""])} />
        </Section>
        <Section title="Sanctions list ingestion" note="Load with scripts/load-list.mts; re-screening of all firms runs after each load (/api/cron/rescreen).">
          <Table head={["List", "Version", "Entries", "Loaded", "Freshness"]} rows={lists.map((l) => [l.name + (l.active ? "" : " (inactive)"), l.version, l._count.entries, fmtDateTime(l.loadedAt), Date.now() - l.loadedAt.getTime() > 86_400_000 ? <Badge key="f" tone="warn">older than 24 h</Badge> : <Badge key="f" tone="ok">fresh</Badge>])} empty="No official list loaded." />
        </Section>
      </div>
    </Page>
  );
}
