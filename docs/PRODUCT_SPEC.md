# AMLSyncAI — Product Specification

*Version 0.2 (draft) · 13 November 2026*

> **Legal references:** Article and annex references are to Regulation (EU) 2024/1624 (AMLR) and must be checked against the Official Journal text and the final AMLA regulatory technical standards. Items marked **[verify]** are thresholds or references to confirm before the product rules are finalised.

---

## 1. Product overview

AMLSyncAI is EU-wide AML/CFT compliance software for **non-financial obliged entities**. These are businesses that are not banks, payment, e-money or other financial institutions but must comply with AMLR from **10 July 2027**.

The product lets a business:
- assess its own money laundering and terrorist financing risk;
- set up policies, procedures and responsibilities;
- carry out customer due diligence (CDD), including beneficial owners;
- screen against sanctions and PEP lists;
- rate customer risk and apply simplified or enhanced due diligence;
- monitor customers and refresh their files on time;
- record and report suspicions to the national FIU;
- keep complete, audit-ready records and export them for a supervisor.

**Out of scope:** credit institutions and financial institutions under AMLR, including payment and e-money institutions, investment firms, insurers and crypto-asset service providers.

---

## 2. Coverage: EU-wide from launch

The product launches in **all 27 EU member states at once**. AMLR is directly applicable, so the core rules are the same everywhere. National differences are handled by a **Country Pack** for each member state (§6), not by separate products.

---

## 3. Supported obliged entity groups

Each group gets a **Sector Profile**. A Sector Profile sets:
- when CDD is triggered;
- the onboarding form fields;
- the default risk factors;
- red-flag indicators;
- report and record templates.

A business can hold more than one Sector Profile, for example an accounting firm that also provides company services.

### 3.1 Auditors, external accountants and tax advisors
*AMLR Art. 3(3)(a)* — this includes anyone whose main business is giving material help or advice on tax matters.

| | Product behaviour |
|---|---|
| **CDD trigger** | Every new engagement (business relationship); occasional services above the occasional transaction threshold **[verify]** |
| **Customers** | Mostly legal entities and sole traders, with long-term recurring relationships |
| **Key data** | Engagement type (bookkeeping, audit, payroll, tax advice, tax planning), entity details, directors, beneficial owners, group structure, sector of the client's business |
| **Risk factors** | Complex or cross-border structures, cash-intensive client businesses, tax planning involving high-risk jurisdictions, nominee arrangements, reluctance to provide ownership information |
| **Specific features** | Bulk import of existing client portfolio for AMLR remediation; refresh campaigns; beneficial owner ownership tree; option to route suspicion reports via a self-regulatory body where the member state provides for it **[verify]** |

### 3.2 Notaries, lawyers and other independent legal professionals
*AMLR Art. 3(3)(b)* — covered only when they take part in, or help plan, certain transactions for a client.

| | Product behaviour |
|---|---|
| **Scope check** | A **"Is this matter in scope?"** step per matter: buying/selling real property or businesses; managing client money, securities or other assets (incl. crypto-assets); opening or managing bank, savings, securities or crypto-asset accounts; organising contributions for companies; creating, operating or managing trusts, companies, foundations or similar structures. Out-of-scope matters are recorded as such |
| **CDD trigger** | Per in-scope matter / client relationship |
| **Key data** | Matter type, transaction value, counterparties, source of funds, client entity and beneficial owners |
| **Risk factors** | Unexplained urgency, unusual payment routes, third-party funding, use of client account without an underlying transaction, complex structures |
| **Specific features** | Matter-level (not only client-level) due diligence; **legal privilege flag**: suspicion reporting workflow records when the privilege exemption is applied, and why; reporting via self-regulatory body where applicable **[verify]** |

### 3.3 Trust or company service providers (TCSPs)
*AMLR Art. 3(3)(c)*

| | Product behaviour |
|---|---|
| **CDD trigger** | Every relationship: company formation, acting as or arranging director/secretary/nominee shareholder/trustee, registered office or business address services |
| **Key data** | Entity or trust details, settlors, trustees, protectors, beneficiaries, beneficial owners, services provided, nominee arrangements |
| **Risk factors** | Shelf companies, nominee services, multi-layered structures, links to high-risk third countries, frequent changes of ownership |
| **Specific features** | Trust and legal arrangement beneficial owner model (all parties, not only ≥25% owners); service register per entity; discrepancy reporting to central beneficial ownership registers **[verify]** |

