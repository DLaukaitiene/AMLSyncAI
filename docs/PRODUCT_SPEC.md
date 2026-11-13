# AMLSyncAI — Product Specification (v0.1, draft)

*Status: draft for discussion · Last updated: 13 November 2026*

> **Legal note:** Article references below are to Regulation (EU) 2024/1624 (AMLR) and should be checked against the final Official Journal text and AMLA's regulatory technical standards before this spec is used for anything customer-facing. Items marked **[verify]** are ones I'm less sure of.

---

## 1. Summary

**AMLSyncAI** is AML compliance software for small and mid-sized **non-financial obliged entities** in the EU: accountants, real estate agents, traders in high-value goods, and similar firms. These firms must meet the same AMLR rules as banks from **10 July 2027**, but usually have no compliance team, no MLRO experience and no budget for enterprise tools.

The product helps them do the work AMLR requires and **prove it to a supervisor**: onboard and check clients, identify beneficial owners, score risk, screen against sanctions and PEP lists, monitor and refresh files, report suspicions, and keep records.

**How it relates to AMLSync:** AMLSync is a people-based compliance outsourcing service for fintechs (payment/e-money institutions, CASPs, banks, brokers, gaming). AMLSyncAI takes the same practitioner know-how and turns it into **software for a different, much larger customer group**. The two support each other:

| | AMLSync (today) | AMLSyncAI (new) |
|---|---|---|
| What | Analysts and senior support, hired by the month | Self-service SaaS |
| Who | Fintechs with compliance teams | Small non-financial firms with no compliance team |
| Revenue | Project / FTE fees | Monthly subscription per firm |
| Link | Can offer "AMLSync expert review" as a paid add-on inside the software | Feeds AMLSync with health-check and remediation leads |

**Why now:** AMLR replaces national AML laws with one directly applicable regulation, so **one product can serve all 27 member states** with mostly the same rules. The deadline (10 July 2027) creates urgency. AMLA is publishing technical standards (CDD standard finalised 1 October 2026) that will tell everyone exactly what data to collect — software can build that in once.

---

## 2. Target customers

### 2.1 Primary segments (MVP)

| Segment | Why they're obliged | Typical size | What hurts most |
|---|---|---|---|
| **External accountants, auditors, tax advisors** | AMLR Art. 3 | 1–50 staff | Many small clients, recurring relationships, beneficial ownership of client companies, refresh cycles |
| **Real estate agents** (incl. letting agents for high monthly rents — **[verify]** threshold €10,000/month) | AMLR Art. 3 | 1–30 staff | CDD on buyer *and* seller **[verify]**, source of funds, cash, foreign buyers |
| **Traders in high-value goods** (cars, jewellery, watches, art, boats, precious metals and stones) | AMLR Art. 3; cash rules | 1–20 staff | One-off cash sales, identifying the buyer at the till, €10,000 EU cash limit |

### 2.2 Later segments
Trust and company service providers, notaries and lawyers (only for certain transactions), art and antiquities dealers, luxury goods traders, crowdfunding platforms. **Professional football clubs and agents** join in **2029**.

### 2.3 Buyer and user
- **Buyer:** the business owner or managing partner. Under AMLR a member of the management body is responsible for AML compliance (Art. 11 **[verify]**), so they are personally exposed.
- **Daily users:** office staff, sales staff, junior accountants. They are **not compliance experts**. The product must tell them what to do next in plain language.

### 2.4 Go-to-market order
1. **Lithuania first.** Home market, you know the supervisors. Many non-financial sectors are supervised by the FNTT (Financial Crime Investigation Service) **[verify per sector]**.
2. **Baltics** (Latvia, Estonia): similar markets, small firms.
3. **Wider EU.** Languages and local registry integrations are the main work; the rules are largely the same under AMLR.

---

## 3. What AMLR requires these firms to do → product features

This is the core of the spec: every module exists because of a legal obligation.

