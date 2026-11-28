import "server-only";
import { adminDb, withTenant } from "./db";
import { sendEmail, appUrl } from "./email";
import { hit } from "./rate-limit";
import { firmObligations } from "./obligations";
import { OBLIGATIONS } from "@/lib/obligations/catalog";
import { obligationSummary } from "@/lib/obligations/evaluate";

/** Who gets the summary: "auto" = weekly for the Owner and Compliance Officer, off for others. */
export function summaryFrequency(pref: string, roles: string[]): "weekly" | "monthly" | "off" {
  if (pref === "weekly" || pref === "monthly" || pref === "off") return pref;
  return roles.includes("OWNER") || roles.includes("COMPLIANCE_OFFICER") ? "weekly" : "off";
}

/** The summary text: where the firm stands on each obligation, what to do first. */
export async function summaryText(firmId: string, seeCases: boolean): Promise<{ subject: string; text: string } | null> {
  const ob = await withTenant(firmId, (tx) => firmObligations(tx, firmId, { seeCases }));
  const sum = obligationSummary(ob.statuses);
  const firm = await adminDb.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true } });
  const title = new Map(OBLIGATIONS.map((o) => [o.id, o.title]));
  const act = ob.statuses.filter((s) => s.state === "overdue");
  const todo = ob.statuses.filter((s) => s.state === "todo" || s.state === "pending" || s.state === "blocked");
  const lines = [
    `${firm.name}: ${sum.done} of ${sum.total} AML obligations in order${sum.overdue ? `, ${sum.overdue} need action now` : ""}.`,
    ...(act.length ? ["Act now:", ...act.map((s) => `- ${title.get(s.id)}: ${s.detail.replace(/\n/g, " · ")}`)] : []),
    ...(todo.length ? ["To do:", ...todo.map((s) => `- ${title.get(s.id)}: ${s.detail.replace(/\n/g, " · ")}`)] : []),
    ...(!act.length && !todo.length ? ["Everything is in order. Well done."] : []),
  ];
  return {
    subject: act.length ? `AMLSync App: ${act.length} obligation(s) need action now` : `AMLSync App: your compliance summary`,
    text: `${lines.join("\n")}\n\nOpen your dashboard:\n${appUrl("/app")}\n\nChange how often you get this summary in Settings → Email settings.`,
  };
}

/** Daily job: sends summaries that are due (weekly on Mondays, monthly on the 1st). */
export async function sendDueSummaries(now = new Date()): Promise<{ sent: number }> {
  const monday = now.getUTCDay() === 1, first = now.getUTCDate() === 1;
  if (!monday && !first) return { sent: 0 };
  const users = await adminDb.user.findMany({
    where: { deactivatedAt: null, firm: { status: "active" } },
    select: { id: true, email: true, roles: true, emailSummary: true, firmId: true },
  });
  let sent = 0;
  const cache = new Map<string, Awaited<ReturnType<typeof summaryText>>>();
  for (const u of users) {
    const f = summaryFrequency(u.emailSummary, u.roles);
    if (!((f === "weekly" && monday) || (f === "monthly" && first))) continue;
    if (!(await hit(`summary:${u.id}:${now.toISOString().slice(0, 10)}`, { limit: 1, windowSec: 86_400 }))) continue;
    const seeCases = u.roles.includes("OWNER") || u.roles.includes("COMPLIANCE_OFFICER");
    const key = `${u.firmId}:${seeCases}`;
    if (!cache.has(key)) cache.set(key, await summaryText(u.firmId, seeCases));
    const m = cache.get(key);
    if (!m) continue;
    await sendEmail(u.email, m.subject, m.text).catch(() => {});
    sent++;
  }
  return { sent };
}