### 3.4 Estate agents (incl. letting agents)
*AMLR Art. 3(3)(d)* — letting is covered for monthly rent of **€10,000 or more [verify]**.

| | Product behaviour |
|---|---|
| **CDD trigger** | Every purchase/sale transaction; lettings at or above the monthly rent threshold |
| **Parties** | CDD on **both buyer and seller** (and both landlord and tenant for covered lettings) **[verify]** |
| **Key data** | Property address and type, price/rent, party role, financing method (mortgage, own funds, cash, crypto), source of funds, intermediaries |
| **Risk factors** | Cash or crypto payment, purchase through a company or trust, foreign buyer from a high-risk country, price far above/below market, quick resale, third-party payer |
| **Specific features** | **Transaction record** linking property + all parties; source-of-funds evidence checklist; transaction-level risk score as well as party-level score |

### 3.5 Traders in precious metals and precious stones
*AMLR Art. 3(3)(e)*

| | Product behaviour |
|---|---|
| **CDD trigger** | Occasional transactions at or above the applicable threshold **[verify]** and all business relationships (e.g. regular wholesale buyers/sellers) |
| **Key data** | Item type (gold, silver, platinum, diamonds, other stones), weight/quality, value, origin, payment method, supplier/buyer |
| **Risk factors** | Cash, anonymous or third-party payers, unclear origin, conflict-affected supply regions, repeated transactions just below thresholds |
| **Specific features** | **Point-of-sale quick check** (identify and screen a customer in under two minutes); **linked transaction detection** (same customer, short period — per AMLA linked-transactions standard); supply chain/origin record |

### 3.6 Traders in high-value goods
*AMLR Art. 3(3)(f) and the high-value goods definition (Annex) **[verify values]***

| Goods | Value threshold **[verify]** |
|---|---|
| Jewellery, goldsmith or silversmith articles | ≥ €10,000 |
| Clocks and watches | ≥ €10,000 |
| Motor vehicles | ≥ €250,000 |
| Aircraft | ≥ €7,500,000 |
| Watercraft | ≥ €7,500,000 |

| | Product behaviour |
|---|---|
| **CDD trigger** | Sale or purchase of a listed item at or above its threshold, regardless of payment method **[verify]** |
| **Key data** | Item category, description, serial/VIN/registration, value, payment method, buyer/seller, delivery country |
| **Risk factors** | Third-party payment, payment from high-risk countries, export shortly after purchase, purchase through a company with unclear ownership, cash or crypto |
| **Specific features** | Item catalogue with automatic threshold check; point-of-sale quick check; linked transaction detection |

### 3.7 Art and cultural goods traders, galleries, auction houses and free-zone storage
*AMLR Art. 3(3) **[verify letter]*** — for transactions or a series of linked transactions of **€10,000 or more [verify]**.

| | Product behaviour |
|---|---|
| **CDD trigger** | Sale, purchase, brokering or storage (incl. free zones and customs warehouses) at or above the threshold |
| **Key data** | Artwork details, provenance, value, buyer, seller, consignor, intermediaries, storage location |
| **Risk factors** | Anonymous bidders, agents acting for undisclosed principals, unclear provenance, payments from third parties, items moved to free zones |
| **Specific features** | **Auction mode** (pre-registration CDD for bidders, post-sale CDD for buyer and consignor); provenance record; free-zone storage register |

### 3.8 Gambling service providers
*AMLR Art. 3(3) **[verify letter]*** — CDD for winnings or stakes of **€2,000 or more [verify]**, or on account opening for online gambling.

| | Product behaviour |
|---|---|
| **CDD trigger** | Player account opening (online); stakes/winnings at or above the threshold (land-based) |
| **Key data** | Player identity, payment methods, deposit/withdrawal history, source of funds for high spenders |
| **Risk factors** | Deposits not matched by play, multiple payment methods, deposits from third parties, play pattern changes, high-risk country |
| **Specific features** | High-volume onboarding API; **transaction monitoring rules** for deposits, withdrawals and play; affordability/source-of-funds review queue |

### 3.9 Crowdfunding service providers and intermediaries (outside Regulation (EU) 2020/1503)
*AMLR Art. 3(3) **[verify letter]***

