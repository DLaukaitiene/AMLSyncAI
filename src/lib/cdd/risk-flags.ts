/**
 * High-risk flags a user can tick on a client (AMLR Annex III, Art. 24, 34, 39, 66, 79, 80).
 *
 * One list drives the form (grouped, with a "?" explanation), risk scoring (points / forced EDD)
 * and the acceptance gate (hard blocks). Ticked flags are stored in party details as `riskFlags`;
 * bearer shares and nominees keep their older boolean keys so existing data keeps working.
 */

export type FlagGroup = "client" | "ownership" | "product";
export type FlagAppliesTo = "NATURAL" | "LEGAL" | "both";

export interface RiskFlag {
  id: string;
  group: FlagGroup;
  appliesTo: FlagAppliesTo;
  label: string;
  help: string;
  article: string;
  /** Points added to the client risk score. */
  points?: number;
  /** Forces High risk and EDD whatever the total. */
  forcesHigh?: boolean;
  /** Hard block: the client can't be accepted while ticked, and no override clears it. */
  block?: string;
  /** Stored as its own boolean in party details (older field), not in `riskFlags`. */
  legacyKey?: "bearerShares" | "nomineeArrangements";
}

export const FLAG_GROUPS: { id: FlagGroup; label: string }[] = [
  { id: "client", label: "Client risk factors" },
  { id: "ownership", label: "Ownership and register" },
  { id: "product", label: "Products and transactions" },
];