| # | AMLR obligation | Article (approx.) | Product module |
|---|---|---|---|
| 1 | Business-wide risk assessment of the firm itself | Art. 10 | **Firm Risk Assessment** wizard |
| 2 | Written internal policies, procedures and controls | Art. 9 | **Policy Builder** |
| 3 | Named compliance manager (management body) and compliance officer | Art. 11 | **Governance** settings + sign-offs |
| 4 | Staff awareness and training | Art. 12 **[verify]** | **Training** tracker (later) |
| 5 | Customer due diligence: identify and verify the client, understand purpose and nature of the relationship | Art. 19–22 | **Client Onboarding (CDD)** |
| 6 | Identify and verify **beneficial owners** (≥25% ownership, or control by other means) | Art. 51–52 **[verify]** | **Beneficial Owner** capture + ownership tree |
| 7 | Risk-based approach: simplified or enhanced due diligence | Art. 33–34 | **Client Risk Scoring** |
| 8 | **PEP** checks, incl. family members and close associates | Art. 42–46 **[verify]**; AMLA CDD standard | **Screening** |
| 9 | Targeted financial sanctions checks | Art. 20, AMLA CDD standard | **Screening** |
| 10 | High-risk third countries → EDD | Art. 29–30 **[verify]** | Country risk table in **Risk Scoring** |
| 11 | Ongoing monitoring; refresh CDD at least **every 1 year (high risk)** and **every 5 years (others)** | Art. 26 | **Monitoring & Refresh** scheduler |
| 12 | Report suspicions to the national FIU | Art. 69 | **Suspicion Reporting** |
| 13 | Keep records for 5 years | Art. 77 | **Audit Log & Records** |
| 14 | €10,000 cash payment limit for traders; identify buyers in cash deals below it **[verify thresholds]** | Art. 80 | **Cash Transaction** log (HVG traders) |
| 15 | No anonymous relationships | Art. 79 **[verify]** | Validation: no client without verified identity |

---

## 4. MVP scope (version 1)

Goal: a small firm can sign up, run its firm risk assessment, onboard clients properly and show a supervisor a complete file. **Target: usable well before 10 July 2027.**

### 4.1 Firm setup & Firm Risk Assessment
- Sign-up, firm profile (sector, country, size, services, client types, cash use, cross-border share).
- Guided questionnaire → **firm risk assessment report** (PDF) with inherent risk, controls and residual risk.
- Re-assessment reminder (yearly, and when the business changes).

### 4.2 Client Onboarding (CDD)
- **Natural persons:** name, date and place of birth, nationality, address, ID document data, occupation, purpose of relationship.
- **Legal entities:** name, registration number, legal form, registered address, directors, ownership structure.
- **Beneficial owners:** add people with ownership %, control type; flag anyone ≥25%; visual ownership tree for layered structures.
- **Document upload:** ID, company extract, proof of address, source-of-funds evidence.
- **Sector templates:** different questions for accountants (engagement type), estate agents (property, buyer/seller role, price, financing), HVG traders (item, value, payment method).
- **Checklist with traffic lights:** what's missing before the client may be accepted.

### 4.3 Client Risk Scoring
- Transparent, rule-based score (no black box): client type, country (incl. EU high-risk third-country list), sector, product/service, delivery channel (face-to-face vs remote), PEP status, cash use, complex structure.
- Result: **Low / Medium / High**, with the reasons listed.
- High → EDD checklist (source of wealth, source of funds, senior management approval).
- Manual override allowed only with a written reason (logged).

### 4.4 Screening
- **Sanctions:** EU consolidated financial sanctions list (free, official) — required; UN list; optionally UK and US lists.
- **PEPs incl. family and close associates:** needs a data provider (see §7).
- Match review screen: *true match / false positive* with a required comment. This documented decision is exactly what supervisors look for.
- Automatic re-screening when lists change (daily).

### 4.5 Monitoring & Refresh
- Due dates per client: **1 year** (high risk) / **5 years** (others), plus trigger events (ownership change, new country, sanctions hit, unusual payment).
- Dashboard: overdue, due in 30 days, recently refreshed.

