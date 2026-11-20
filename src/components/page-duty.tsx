"use client";

import { usePathname } from "next/navigation";
import type { ObligationId } from "@/lib/obligations/catalog";
import { DutyNote } from "./obligations";

/** Which legal duty each page serves: shown as a short "Your duty" note at the top. */
const PAGE_DUTY: Record<string, ObligationId> = {
  "/app/clients": "client-checks",
  "/app/clients/new": "client-checks",
  "/app/remediation": "client-checks",
  "/app/identity-verification": "client-checks",
  "/app/monitoring-alerts": "screening",
  "/app/risk-assessments": "high-risk",
  "/app/matters": "deals",
  "/app/matters/new": "deals",
  "/app/transactions": "deals",
  "/app/cases": "reporting",
  "/app/reports": "reporting",
  "/app/firm/training": "training",
  "/app/team/training-register": "training",
  "/app/firm/integrity": "staff-integrity",
  "/app/firm/whistleblowing": "whistleblowing",
  "/app/team/responsibilities": "compliance-officer",
  "/app/firm/governance": "compliance-officer",
  "/app/firm/risk-assessment": "risk-assessment",
  "/app/firm/policies": "policies",
  "/app/settings/country-profile": "national-rules",
  "/app/registers": "records",
  "/app/records": "records",
};

export function PageDuty() {
  const id = PAGE_DUTY[usePathname()];
  return id ? <div className="mb-6"><DutyNote id={id} /></div> : null;
}