| | Product behaviour |
|---|---|
| **CDD trigger** | Onboarding of project owners and investors/contributors |
| **Key data** | Project owner entity and beneficial owners, project details, investor/contributor identity, amounts |
| **Risk factors** | Project owners with opaque ownership, contributions from high-risk countries, round-number or rapid contributions, investor = project owner links |
| **Specific features** | Two-sided onboarding (project owners and backers); campaign-level monitoring |

### 3.10 Mortgage and consumer credit intermediaries (non-financial institutions)
*AMLR Art. 3(3) **[verify letter]***

| | Product behaviour |
|---|---|
| **CDD trigger** | Every client for whom credit is intermediated |
| **Key data** | Borrower identity, purpose of credit, property (for mortgages), income/source of funds, lender |
| **Risk factors** | Early repayment from unexplained funds, inconsistent income documents, property purchased through companies |
| **Specific features** | Case per credit application; document consistency checks |

### 3.11 Investment migration operators
*AMLR Art. 3(3) **[verify letter]*** — businesses that represent or help third-country nationals get residence rights in exchange for investment.

| | Product behaviour |
|---|---|
| **CDD trigger** | Every client |
| **Key data** | Applicant and family members, nationality, investment type and amount, **source of wealth and source of funds** |
| **Risk factors** | High-risk or sanctioned nationalities, PEPs, complex funding routes |
| **Specific features** | **Enhanced due diligence by default**; family member records; source-of-wealth evidence pack |

### 3.12 Professional football clubs and football agents *(applies from 10 July 2029)*
*AMLR Art. 3(3) **[verify letter and club scope criteria]***

| | Product behaviour |
|---|---|
| **CDD trigger** | Transactions with investors, sponsors, advertisers, other clubs and agents; player transfers |
| **Key data** | Counterparty, transaction type (transfer, sponsorship, investment, agency fee), value, beneficial owners of investors and sponsors |
| **Risk factors** | Investors from high-risk countries, opaque ownership of sponsors, transfer fees far from market value, third-party ownership |
| **Specific features** | Transfer and sponsorship transaction registers; profile available but activated by date |

### 3.13 Other groups
The product must also support member states that add **further sectors under national law** (AMLR allows extension to other sectors **[verify]**). This is done through a configurable **"Custom Sector Profile"** in the Country Pack.

---

## 4. Users and roles

| Role | Description | Permissions |
|---|---|---|
| **Owner / Management body member** | Person in the management body responsible for AML compliance (AMLR Art. 11 **[verify]**) | Approves policies and risk assessments, sees everything, manages subscription |
| **Compliance Officer** | Day-to-day AML compliance, receives internal suspicion reports | Approves high-risk clients, decides on FIU reports, manages settings |
| **Staff** | Front-office and admin staff who onboard customers | Create and update customers, run screenings, raise internal reports |
| **Read-only / Auditor** | Internal or external auditor, supervisor during inspection | View and export only, time-limited access |

Users are mostly **not compliance experts**. Every screen states what is required, why, and what to do next, in plain language.

---

## 5. Functional modules

### 5.1 Firm Risk Assessment (AMLR Art. 10)
- Guided questionnaire built from the Sector Profile(s) and Country Pack: customers, products and services, delivery channels, geography, cash use, volumes.
- Uses the EU supranational risk assessment and national risk assessment factors for the relevant member state.
- Output: inherent risk, description of controls, residual risk, action list; signed by the management body member.
- Version history; review reminders (at least annually **[verify]** and whenever the business changes).

### 5.2 Policies, Procedures and Governance (AMLR Art. 9, 11)
- **Policy Builder** that generates an AML/CFT policy and procedures from the firm profile and risk assessment.
- Records the appointed management body member and compliance officer, with dates.
- Approval workflow and version history.
- Staff acknowledgement that they have read the policy.

