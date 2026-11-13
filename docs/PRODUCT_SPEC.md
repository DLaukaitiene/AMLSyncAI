# AMLSyncAI — Product Specification (v0.7, draft)

*Status: draft for discussion · Last updated: 13 November 2026 · v0.2 incorporated a regulatory gap analysis (REGULATORY_REVIEW.md — not yet in the repository); v0.3 added the **automation layer** (§4A) and the **Australian competitor benchmark** (§10); v0.4 reorganised scope into **releases V1 / V2 / V3** (§4.0); v0.5 made the launch **EU-wide**, added the **other obliged-entity groups** (§2.2) and dropped go-to-market, roadmap, open questions and business targets; v0.6 separates **EU-wide rules from country-specific rules** (§3A); v0.7 aligns the AI section with the releases (§5), adds the **core data model** (§8A) and **non-functional requirements** (§8B), and fixes inconsistencies*

> **Legal note:** Article references are to Regulation (EU) 2024/1624 (AMLR) unless stated. AMLA's technical standards are still final drafts awaiting Commission adoption. Items marked **[verify]** depend on national law or pending standards. Get legal sign-off before any customer-facing compliance claim.

---

## 1. Summary

**AMLSyncAI** is AML compliance software for small and mid-sized **non-financial obliged entities in all 27 EU member states**: accountants, real estate agents and traders in high-value goods (covered in depth), plus trust and company service providers, lawyers and notaries, art traders and the other non-financial obliged entities. These firms must meet the same AMLR rules as banks from **10 July 2027**, but usually have no compliance team, no MLRO experience and no budget for enterprise tools.

The product helps them do the work AMLR requires and **prove it to a supervisor**: onboard and check clients, identify beneficial owners, score risk, screen against sanctions and PEP lists, monitor and refresh files, report suspicions, and keep records.

**How it relates to AMLSync:** AMLSync is a people-based compliance outsourcing service for fintechs (payment/e-money institutions, CASPs, banks, brokers, gaming). AMLSyncAI takes the same practitioner know-how and turns it into **software for a different, much larger customer group**. The two support each other:

| | AMLSync (today) | AMLSyncAI (new) |
|---|---|---|
| What | Analysts and senior support, hired by the month | Self-service SaaS |
| Who | Fintechs with compliance teams | Small non-financial firms with no compliance team |
| Revenue | Project / FTE fees | Monthly subscription per firm |
| Link | Can offer "AMLSync expert review" as a paid add-on inside the software | Feeds AMLSync with health-check and remediation leads |

**Why now:** AMLR replaces national AML laws with one directly applicable regulation, so **one product can serve all 27 member states from launch**: one AMLR engine plus a **Country Pack** per state for the national options. The deadline (10 July 2027) creates urgency. AMLA is publishing technical standards (final draft CDD RTS submitted to the Commission on 1 October 2026; expected to apply 6 months after entry into force) that will tell everyone exactly what data to collect — software can build that in once. The CDD RTS also forces **remediation of existing client files**, which every new customer will need help with.

---

## 2. Target customers

### 2.1 Core groups — covered in detail

| Segment | Why they're obliged | Typical size | What hurts most |
|---|---|---|---|
| **External accountants, auditors, tax advisors** | AMLR Art. 3 | 1–50 staff | Many small clients, recurring relationships, beneficial ownership of client companies, refresh cycles |
| **Real estate agents** (incl. letting agents where monthly rent ≥ €10,000) | Art. 3(3)(d) | 1–30 staff | CDD on **both** parties (Art. 19(6)), verification after offer accepted and before funds/property move (Art. 23), source of funds, cash, foreign buyers |
| **Traders in high-value goods** (Annex IV: jewellery and watches > €10,000; motor vehicles > €250,000; aircraft/watercraft > €7.5m) and **precious metals & stones** traders | Art. 3(3)(e)–(f), Annex IV | 1–20 staff | CDD on customer **and supplier** (Art. 19(6)), €3,000 cash identification (Art. 19(4)), cash cap (Art. 80; lower in some states, e.g. LT €5,000), FIU threshold reports for cars/boats/aircraft (Art. 74). *Note: ordinary car dealers are not obliged entities on this basis — size the segment accordingly.* |

### 2.2 Other obliged entities — covered by the core engine

These groups use the same modules (firm risk assessment, policies, CDD, BO, screening, risk scoring, monitoring, reporting, records) with a **sector template** that sets their specific triggers, questions and exemptions. They do not get dedicated sector features.

| Group | Article | What the sector template sets |
|---|---|---|
| **Trust and company service providers** | Art. 3(3)(c) | CDD on company formation and on transfer of ownership of a legal entity regardless of value (Art. 19(1)(c)); trusts and nominee arrangements as standard; EDD for private-wealth relationships (Art. 34(5)) |
| **Lawyers, notaries and other independent legal professionals** | Art. 3(3)(b) | In scope only for listed activities (property and company transactions, client money, accounts, company and trust set-up); both parties as customers when sole intermediary (Art. 19(6)); privilege exemptions (Art. 21(2), 24, 70(2)); SRO reporting route where the state uses one (Art. 70(1)) |
| **Art and cultural goods traders** (incl. galleries, auction houses, free zones and customs warehouses) | Art. 3(3)(i)–(j) | CDD for transactions ≥ €10,000 incl. linked transactions; provenance and counterparty questions |
| **Other non-financial obliged entities**: credit intermediaries (mortgage/consumer credit), investment migration operators, crowdfunding service providers, gambling providers, non-financial mixed-activity holding companies | Art. 3(3) | Sector triggers (e.g. gambling stakes/winnings ≥ €2,000, Art. 19(5); crowdfunding: both funder and project owner, Art. 19(6)); state exemptions (Art. 4–6) |
| **Professional football clubs and agents** | Art. 3(3) | Obligations apply from **10 July 2029**: template for player transfers, investors, sponsors and agents (V3) |


### 2.3 Buyer and user
- **Buyer:** the business owner or managing partner. Under AMLR a member of the management body is the **compliance manager** (Art. 11), so they are personally exposed. In one-person firms that person holds every role.
- **Daily users:** office staff, sales staff, junior accountants. They are **not compliance experts**. The product must tell them what to do next in plain language.

---

## 3. What AMLR requires these firms to do → product features

This is the core of the spec: every module exists because of a legal obligation.

Scope: **EU** = identical in every member state · **EU + N** = EU rule with a national parameter that comes from the Country Pack (see §3A).

Legend: **V1** = launch release, live in all 27 member states by 10 July 2027 · **V2** = full automation and deeper sector templates (Q4 2027 – Q1 2028) · **V3** = integrations, platform and football (2028–2029). Rule: **everything the law requires for every group we sell to is in V1**; V2 and V3 add automation and convenience — never missing obligations.

