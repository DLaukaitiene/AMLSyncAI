"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { requireUser, hasRecentMfa } from "@/lib/server/session";
import { withTenant } from "@/lib/server/db";
import { currentProfile } from "@/lib/server/country-profile";
import { audit } from "@/lib/server/audit";
import { defaultCountryProfile, diffProfiles, parseCountryProfile, type CountryProfileInput } from "@/lib/rules/country-profile";
import { EU_CORE_VERSION } from "@/lib/rules/eu-core";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => (str(fd, k) === "" ? undefined : Number(str(fd, k)));
const lines = (fd: FormData, k: string) => str(fd, k).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function contact(fd: FormData, prefix: string) {
  const name = str(fd, `${prefix}.name`);
  const channel = str(fd, `${prefix}.channel`);
  return name || channel ? { name, channel } : null;
}

/** Builds the profile from the form. Unknown/blank optional values fall back to safe defaults. */
function readForm(fd: FormData, memberState: string): CountryProfileInput {
  const supervisor = contact(fd, "supervisor");
  return {
    memberState,
    supervisors: supervisor ? [{ ...supervisor, sector: str(fd, "supervisor.sector") || "All sectors" }] : [],
    fiu: contact(fd, "fiu"),
    sanctionsAuthority: contact(fd, "sanctionsAuthority"),
    boRegister: contact(fd, "boRegister"),
    businessRegister: contact(fd, "businessRegister"),
    dataProtectionAuthority: contact(fd, "dataProtectionAuthority"),
    whistleblowing: str(fd, "whistleblowing") ? { externalChannel: str(fd, "whistleblowing") } : null,
    sroReportingRoute: { enabled: fd.get("sro.enabled") === "on", body: str(fd, "sro.body") || undefined },
    privilegeNarrowing: { enabled: fd.get("privilege.enabled") === "on", transactionTypes: lines(fd, "privilege.types") },
    cashCapEUR: num(fd, "cashCapEUR"),
    nationalCashReport: {
      enabled: fd.get("cashReport.enabled") === "on",
      thresholdEUR: num(fd, "cashReport.thresholdEUR"),
      deadlineWorkingDays: num(fd, "cashReport.deadlineWorkingDays"),
    },
    thresholdReportDeadlineWorkingDays: num(fd, "thresholdReportDeadlineWorkingDays") ?? null,
    fiuRequestWorkingDays: num(fd, "fiuRequestWorkingDays"),
    additionalEddCases: lines(fd, "additionalEddCases").map((l, i) => {
      const [id, ...rest] = l.split(":");
      return rest.length ? { id: id.trim(), description: rest.join(":").trim() } : { id: `case-${i + 1}`, description: l };
    }),
    nationalRiskAssessmentReviewed: fd.get("nraReviewed") === "on",
    riskAssessmentWaiver: fd.get("raWaiver") === "on",
    retentionYears: num(fd, "retentionYears"),
    workingWeekdays: [1, 2, 3, 4, 5, 6, 7].filter((d) => fd.get(`wd.${d}`) === "on"),
    holidays: lines(fd, "holidays"),
    idDocumentTypes: lines(fd, "idDocumentTypes"),
    acceptedEidSchemes: lines(fd, "acceptedEidSchemes"),
  };
}

export async function saveProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("countryProfile.edit");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/app/settings/country-profile" } };

  const officeId = String(fd.get("officeId") ?? "") || null;
  return withTenant(s.firm.id, async (tx) => {
    const cur = await currentProfile(tx, s.firm.id, officeId);
    const parsed = parseCountryProfile(readForm(fd, cur.profile.memberState));
    if (!parsed.ok) {
      const fieldErrors: Record<string, string[]> = {};
      for (const v of parsed.violations) (fieldErrors[v.field] ??= []).push(v.message);
      return { error: parsed.violations[0].message, fieldErrors };
    }
    const changes = diffProfiles(cur.profile, parsed.profile);
    if (changes.length === 0) return { message: "No changes to save." };

    const version = cur.version + 1;
    const row = await tx.countryProfileVersion.create({
      data: {
        firmId: s.firm.id, officeId, memberState: parsed.profile.memberState, version, enteredById: s.user.id,
        source: str(fd, "source") || null, data: parsed.profile as object,
      },
    });
    // Changes need Compliance Officer approval (§3A.3). Only a CO can save, so the save is the approval.
    const approval = await tx.approval.create({
      data: {
        firmId: s.firm.id, objectType: "CountryProfileVersion", objectId: row.id, decision: "APPROVED",
        userId: s.user.id, role: "COMPLIANCE_OFFICER", euCoreVersion: EU_CORE_VERSION, countryProfileVersion: version,
      },
    });
    await tx.countryProfileVersion.update({ where: { id: row.id }, data: { approvalId: approval.id } });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "update", objectType: "CountryProfile", objectId: row.id, fields: changes.map((c) => c.field) });
    revalidatePath("/app", "layout");
    return { message: `Saved as version ${version}. Changed: ${changes.map((c) => c.field).join(", ")}.` };
  });
}

/** An office or branch in another member state gets its own (host-state) Country Profile (§3A.3 rule 2). */
export async function addOfficeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const s = await requireUser("countryProfile.edit");
  if (!hasRecentMfa(s)) return { error: "For security, confirm it's you first.", data: { stepUp: "/app/settings/country-profile" } };
  const name = String(fd.get("name") ?? "").trim();
  const memberState = String(fd.get("memberState") ?? "").trim().toUpperCase();
  if (name.length < 2) return { error: "Name the office.", fieldErrors: { name: ["Required."] } };
  if (!/^[A-Z]{2}$/.test(memberState)) return { error: "Choose the member state.", fieldErrors: { memberState: ["2-letter code"] } };
  await withTenant(s.firm.id, async (tx) => {
    const o = await tx.office.create({ data: { firmId: s.firm.id, name, memberState } });
    const row = await tx.countryProfileVersion.create({
      data: { firmId: s.firm.id, officeId: o.id, memberState, version: 1, enteredById: s.user.id, source: "Defaults (EU Core)", data: defaultCountryProfile(memberState) as object },
    });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "Office", objectId: o.id, fields: ["memberState"] });
    await audit(tx, { firmId: s.firm.id, userId: s.user.id, action: "create", objectType: "CountryProfile", objectId: row.id, fields: ["version"] });
  });
  revalidatePath("/app/settings/country-profile");
  return { message: `Office added with a ${memberState} Country Profile at EU defaults. Fill it in for that member state.` };
}
