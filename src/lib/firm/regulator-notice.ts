/**
 * The email a firm sends its AML supervisor when it appoints or changes its Compliance Officer
 * or the Compliance Manager (AMLR Art. 11). Plain text, ready to copy.
 */
export type AppointmentFn = "compliance-officer" | "compliance-manager";

export const ROLE_NAME: Record<AppointmentFn, string> = {
  "compliance-officer": "Compliance Officer",
  "compliance-manager": "Compliance Manager (the member of management responsible for AML compliance)",
};

export interface NoticeInput {
  fn: AppointmentFn;
  firm: { name: string; country: string };
  person: { name: string; email: string };
  fromDate: string; // YYYY-MM-DD
  previous?: { name: string; fromDate: string; toDate: string; reason: string | null } | null;
  other?: { name: string; email: string } | null; // holder of the other role, for context
  sender: { name: string; email: string };
}

export function regulatorNotice(i: NoticeInput): { subject: string; body: string } {
  const role = ROLE_NAME[i.fn];
  const short = i.fn === "compliance-officer" ? "Compliance Officer" : "Compliance Manager";
  const subject = `${i.firm.name}: ${i.previous ? "change of" : "appointment of"} ${short}`;
  const lines = [
    "Dear Sir or Madam,",
    "",
    `In accordance with Article 11 of Regulation (EU) 2024/1624 (AMLR) and the applicable national rules, ${i.firm.name} (${i.firm.country}) informs you that it has appointed:`,
    "",
    `  Name: ${i.person.name}`,
    `  Role: ${role}`,
    `  Effective from: ${i.fromDate}`,
    `  Email: ${i.person.email}`,
    "",
  ];
  if (i.previous) {
    lines.push(
      `This appointment replaces ${i.previous.name}, who held the role from ${i.previous.fromDate} to ${i.previous.toDate}.`,
      `Reason for the change: ${i.previous.reason?.trim() || "not stated"}.`,
      "",
    );
  }
  if (i.other) {
    lines.push(
      `For completeness: our ${i.fn === "compliance-officer" ? "Compliance Manager" : "Compliance Officer"} is ${i.other.name} (${i.other.email}).`,
      "",
    );
  }
  lines.push(
    "Please let us know if you need any further information or documents.",
    "",
    "Kind regards,",
    i.sender.name,
    i.firm.name,
    i.sender.email,
  );
  return { subject, body: lines.join("\n") };
}

/** A supervisor channel that is an email address, so the page can offer a mailto: link. */
export function emailOf(channel: string): string | null {
  const m = channel.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
  return m ? m[0] : null;
}
