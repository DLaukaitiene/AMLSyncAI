"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/form";
import { adminDb } from "@/lib/server/db";
import { adminAction, isActionError } from "@/lib/server/backoffice/access";
import { adminAudit } from "@/lib/server/backoffice/audit";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const SEV = ["sev1", "sev2", "sev3", "sev4"];

export async function createIncidentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("incidents.manage", "/adminpage1&/security"); if (isActionError(a)) return a;
  const title = str(fd, "title"), severity = str(fd, "severity"), summary = str(fd, "summary");
  const detected = str(fd, "detectedAt");
  if (title.length < 5) return { error: "Give the incident a title." };
  if (!SEV.includes(severity)) return { error: "Choose a severity." };
  const detectedAt = detected ? new Date(detected.length === 16 ? detected + ":00Z" : detected) : new Date();
  if (Number.isNaN(detectedAt.getTime()) || detectedAt > new Date()) return { error: "Detected at: a past date and time (UTC), e.g. 2026-11-18T09:30." };
  const domains = str(fd, "firms").split(/[\s,;]+/).map((d) => d.toLowerCase()).filter(Boolean);
  const firms = domains.length ? await adminDb.firm.findMany({ where: { emailDomain: { in: domains } }, select: { id: true, emailDomain: true } }) : [];
  if (firms.length !== domains.length) return { error: `Unknown firm domain(s): ${domains.filter((d) => !firms.some((f) => f.emailDomain === d)).join(", ")}` };
  const i = await adminDb.$transaction(async (tx) => {
    const i = await tx.incident.create({
      data: {
        title, severity, summary, detectedAt, personalData: fd.get("personalData") === "on", controllerData: fd.get("controllerData") === "on",
        systems: str(fd, "systems").split(",").map((s) => s.trim()).filter(Boolean), firmIds: firms.map((f) => f.id), createdBy: a.email,
      },
    });
    await adminAudit({ adminEmail: a.email, action: "incident.create", targetType: "Incident", targetId: i.id, details: { severity, personalData: i.personalData, firms: firms.length } }, tx);
    return i;
  });
  redirect(`/adminpage1&/security/incidents/${i.id}`);
}

export async function updateIncidentAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const a = await adminAction("incidents.manage", `/adminpage1&/security/incidents/${id}`); if (isActionError(a)) return a;
  const status = str(fd, "status"), text = str(fd, "text").slice(0, 4000), rootCause = str(fd, "rootCause");
  if (!["open", "contained", "resolved", "closed"].includes(status)) return { error: "Choose a status." };
  if (text.length < 3) return { error: "Write what happened or what was done." };
  const mark = (k: string) => fd.get(k) === "on";
  const cur = await adminDb.incident.findUniqueOrThrow({ where: { id } });
  const dpaNotRequiredReason = str(fd, "dpaNotRequiredReason");
  if (status === "closed" && cur.personalData && !(cur.firmIds.length === 0 || cur.firmsNotifiedAt || mark("firmsNotified"))) return { error: "Record that the affected firms were notified before closing." };
  if (status === "closed" && cur.personalData && cur.controllerData && !(cur.dpaNotifiedAt || cur.dpaNotRequiredReason || mark("dpaNotified") || dpaNotRequiredReason)) return { error: "Record the DPA notification, or why it was not required, before closing." };
  if (status === "closed" && !(rootCause || cur.rootCause)) return { error: "Record the root cause before closing." };
  await adminDb.$transaction(async (tx) => {
    await tx.incident.update({
      where: { id },
      data: {
        status, ...(rootCause ? { rootCause } : {}),
        ...(status === "resolved" || status === "closed" ? { resolvedAt: cur.resolvedAt ?? new Date() } : {}),
        ...(mark("firmsNotified") && !cur.firmsNotifiedAt ? { firmsNotifiedAt: new Date() } : {}),
        ...(mark("dpaNotified") && !cur.dpaNotifiedAt ? { dpaNotifiedAt: new Date() } : {}),
        ...(dpaNotRequiredReason ? { dpaNotRequiredReason } : {}),
        public: fd.get("public") === "on", publicSummary: str(fd, "publicSummary").slice(0, 500) || null,
      },
    });
    await tx.incidentUpdate.create({ data: { incidentId: id, authorEmail: a.email, text } });
    await adminAudit({ adminEmail: a.email, action: "incident.update", targetType: "Incident", targetId: id, details: { status, firmsNotified: mark("firmsNotified"), dpaNotified: mark("dpaNotified") } }, tx);
  });
  revalidatePath(`/adminpage1&/security/incidents/${id}`);
  return { message: "Incident updated." };
}
