import "server-only";
import { resolveMx } from "node:dns/promises";
import type { DomainLookups } from "@/lib/security/email-domain";
import { adminDb } from "./db";

/** Real-world lookups for sign-up email verification (spec §8C.2). */
export const domainLookups: DomainLookups = {
  async hasMx(domain) {
    if (process.env.SKIP_DOMAIN_CHECKS === "1") return true;
    try {
      const mx = await resolveMx(domain);
      return mx.some((r) => r.exchange && r.exchange !== ".");
    } catch {
      return false;
    }
  },
  async registeredAt(domain) {
    if (process.env.SKIP_DOMAIN_CHECKS === "1") return null;
    // RDAP: the registry's public registration data. Unknown → null (let through).
    const registrable = domain.split(".").slice(-2).join(".");
    try {
      const res = await fetch(`https://rdap.org/domain/${registrable}`, { signal: AbortSignal.timeout(4000), redirect: "follow" });
      if (!res.ok) return null;
      const body = (await res.json()) as { events?: { eventAction: string; eventDate: string }[] };
      const reg = body.events?.find((e) => e.eventAction === "registration");
      return reg ? new Date(reg.eventDate) : null;
    } catch {
      return null;
    }
  },
  async domainInUse(domain) {
    return (await adminDb.firm.count({ where: { emailDomain: domain } })) > 0;
  },
};