| # | Obligation | Article | Product module | Scope | When |
|---|---|---|---|---|---|
| **Firm level** ||||||
| 1 | Business-wide risk assessment incl. sanctions-evasion risk; Annex I–III, national & EU risk assessments; drafted by compliance officer, approved by management; updated on significant change; pre-launch assessment of new products/channels/markets | Art. 10 | **Firm Risk Assessment** | EU + N | V1 |
| 2 | Written policies, procedures and controls covering the Art. 9(2) minimum list; policies approved by management, procedures by compliance manager | Art. 9 | **Policy Builder** | EU | V1 |
| 3 | Independent audit / testing of the AML framework (internal or external expert) | Art. 9 | **Independent Review** (AMLSync service) | EU | V1 service · V2 module |
| 4 | Compliance manager + compliance officer; annual compliance report to management; supervisor notified if officer is removed | Art. 11 | **Governance** + **Annual Report** generator | EU + N | V1 |
| 5 | Staff awareness and documented ongoing training | Art. 12 | **Training** tracker (lite) | EU | V1 |
| 6 | Employee integrity, skills and conflict-of-interest checks before start and periodically (not one-person firms) | Art. 13 | **People & Integrity** | EU | V1 (forms) · V2 (automated cycle) |
| 7 | Internal whistleblowing channel (Directive 2019/1937) (not one-person firms) | Art. 14 | **Whistleblowing** channel | EU + N | V1 |
| 8 | Outsourcing: prior supervisor notice, written agreement, non-outsourceable tasks | Art. 18 | **Outsourcing register** (+ AMLSync Expert setup) | EU + N | V1 |
| 9 | Reliance on another obliged entity: written agreement, documents within 5 working days | Art. 48–50 | **Reliance** source type | EU | V3 |
| 10 | Cross-border notification; group-wide policies | Art. 8, 16 | **Multi-office / network** | EU + N | V2 |
| **Client level** ||||||
| 11 | CDD triggers: relationship, occasional transactions ≥ €10,000 (incl. **linked**), cash ≥ €3,000, company formation/transfer, suspicion, doubts | Art. 19; RTS 19(9) | **Onboarding triggers** + linked-transaction aggregation | EU + N | V1 |
| 12 | Who is the customer: both parties (estate agents), customer + supplier (HVG / precious metals) | Art. 19(6) | **Matter / Transaction** with multiple parties | EU | V1 |
| 13 | CDD measures (a)–(i): identify/verify customer, BOs, purpose, sanctions, nature of business, monitoring, PEP, other beneficiaries, authorised representatives | Art. 20 | **Client Onboarding (CDD)** | EU | V1 |
| 14 | Full identification data set; verification by ID document or eIDAS substantial/high | Art. 22, 62; CDD RTS | **CDD data model** | EU + N | V1 |
| 15 | BO: ≥ 25% (multiply down chains, add across chains), control by other means, trusts and arrangements, no-BO fallback to senior managing officials | Art. 51–60, 22(2) | **Beneficial Owner** tree | EU + N | V1 (trusts: manual form V1, guided V2) |
| 16 | Check BO register; proof of registration for new entity clients; report discrepancies within 14 days | Art. 22(7), 23(4), 24 | **Registry & Discrepancy** | EU + N | V1 |
| 17 | Timing of verification (before relationship; estate agents after offer accepted and before funds/property move) | Art. 23 | Hard gates in **Matter** workflow | EU | V1 |
| 18 | Purpose and intended nature | Art. 25 | Sector templates | EU | V1 |
| 19 | Can't complete CDD → refuse / terminate, consider STR, record | Art. 21 | **Refuse / Terminate** workflow | EU | V1 |
| 20 | Risk-based SDD (max 60-day verification delay) and EDD (Art. 34(4) menu, unusual transactions) | Art. 20(2), 33, 34 | **Client Risk Scoring** + EDD checklist | EU + N | V1 |
| 21 | High-risk third countries and countermeasures | Art. 29–31, 35 | Country data feed | EU | V1 |
| 22 | PEPs, family, close associates; approval to establish **or continue**; SoW & SoF; former PEPs ≥ 12 months | Art. 42–46 | **Screening** + PEP workflow | EU + N | V1 (PEP data provider from day one) |
| 23 | Targeted financial sanctions incl. **> 50% ownership / control** by sanctioned persons; not risk-based | Art. 20(1)(d), 26(4), 27 | **Screening** across ownership tree | EU + N | V1 |
| 24 | Sanctions hit: freeze and report to national sanctions authority; sectoral Russia/Belarus bans | EU Reg. 269/2014, 833/2014, 765/2006 | **Sanctions Hit** workflow + sectoral rule pack | EU + N | V1 |
| 25 | Ongoing monitoring of each engagement/transaction; refresh max **1 year** (EDD) / **5 years** (others); event-driven updates | Art. 26 | **Monitoring & Refresh** | EU | V1 |
| 26 | Remediation of existing client files to the new CDD standard | CDD RTS **[verify]** | **Back-book Remediation** | EU | V1 |
| 27 | No anonymous accounts / bearer shares | Art. 79 | Onboarding validation | EU | V1 |
| **Reporting** ||||||
| 28 | STR incl. attempted transactions; record all assessments; FIU requests within 5 working days; SRO route; privilege exemption | Art. 69, 70 | **Suspicion Reporting** | EU + N | V1 |
| 29 | Refrain from suspicious transaction; proceed if no FIU instruction within 3 working days | Art. 71 | Transaction **hold** with clock | EU | V1 |
| 30 | No tipping-off (dissuading a client is not tipping-off for professionals) | Art. 73 | Warnings + restricted access | EU | V1 |
| 31 | Threshold reports: cars ≥ €250,000, aircraft/watercraft ≥ €7.5m | Art. 74 | **Threshold Reporting** | EU + N | V1 |
| 32 | Cash cap €10,000 or lower national cap; national cash reports (e.g. LT ≥ €15,000 to FNTT **[verify]**) | Art. 80; national law | **Cash log** with Country Pack | EU + N | V1 |
| **Data & records** ||||||
| 33 | Retain 5 years from end of relationship / occasional transaction / refusal; delete after; authority extension ≤ 5 years | Art. 77, 78 | **Audit Log & Records** + legal hold | EU + N | V1 |
| 34 | Data protection: inform clients, criminal-data distinctions, no commercial reuse, human intervention + explanation for automated decisions | Art. 76; GDPR | Privacy notice template, **Explain decision**, DPA/DPIA | EU + N | V1 |


---

## 3A. Regulatory layers — what is the same across the EU and what is country-specific

AMLR is a **regulation**: it applies directly and identically in every member state from 10 July 2027, and member states may only deviate where AMLR expressly allows it. AMLD6 (Directive (EU) 2024/1640) is a **directive**: each state transposes it, so supervisors, FIUs, BO registers and penalties are national. The product mirrors this: one **EU Core** rule set, plus one **Country Pack** per member state that can only fill in parameters or tighten rules where EU law permits.

### 3A.1 EU Core — identical in all 27 member states (built once)