export const RISK_FLAGS: RiskFlag[] = [
  // --- Client (Annex III, point 1) -------------------------------------------------------------
  {
    id: "personal-asset-vehicle", group: "client", appliesTo: "LEGAL", points: 3, article: "Annex III(1)(c)",
    label: "Personal asset-holding vehicle",
    help: "A company or arrangement that only holds a person's or family's assets (property, investments, a yacht) and does no real trading.",
  },
  {
    id: "no-economic-activity", group: "client", appliesTo: "LEGAL", points: 4, article: "Annex III(1)(h)",
    label: "No real economic activity",
    help: "A shell: set up somewhere it has no real business, staff or premises, and no apparent economic reason to exist.",
  },
  {
    id: "owned-by-shell", group: "client", appliesTo: "LEGAL", points: 4, article: "Annex III(1)(i)",
    label: "Owned by a shell company",
    help: "The client is owned, directly or through other companies, by an entity or arrangement with no real economic activity. This is a separate factor from the client itself being a shell.",
  },
  {
    id: "cash-intensive", group: "client", appliesTo: "both", points: 2, article: "Annex III(1)",
    label: "Cash-intensive business",
    help: "The client's business takes a lot of cash: for example restaurants, bars, car washes, used cars, timber trade, kiosks or currency exchange.",
  },
  {
    id: "complex-ownership", group: "client", appliesTo: "LEGAL", points: 3, article: "Annex III(1)",
    label: "Ownership too complex for the business",
    help: "The ownership structure looks unusual or excessively complex for what the company does. The test is complexity relative to the business, not a set number of layers: a small local shop owned through two foreign companies counts.",
  },
  {
    id: "residence-by-investment", group: "client", appliesTo: "NATURAL", points: 3, article: "Annex III(1)",
    label: "Residence or citizenship by investment",
    help: "A non-EU national applying for, or holding, residence rights or citizenship in exchange for an investment, property purchase or capital transfer (a \"golden visa\").",
  },
  {
    id: "unusual-circumstances", group: "client", appliesTo: "both", points: 3, article: "Annex III(1)(a)",
    label: "Unusual circumstances",
    help: "The relationship is unusual: for example the client has no obvious reason to use your firm, is far away for no reason, avoids meeting, or won't explain things.",
  },

  // --- Ownership and register --------------------------------------------------------------------
  {
    id: "bearer-shares", legacyKey: "bearerShares", group: "ownership", appliesTo: "LEGAL", article: "Art. 79",
    block: "Entities with bearer shares that are not converted, immobilised or deposited cannot be accepted.",
    label: "Bearer shares not converted, immobilised or deposited",
    help: "Shares owned by whoever physically holds the certificate, with no name in a share register. New ones can't be issued; existing ones must be converted to registered shares, immobilised or deposited with a financial institution. They lose voting and distribution rights after 10 July 2029 and are cancelled on 10 July 2030. Listed companies are exempt.",
  },
  {
    id: "bearer-shares-immobilised", group: "ownership", appliesTo: "LEGAL", points: 3, article: "Art. 79; Annex III(1)",
    label: "Bearer shares, immobilised or deposited",
    help: "The company has bearer shares, but they are immobilised or held by a financial institution, so the holder is recorded. Allowed, but still a higher-risk factor: check who holds them.",
  },
  {
    id: "bearer-warrants", group: "ownership", appliesTo: "LEGAL", article: "Art. 79",
    block: "Bearer share warrants that are not in intermediated form are prohibited.",
    label: "Bearer share warrants not in intermediated form",
    help: "Warrants (rights to buy shares) that belong to whoever holds the paper, not held through a securities account. These are prohibited.",
  },
  {
    id: "nominee", legacyKey: "nomineeArrangements", group: "ownership", appliesTo: "LEGAL", points: 3, article: "Annex III(1)",
    label: "Nominee shareholders or directors",
    help: "People named on the register or board who hold the shares or role on behalf of someone else, often through a corporate service provider. You must identify the person behind them.",
  },
  {
    id: "nominee-undisclosed", group: "ownership", appliesTo: "LEGAL", points: 5, article: "Art. 66",
    label: "Nominee hasn't disclosed who they act for",
    help: "Nominee shareholders and directors must keep and disclose who their nominator is and the nominator's beneficial owners, and the company must give this to you. A refusal to disclose is a strong red flag.",
  },
  {
    id: "bo-register-mismatch", group: "ownership", appliesTo: "LEGAL", points: 2, article: "Art. 24",
    label: "Doesn't match the beneficial-owner register",
    help: "What you found differs from the central beneficial-owner register. Ticking this opens a discrepancy case: report it within 14 calendar days unless the client corrects the register.",
  },
  {
    id: "no-bo-identified", group: "ownership", appliesTo: "LEGAL", points: 4, article: "Art. 22(2)",
    label: "No beneficial owner identified, or doubts remain",
    help: "You couldn't identify a beneficial owner, or you doubt the one given. Record this, then identify and verify the senior managing officials.",
  },

  // Country risk (Annex III, point 3) is not ticked by hand: the app checks every linked country
  // against the versioned lists in rules/country-risk-lists automatically.

  // --- Products and transactions (Annex III, point 2; Art. 34, 39, 80) ---------------------------
  {
    id: "third-party-payments", group: "product", appliesTo: "both", points: 3, article: "Annex III(2)",
    label: "Payments from unknown or unrelated third parties",
    help: "Someone with no clear link to the client pays for the service or sends money on the client's behalf.",
  },
  {
    id: "anonymity-new-tech", group: "product", appliesTo: "both", points: 3, article: "Annex III(2)",
    label: "Anonymity-favouring products or new technology",
    help: "Products or transactions that make it easier to stay anonymous, or new or developing technologies such as crypto-assets.",
  },
  {
    id: "high-risk-goods", group: "product", appliesTo: "both", points: 3, article: "Annex III(2)",
    label: "High-risk goods",
    help: "Transactions involving oil, arms, precious metals or stones, tobacco, cultural artefacts or other items of archaeological, historical or religious value, ivory or protected species.",
  },
  {
    id: "unusual-transaction", group: "product", appliesTo: "both", points: 5, forcesHigh: true, article: "Art. 34(2)",
    label: "Transactions needing extra scrutiny",
    help: "Transactions that are complex, unusually large, follow an unusual pattern, or have no apparent economic or lawful purpose. These always require enhanced due diligence.",
  },
  {
    id: "very-wealthy", group: "product", appliesTo: "both", points: 5, forcesHigh: true, article: "Art. 34",
    label: "Very wealthy client (personalised wealth services)",
    help: "A relationship involving at least EUR 5 million in assets handled through personalised services, for a client with at least EUR 50 million in total assets. Enhanced due diligence applies. Only relevant if you provide wealth management.",
  },
  {
    id: "cash-over-limit", group: "product", appliesTo: "both", article: "Art. 80",
    block: "Cash payments above the legal limit can't be accepted. In Lithuania the limit is EUR 5,000, including linked payments that add up past it. Agree payment by bank transfer, then untick this.",
    label: "Wants to pay cash above the legal limit",
    help: "The client wants to pay in cash above the legal limit (Lithuania EUR 5,000; EU maximum EUR 10,000), in one go or in linked payments. Recorded cash transactions are also checked automatically.",
  },
  {
    id: "anonymous-prepaid-cards", group: "product", appliesTo: "both", article: "Art. 79",
    block: "Payments with anonymous prepaid cards issued outside the EU can't be accepted.",
    label: "Pays with anonymous non-EU prepaid cards",
    help: "Only relevant if you accept card payments as an acquirer: payments made with anonymous prepaid cards issued in non-EU countries can't be accepted.",
  },
  {
    id: "shell-bank", group: "product", appliesTo: "LEGAL", article: "Art. 39",
    block: "Correspondent relationships with shell institutions are prohibited.",
    label: "Shell bank or shell institution",
    help: "Only relevant for banks and financial institutions: a credit or financial institution with no physical presence and no real management where it's incorporated, and not part of a regulated group.",
  },
];

/** Flags ticked on a party, from `riskFlags` and the two older boolean keys. */
export function tickedFlags(d: Record<string, unknown>): RiskFlag[] {
  const ids = new Set((d.riskFlags as string[] | undefined) ?? []);
  return RISK_FLAGS.filter((f) => (f.legacyKey ? !!d[f.legacyKey] : ids.has(f.id)));
}

export const RISK_FLAG_IDS = RISK_FLAGS.filter((f) => !f.legacyKey).map((f) => f.id);
