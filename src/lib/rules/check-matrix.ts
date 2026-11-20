/**
 * Who needs which check (spec §4.2; AMLR Art. 20, 22, 58, 62–63). Every person
 * or entity in a client's structure gets a required check from its role(s). A
 * party with several roles gets the strictest. Unknown roles or entity types
 * fall back to the strictest check, so nothing is under-checked by omission.
 */

export type StructureRole =
  | "client"
  | "beneficial-owner"
  | "intermediate-owner"
  | "minority-owner"
  | "controller"
  | "senior-managing-official"
  | "trust-settlor"
  | "trustee"
  | "trust-protector"
  | "trust-beneficiary"
  | "nominee"
  | "director"
  | "unknown";

/** Strictest first. */
export type CheckLevel = "full" | "register" | "reasonable" | "identify" | "screen-only";
const ORDER: CheckLevel[] = ["full", "register", "reasonable", "identify", "screen-only"];

export interface RequiredCheck {
  level: CheckLevel;
  screen: true;
  label: string;
  article: string;
  why: string;
}

const LABEL: Record<CheckLevel, string> = {
  full: "Identity check (eID, document or in person)",
  register: "Company register extract",
  reasonable: "Reasonable measures (register, document or identity check)",
  identify: "Identify (name, date of birth, nationality)",
  "screen-only": "Screening only",
};

function forRole(kind: "natural" | "legal" | "arrangement", role: StructureRole, edd: boolean): { level: CheckLevel; article: string; why: string } {
  const person = kind === "natural";
  switch (role) {
    case "client":
      return person ? { level: "full", article: "Art. 22(1)(a), 22(6)", why: "The client must be identified and verified." } : { level: "register", article: "Art. 22(1)(b), 22(7)", why: "Verify the entity from the company register." };
    case "beneficial-owner":
    case "controller":
      return edd && person
        ? { level: "full", article: "Art. 20(1)(b), 34", why: "High-risk client: verify the beneficial owner's identity." }
        : { level: person ? "reasonable" : "register", article: "Art. 20(1)(b), 22(1)(c)", why: "Identify the beneficial owner and take reasonable measures to verify." };
    case "senior-managing-official":
      return { level: "reasonable", article: "Art. 63(4)", why: "No beneficial owner found: identify the senior managing officials." };
    case "trustee":
      return person ? { level: "full", article: "Art. 58, 22", why: "The trustee acts for the arrangement." } : { level: "register", article: "Art. 58", why: "Corporate trustee: verify from the register." };
    case "trust-settlor":
    case "trust-protector":
      return edd && person ? { level: "full", article: "Art. 58, 34", why: "High-risk: verify." } : { level: "reasonable", article: "Art. 58", why: "Beneficial owner of the arrangement." };
    case "trust-beneficiary":
      return edd ? { level: "reasonable", article: "Art. 58", why: "High-risk: verify named beneficiaries." } : { level: "identify", article: "Art. 58", why: "Identify the beneficiaries or the class." };
    case "nominee":
      return { level: person ? "full" : "register", article: "Art. 62(1), 66", why: "Nominees and their nominators must be identified and verified." };
    case "intermediate-owner":
      return { level: "reasonable", article: "Art. 20(1)(b)", why: "Understand the ownership chain." };
    case "director":
      return { level: "identify", article: "Art. 22(1)(b)", why: "Identify the people in the company's senior management (directors)." };
    case "minority-owner":
      return { level: "screen-only", article: "Art. 20(1)(d)", why: "Below the threshold: screened for sanctions (including the 50% rule)." };
    default:
      return { level: person ? "full" : "register", article: "Art. 20, 22", why: "Role not known: the strictest check applies." };
  }
}

export function requiredCheck(kind: "natural" | "legal" | "arrangement" | "unknown", roles: StructureRole[], opts: { edd: boolean }): RequiredCheck {
  const k = kind === "unknown" ? "natural" : kind; // unknown entity type → treated as a person (strictest)
  const rs = roles.length ? roles : (["unknown"] as StructureRole[]);
  let best = forRole(k, rs[0], opts.edd);
  for (const r of rs.slice(1)) {
    const c = forRole(k, r, opts.edd);
    if (ORDER.indexOf(c.level) < ORDER.indexOf(best.level)) best = c;
  }
  // A legal entity can't be identity-checked: its strictest is the register.
  if (k !== "natural" && best.level === "full") best = { ...best, level: "register" };
  return { level: best.level, screen: true, label: LABEL[best.level], article: best.article, why: best.why };
}

export interface PartyEvidence {
  identityVerified: boolean;
  registerExtract: boolean;
  documentOnFile: boolean;
  fromRegister: boolean; // added from a register extract
  clientRegisterChecked: boolean; // the client's company/BO register was consulted
  identified: boolean; // name + date of birth or nationality (persons) / name (entities)
  screened: boolean;
}

/** Is the required check done? Reasonable measures accept several kinds of evidence. */
export function checkSatisfied(level: CheckLevel, e: PartyEvidence): boolean {
  switch (level) {
    case "full": return e.identityVerified;
    case "register": return e.registerExtract;
    case "reasonable": return e.identityVerified || e.registerExtract || e.documentOnFile || e.fromRegister || e.clientRegisterChecked;
    case "identify": return e.identified;
    case "screen-only": return true;
  }
}
