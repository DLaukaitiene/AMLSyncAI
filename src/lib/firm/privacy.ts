/**
 * Privacy notice for clients and DPIA template (spec §3 row 34, §4A.6;
 * AMLR Art. 76; GDPR Art. 13–14, 35). AMLSyncAI is the firm's processor.
 */
import type { GeneratedDoc } from "@/lib/docs/model";
import type { CountryProfile } from "@/lib/rules/country-profile";

export interface PrivacyInput {
  firm: { name: string; memberState: string; emailDomain: string };
  profile: CountryProfile;
  aiEnabled: boolean;
}

export function privacyNoticeDoc(i: PrivacyInput, version: number, date: string): GeneratedDoc {
  const dpa = i.profile.dataProtectionAuthority?.name ?? "your national data protection authority";
  return {
    title: "Privacy notice — anti-money-laundering checks",
    subtitle: i.firm.name,
    meta: [`Version ${version} · ${date}`, "GDPR Art. 13–14 · AMLR (EU) 2024/1624 Art. 76"],
    sections: [
      { id: "who", heading: "Who is responsible", blocks: [{ p: `${i.firm.name} is the controller of the personal data described here. Contact us at privacy@${i.firm.emailDomain}.` }] },
      { id: "why", heading: "Why we process your data", blocks: [{ p: "EU anti-money-laundering law requires us to identify and verify our clients, their beneficial owners and representatives, to understand the purpose of our work and the source of funds, to check sanctions lists, to monitor our relationship, and to report suspicions to the authorities. We process your data only for these purposes (legal obligation, GDPR Art. 6(1)(c); AMLR Art. 76) and never for marketing or other commercial purposes." }] },
      { id: "what", heading: "What data we process", blocks: [{ list: [
        "Identification data: names, date and place of birth, nationalities, address, ID document details and copies, national ID or tax number.",
        "For companies: registration details, owners, directors and representatives.",
        "Information about the purpose of our work, your occupation, the source of funds and, where required, the source of wealth.",
        "Results of checks against sanctions lists and lists of politically exposed persons, and any relevant public information.",
        "Our assessment of the risk, and records of our decisions.",
      ] }] },
      { id: "auto", heading: "Automated steps and your rights", blocks: [{ p: `Our software calculates a risk level from the information collected and screens names against official lists. A member of our staff reviews every decision to accept, refuse or end a relationship. You can ask us to explain how a decision about you was reached and to challenge it, except where this would reveal information we must keep confidential by law (AMLR Art. 76(5)).${i.aiEnabled ? " We may use AI to help draft documents; a person always reviews them, and your data is not used to train AI models." : ""}` }] },
      { id: "sharing", heading: "Who we share it with", blocks: [{ list: [
        "Our AML software provider (AMLSyncAI), as our processor, hosting data in the EU.",
        "Identity-verification and screening providers we use for these checks.",
        `Authorities when the law requires it, for example ${i.profile.fiu?.name ?? "the Financial Intelligence Unit"} or ${i.profile.supervisors[0]?.name ?? "our supervisor"}.`,
      ] }] },
      { id: "retention", heading: "How long we keep it", blocks: [{ p: `We keep the data for ${i.profile.retentionYears} years after our relationship ends, an occasional transaction is carried out or we decline to act, and then delete it, unless an authority requires us to keep it longer (AMLR Art. 77).` }] },
      { id: "rights", heading: "Your rights", blocks: [{ p: `You have the right to access and correct your data, and in some cases to restrict its processing. Some rights are limited where AML law requires (AMLR Art. 76). You can complain to ${dpa}.` }] },
    ],
  };
}

export function dpiaDoc(i: PrivacyInput, version: number, date: string): GeneratedDoc {
  return {
    title: "Data protection impact assessment — AML processing",
    subtitle: i.firm.name,
    meta: [`Version ${version} · ${date}`, "GDPR Art. 35 · template to be reviewed by the firm"],
    sections: [
      { id: "description", heading: "1. Description of the processing", blocks: [{ p: "Customer due diligence, screening, risk assessment, monitoring, suspicion reporting and record-keeping as required by AMLR, using AMLSyncAI as processor." }] },
      { id: "necessity", heading: "2. Necessity and proportionality", blocks: [{ list: [
        "Legal basis: legal obligation (GDPR Art. 6(1)(c)); criminal-offence data only as permitted by AMLR Art. 76 and national law.",
        "Data minimisation: only the AMLR / CDD RTS data set is collected; screening is limited to parties linked to a matter.",
        "Retention: deleted after the AMLR retention period unless under legal hold; the audit log keeps no identifiable data.",
        "No commercial reuse; no use of data to train AI models.",
      ] }] },
      { id: "risks", heading: "3. Risks to individuals", blocks: [{ table: { head: ["Risk", "Likelihood", "Severity"], rows: [
        ["Unauthorised access to identity documents and case data", "Low", "High"],
        ["Incorrect sanctions or PEP match leading to refusal", "Medium", "High"],
        ["Tipping-off or disclosure of a suspicion report", "Low", "High"],
        ["Over-retention of data", "Low", "Medium"],
        ["Automated decision without human review", "Low", "High"],
      ] } }] },
      { id: "measures", heading: "4. Measures", blocks: [{ list: [
        "EU-only hosting; per-firm encryption keys; field-level encryption for ID numbers and case content.",
        "Mandatory two-factor authentication, step-up re-authentication, role-based and need-to-know access; case data visible only to the Compliance Officer.",
        "Every possible match reviewed by a person with a written reason; every accept / refuse decision approved by a named person.",
        "Automatic deletion workflow at the end of retention; legal hold only on authority order.",
        "Audit log and security log; incident response with notification within 24 hours.",
        ...(i.aiEnabled ? ["AI used only for drafting text, always reviewed; prompts and outputs logged; EU processing confirmed with the provider."] : []),
      ] }] },
      { id: "conclusion", heading: "5. Conclusion", blocks: [{ p: "[to be completed by the firm: residual risk acceptable / consult the data protection authority]" }] },
    ],
  };
}
