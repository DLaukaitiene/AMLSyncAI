/**
 * Deadlines AMLSync tracks for itself (§10.3, §12.2). [verify] with the DPO.
 */
const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** GDPR Art. 33: as processor, notify firms without undue delay (target ≤ 24 h); as controller, the DPA within 72 h of awareness. */
export function breachDeadlines(detectedAt: Date) {
  return { firmsBy: new Date(detectedAt.getTime() + 24 * 3600_000), dpaBy: new Date(detectedAt.getTime() + 72 * 3600_000) };
}

export type BreachStatus = { label: string; overdue: boolean; done: boolean };

export function breachClock(i: { personalData: boolean; controllerData: boolean; detectedAt: Date; firmsNotifiedAt: Date | null; dpaNotifiedAt: Date | null; dpaNotRequiredReason: string | null; firmIds: string[] }, now = new Date()): BreachStatus[] {
  if (!i.personalData) return [];
  const d = breachDeadlines(i.detectedAt);
  const out: BreachStatus[] = [];
  if (i.firmIds.length) out.push(i.firmsNotifiedAt ? { label: `Firms notified ${i.firmsNotifiedAt.toISOString().slice(0, 16).replace("T", " ")}`, overdue: false, done: true } : { label: `Notify affected firms by ${d.firmsBy.toISOString().slice(0, 16).replace("T", " ")} UTC`, overdue: now > d.firmsBy, done: false });
  if (i.controllerData) {
    if (i.dpaNotifiedAt) out.push({ label: `DPA notified ${i.dpaNotifiedAt.toISOString().slice(0, 16).replace("T", " ")}`, overdue: false, done: true });
    else if (i.dpaNotRequiredReason) out.push({ label: `DPA not notified: ${i.dpaNotRequiredReason}`, overdue: false, done: true });
    else out.push({ label: `Notify the DPA (VDAI [verify]) by ${d.dpaBy.toISOString().slice(0, 16).replace("T", " ")} UTC`, overdue: now > d.dpaBy, done: false });
  }
  return out;
}

/** GDPR Art. 12(3): one month from receipt, extendable by two further months. */
export function dsrDueOn(receivedOn: string, extended = false): string {
  const d = new Date(receivedOn + "T00:00:00Z");
  const months = extended ? 3 : 1;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
  // Day overflow (31 Jan + 1 month) → last day of the target month.
  if (target.getUTCDate() !== d.getUTCDate()) target.setUTCDate(0);
  return iso(target);
}

export function daysUntil(isoDate: string, now = new Date()): number {
  return Math.round((Date.parse(isoDate + "T00:00:00Z") - Date.parse(iso(now) + "T00:00:00Z")) / DAY);
}