### 5.3 Customer Onboarding — CDD (AMLR Art. 19–22)
- **Natural persons:** full name, date and place of birth, nationality(ies), residential address, ID document details, occupation/source of income, purpose and intended nature of the relationship.
- **Legal entities:** name, legal form, registration number, registered address and principal place of business, directors and senior managers, ownership and control structure.
- **Trusts and legal arrangements:** settlors, trustees, protectors, beneficiaries or class of beneficiaries, other controllers.
- **Representatives:** people acting on behalf of the customer and their authority.
- **Verification:** document upload, remote ID verification integration, register extract retrieval where available.
- Data fields follow the **AMLA CDD regulatory technical standard**. A field library is updated when the standard changes.
- **Completeness checklist:** a customer cannot be marked "accepted" until required items are complete, or an approved exception is recorded.
- **Bulk import** of existing customers with gap report (for AMLR remediation of existing files).

### 5.4 Beneficial Ownership (AMLR Art. 51–55 **[verify]**)
- Capture of ownership (≥25% direct or indirect) and control by other means.
- **Ownership tree** with automatic calculation of indirect percentages through multiple layers.
- When no beneficial owner can be identified, records senior managing officials and the steps taken.
- Comparison with central beneficial ownership register data; **discrepancy reporting** workflow.

### 5.5 Customer Risk Scoring (AMLR Art. 20, 33–34)
- **Rule-based, transparent** model: customer type, geography (incl. EU high-risk third-country list), sector, product/service, delivery channel, PEP status, cash use, structure complexity, sector-specific factors from §3.
- Default weights per Sector Profile, adjustable by the Compliance Officer with change log.
- Result: **Low / Medium / High**, showing every factor that contributed.
- **Simplified due diligence** allowed for low risk where permitted.
- **Enhanced due diligence** checklist for high risk: source of wealth, source of funds, additional verification, management approval, increased monitoring.
- Mandatory EDD triggers: high-risk third countries, PEPs, very high-net-worth individuals (≥ €50 million assets **[verify]**), other cases defined in AMLR.
- Manual override only with a written reason and approval.

### 5.6 Screening
- **Sanctions:** EU consolidated list of financial sanctions (mandatory), UN Security Council list; optional national, UK and US lists.
- **PEPs, family members and close associates** (as required by the AMLA CDD standard).
- **Adverse media** (optional).
- Fuzzy name matching with transliteration (Latin, Cyrillic, Greek, Arabic and other scripts).
- **Match review:** each potential match is resolved as *true match* or *false positive* with a mandatory comment.
- **Continuous re-screening** of all active customers and beneficial owners when lists change; alerts for new hits.
- Asset freeze workflow for true sanctions matches, plus notification to the competent authority **[verify]**.

### 5.7 Transactions and Linked-Transaction Detection
- Transaction register per customer: date, amount, currency, payment method, counterparty, item/property/matter.
- Automatic threshold checks per Sector Profile and Country Pack.
- **Linked-transaction detection** following the AMLA linked-transactions standard (same customer or related parties, over a defined period).
- **Cash payment limit:** warns when a cash payment would exceed €10,000 or a lower national limit **[verify]**.
- Configurable monitoring rules for higher-volume sectors (gambling, crowdfunding).

### 5.8 Ongoing Monitoring and File Refresh (AMLR Art. 26)
- Refresh dates per customer: **at least every 1 year for high risk, at least every 5 years for others**.
- Event triggers: ownership change, new screening hit, change of country, unusual transaction, expired ID document.
- Dashboard: overdue, due in 30/60/90 days, completed.
- Refresh campaigns for groups of customers.

### 5.9 Suspicion Reporting (AMLR Art. 69 onwards)
- **Internal report:** any user can raise a concern on a customer or transaction.
- **Compliance Officer review:** investigation notes, evidence, decision (report / do not report) with reasons.
- **FIU report draft:** structured data and narrative in the format of the member state's FIU (via Country Pack); export for submission through the FIU's channel. Direct submission integration where the FIU offers one **[verify per FIU]**.
- Records the transaction decision while a report is pending, and records any FIU suspension order.
- **Tipping-off protection:** warning banner on the customer; restricted visibility of the case.
- Legal privilege and self-regulatory body routing for §3.1/§3.2 professions where applicable.

### 5.10 Records, Audit Log and Data Retention (AMLR Art. 77)
- Immutable audit log of every create, update, view of sensitive data, decision, export: user, timestamp, old/new value.
- Retention: **5 years** after the end of the relationship or occasional transaction, with deletion workflow afterwards (extension if required by a competent authority **[verify]**).
- **Supervisor export:** one customer or the whole firm, as PDF report + document archive.
- Statistics needed for supervisor questionnaires (customer counts by risk, EDD cases, reports filed).

