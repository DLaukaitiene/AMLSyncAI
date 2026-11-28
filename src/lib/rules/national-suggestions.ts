/**
 * Pre-filled national details the firm reviews and saves on its Country Profile [28 Nov 2026].
 * Nothing here is applied until someone saves it. Lithuania only for now; other countries show empty fields.
 * Keep these current: authorities rename and holidays change (last checked Nov 2026).
 */
type Contact = { name: string; channel: string };
export interface NationalSuggestions {
  supervisor?: Contact;
  fiu?: Contact;
  sanctionsAuthority?: Contact;
  boRegister?: Contact;
  dataProtectionAuthority?: Contact;
  whistleblowing?: string;
  holidays?: string[];
}

const FNTT: Contact = { name: "Financial Crime Investigation Service (FNTT)", channel: "https://www.fntt.lt" };

/** Lithuania: the AML supervisor depends on the sector. */
function ltSupervisor(sectors: string[]): Contact {
  if (sectors.includes("LEGAL")) return { name: "Lithuanian Bar Association (advocates) / Chamber of Notaries (notaries)", channel: "https://www.advokatura.lt" };
  if (sectors.includes("GAMBLING")) return { name: "Gaming Control Authority", channel: "https://lpt.lrv.lt" };
  if (sectors.includes("CROWDFUNDING") || sectors.includes("CREDIT_INTERMEDIARY")) return { name: "Bank of Lithuania", channel: "https://www.lb.lt" };
  return FNTT; // accountants, estate agents, traders, company service providers and others
}

const LT_HOLIDAYS = [
  "2026-01-01", "2026-02-16", "2026-03-11", "2026-04-05", "2026-04-06", "2026-05-01", "2026-05-03", "2026-06-07", "2026-06-24", "2026-07-06", "2026-08-15", "2026-11-01", "2026-11-02", "2026-12-24", "2026-12-25", "2026-12-26",
  "2027-01-01", "2027-02-16", "2027-03-11", "2027-03-28", "2027-03-29", "2027-05-01", "2027-05-02", "2027-06-06", "2027-06-24", "2027-07-06", "2027-08-15", "2027-11-01", "2027-11-02", "2027-12-24", "2027-12-25", "2027-12-26",
];

export function nationalSuggestions(memberState: string, sectors: string[]): NationalSuggestions {
  if (memberState !== "LT") return {};
  return {
    supervisor: ltSupervisor(sectors),
    fiu: { name: FNTT.name, channel: "https://www.fntt.lt (online reporting for obliged entities)" },
    sanctionsAuthority: { name: FNTT.name, channel: "https://www.fntt.lt" },
    boRegister: { name: "JANGIS, Centre of Registers (Registrų centras)", channel: "https://www.registrucentras.lt" },
    dataProtectionAuthority: { name: "State Data Protection Inspectorate", channel: "https://vdai.lrv.lt" },
    whistleblowing: "Prosecutor General's Office, https://www.prokuraturos.lt",
    holidays: LT_HOLIDAYS,
  };
}