| Area | Rule | Source |
|---|---|---|
| Who is obliged | List of obliged entities and thresholds (letting ≥ €10,000/month, art ≥ €10,000, Annex IV high-value goods) | AMLR Art. 3, Annex IV |
| Firm-level duties | Business-wide risk assessment, policies & controls, compliance manager/officer, annual report, training, employee integrity, internal reporting channel, outsourcing limits, reliance | Art. 9–18, 48–50 |
| CDD triggers | Business relationship; occasional transactions ≥ €10,000 incl. linked; cash ≥ €3,000; company formation/transfer; suspicion; doubts; who counts as customer (both parties, supplier) | Art. 19 |
| CDD content | Measures (a)–(i), identification data set, verification by ID document or eIDAS substantial/high, timing (estate agents: after offer, before funds/property move), purpose and nature | Art. 20, 22, 23, 25; CDD RTS |
| Inability to complete CDD | Refuse / terminate, consider STR, record | Art. 21 |
| Beneficial ownership | 25% or more, chain multiplication, control by other means, trusts and arrangements, senior-managing-official fallback, BO data set | Art. 51–62 |
| Risk-based approach | SDD (60-day verification delay), EDD triggers and measures, unusual-transaction review, high-risk third countries (EU list) and countermeasures | Art. 29–35 |
| PEPs | Approval, SoW/SoF, enhanced monitoring, family and close associates, former PEPs ≥ 12 months | Art. 42, 44–46 |
| Sanctions in CDD | Check customer, BOs and > 50% ownership/control by sanctioned persons; EU sanctions regimes (Reg. 269/2014, 833/2014, 765/2006 etc.) | Art. 20(1)(d), 26(4); EU sanctions regulations |
| Monitoring | Ongoing monitoring; update at most every 1 year (EDD) / 5 years (others); event-driven updates | Art. 26 |
| Reporting rules | STR duty incl. attempted transactions; answer FIU requests in 5 working days; refrain until reported, 3 working days; no tipping-off; Art. 74 report duty for cars ≥ €250,000 and aircraft/watercraft ≥ €7.5m; STR format (implementing standard, once adopted) | Art. 69, 71, 73, 74 |
| BO discrepancies | Report to the central register within 14 calendar days; minor-discrepancy route | Art. 24 |
| Records & data | 5-year retention from end of relationship / transaction / refusal, then delete; Art. 76 data rules incl. human intervention for automated decisions | Art. 76–78; GDPR |
| Anonymity & cash | No anonymous accounts or bearer shares; €10,000 EU cash cap | Art. 79, 80(1) |
| Technical standards | AMLA RTS/ITS and guidelines (CDD, thresholds, risk factors, PEPs, outsourcing, business risk assessment) | AMLR mandates to AMLA |
| Other EU law | GDPR; AI Act; eIDAS / EUDI Wallet; DAC (event-driven updates) | — |

### 3A.2 Country Pack — set per member state (configured, not coded)