### 4.6 Suspicion Reporting
- Internal "something feels off" report by any staff member → compliance officer reviews → decision documented (report / don't report, with reasons).
- Draft of the FIU report with the facts collected. Submission stays with the firm through the national FIU channel (in Lithuania: FNTT).
- "Tipping-off" warning: the client must not be told.

### 4.7 Audit Log & Records
- Every change logged: who, what, when, old value, new value. Cannot be edited.
- One-click **"Supervisor file"** export per client and for the whole firm (PDF + ZIP of documents).
- Retention: 5 years after the relationship ends, then deletion workflow (GDPR).

### 4.8 Policy Builder (simple version)
- Generates an AML/CTF policy and procedures document from the firm profile and risk assessment, in plain language, for the firm to review and approve.
- Version history and management sign-off.

---

## 5. Where "AI" helps (and where it must not)

The name says AI, so be specific and conservative. **AI drafts and suggests; a named person decides and signs.** Supervisors will expect that.

| Use | Value | Safeguard |
|---|---|---|
| Read uploaded ID / company registry extracts and pre-fill forms | Saves time, fewer typos | User confirms every field |
| Explain screening hits ("why this is probably a different person") | Faster false-positive clearing | Decision and comment by the user |
| Adverse media summary for a client | EDD support | Sources linked; user reviews |
| Draft the risk rationale and EDD memo | Better written files | Editable; user signs |
| Draft suspicion report narrative | Small firms struggle to write these | Compliance officer approves; never auto-submitted |
| Draft policy and firm risk assessment text | Big time saving | Management approval |
| "Ask the AML assistant" (plain-language Q&A on AMLR) | Users aren't experts | Cites articles; says when to ask an expert (upsell to AMLSync) |

**Not in v1:** automatic accept/reject decisions, automatic risk ratings without rules, automatic FIU submissions.

**Check before launch:** EU AI Act classification of the AI features **[verify]**; GDPR data processing (client personal data must not leave the EU without safeguards — choose EU-hosted infrastructure and AI processing).

---

## 6. Pricing idea (to validate)

| Plan | For | Includes | Indicative price |
|---|---|---|---|
| **Starter** | Sole traders, very small firms | 1 user, up to 50 active clients, sanctions screening, CDD, risk scoring, audit log | €49–79 / month |
| **Professional** | Small firms | 5 users, 500 clients, PEP screening, monitoring, policy builder, AI drafting | €149–249 / month |
| **Business** | Larger firms, networks | Unlimited users, API, multi-office, custom risk model | From €500 / month |
| **Add-on: AMLSync Expert** | Any plan | Human review by an AMLSync analyst: file review, AMLR health-check, remediation | Per review / per project |

Market reference: many AML tools charge per check, and the cheapest monthly screening plans start at roughly €90 / $95 per month. A flat, simple price is a selling point for small firms.

---

## 7. Data sources & integrations

| Need | Options |
|---|---|
| Sanctions lists | EU consolidated list (free), UN (free), OFAC, UK OFSI |
| PEPs, family members, close associates, adverse media | Commercial data provider (e.g. OpenSanctions commercial licence, or a screening API vendor) — **cost decision** |
| ID verification (remote clients) | Lithuanian/EU vendors such as Ondato or iDenfy; eIDAS-based identity later |
| Company and beneficial ownership registers | Lithuania: Registrų centras / JADIS; other EU registries via BRIS later |
| High-risk third countries | EU Commission list (and AMLA updates), FATF lists |

---

## 8. Technical approach (for the MVP)

- **Web app:** Next.js + TypeScript, Tailwind for UI.
- **Database:** PostgreSQL (EU region), Prisma ORM. Separate data per firm (multi-tenant with row-level security).
- **Files:** EU-hosted object storage, encrypted.
- **Auth:** email + password with 2FA; roles: Owner, Compliance Officer, Staff, Read-only (supervisor/auditor view).
- **Hosting:** EU only (GDPR, client trust).
- **AI:** called through a server-side service with logging; no client data used for model training.
- **Languages:** English and Lithuanian at launch; Latvian and Estonian next.

---

## 9. Roadmap

| Phase | When (target) | Scope |
|---|---|---|
| 0. Validate | Nov–Dec 2026 | Interview 10–15 accountants, estate agents, dealers in Lithuania; test pricing; click-through prototype |
| 1. MVP | Jan–Mar 2027 | §4.1–4.7 for accountants and estate agents; EU sanctions screening |
| 2. Pilot | Apr–Jun 2027 | 5–10 paying pilot firms; HVG trader template + cash log; PEP data provider; policy builder; AI drafting |
| 3. AMLR go-live | 10 July 2027 | Public launch in Lithuania, aligned with final AMLA CDD standard |
| 4. Expand | H2 2027 | Latvia, Estonia; ID verification integration; training module |
| 5. Scale | 2028+ | More EU countries and languages, registry integrations, API, partner channel (accounting software, real estate CRMs) |

---

## 10. Open questions (for you to decide)

1. **First segment:** accountants, estate agents, or HVG traders? (Recommendation: **accountants** — recurring clients, many company clients with beneficial owners, and they influence their own clients.)
2. **PEP data:** which provider and budget? This is the largest running cost.
3. **AMLSync link:** same brand ("AMLSyncAI by AMLSync") or separate brand?
4. **Sales channel:** direct, or through professional associations (e.g. accountants' and real estate associations)?
5. **Remote onboarding:** include ID verification in MVP or later?
6. **Pilot customers:** do you already know 3–5 firms who'd test it?

---

## 11. Success measures

- Time to onboard a client: **under 10 minutes** for a standard low-risk client.
- 100% of active clients with a risk rating and a next-refresh date.
- Supervisor file exported in **one click**.
- 10 paying firms by AMLR go-live; churn under 3% per month.
