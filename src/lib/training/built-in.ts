/**
 * Built-in AML training (AMLR Art. 12): short modules in plain words. Core
 * modules for everyone; a sector module for the firm's sector. Completion is
 * recorded with an attestation, and counts towards the yearly training duty.
 */
export interface BuiltInModule { key: string; title: string; minutes: number; sectors?: string[]; content: string }

export const BUILT_IN_TRAINING: BuiltInModule[] = [
  {
    key: "essentials", title: "AML essentials under the EU AML Regulation", minutes: 30,
    content: [
      "Why it matters: from 10 July 2027 the EU AML Regulation (EU) 2024/1624 applies directly to our firm. Breaches can lead to fines for the firm and for managers.",
      "Know your client: before we work for a client we identify and verify them and the people who own or control them (25% or more, or control by other means), understand the purpose of the work and screen everyone against sanctions lists. A client can't be accepted while anything is open.",
      "Higher risk: politically exposed persons, links with high-risk countries, complex structures, cash and unusual transactions need enhanced due diligence and senior approval.",
      "Cash: we never accept cash of €10,000 or more (or the lower national limit). Several smaller payments that belong together count as one.",
      "Suspicion: if something feels wrong, report it to the Compliance Officer at once using 'Report a suspicion'. Don't investigate on your own and don't complete the transaction until told it may go ahead.",
      "Tipping-off: never tell the client or anyone else that a report has been or may be made.",
      "Sanctions: a true sanctions match means we stop immediately and make nothing available to the person. The Compliance Officer notifies the authority.",
      "Records: everything we do is recorded and kept for 5 years after the relationship ends.",
    ].join("\n\n"),
  },
  {
    key: "suspicion", title: "Spotting and reporting suspicious activity", minutes: 20,
    content: [
      "What counts: you don't need proof. A suspicion is enough: something that doesn't make sense for this client, and that could involve money from crime or financing of terrorism.",
      "Warning signs: the client won't say where the money comes from; cash, or cash split into smaller amounts; someone else pays; money from or to high-risk countries; structures more complex than needed; a rush, or no interest in price; deals far from market value; documents that look false.",
      "What to do: stop, don't go ahead with the transaction if you can avoid it, and report to the Compliance Officer in AMLSync App ('Report a suspicion to the Compliance Officer' on the case or payment). Write down what you saw and why it worries you.",
      "What not to do: don't investigate further on your own, don't confront the client, and never tell the client or anyone else (tipping-off is an offence).",
      "What happens next: the Compliance Officer decides whether to report to the FIU and does so promptly. A reported transaction is usually held for 3 working days. Reporting in good faith is protected by law.",
    ].join("\n\n"),
  },
  {
    key: "sanctions", title: "Sanctions and politically exposed persons (PEPs)", minutes: 15,
    content: [
      "Sanctions: EU and UN sanctions forbid making money or assets available to listed people and companies, and to companies they own or control (more than 50%). AMLSync App screens every client and owner, and re-screens daily.",
      "If there's a possible match: compare date of birth, nationality and other details. Record 'not the same person' with the reason, or 'confirmed match'. A confirmed match means: stop, freeze, and the Compliance Officer notifies the sanctions authority.",
      "PEPs: people with prominent public functions (ministers, MPs, judges, ambassadors, senior officers, board members of state companies), their family members and close associates. Being a PEP isn't wrong, but needs senior management approval, checks on the source of wealth and funds, and closer monitoring, also for 12 months after leaving office.",
    ].join("\n\n"),
  },
  {
    key: "real-estate", title: "AML for real estate agents", minutes: 15, sectors: ["ESTATE_AGENT"],
    content: [
      "Both sides: estate agents check both the buyer and the seller, and in lettings the landlord and tenant when the monthly rent is €10,000 or more.",
      "Timing: identify the parties early; verify them after the offer is accepted and before money or the property changes hands.",
      "Watch for: cash, payments from third parties, buyers who don't care about price or inspections, quick resales at much higher prices, purchases through companies or trusts with unclear owners, and foreign buyers from high-risk countries.",
    ].join("\n\n"),
  },
  {
    key: "accountants", title: "AML for accountants, auditors and tax advisers", minutes: 15, sectors: ["ACCOUNTANT"],
    content: [
      "Every client: accountants, auditors and tax advisers are obliged entities for all their clients, not only for certain transactions.",
      "Watch for: income that doesn't match the business, unexplained loans or capital injections, frequent changes of owners or directors, invoices for services that don't seem real, and clients who want you to move money for them.",
      "Privilege: tax advisers and auditors have a reporting exemption only where national law gives it. When in doubt, ask the Compliance Officer.",
    ].join("\n\n"),
  },
  {
    key: "legal", title: "AML for lawyers and notaries", minutes: 15, sectors: ["LEGAL"],
    content: [
      "When the rules apply: when you help a client buy or sell property or companies, handle client money or assets, open or manage accounts, set up or run companies, trusts or similar structures, or carry out financial or real estate transactions for them.",
      "Privilege: you don't report information received while defending a client in proceedings or advising on their legal position, unless you know the client wants advice for money laundering. Everything else follows the normal rules.",
      "Watch for: unusual use of the client account, transactions without a clear purpose, and instructions to structure deals to avoid thresholds.",
    ].join("\n\n"),
  },
  {
    key: "dealers", title: "AML for dealers in high-value goods", minutes: 15, sectors: ["HVG_TRADER", "PRECIOUS_METALS", "ART_TRADER"],
    content: [
      "Cash: identify every buyer paying €3,000 or more in cash (including linked payments). Never accept cash of €10,000 or more, or the lower national limit.",
      "Suppliers: check your suppliers too, not only your buyers.",
      "Reports: sales of cars of €250,000 or more, and of aircraft or boats of €7.5 million or more, are reported to the FIU.",
      "Watch for: buyers who pay in many small amounts, use third parties, or buy and quickly return or resell goods.",
    ].join("\n\n"),
  },
];

/** Modules that apply to a firm: the core ones plus its sector's. */
export function modulesForFirm(sectors: string[]): BuiltInModule[] {
  return BUILT_IN_TRAINING.filter((m) => !m.sectors || m.sectors.some((s) => sectors.includes(s)));
}