| Parameter | Why it varies | Source | Used by |
|---|---|---|---|
| **Supervisor per sector** and its contact/notification channel | AMLD6 designates national supervisors and self-regulatory bodies (e.g. bar, notaries' chamber, audit oversight body) | AMLD6; national law | Governance, outsourcing notice, officer-removal notice, supervisor file |
| **FIU** and its report channel (portal / goAML / API), submission language, receipt format | National FIUs | AMLD6; Art. 69(6) | Suspicion Reporting, FIU request inbox |
| **SRO reporting route** for lawyers, notaries, accountants, auditors, tax advisors | State option | Art. 70(1) | Suspicion Reporting |
| **Privilege exemption narrowed** for higher-risk transaction types | State option | Art. 70(3) | Privilege flag logic |
| **Deadlines set by the FIU** for Art. 74 threshold reports and Art. 80 above-limit reports | Set nationally | Art. 74, 80(4) | Threshold Reporting, Compliance Calendar |
| **Cash cap below €10,000** (e.g. LT €5,000) and any national cash-transaction reports (e.g. LT ≥ €15,000 to FNTT **[verify after July 2027]**) | State option / national law | Art. 80(2)–(3) | Cash log, CDD triggers (the €3,000 identification rule switches off where the cap is ≤ €3,000, Art. 19(4)) |
| **Additional EDD cases** from the national risk assessment | State option | Art. 34(6); AMLD6 Art. 8 | Risk Scoring |
| **National risk assessment** findings and sector risk assessments | National | Art. 10(3); AMLD6 Art. 8 | Firm Risk Assessment inputs |
| **Waiver of an individual documented business-wide risk assessment** for some sectors | Supervisor decision | Art. 10 | Firm Risk Assessment |
| **List of prominent public functions** (national PEP positions) | Each state publishes its list | Art. 43 | Screening, PEP declaration |
| **Higher-risk legal-entity categories** (possible lower BO thresholds via Commission act) | States notify; Commission decides | Art. 52 | BO calculation |
| **Exemptions** for certain gambling providers and football clubs; notification of exemptions | State option | Art. 4, 5, 7 | Scope check at sign-up |
| **Additional obliged entities** beyond AMLR | State option | AMLD6 | Scope check, sector templates |
| **Central BO register** (access route, API, fees, extract format, discrepancy-report channel) and **business register** | National registers, EU interconnection | AMLD6; Art. 22(7), 23(4), 24 | Registry & Discrepancy |
| **National sanctions lists**, the competent authority for freezes/notifications, and national criminal penalties | National lists and authorities; Directive (EU) 2024/1226 transposed nationally | National law | Screening, Sanctions Hit workflow |
| **eID schemes** accepted (eIDAS-notified) and national identity document types and ID-number formats | National | Art. 22(6); eIDAS | Client portal, CDD data model |
| **Legal entity forms**, registration and tax ID formats | National company law | — | CDD data model, BO tree |
| **Record-retention extensions** ordered by authorities; longer retention required by national law; transitional rule for pending proceedings | Competent authorities / state option | Art. 77(3)–(4) | Records & legal hold |
| **Whistleblowing channel** details | National transposition of Directive 2019/1937 | Art. 14 | Whistleblowing |
| **Data protection authority**, privacy-notice language, any national rules on processing AML data | GDPR national layer | Art. 76; GDPR | Privacy templates, DPIA |
| **Penalties** for obliged entities and managers | AMLD6 transposed nationally | AMLD6 | Firm risk assessment, training content |
| **Language(s)** for policies, client communication and reports to authorities | National practice | — | Document generation, client portal |
| **Working days and public holidays** | National | — | All deadline clocks |

### 3A.3 Rules for the rules engine
1. **EU Core always applies.** A Country Pack can **add** or **tighten** (lower cash cap, extra EDD cases, extra obliged entities) or **fill in** a parameter (supervisor, FIU channel, deadlines) — it can never relax an EU Core rule.
2. **Which pack applies:** the pack of the member state where the firm is established; for branches or activity in another state, the host-state pack is added for the matters Art. 8 sends to host-state law **[verify scope with counsel]**.
3. **Every decision stores** the EU Core version and the Country Pack version used.
4. **Change management:** AMLA standards update the EU Core once for everyone; national changes update one pack. Customers get plain-language release notes and, where needed, auto-created tasks.
5. **Pack completeness gate:** a member state is sold only when its pack has every parameter in §3A.2 filled and legally reviewed; until then, missing national parameters are shown to the firm as a task, never silently defaulted.

---

## 4. Release scope

### 4.0 Release plan at a glance

| | **V1 — "Compliant on day one, EU-wide"** | **V2 — "Hands-off compliance"** | **V3 — "Platform"** |
|---|---|---|---|
| **When** | Live in all member states by **10 July 2027** | Q4 2027 – Q1 2028 | 2028 – 2029 |
| **Goal** | Every in-scope firm in any member state meets **every** AMLR duty and can show its supervisor a complete file | Cut staff time to approvals only; deeper templates for the other groups | Work inside the tools firms already use; football clubs and agents |
| **Markets** | **All 27 member states**: Country Pack for each; UI and client portal in all 24 official EU languages (AI-assisted translation, legal terms reviewed) | Country Pack refinements as national laws, FIUs and AMLA standards settle | Same |
| **Groups** | Detailed: accountants / auditors / tax advisors, estate agents, HVG & precious-metal traders. Core-engine templates: TCSPs, lawyers & notaries, art traders, other non-financial obliged entities (§2.2) | Richer templates for TCSPs, lawyers & notaries, art traders | Football clubs & agents (from 10 July 2029) |
| **Firm level** | Firm risk assessment, Policy Builder, governance + annual report, training (lite), integrity & conflict forms, whistleblowing channel, outsourcing register | Automated annual cycle, role-based training paths with certificates, Independent Review module, multi-office / network policies, cross-border notifications | Reliance agreements between firms |
| **Client onboarding** | Multi-party matters, **client self-service portal**, national eIDs (eIDAS-notified schemes via an eID broker) with **NFC chip + liveness** fallback, hard gates, registry auto-unwrapping (BRIS + national BO registers), BO % calculation, discrepancy workflow, refuse/terminate, supplier CDD for HVG, trusts (manual form) | Guided trusts, recommended-documents engine, reusable identity across matters | EUDI Wallet, embeddable onboarding form, reusable KYC with reliance |
| **Screening** | EU, UN and national sanctions + **PEP/RCA via provider**, whole ownership tree incl. > 50% aggregation, sanctions-hit workflow, Russia/Belarus rule pack, daily delta re-screening | **AI match triage**, adverse media with allegation/conviction labels, registry change feeds | — |
| **Risk & EDD** | Rule-based score from collected data, SDD/EDD logic, EDD checklist, automatic SoF/SoW requests via portal | **AI document reading** & reconciliation of SoF evidence, AI-drafted risk/EDD memos | Configurable risk models for larger firms |
| **Monitoring** | 1y/5y refresh with client "nothing changed" link, per-matter checks, Compliance Calendar, linked-transaction aggregation, cash log | Perpetual KYC (background registry + screening re-runs, exceptions only), POS/invoice cash feeds | Portfolio analytics, self-inspection |
| **Back-book** | CSV import + gap analysis + prioritised task list | **Bulk outreach campaigns** to existing clients for missing items only | Practice-software sync of the whole client base |
| **Reporting** | STR with transaction hold and FIU request inbox, Art. 74 threshold reports, national cash reports, discrepancy reports, sanctions-authority notices, FIU export in each state's format, supervisor file, audit log & retention | Direct FIU submission where an API exists | — |
| **Integrations** | Email-in, e-signature, CSV | First practice-software and real-estate CRM integrations, Zapier/Make | Public API, partner integrations (accounting software, CRMs, professional bodies) |
| **AI** | Assisted drafting (policies, risk assessment, STR narrative) — always approved by a person | Triage, document reading, adverse media, memo drafting | "Ask the AML assistant" with article citations |
| **AMLSync services** | AMLSync Expert reviews + Independent Review (Art. 9) | Managed "done for you" queue | Partner consultancies per country |

**Why this split**
1. **V1 is legally complete for every group in every member state.** All mandatory duties — including HVG threshold and cash reports, PEP screening, integrity checks, whistleblowing and the outsourcing register — are in V1. National differences live in Country Packs, so going EU-wide is configuration, not a rebuild.
2. **V1 already automates the biggest time sinks** (client portal, eID / NFC, registry unwrapping, auto-chasing), because "less manual work" is the core promise.
3. **V2 adds AI and deeper templates** once real usage data exists to tune triage and document reading.
4. **V3 adds the platform layer** (API, integrations, reliance, EUDI Wallet) and football ahead of 10 July 2029.

Sections 4.1–4.8 describe the V1 modules; items tagged **(V2)** or **(V3)** inside them are later additions. Lithuanian names (JAR, JANGIS, FNTT) appear as worked examples of a Country Pack.


### 4.1 Firm setup & Firm Risk Assessment
- Sign-up, firm profile (sector, country, size, services, client types, cash use, cross-border share).
- Guided questionnaire → **firm risk assessment report** (PDF) with inherent risk, controls and residual risk — covering ML, TF **and sanctions-evasion** risk, using Annex I–III factors and the national risk assessment.
- Drafted by the compliance officer, **approved by management** (logged sign-off).
- Re-assessment reminder (yearly, on significant change, and **before launching a new service, channel or market**).
- **Governance:** appoint compliance manager and compliance officer (same person allowed for small firms); generate the **annual compliance report** to management; template notice to supervisor if the officer is removed.
- **Training (lite):** assign, complete, attest; records kept for the supervisor file. *(V2: role-based paths, automatic annual refresh, certificates.)*
- **Integrity & conflicts (Art. 13):** e-form declarations on joining and yearly; conflicted staff excluded from the client. **Whistleblowing (Art. 14):** confidential internal channel. **Outsourcing register (Art. 18):** needed from V1 because AMLSync Expert is sold at launch.

### 4.2 Client Onboarding (CDD)
- **Matter / Transaction model:** every engagement, deal or sale is a *matter* with one or more parties (buyer, seller, landlord, tenant, supplier, client), each with its own CDD file. Estate agents check **both parties**; HVG and precious-metal traders check the **supplier** too.
- **Natural persons:** all names, full date and place of birth, **all nationalities** (verify one), national ID number, residence, tax ID, ID document data, occupation, purpose of relationship.
- **Legal entities:** name, legal form, registration number, tax ID, LEI, registered office, principal place of business, country of creation, legal representatives, **nominee shareholders/directors**, nature of business.
- **Representatives and beneficiaries:** anyone acting for the client (with proof of authority, e.g. POA) and anyone else the transaction benefits are identified and verified.
- **Beneficial owners:** ownership % **calculated automatically** (multiply down each chain, add across chains); control by other means (voting, board appointment, veto, agreements, family, nominees); flag ≥ 25%; Art. 62 data incl. date interest held; visual tree. If no BO is found → record it, identify all senior managing officials, log the steps taken.
- **Registry check:** pull the company and BO register extract (via BRIS for company data and each state's **central BO register**; e.g. LT: JAR, JADIS, JANGIS), store it, compare with what the client declared. Mismatch → **discrepancy workflow** (ask client to correct, else report to the register within **14 days**).
- **Refuse / terminate:** if CDD can't be completed, the tool blocks acceptance, prompts an internal suspicion assessment and records the refusal (retained 5 years from refusal).
- **Back-book remediation:** import existing clients (CSV), score each file against the new CDD data set, prioritise high-risk files, track the RTS deadlines.
- **Document upload:** ID, company extract, proof of address, source-of-funds evidence.
- **Sector templates:** detailed for accountants (engagement type), estate agents (property, buyer/seller/landlord/tenant role, price or rent, financing) and HVG / precious-metal traders (item, value, payment method, supplier); core templates for the groups in §2.2.
- **Trusts & arrangements:** manual form for settlor, trustees, protector, beneficiaries/class in V1 *(V2: guided template)*.
- **Hard gates, not just traffic lights:** the client can't be accepted and the transaction can't be marked completed while a mandatory item is open (estate agents: verification after offer accepted, before funds/property move). Overrides only by the compliance officer with a written reason.
- **Linked transactions:** occasional transactions and cash payments are aggregated per client so the €10,000 / €3,000 thresholds can't be split around.

### 4.3 Client Risk Scoring
- Transparent, rule-based score (no black box): client type, country (incl. EU high-risk third-country list), sector, product/service, delivery channel (face-to-face vs remote), PEP status, cash use, complex structure.
- Result: **Low / Medium / High**, with the reasons listed and the **rule-set version** stored.
- Low → SDD only with documented reasons; verification can be delayed max **60 days**; monitoring never switched off; automatic exit from SDD on doubts or new risk factors.
- High → EDD checklist matching Art. 34(4) (more info on client/BO and purpose, source of wealth, source of funds, reasons for transactions, senior management approval, enhanced monitoring, first payment from own bank account).
- Mandatory review of complex, unusually large or no-purpose transactions (Art. 34(2)).
- PEP: senior approval to **establish or continue**, SoW and SoF, former PEPs kept in scope ≥ 12 months.
- Manual override allowed only with a written reason (logged).

### 4.4 Screening
- **Sanctions:** EU consolidated financial sanctions list (free, official) — required; UN list; national lists; optionally UK and US lists. Screen **every person and company in the ownership tree** and flag where sanctioned persons together own **> 50%** or control the client. Screening can never be reduced for low-risk clients.
- **Sanctions hit workflow** (separate from STR): stop, freeze, don't make funds available, report to the national sanctions authority, record evidence.
- **Sectoral sanctions rule pack:** Russia/Belarus restrictions relevant to each segment (e.g. ban on accounting, tax and consulting services to Russian-established entities; luxury-goods exports).
- **PEPs incl. family and close associates:** needs a data provider (see §7).
- Match review screen: *true match / false positive* with a required comment. This documented decision is exactly what supervisors look for.
- Automatic re-screening when lists change (daily). Every check stores the **list version and timestamp**.

### 4.5 Monitoring & Refresh
- Due dates per client: max **1 year** (EDD) / **5 years** (others), plus trigger events (ownership change, new country, sanctions hit, unusual payment, change of circumstances).
- **Per-matter monitoring:** each new deal, engagement or sale under an existing client is checked against the client profile (expected value, source of funds, counterparties, countries).
- **Compliance Calendar:** one place for every clock — refresh, discrepancy (14 days), transaction hold (3 working days), FIU requests (5 working days), SDD verification (60 days), former PEP (12 months), remediation, annual report, training, policy and risk-assessment reviews.
- Dashboard: overdue, due in 30 days, recently refreshed.

### 4.6 Suspicion Reporting
- Internal "something feels off" report by any staff member → compliance officer reviews → decision documented (report / don't report, with reasons). **Every assessment is kept**, including "no report".
- Covers **attempted** transactions and suspicions arising from failed CDD.
- **Transaction hold:** the suspicious transaction is blocked until the report is filed; it may go ahead only if the FIU gives no instruction within **3 working days** (or if holding it is impossible — then notify the FIU immediately).
- Draft of the FIU report with the facts collected. Submission stays with the firm through the national FIU channel set in the Country Pack (e.g. LT: FNTT). SRO route where the country allows it.
- **FIU request inbox:** answer within **5 working days** (or the FIU's shorter deadline).
- **Privilege flag** for auditors, accountants, tax advisors, lawyers and notaries when ascertaining a client's legal position or defending/representing the client (Art. 70(2)); narrowed where the Country Pack says so (Art. 70(3)).
- "Tipping-off" warning: the client must not be told; STR records visible only to the compliance officer.
- **Threshold reports:** automatic FIU reports for motor vehicles ≥ €250,000 and aircraft/watercraft ≥ €7.5m (Art. 74); national cash reports via the Country Pack.

### 4.7 Audit Log & Records
- Every change logged: who, what, when, old value, new value. Cannot be edited.
- One-click **"Supervisor file"** export per client and for the whole firm (PDF + ZIP of documents).
- Records kept unredacted (or as immutable references); includes AI outputs and human edits, rule-set and list versions.
- Supervisor file covers the **firm level** too: risk assessment, policies with approvals, governance appointments, annual reports, training, integrity checks, outsourcing register.
- Retention: 5 years from end of relationship, the occasional transaction, or the **refusal**; then deletion workflow (GDPR). **Legal hold** for authority-ordered extensions (≤ 5 years).

### 4.8 Policy Builder (simple version)
- Generates an AML/CTF policy and procedures document from the firm profile and risk assessment, in plain language, covering the full Art. 9(2) list: risk assessment, risk management, CDD incl. PEP, STR, outsourcing and reliance, records and data protection, compliance monitoring and remediation, staff integrity, internal communication, training.
- Version history; policies approved by management, procedures at least by the compliance manager.

### 4.9 Added in V2 and V3
- **V2:** AI triage / document reading / adverse media, perpetual KYC, bulk back-book outreach, guided trusts, richer templates for TCSPs, lawyers & notaries and art traders, multi-office and cross-border (Art. 8, 16), first integrations, Independent Review module, managed service, direct FIU APIs.
- **V3:** EUDI Wallet, reliance (Art. 48–50), public API and embeddable form, partner integrations, AML assistant, football clubs & agents (from 10 July 2029).


---

## 4A. Automation layer — "the firm only approves"

**Design principle:** the tool does the collecting, checking, chasing, calculating and drafting. Staff do only what AMLR says a person must do: **decide** (accept/refuse, final risk level, continue a PEP relationship, file a report) and **approve** (risk assessment, policies). Every such decision arrives as **one screen with a pre-filled rationale** and one click to approve, edit or reject (Art. 18 and Art. 76(5) — meaningful human intervention).

**Target staff effort:** low-risk individual **< 2 min**, standard company **< 5 min**, EDD case **< 20 min** of staff time; the rest is done by the client and the system.

### 4A.1 Client does the data entry — self-service portal *(V1 incl. NFC + liveness; EUDI Wallet V3)*
- Staff enter just a name + email/phone (or the CRM creates the matter) → the system sends each party **its own secure link** (mobile-first, in all 24 official EU languages; multi-party matters send one link per buyer, seller, supplier, representative).
- Client verifies identity in the preferred order allowed by the AMLA CDD RTS: **national eID** (e.g. Smart-ID / Mobile-ID in the Baltics, itsme in Belgium, BankID-type schemes — via an eIDAS-compliant eID broker; later EUDI Wallet) → in-person route → **remote document + NFC chip read + liveness** as fallback with the justification captured automatically **[verify after RTS adoption]**.
- Client answers the sector questionnaire (purpose, source of funds, PEP self-declaration, tax residence), uploads documents, declares BOs and representatives, and e-signs the declarations.
- **Auto-chasing:** reminders by email/SMS at day 1, 3, 7; escalation to staff only when the client stalls; status visible to staff in real time.
- **Reusable identity within the firm:** a verified person is reused across all their matters (no re-asking until refresh is due or data changes).

### 4A.2 Companies unwrap themselves — registry automation *(V1 all EU registries + foreign parents via KYB aggregator)*
- Staff (or the client) enter a **company code** → the system pulls the company, shareholder and BO register extracts (BRIS and national business registers for company data; each state's central BO register — e.g. LT: JAR, JADIS, JANGIS; a commercial KYB aggregator where a register has no API and for non-EU parents).
- **Recursive unwrapping:** each corporate shareholder is looked up in turn, foreign parents included, until natural persons are reached; the system **calculates indirect percentages** (multiply down / add across), applies control tests, proposes the BO list and, if none qualify, the senior managing officials.
- **Auto-comparison** of register data vs client declaration → minor mismatch = auto-request to the client to correct; material mismatch = pre-filled **Art. 24 discrepancy report** with the 14-day clock started.
- Stored extract + timestamp = Art. 23(4) proof of registration, collected automatically.

### 4A.3 Screening that clears its own noise *(V1 tree screening + delta re-screening; V2 AI triage, adverse media, registry change feeds)*
- Every person and company in the tree is screened automatically (sanctions, PEP/RCA, adverse media), with **> 50% sanctioned-ownership aggregation** computed by the system.
- **AI-assisted triage:** possible matches are pre-sorted using DOB, nationality, photo, location, entity identifiers; obvious non-matches are proposed for bulk clearance with the reason written out; the user confirms in one click. True-match candidates are escalated with an evidence pack.
- **Adverse media summaries** with sources, classified as allegation / investigation / charge / conviction (Art. 76(3)).
- **Continuous monitoring:** delta screening on every list update and registry change feeds (new director, ownership change) → alert only when something changed.

### 4A.4 Risk scoring and EDD run themselves *(V1 auto score + SoF/SoW requests; V2 AI document reading and memo drafting)*
- Risk is **calculated from data already collected** (client type, countries, ownership complexity, PEP, sector, channel, cash, transaction value) — no separate staff questionnaire.
- If EDD is triggered, the system **automatically requests** the SoF/SoW evidence from the client through the portal, with the list tailored to the case (e.g. sale contract, mortgage offer, bank statements, inheritance deed).
- **AI document reading:** extracts names, amounts, dates and counterparties from the uploaded evidence and checks they reconcile with the declared source of funds and the transaction value; inconsistencies are listed for the reviewer.
- The system drafts the **risk rationale / EDD memo**; the compliance officer approves.

### 4A.5 Ongoing compliance runs on autopilot *(V1 refresh links, per-matter checks, CSV back-book; V2 perpetual KYC, bulk outreach, POS/invoice cash feeds)*
- **Perpetual KYC refresh:** before the 1-/5-year due date, the client automatically gets a link to confirm "nothing changed" or update; registry and screening re-run in the background; staff only see exceptions.
- **Per-matter monitoring:** a new deal or sale under an existing client is automatically compared with the client profile; mismatches open a review task.
- **Linked transactions & cash:** aggregation runs automatically from the matter log / invoice or POS feed; thresholds trigger CDD, cash cap warnings and national cash reports.
- **Back-book remediation:** bulk CSV or practice-software import → automatic gap analysis per file → **bulk outreach campaign** sending each existing client a portal link for only the missing items.

### 4A.6 Reports and documents are drafted, not written *(V1 all reports and documents; V2 direct FIU APIs)*
- Pre-filled drafts for: STR (in the national FIU format), Art. 74 threshold reports, Art. 24 discrepancy reports, sanctions-authority notifications, firm risk assessment, policies and procedures, **annual compliance report**, privacy notice, DPIA, outsourcing notification and agreement, supervisor file.
- **Deadlines auto-calculated** (working days, national holidays) and pushed to the Compliance Calendar.
- FIU submission: direct API where the FIU offers one **[verify for FNTT]**; otherwise a ready-to-upload file plus a submission receipt upload.

### 4A.7 Training and governance automation *(V1 basic; V2 full annual cycle)*
- New user → role-based training auto-assigned; annual refresh auto-scheduled; certificates generated (and CPD hours for accountants/auditors where recognised **[verify]**).
- Integrity and conflict-of-interest declarations collected by e-form on joining and yearly.
- Rule and law changes: Country Pack updates pushed by AMLSync with plain-language release notes and, where needed, auto-generated tasks ("re-approve policy section 4").

### 4A.8 Work inside tools the firm already uses *(V1 email-in, e-signature, CSV; V2 first practice-software/CRM integrations; V3 public API and partners)*
- **Integrations:** practice/accounting software (the leading packages per country, e.g. DATEV, Exact, Sage, Xero, QuickBooks, Merit, B1.lt **[validate]**), real-estate CRMs, e-signature, Google/Microsoft email and calendar, Zapier/Make and a public API.
- **Triggers:** new client in practice software / deal moves to "offer accepted" in CRM → matter and client links created automatically; outcome written back.
- **Email-in:** forward a client email or document to a firm-specific address → attached to the right file and read by AI.

### 4A.9 What is never automated
Final decisions to onboard, refuse or terminate; the final risk profile; PEP approval; filing STR/threshold reports; approving the risk assessment and policies; the reply to a true sanctions match. These are prepared fully by the system and approved by a named person (logged).

### 4A.10 Managed service option ("done for you") *(V2)*
For firms that want zero effort: AMLSync analysts work the queue (chase clients, review screening hits, prepare EDD memos, run back-book remediation) and the firm's officer approves. This is outsourcing under Art. 18 — the product generates the supervisor notification and agreement and enforces the recommend/approve split.

---

## 5. Where "AI" helps (and where it must not)

The name says AI, so be specific and conservative. **AI drafts and suggests; a named person decides and signs.** Supervisors will expect that.

| Use | Value | Safeguard | Release |
|---|---|---|---|
| Draft policy and firm risk assessment text | Big time saving | Management approval | V1 |
| Draft suspicion report narrative | Small firms struggle to write these | Compliance officer approves; never auto-submitted | V1 |
| Draft annual compliance report, privacy notice, DPIA | Saves time | Approved by the responsible person | V1 |
| Read uploaded ID / company registry extracts / SoF evidence and pre-fill forms | Saves time, fewer typos | User confirms every field | V2 |
| Explain and triage screening hits ("why this is probably a different person") | Faster false-positive clearing | Decision and comment by the user | V2 |
| Adverse media summary with allegation / investigation / conviction labels | EDD support | Sources linked; user reviews | V2 |
| Draft the risk rationale and EDD memo | Better written files | Editable; user signs | V2 |
| "Ask the AML assistant" (plain-language Q&A on AMLR and the Country Pack) | Users aren't experts | Cites articles; says when to ask an expert (upsell to AMLSync) | V3 |

**Never automated, in any release** (see §4A.9): accept/refuse/terminate decisions, final risk profile, PEP approval, filing FIU or threshold reports, approving the risk assessment and policies, the response to a true sanctions match. Risk scores are always rule-based; AI never sets a risk rating on its own.

**Art. 76(5) rules for any automated or AI step:** use only CDD data; **meaningful human intervention** for onboard / refuse / maintain decisions and for changing the CDD level; clients can get an **explanation** and challenge it (except STR-related). Adverse media must label **allegation vs investigation vs conviction**. AML data may not be reused commercially.

**Check before launch:** EU AI Act classification (AML tools are not listed as high-risk in Annex III; biometric ID may be — **[verify with counsel]**); GDPR: AMLSyncAI acts as **processor** → DPA, sub-processor list, EU-hosted infrastructure and AI processing, DPIA template for customers.

---

## 6. Pricing idea (to validate)

| Plan | For | Includes | Indicative price |
|---|---|---|---|
| **Starter** | Sole traders, very small firms | 2 users, up to 50 active clients, client portal, registry unwrapping (home country), sanctions screening, risk scoring, audit log, training | €49–79 / month incl. a small monthly check credit |
| **Professional** | Small firms | 10 users, 500 clients, PEP/adverse media + continuous monitoring, AI drafting & triage, back-book remediation, integrations | €149–249 / month incl. check credits |
| **Business** | Larger firms, networks | Unlimited users, API, multi-office, custom risk model | From €500 / month |
| **Add-on: AMLSync Expert** | Any plan | Human review by an AMLSync analyst: file review, AMLR health-check, back-book remediation, **independent review (Art. 9)** | Per review / per project |

> **Outsourcing rule (Art. 18):** AMLSync Expert is outsourcing. The customer must notify its supervisor before it starts and sign a written agreement. AMLSync may *recommend*, but the customer's own user must approve the risk assessment and policies, decide risk profiles, decide to onboard, and file FIU reports. The product enforces this split.

Market reference: many AML tools charge per check, and the cheapest monthly screening plans start at roughly €90 / $95 per month. ClearAML (AU) uses a flat plan **plus** A$5 per ID or screening check with monthly credits on the higher plan, and a **14-day free trial**. Because eID, NFC/liveness, registry extracts and PEP data all cost money per check, use **flat plan + included credits + top-ups**; keep sanctions screening unlimited. Offer a free trial with sample data.

---

## 7. Data sources & integrations

| Need | Options |
|---|---|
| Sanctions lists | EU consolidated list (free), UN (free), **national lists of each member state** (via Country Pack); optionally OFAC, UK OFSI |
| PEPs, family members, close associates, adverse media | Commercial data provider (e.g. OpenSanctions commercial licence, or a screening API vendor) — **cost decision** |
| ID verification (remote clients) | EU vendors with NFC chip reading and liveness covering all EU ID documents (e.g. Ondato, iDenfy, Veriff) |
| Company and beneficial ownership registers | BRIS (EU business registers interconnection) and national business registers; each member state's **central BO register** (access for obliged entities under AMLD6; e.g. LT: JANGIS) and the BO-register interconnection; commercial KYB aggregator for gaps and non-EU entities |
| eID | National eIDAS-notified schemes via an eID broker (e.g. Smart-ID / Mobile-ID, itsme, national ID cards); **EU Digital Identity Wallet** (eIDAS 2, expected ~end 2027 **[verify]**) — preferred over remote document checks under the AMLA CDD RTS |
| National data (Country Packs) | Per state: cash cap and cash-report rules, FIU format and channel, sanctions authority and national lists, prominent public functions list (Art. 43), SRO option, supervisors per sector, national risk assessment |
| Sectoral sanctions | EU Regulations 833/2014 (Russia) and 765/2006 (Belarus) — maintained as rule packs |
| High-risk third countries | EU Commission list (and AMLA updates), FATF lists |

---

## 8. Technical approach (V1)

- **Web app:** Next.js + TypeScript, Tailwind for UI.
- **Database:** PostgreSQL (EU region), Prisma ORM. Separate data per firm (multi-tenant with row-level security).
- **Files:** EU-hosted object storage, encrypted.
- **Auth:** email + password with 2FA; roles: Owner / Compliance Manager, Compliance Officer, Staff, External Reviewer (AMLSync — recommend only), Read-only (supervisor/auditor view).
- **Rules as data:** two layers — the **EU Core** rule set and one **Country Pack** per member state (§3A) — both versioned configuration; packs may only add, tighten or fill in parameters; every decision records both versions applied.
- **Hosting:** EU only (GDPR, client trust).
- **AI:** called through a server-side service with logging; no client data used for model training.
- **Languages:** all 24 official EU languages at launch for the app, client portal and generated documents (AI-assisted translation with legal-term review).

---

## 8A. Core data model

| Object | What it is | Key relations |
|---|---|---|
| **Firm** | The obliged entity using AMLSyncAI | Has Users, Sector Profiles, a home Country Pack, Offices |
| **Office** | Branch or establishment (incl. in other member states) | Belongs to Firm; may add a host-state Country Pack (§3A.3) |
| **User** | Person working for the firm or an external reviewer | Has Role(s); signs Approvals |
| **Firm Risk Assessment** | Business-wide risk assessment, versioned | Belongs to Firm; has Approval |
| **Policy / Procedure** | Generated document, versioned | Belongs to Firm; has Approval; staff Acknowledgements |
| **Party** | A natural person or legal entity/arrangement known to the firm | Reused across Matters; has Identity Verifications, Documents, Screening Results, Risk Assessments |
| **Ownership Link** | Shareholding, control or trust role between two Parties | Builds the BO tree; stores %, control type, source (register / declaration), dates |
| **Matter** | Engagement, deal, sale, letting or transaction | Belongs to Firm; has Parties with roles (client, buyer, seller, supplier, representative, beneficiary), Transactions, Tasks |
| **Transaction** | A payment or occasional transaction, incl. cash | Belongs to Matter; used for linked-transaction aggregation and cash cap |
| **CDD File** | Due diligence record for a Party in a role | Has status (open / complete / SDD / EDD / refused / terminated), refresh date, gates |
| **Identity Verification** | eID, document + NFC + liveness, or in-person result | Belongs to Party; stores method, assurance level, provider reference |
| **Registry Extract** | Business or BO register extract | Belongs to Party; timestamped; compared with declarations; may create a Discrepancy |
| **Screening Result** | Sanctions / PEP / adverse media hit | Belongs to Party; stores list version, match decision, reviewer comment |
| **Risk Assessment (client)** | Rule-based score and level | Belongs to CDD File; stores rule-set and Country Pack versions, factors, override |
| **Case** | Internal suspicion, sanctions hit, discrepancy or FIU request | Linked to Parties / Matters; restricted access; has Report(s) |
| **Report** | STR, threshold report, cash report, discrepancy report, sanctions notice | Belongs to Case or Matter; stores format, submission receipt |
| **Task / Deadline** | Any clock in the Compliance Calendar | Linked to any object; calculated from Country Pack working days |
| **Approval** | Named decision by an authorised user | Linked to any decision object; immutable |
| **Audit Event** | Every create / update / view of sensitive data / export | Linked to any object; append-only |
| **Rule Set / Country Pack** | Versioned configuration (§3A) | Version referenced by every decision |

---

## 8B. Non-functional requirements

| Area | Requirement |
|---|---|
| **Security** | Encryption in transit (TLS 1.2+) and at rest; mandatory 2FA for firm users; role-based access; row-level tenant isolation; restricted visibility for Cases (tipping-off); yearly penetration test; ISO 27001-aligned controls |
| **Data protection** | EU-only hosting and AI processing; AMLSyncAI as processor with DPA and sub-processor list; data minimisation; deletion after retention period unless on legal hold |
| **Auditability** | Append-only audit log; every decision stores user, timestamp, inputs, rule-set and Country Pack versions, list versions, AI output and human edits |
| **Availability** | 99.9% monthly target; daily encrypted backups with restore tests; screening lists refreshed at least daily |
| **Performance** | Screening result < 5 s per party; registry unwrapping < 60 s for a 3-level structure; dashboard load < 2 s |
| **Accessibility** | WCAG 2.1 AA for the app and client portal |
| **Devices** | Web app for desktop and tablet; client portal mobile-first |
| **Localisation** | 24 EU languages; local date, number and ID formats; national working days and holidays per Country Pack |
| **Export** | Supervisor file and all records exportable as PDF + ZIP; full data export when a firm leaves |

---

## 9. Success measures

- Staff time per client: **< 2 min** low-risk individual, **< 5 min** company, **< 20 min** EDD (client self-service does the rest).
- ≥ 80% of clients complete the portal without staff help; ≥ 70% of possible screening matches cleared via AI triage with one-click confirmation.
- Time to first verified client after sign-up: **< 15 min**.
- 100% of active clients with a risk rating and a next-refresh date.
- 0 overdue items in the Compliance Calendar for active customers (or escalated within 24 h).
- 100% of existing client files in remediation scope tracked against the RTS deadlines.
- Supervisor file exported in **one click**.

---

## 10. Competitor benchmark — Australia (Tranche 2) and lessons

Australia brought lawyers, accountants, real-estate agents and TCSPs under AML/CTF rules from **1 July 2026**, with AUSTRAC as regulator. The rules differ from AMLR, but the jobs to be done are the same, so the Australian launch wave is the best preview of the EU market in 2027.

*Note: ClearAML's product is behind a login (the attempted login stopped at a Cloudflare security check), so this review uses public sources only. A trial account and screenshots of the dashboard would let us compare screens directly.*

| Vendor | What they do well | Pricing | What to copy / beat |
|---|---|---|---|
| **ClearAML** | Built only for Tranche 2 sectors (accountants, lawyers, conveyancers, real estate); guided **AML/CTF Program Builder** wizard; risk-assessment engine with **PDF audit reports**; KYC/KYB for individuals, companies, **trusts and SMSFs**; ID via government document database (DVS) **+ biometrics**; real-time sanctions/PEP (DFAT, UN, global PEP); **pre-built SMR and TTR workflows**; staff training with **automated CPD certificates**; timestamped audit ledger; local data hosting (Sydney); "first KYC check in under 5 minutes"; 14-day free trial | A$149/mo (5 users) · A$299/mo (25 users, A$135 credits) + A$5 per KYC or screening check; KYB free for a limited time | Copy: simple flat plans + per-check credits, free trial, program builder, regulator-report workflows, CPD-style training certificates, local hosting message. Beat: public sources show **no deep ownership unwrapping, no practice-software integrations, no back-book remediation** — make these our headline features. |
| **First AML (Source)** | Automatic **entity unwrapping** to directors/shareholders/UBOs, 300+ registries in 185+ countries; tiered verification (screening → KYC → ID → anti-tampering → biometrics); risk questionnaire **sent to the client**; recommended documents per entity type; SoF/SoW collection; screening with automatic false-positive filtering; one-checkbox ongoing monitoring; scheduled re-verification by risk level; API and embeddable form | Quote | Copy: verification tiers chosen per case, client-completed questionnaires, recommended-document engine, embeddable onboarding form. Beat on: EU registries + BO registers, local eID, AMLR-native rules, price for 1–20-person firms. |
| **AML Guard** | Real estate & conveyancing focus; UBO tracing up to 5 levels; 48-factor risk score | A$170/mo for 3 users + A$45 per person, A$90+ per company check | Copy: explainable multi-factor score. Beat: per-check prices are high for small firms. |
| **PEXA Clear** | AML **embedded in the property-transaction workflow**; transaction-level risk rating with justification that **re-scores automatically** when data changes; guidance on what to request and when to consider an SMR | n/a | Copy: matter-level risk that updates itself; "what to do next" guidance. Our equivalent: CRM / practice-software integrations. |
| **easyAML** | Program builder, template library, SMR/TTR/IFTI workflows with deadline support, role-based training with reminders and certificates, EDD triggers escalated to the compliance officer | n/a | Copy: role-based training paths (frontline, officer, director). |

**Lessons for AMLSyncAI**
1. **Winners sell "compliant in a day", not features.** Lead with: sign up → firm risk assessment and policies generated → first client verified in under 15 minutes.
2. **Client self-service + eID is the main time saver.** In the EU we have an advantage AU doesn't: national eIDs and, soon, the EUDI Wallet.
3. **Ownership unwrapping is the hardest part and the strongest moat** (First AML's core). Build it on EU BO registers and test it with real cross-border EU group structures.
4. **Regulator-report workflows and training certificates are expected**, not differentiators.
5. **Price transparently**: a flat plan plus visible per-check credits is the norm; small firms dislike quote-only.
6. **Embed in the workflow** (PEXA Clear, Reapit Verify): integrations with the tools agents and accountants use daily drive adoption more than a separate app.
7. **Ready before the deadline:** AU vendors were live months before 1 July 2026; V1 must be live across the EU before 10 July 2027.
