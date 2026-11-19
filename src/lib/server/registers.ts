import "server-only";
import type { Tx } from "./db";
import { STATUS_LABEL } from "@/components/chips";

/**
 * Registers for the Reports page: point-in-time CSV snapshots from live data,
 * the evidence a supervisor asks for first. Case and report content is never
 * included — only the register fields (type, dates, status).
 */
export const REGISTERS = [
  { id: "clients", pillar: "Clients", title: "Client Register", text: "Every client with type, status, risk level, date onboarded and next review." },
  { id: "risk", pillar: "Risk", title: "Risk Register", text: "All client risk assessments with score, calculated and final rating, override reason and date." },
  { id: "verifications", pillar: "Clients", title: "Identity Verification Register", text: "Every identity verification: person, method, provider and date." },
  { id: "screening", pillar: "Monitoring", title: "Screening Alerts", text: "All possible matches for clients and staff, with how each was resolved." },
  { id: "transactions", pillar: "Monitoring", title: "Transaction Log", text: "Every recorded payment with method, flags, monitoring status and review reasons." },
  { id: "matters", pillar: "Clients", title: "Matters Register", text: "Every matter with type, sector, status and date opened." },
  { id: "suspicious", pillar: "Regulatory", title: "Suspicious Matters", text: "Internal reports and FIU reports: dates, decision and submission reference. No case content." },
  { id: "training", pillar: "People", title: "Staff Training Register", text: "In-app training per staff member with due dates, plus external workshops and courses attended." },
  { id: "audit", pillar: "System", title: "Audit Trail", text: "Every recorded action: when, who, what and which fields changed (never the values)." },
] as const;
export type RegisterId = (typeof REGISTERS)[number]["id"];

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "");
const t = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 19).replace("T", " ") : "");

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows.map((r) => r.map((v) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s; // no spreadsheet formulas from text
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\r\n") + "\r\n";
}

export async function buildRegister(tx: Tx, id: RegisterId, only?: string[]): Promise<(string | number | null)[][]> {
  const users = new Map((await tx.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const who = (uid: string | null | undefined) => (uid ? users.get(uid) ?? "former user" : "system");
  switch (id) {
    case "clients": {
      const files = await tx.cddFile.findMany({ where: { role: "CLIENT", ...(only?.length ? { id: { in: only } } : {}) }, orderBy: { createdAt: "asc" }, include: { party: true, riskAssessments: { orderBy: { createdAt: "desc" }, take: 1 } } });
      return [["Client", "Type", "Status", "Risk", "Scope", "Source", "Onboarded", "Decided", "Next review"],
        ...files.map((f) => [f.party.displayName, f.party.kind === "NATURAL" ? "Individual" : "Entity", STATUS_LABEL[f.status] ?? f.status, f.riskAssessments[0]?.final ?? "", f.scope, f.source, d(f.createdAt), d(f.decidedAt), d(f.nextRefreshOn)])];
    }
    case "risk": {
      const ras = await tx.clientRiskAssessment.findMany({ orderBy: { createdAt: "asc" }, include: { cddFile: { include: { party: { select: { displayName: true } } } } } });
      return [["Client", "Assessed", "Score", "Calculated", "Final", "Override reason", "Overridden by", "Ruleset"],
        ...ras.map((r) => [r.cddFile.party.displayName, t(r.createdAt), r.score, r.calculated, r.final, r.overrideReason ?? "", r.overrideById ? who(r.overrideById) : "", r.rulesetVersion])];
    }
    case "verifications": {
      const vs = await tx.identityVerification.findMany({ orderBy: { verifiedAt: "asc" }, include: { party: { select: { displayName: true } } } });
      return [["Person", "Method", "Assurance", "Provider", "Reason if not eID", "Verified"],
        ...vs.map((v) => [v.party.displayName, v.method, v.assuranceLevel ?? "", v.provider ?? "", v.fallbackReason ?? "", t(v.verifiedAt)])];
    }
    case "screening": {
      const rs = await tx.screeningResult.findMany({ where: { decision: { not: "NO_MATCH" } }, orderBy: { screenedAt: "asc" }, include: { party: { select: { displayName: true } } } });
      const staff = await tx.staffScreening.findMany({ where: { status: { not: "clear" } }, orderBy: { screenedAt: "asc" } });
      return [["Subject", "Who", "List", "Matched name", "Score", "Status", "Reason", "Reviewed by", "Screened", "Decided"],
        ...rs.map((r) => { const m = r.matchData as { matchedName?: string; score?: number }; return [r.party.displayName, "Client", r.listName, m.matchedName ?? "", m.score ?? "", r.decision, r.comment ?? "", r.reviewerId ? who(r.reviewerId) : "", t(r.screenedAt), t(r.decidedAt)]; }),
        ...staff.flatMap((s) => (s.matches as { listName: string; matchedName: string; score: number }[]).map((m) => [who(s.userId), "Staff", m.listName, m.matchedName, m.score, s.status, s.reviewNote ?? "", s.reviewedById ? who(s.reviewedById) : "", t(s.screenedAt), ""]))];
    }
    case "transactions": {
      const ts = await tx.transaction.findMany({ orderBy: { date: "asc" }, include: { matter: { select: { title: true } } } });
      const names = new Map((await tx.party.findMany({ where: { id: { in: [...new Set(ts.map((x) => x.customerId))] } }, select: { id: true, displayName: true } })).map((p) => [p.id, p.displayName]));
      return [["Date", "Client", "Matter", "Amount EUR", "Method", "From country", "Third-party payer", "Description", "Status", "Flags", "Review", "Reviewed by"],
        ...ts.map((x) => [d(x.date), names.get(x.customerId) ?? "", x.matter.title, Number(x.amountEUR), x.method, x.fromCountry ?? "", x.thirdPartyPayer ? "yes" : "", x.description ?? "", x.monitorStatus, ((x.flags as { text: string }[]) ?? []).map((f) => f.text).join("; "), x.reviewNote ?? "", x.reviewedById ? who(x.reviewedById) : ""])];
    }
    case "matters": {
      const ms = await tx.matter.findMany({ orderBy: { createdAt: "asc" } });
      return [["Matter", "Type", "Sector", "Status", "Opened"], ...ms.map((m) => [m.title, m.type, m.sector, m.status, d(m.createdAt)])];
    }
    case "suspicious": {
      const cs = await tx.case.findMany({ orderBy: { createdAt: "asc" }, include: { reports: true } });
      return [["Case", "Type", "Opened", "Suspicion formed", "Decision", "Decided", "Status", "Report", "Report status", "Submitted", "Submission ref"],
        ...cs.flatMap((c) => {
          const base = [c.id.slice(0, 8), c.type, t(c.createdAt), t(c.suspicionFormedAt), c.decision ?? "", t(c.decidedAt), c.status];
          return c.reports.length ? c.reports.map((r) => [...base, r.type, r.status, t(r.submittedAt), r.submissionRef ?? ""]) : [[...base, "", "", "", ""]];
        })];
    }
    case "training": {
      const as = await tx.trainingAssignment.findMany({ orderBy: { assignedAt: "asc" }, include: { module: { select: { title: true } } } });
      const ext = await tx.externalTraining.findMany({ orderBy: { date: "asc" } });
      return [["Staff member", "Training", "Source", "Assigned / held", "Due", "Completed", "Status", "Provider", "Minutes"],
        ...as.map((a) => [who(a.userId), a.module.title, "In-app module", d(a.assignedAt), d(a.dueOn), d(a.completedAt), a.completedAt ? "Completed" : a.dueOn < new Date() ? "Overdue" : "Pending", "", ""]),
        ...ext.flatMap((e) => e.attendeeIds.map((u) => [who(u), e.title, `External: ${e.type}`, d(e.date), "", d(e.date), "Attended", e.provider ?? "", e.durationMinutes]))];
    }
    case "audit": {
      const ev = await tx.auditEvent.findMany({ orderBy: { at: "asc" }, take: 50_000 });
      return [["When (UTC)", "User", "Action", "Object", "Object id", "Fields"], ...ev.map((e) => [t(e.at), who(e.userId), e.action, e.objectType, e.objectId, e.fields.join(" ")])];
    }
  }
}