### 5.11 Training Records (AMLR Art. 12 **[verify]**)
- Short role-based training modules per Sector Profile.
- Completion tracking, certificates, yearly reminders.

### 5.12 Expert Support (AMLSync)
- In-app request for a human review by an AMLSync specialist: complex customer files, EDD cases, policy review, AMLR gap check.
- Reviewer gets time-limited, logged access to the selected files only.

---

## 6. Country Packs (EU-wide configuration)

One Country Pack per EU member state. Each holds:

| Item | Example |
|---|---|
| **Languages** | UI, generated documents and policy templates in the national language(s) — all 24 official EU languages |
| **FIU** | Name, report format, submission channel |
| **Supervisors and self-regulatory bodies** | Per sector |
| **National risk assessment** | Country-specific risk factors and red flags |
| **Cash limit** | €10,000 or lower national limit |
| **Registers** | Company register and beneficial ownership register access (national or via BRIS / BORIS **[verify]**) |
| **ID documents** | Accepted national ID types and formats; eIDAS electronic identification where available |
| **Additional sectors** | Sectors added under national law |
| **Retention and other national options** | Where AMLR allows national choices |

Country Packs are data, not code: updating a national rule does not need a new release.

---

## 7. AI features

Principle: **AI drafts, extracts and suggests; a named user decides and signs.** No automatic accept/reject, risk rating or FIU submission.

| Feature | What it does | Control |
|---|---|---|
| **Document extraction** | Reads ID documents, company extracts, trust deeds and invoices; pre-fills CDD fields | User confirms each field |
| **Ownership mapping** | Builds a draft ownership tree from uploaded extracts | User confirms structure and percentages |
| **Screening assistant** | Explains why a hit is likely or unlikely to be the same person | User decides and comments |
| **Adverse media summary** | Summarises news results with links to sources | User reviews |
| **EDD and risk memo drafting** | Drafts the written rationale for the customer's risk rating | Editable; signed by user |
| **Suspicion report drafting** | Turns case notes into a structured FIU narrative | Compliance Officer approves |
| **Policy and risk assessment drafting** | Drafts documents from questionnaire answers | Management approval |
| **AML assistant** | Plain-language answers on AMLR obligations for the user's sector and country, citing articles | Shows "consult an expert" when uncertain |

Requirements: EU-hosted processing; customer data not used to train models; every AI output stored with input references in the audit log; EU AI Act classification assessed **[verify]**.

---

## 8. Integrations

| Area | Integration |
|---|---|
| Sanctions data | EU Financial Sanctions Files, UN list; optional OFAC, UK lists |
| PEP / adverse media data | Commercial data provider via API |
| Identity verification | Remote ID verification provider (document + liveness); eIDAS eID |
| Company & beneficial ownership data | National registers / BRIS / beneficial ownership registers interconnection |
| Business software | API and webhooks; connectors for accounting software, real estate CRMs, point-of-sale and auction platforms |
| Data import | CSV/Excel import of customers and transactions |

---

## 9. Non-functional requirements

- **Hosting:** EU only; data residency per customer region option.
- **Security:** encryption in transit and at rest; 2FA mandatory; role-based access; separation of each firm's data; regular penetration testing; ISO 27001 / SOC 2 aligned controls.
- **GDPR:** the product is a data processor; DPA included; data minimisation; access and deletion requests supported within AML retention rules.
- **Availability:** 99.9% target; daily backups; screening lists updated at least daily.
- **Accessibility:** WCAG 2.1 AA.
- **Devices:** web app on desktop and tablet; mobile-friendly point-of-sale quick check.
- **Performance:** standard low-risk customer onboarding completed in under 10 minutes; point-of-sale quick check under 2 minutes; screening result under 5 seconds.

---

## 10. Technical architecture (initial)

- **Front end:** Next.js, TypeScript, Tailwind CSS.
- **Back end:** Node.js/TypeScript API.
- **Database:** PostgreSQL (EU region) with row-level security per firm; Prisma ORM.
- **File storage:** encrypted EU object storage.
- **Background jobs:** list updates, re-screening, refresh reminders, linked-transaction detection.
- **Configuration:** Sector Profiles and Country Packs stored as versioned configuration data.
- **AI service:** separate server-side service with logging and EU data processing.
