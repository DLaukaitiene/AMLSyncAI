/**
 * Automatic company-email verification at sign-up (spec §8C.2, §11.14).
 *
 * - Free and disposable email domains are refused.
 * - The domain does NOT have to match the company name (v0.11).
 * - The domain must have MX records and be at least 30 days old [validate threshold].
 * - One firm per domain.
 * No manual review: every attempt ends as accepted or refused.
 */

export const MIN_DOMAIN_AGE_DAYS = 30;

/** Common free-mail providers. Extend from a maintained list in production. */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "hotmail.co.uk", "hotmail.fr", "hotmail.de", "hotmail.it",
  "live.com", "live.fr", "live.de", "msn.com", "yahoo.com", "yahoo.co.uk", "yahoo.fr", "yahoo.de", "yahoo.it", "yahoo.es",
  "ymail.com", "aol.com", "icloud.com", "me.com", "mac.com", "gmx.com", "gmx.de", "gmx.net", "gmx.at", "gmx.fr",
  "web.de", "t-online.de", "freenet.de", "mail.com", "mail.ru", "yandex.com", "yandex.ru", "proton.me", "protonmail.com",
  "pm.me", "tutanota.com", "tuta.io", "zoho.com", "laposte.net", "orange.fr", "free.fr", "sfr.fr", "wanadoo.fr",
  "libero.it", "virgilio.it", "alice.it", "tiscali.it", "seznam.cz", "centrum.cz", "wp.pl", "o2.pl", "onet.pl",
  "interia.pl", "inbox.lv", "inbox.lt", "one.lt", "mail.ee", "abv.bg", "freemail.hu", "citromail.hu", "azet.sk",
  "telenet.be", "skynet.be", "ziggo.nl", "kpnmail.nl", "home.nl", "planet.nl", "sapo.pt", "terra.es", "bluewin.ch",
  "eircom.net", "mail.bg", "post.cz", "hey.com", "fastmail.com",
]);

/** Common disposable/temporary email domains. Extend from a maintained list in production. */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "sharklasers.com", "10minutemail.com", "temp-mail.org",
  "tempmail.com", "yopmail.com", "yopmail.fr", "trashmail.com", "getnada.com", "throwawaymail.com", "dispostable.com",
  "maildrop.cc", "mintemail.com", "fakeinbox.com", "mohmal.com", "emailondeck.com", "spamgourmet.com", "tempr.email",
  "discard.email", "mailnesia.com", "burnermail.io", "33mail.com", "moakt.com", "tmail.ws", "tempail.com",
]);

export interface DomainLookups {
  /** Returns true if the domain has at least one MX record. */
  hasMx(domain: string): Promise<boolean>;
  /** Registration date of the domain, or null if it cannot be determined. */
  registeredAt(domain: string): Promise<Date | null>;
  /** True if a firm already uses this domain. */
  domainInUse(domain: string): Promise<boolean>;
}

export type DomainRefusal =
  | "invalid-email"
  | "free-email"
  | "disposable-email"
  | "no-mx"
  | "domain-too-new"
  | "domain-age-unknown"
  | "domain-in-use";

export interface DomainCheckResult {
  accepted: boolean;
  domain: string | null;
  refusal?: DomainRefusal;
  message?: string;
  checks: { freeOrDisposable: boolean; hasMx?: boolean; domainAgeDays?: number | null };
}

const EMAIL_RE = /^[^\s@]+@([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+)$/i;

export function emailDomain(email: string): string | null {
  const m = EMAIL_RE.exec(email.trim());
  return m ? m[1].toLowerCase() : null;
}

function isListed(domain: string, list: ReadonlySet<string>): boolean {
  // Match the domain itself or any parent (e.g. "eu.mailinator.com").
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (list.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

const MESSAGES: Record<DomainRefusal, string> = {
  "invalid-email": "Enter a valid email address.",
  "free-email": "Please sign up with your company email address. Free email providers are not accepted.",
  "disposable-email": "Please sign up with your company email address. Temporary email addresses are not accepted.",
  "no-mx": "This email domain cannot receive email. Please use your company email address.",
  "domain-too-new": "This email domain was registered too recently. Please use your company's established email domain.",
  "domain-age-unknown": "We could not confirm this email domain. Please use your company's established email domain.",
  "domain-in-use": "A firm already uses this email domain. Ask that firm's Owner to invite you.",
};

export async function checkSignupEmail(email: string, lookups: DomainLookups, now: Date = new Date()): Promise<DomainCheckResult> {
  const domain = emailDomain(email);
  const refuse = (refusal: DomainRefusal, checks: DomainCheckResult["checks"]): DomainCheckResult => ({
    accepted: false,
    domain,
    refusal,
    message: MESSAGES[refusal],
    checks,
  });

  if (!domain) return refuse("invalid-email", { freeOrDisposable: false });
  if (isListed(domain, FREE_EMAIL_DOMAINS)) return refuse("free-email", { freeOrDisposable: true });
  if (isListed(domain, DISPOSABLE_EMAIL_DOMAINS)) return refuse("disposable-email", { freeOrDisposable: true });

  const hasMx = await lookups.hasMx(domain);
  if (!hasMx) return refuse("no-mx", { freeOrDisposable: false, hasMx });

  const registered = await lookups.registeredAt(domain);
  const ageDays = registered ? Math.floor((now.getTime() - registered.getTime()) / 86_400_000) : null;
  // Secure by default: an unknown age is refused rather than waved through.
  if (ageDays === null) return refuse("domain-age-unknown", { freeOrDisposable: false, hasMx, domainAgeDays: null });
  if (ageDays < MIN_DOMAIN_AGE_DAYS) return refuse("domain-too-new", { freeOrDisposable: false, hasMx, domainAgeDays: ageDays });

  if (await lookups.domainInUse(domain)) return refuse("domain-in-use", { freeOrDisposable: false, hasMx, domainAgeDays: ageDays });

  return { accepted: true, domain, checks: { freeOrDisposable: false, hasMx, domainAgeDays: ageDays } };
}

/** An invited user must be on the firm's domain unless the Owner allows them as external (§8C.3). */
export function checkInviteEmail(email: string, firmDomain: string, allowExternal: boolean): { allowed: boolean; external: boolean; message?: string } {
  const domain = emailDomain(email);
  if (!domain) return { allowed: false, external: false, message: MESSAGES["invalid-email"] };
  if (domain === firmDomain.toLowerCase()) return { allowed: true, external: false };
  if (allowExternal) return { allowed: true, external: true };
  return { allowed: false, external: true, message: `Invitations must use an @${firmDomain} address unless the Owner allows an external user.` };
}
