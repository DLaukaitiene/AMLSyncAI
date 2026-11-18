# AMLSyncAI — Backoffice (Admin) Specification (v0.2, draft)

*Status: draft for discussion · Last updated: 18 November 2026 · v0.2 records decisions on credits, tooling, log retention and VAT · Companion to [PRODUCT_SPEC.md](PRODUCT_SPEC.md) (v0.7) and [REGULATORY_REVIEW.md](REGULATORY_REVIEW.md)*

> **Scope.** The Backoffice is AMLSync's internal admin application for running AMLSyncAI: every customer firm and user, every website visitor and lead, billing and check credits, product usage, security, bot traffic, vendors, the rule content (EU Core and Country Packs), support, feature requests and compliance of AMLSync itself. It is **not** the customer-facing app.
>
> **Legal note.** Items marked **[verify]** need legal or vendor confirmation. Not legal advice.

---

## 1. Summary

The Backoffice gives AMLSync one place to see and run the whole business, with one hard rule that separates it from a normal SaaS admin panel:

> **AMLSync sees the business, not the customers' AML files.** Each customer firm is the data controller for its clients' KYC data and AMLSync is its processor (GDPR Art. 28–29). Suspicion reports (STRs) are protected by the AMLR ban on tipping-off (Art. 73). So the Backoffice shows **counts, metadata and health signals by default**. It never shows customers' client names, ID documents, screening hits or STR content unless the firm grants time-limited, logged access for a specific support case. STR content is never viewable at all.

What the Backoffice covers:

| Area | What AMLSync gets |
|---|---|
| **Customers (firms)** | Complete 360° view of every firm: profile, plan, credits, users, usage, health, support, invoices, sanctions check of the firm itself |
| **Users** | Every user across all firms: roles, logins, MFA, devices, activity, risk signals |
| **Visitors & leads** | Every website and docs visitor (anonymous and identified), sources, funnels, sign-up drop-off, lead scoring and CRM |
| **Website & product analytics** | Traffic, pages, campaigns, SEO, conversion funnel, activation, feature adoption, cohorts, retention |
| **Revenue & billing** | Prepaid credit wallets, top-ups, subscriptions, invoices, VAT, refunds, MRR/ARR, usage revenue, vendor cost and margin per check |
| **Security** | Auth events, account takeover signals, admin access log, WAF, vulnerabilities, incidents, backups, uptime |
| **Bot traffic** | Good bots, AI crawlers, scrapers, credential stuffing, fake sign-ups, card testing, abuse of checks |
| **Abuse & misuse** | Firms using checks for non-AML purposes (people-search), shared accounts, sanctioned or prohibited customers |
| **Vendors & integrations** | Health, latency, error rates and costs of ID, screening, registry, eID, payment, email and AI providers, per country |
| **Rules content** | Editing, reviewing and publishing the EU Core and the 27 Country Packs, sanctions list ingestion, regulatory watch |
| **AI operations** | AI usage, cost, quality, human-override rates, incidents, AI Act and Art. 76(5) evidence |
| **Support** | Tickets, SLAs, consented support access, knowledge base, status page |
| **Feature requests** | In-app requests, votes, deduplication, revenue-weighted priority, roadmap, changelog, notifications |
| **AMLSync's own compliance** | GDPR records, DPAs and sub-processors, data subject requests, breach register, trust centre, certifications evidence |
| **Communications** | Emails, in-app messages, regulatory alerts and release notes to customers |
| **Expert services** | Queue and time tracking for AMLSync Expert / managed-service work under Art. 18 outsourcing agreements |

---

## 2. Design principles

1. **Least data, least privilege.** Every screen shows the minimum needed. Admin roles are narrow (§4). Personal data of customers' clients is out of reach by default.
2. **Tenant consent for any look inside.** Support access to a firm's workspace requires the firm's in-app approval, is scoped (which client file or screen), time-limited (default 30 minutes), read-only by default, shown on screen to the admin with a coloured border and banner, and logged in both AMLSync's and the firm's audit logs. Pattern based on [Pigment's safe impersonation design](https://engineering.pigment.com/2026/04/08/safe-user-impersonation/).
3. **STR wall.** No admin role, support session or database query from the Backoffice can read STR drafts, internal suspicion notes or FIU correspondence. Only aggregate counts such as "STR module used: yes/no" are allowed **[verify — counts may themselves be sensitive; consider removing even counts]**.
4. **Everything is logged, nothing is deleted silently.** All admin actions go to an append-only, hash-chained admin audit log (same design as the customer audit log).
5. **Four eyes for dangerous actions.** Refunds above a threshold, credit grants, account deletion, rule publication, role changes, data exports and break-glass access need a second admin's approval.
6. **Privacy-first analytics.** First-party, EU-hosted, cookie-light web analytics. Anything beyond aggregated audience measurement needs consent (§7.6).
7. **No end-client data in third-party tools.** No data about the people our customers check ever goes into analytics, error tracking or the CRM — only data about customer firms' staff and how they use the product.
8. **Actionable, not decorative.** Every metric links to the list of records behind it, and every alert has an owner and a playbook.
9. **Built for one operator first.** AMLSync is small: the default views answer "what needs my attention today?" on one screen (§5).

---

## 3. Users of the Backoffice

| Persona | Typical questions |
|---|---|
| **Founder / Managing Director** | How many firms, revenue, burn, which countries and sectors grow, what's on fire today |
| **Sales & customer success** | Which visitors are hot leads, which trials are stuck, which firms are at risk of churning, who to upsell to Expert services |
| **Support** | Who is this user, what did they just do, what error did they hit, can I see the screen (with consent) |
| **Finance** | Top-ups, invoices, VAT, refunds, failed payments, vendor bills vs. resale revenue, margin per check |
| **Security / DevOps** | Suspicious logins, bot attacks, WAF events, vendor outages, incidents, backups, vulnerabilities |
| **Regulatory content editor** | Country Pack gaps, new AMLA standards, sanctions-list updates, release notes |
| **AMLSync Expert analysts** | Their assigned review queue for firms that bought Expert / managed service (separate, contract-based access) |
| **Product** | Feature adoption, funnel drop-off, feature requests, experiments |
| **Auditor / DPO (read-only)** | Admin access logs, GDPR records, incidents, evidence for ISO 27001 / SOC 2 |

---

## 4. Roles and permissions

### 4.1 Admin roles

| Role | Can do | Cannot do |
|---|---|---|
| **Owner** (founder) | Everything below, approve four-eyes actions, manage admin roles | Read STR content (nobody can); bypass audit log |
| **Operations admin** | Manage firms, plans, credits (within limits), users, communications | Approve own four-eyes actions; data exports above threshold |
| **Support agent** | View firm and user metadata, tickets, error traces; request consented access | Grant credits, change billing, access without consent |
| **Finance** | Billing, invoices, refunds (below threshold), VAT, vendor costs, revenue reports | User and security admin |
| **Security engineer** | Security, bot, WAF, incident, vulnerability and admin-log views; lock accounts; revoke sessions/keys | Billing; content publishing |
| **Content editor** | Draft EU Core and Country Pack changes, release notes, help articles | Publish without a reviewer |
| **Content reviewer (legal)** | Review and publish rule changes | Billing, user admin |
| **Sales / CS** | Leads, CRM, trials, health scores, notes, feature requests | Credits, refunds, security |
| **Expert analyst** | Work assigned cases inside firms that signed an Art. 18 agreement, within the firm's own permissions model | Decide on onboarding, risk profile or STR (firm's decision, Art. 18); any other firm |
| **Read-only auditor** | View logs, reports, evidence | Change anything |

### 4.2 Admin access security
- Separate admin domain (e.g. `admin.amlsync…`), not linked from the public site, behind Cloudflare Access / zero-trust with device posture checks **[validate tooling]**.
- SSO with **phishing-resistant MFA** (passkeys / hardware keys) mandatory for every admin.
- Just-in-time elevation for Owner-level actions (expires after 1 hour).
- Session timeout 15 minutes idle; re-authentication before sensitive actions.
- IP / country allow-list for admin sign-ins; alert on any new device or location.
- Quarterly access review: every admin role re-approved, leavers removed the same day.
- **Break-glass account** stored offline, use triggers an alert to all owners and an incident record.

---

## 5. Home: "Today" dashboard

The first screen answers "what needs attention?" in under 10 seconds.

| Tile | Content | Click-through |
|---|---|---|
| **Alerts** | Open security incidents, vendor outages, failed payments, bot attack in progress, overdue support SLAs | Alert list with playbook |
| **New today** | Sign-ups, firms verified, first checks run, top-ups, cancellations | Lists of records |
| **Revenue** | Today / month-to-date top-ups, MRR, credits sold vs. consumed, vendor cost, gross margin | Revenue module |
| **Funnel (7 days)** | Visitors → sign-ups → email verified → firm set up → first client check → first payment | Funnel analysis |
| **At-risk firms** | Health score dropped, credits about to run out, no logins for 30 days, many errors | Firm 360 |
| **Hot leads** | Visitors with high lead score, trial firms close to activation | Leads list |
| **Support** | Open tickets by priority, SLA breaches, CSAT | Support queue |
| **Security** | Failed logins (24h), blocked bot requests, MFA adoption, admin access events | Security module |
| **Product** | Top errors, slowest pages, feature-request trending | Product analytics |
| **Regulatory** | Country Pack items to review, new AMLA/Commission publications, sanctions list updates in last 24h | Content module |

Filters on every tile: country, sector, plan, acquisition channel, date range.

---

## 6. Customers: firms and users

### 6.1 Firm list
Searchable, filterable, exportable (export is four-eyes above 500 rows).

Columns (configurable): firm name · legal ID (company code / VAT ID) · country · sector(s) · plan · signup date · status (trial / active / paused / churned / suspended / closed) · seats used / allowed · active users (30d) · checks this month (person / company / screening) · credit balance (€ and checks) · lifetime revenue · MRR · health score · last login · owner (AMLSync account manager) · acquisition source · open tickets · NPS · tags.

Saved views: "Trials ending in 7 days", "Credits < 10%", "No first check after 3 days", "Enterprise / networks", "Per country".

### 6.2 Firm 360 page
Tabs:

| Tab | Contents |
|---|---|
| **Overview** | Firm profile (legal name, registration number, VAT ID with VIES validation status, LEI if any, address, country, sector(s), obliged-entity category under AMLR Art. 3, supervisor, size band), plan, health score with reasons, key dates, AMLSync owner, notes and tags |
| **Firm KYB (AMLSync's own checks)** | Registry extract of the firm, its directors and beneficial owners; **sanctions screening of the firm, its directors and BOs** with ongoing monitoring; check for Russia/Belarus restrictions (e.g. ban on providing enterprise-management software and IT services to Russian-established entities under Reg. 833/2014 **[verify the exact Article and scope]**); result and date. Prevents AMLSync from serving sanctioned or prohibited customers. |
| **Users** | Users, roles, MFA status, last login, devices, invitations pending, SSO status |
| **Usage** | Checks per type per month (chart), clients onboarded, matters, refresh tasks, AI features used, portal links sent vs. completed by end-clients, API calls; **metadata only** |
| **Compliance health (aggregate)** | Counts only: files with open mandatory items, overdue refreshes, overdue discrepancy reports, training completion %, policies approved (yes/no), firm risk assessment age. Lets CS help firms avoid under-compliance without seeing client data. |
| **Billing** | Wallet balance, top-up history, invoices, subscription, payment method (tokenised, last 4 only), failed payments, refunds, credit grants, VAT treatment |
| **Support** | Tickets, chat transcripts, consented-access sessions and their logs, CSAT |
| **Feature requests** | Requests and votes from this firm, linked to roadmap items |
| **Communications** | Emails and in-app messages sent, opens/clicks, release notes received, regulatory alerts |
| **Contracts** | Terms version accepted (date, user, IP), DPA version, Art. 18 outsourcing agreement (if Expert/managed service), order forms, PI-insurance-relevant notes |
| **Security** | Firm-level auth events, IP allow-list setting, API keys (masked, created by, last used), webhooks, suspicious activity flags |
| **Timeline** | Every event for the firm in one stream: sign-up, plan changes, top-ups, logins, tickets, emails, support access, alerts |
| **Admin actions** | Every admin action on this firm with who, when, why |

Actions (permission-dependent): change plan · grant/revoke credits (four-eyes above €100) · extend trial · pause / suspend (with reason; suspension blocks new checks, keeps read access and retention) · reset MFA for a user (requires identity verification of the requester) · resend invitation · request support access · export firm metadata (GDPR portability on request) · start closure (§12.4).

### 6.3 Users (all firms)
- Global user search (email, name, firm, user ID).
- Per user: profile, firm(s), role, MFA type, login history (time, IP, country, ASN, device, browser, result), sessions (revoke), password reset history, notification settings, language, feature usage, errors encountered, tickets, consent records, marketing preferences.
- Signals: impossible travel, new device + new country, many failed logins, login from Tor / hosting provider / VPN, shared account (simultaneous sessions from far-apart locations), dormant admin users in a firm.
- Actions: lock, unlock, revoke sessions, force password reset, force MFA re-enrolment, merge duplicate users (four-eyes).

### 6.4 Health score (per firm)
Weighted 0–100 score, recalculated daily, with the reasons shown:

| Signal | Weight | Example |
|---|---|---|
| Active users / seats (30d) | 20 | 3 of 5 seats active |
| Core actions (checks, clients onboarded) trend vs. previous 30d | 25 | −40% |
| Activation milestones reached (§7.4) | 15 | 4 of 6 |
| Credit balance runway | 10 | 12 days at current usage |
| Compliance health (aggregate, §6.2) | 10 | 8 overdue refreshes |
| Support (open tickets, CSAT) | 10 | 1 P1 open |
| Payment health | 10 | 1 failed top-up |

Bands: green ≥ 70, amber 40–69, red < 40. Red triggers a CS task.

---

## 7. Visitors, leads and website activity

### 7.1 Properties tracked
- Marketing website (amlsync / AMLSyncAI site, all language versions).
- Docs / help centre.
- Pricing page, calculators, blog, regulatory guides, webinar pages.
- Sign-up and login pages (security events go to §10).
- In-app product analytics (§8).
- Client-facing portal used by **customers' clients** — tracked only for technical health (completion, errors, drop-off step), never for marketing, and without identifying the end-client to AMLSync.

### 7.2 Visitor list
Every visitor gets an anonymous visitor record. It becomes identified only when the visitor signs up, books a demo, subscribes to the newsletter or submits a form.

| Field | Anonymous visitor | Identified lead |
|---|---|---|
| Visitor ID (first-party, pseudonymous) | ✓ | ✓ |
| First seen / last seen, visits, pages, time on site | ✓ | ✓ |
| Country / region (from IP, IP not stored in full) | ✓ | ✓ |
| Device, browser, OS, language | ✓ | ✓ |
| Referrer, UTM source/medium/campaign, landing page | ✓ | ✓ |
| Pages viewed (pricing, sector pages, docs, regulatory guides) | ✓ | ✓ |
| Search terms used on site/docs | ✓ | ✓ |
| Bot classification (§11) | ✓ | ✓ |
| Company (from form; reverse-IP enrichment only with consent / legal basis **[verify]**) | — | ✓ |
| Name, email, role, firm size, sector, country | — | ✓ |
| Consent records (analytics, marketing, newsletter) | ✓ | ✓ |
| Lead score, owner, stage, notes | — | ✓ |

### 7.3 Lead management (light CRM)
- Stages: Visitor → Lead → Trial → Activated → Paying → Expanded / Churned.
- Lead score (0–100) from: sector fit (accountant / estate agent / HVG etc.), country, firm size, pages viewed (pricing, sector, docs), return visits, demo requested, trial actions.
- Tasks, notes, email sequences, meeting links, deal value, close date.
- **CRM: HubSpot Free** (works with Gmail / Google Workspace; enough for LinkedIn and Upwork outreach). Move to Pipedrive only if the pipeline gets busy. Only lead and customer-staff data goes into the CRM; the Backoffice stays the source of truth for product data.

### 7.4 Funnels and activation
Standard funnel (per country, sector, channel, device):

1. Visit → 2. Pricing / sector page view → 3. Sign-up started → 4. Email verified → 5. Firm profile completed → 6. Firm KYB passed → 7. **First client check run** → 8. First portal link completed by an end-client → 9. First top-up / payment → 10. Second month active.

**Activation milestones** (shown per firm): firm risk assessment done · policy generated and approved · first client onboarded end to end · first company with ownership tree resolved · second user invited · first refresh or monitoring alert handled.

Views: step conversion %, median time between steps, drop-off reasons (form field errors, validation failures, payment declines), cohort comparison.

### 7.5 Website analytics
- Traffic: visitors, sessions, page views, bounce / engaged sessions, by day / week / month.
- Acquisition: channels, referrers, campaigns, search engines, LLM / AI-assistant referrals (ChatGPT, Perplexity, Claude, Copilot), social, partners, associations.
- Content: top pages, entry and exit pages, scroll depth, docs article helpfulness votes, search with no results (content gaps).
- Geography and language: visitors per EU member state vs. Country Packs live; language switch rate.
- SEO: indexed pages, rankings for key terms ("AMLR software", "KYC for accountants", per language), Core Web Vitals.
- Experiments: A/B tests on pricing and sign-up pages with significance shown.

### 7.6 Privacy rules for visitor tracking
- Default: **aggregated, first-party, EU-hosted audience measurement** configured for consent exemption where national rules allow (e.g. CNIL-type exemption; the proposed EU Digital Omnibus exemption for aggregated audience measurement is not yet law **[verify status]**) — see [Matomo on 2026 privacy changes](https://matomo.org/blog/2026/01/privacy-regulations-changes-2026-analytics/).
- Anything beyond that (session replay, cross-session marketing profiles, ad pixels, reverse-IP company identification) only after **opt-in consent**; consent records kept per visitor.
- IPs truncated before storage in analytics; raw IPs kept only in security and access logs (§10), retained 12 months (§12.3).
- Retention: anonymous visitor records 13 months, then aggregated.
- Never track end-clients of customers for marketing; never load third-party trackers in the client portal or the customer app.
- Do-Not-Track / Global Privacy Control respected.

---

## 8. Product analytics (inside the customer app)

### 8.1 Event model
Every product action emits an event with: event name, timestamp, firm ID, user ID (pseudonymous), role, country pack, plan, app version, device, and **non-personal properties only** (e.g. `check_type=company`, `risk_level=high`, `country=DE`, `duration_ms`). No names, ID numbers, document images or screening hit details ever enter analytics.

Core events: `signup_completed`, `firm_kyb_passed`, `client_created`, `portal_link_sent`, `portal_completed`, `id_check_completed`, `registry_lookup`, `ubo_tree_resolved`, `screening_run`, `screening_match_reviewed`, `risk_scored`, `edd_triggered`, `client_accepted`, `client_refused`, `refresh_due`, `refresh_completed`, `discrepancy_report_drafted`, `str_module_opened` **[verify — see STR wall]**, `report_exported`, `policy_approved`, `training_completed`, `ai_draft_accepted`, `ai_draft_edited`, `topup_completed`, `feature_request_submitted`.

### 8.2 Dashboards
- Feature adoption per module (% of active firms using it in 30 days).
- Time-to-value: median minutes from sign-up to first completed client file.
- Staff time per client file (target from product spec: < 2 min low-risk individual, < 5 min company, < 20 min EDD).
- Portal completion rate by end-client device, country and language; step where end-clients drop.
- Automation rate: share of screening matches cleared by AI triage with one-click confirmation; share of company trees auto-resolved; share of refreshes completed by end-clients without staff.
- Error and friction: rage clicks, validation errors per field, slow pages (p75), failed vendor calls seen by users.
- Retention: weekly/monthly active firms, cohort retention curves by signup month, sector and country.
- Usage-based revenue drivers: checks per active firm, credits consumed vs. purchased, top-up frequency.

### 8.3 Session diagnostics
For support only: **PostHog session replay** on the customer app, with all inputs masked and **replay switched off on every screen that shows check results, client files, screening hits or reports**. Users are identified in PostHog only after they log in.

---

## 9. Revenue, billing and credits

### 9.1 Model to support
From the MVP plan: **pay per check with prepaid bundles**, optional subscription for consulting add-on and plans in the product spec (flat plan + included credits + top-ups). The Backoffice must handle both.

### 9.2 Wallet and credits
- Wallet per firm: **one universal credit**. Every check type (person, company, screening, eID, registry extract) consumes a set number of credits from the same balance; the price list (credits per check type) is versioned configuration, so prices can change without migrating wallets. Balance shown in credits and € equivalent.
- Ledger (append-only): top-up, consumption (linked to check ID and vendor transaction ID), refund, expiry (e.g. bundles valid 12 months), promotional grant, manual adjustment (four-eyes), chargeback.
- Low-balance alerts to the firm (20%, 5%, 0) and auto top-up option.
- Failed check policy: credit returned automatically if the vendor call failed or the end-client never completed.

### 9.3 Payments, invoices and tax
- Payment provider: Stripe or Revolut Business (decision open) — Backoffice reads payments, payouts, disputes and fees from the provider; card data never touches AMLSync systems (PCI scope stays with the provider).
- Invoices: sequential numbering, EU-compliant fields, PDF, credit notes; per-firm billing contacts.
- **EU VAT** (confirm with the accountant before launch):
    - **Lithuanian customers:** always 21% Lithuanian VAT, with or without a VAT number.
    - **EU business customers with a valid VAT number:** reverse charge (0% with the reverse-charge note). VAT number checked in **VIES at sign-up**, result and timestamp stored, re-checked before each invoice.
    - **EU customers without a VAT number:** treated as non-taxable (B2C) for electronically supplied services. While total cross-border B2C sales in the EU stay under **€10,000 a year**, charge Lithuanian 21%; above that, charge the customer's country rate and report through **OSS**. Stripe Tax can calculate this.
    - **Electronically supplied vs. ordinary service:** fully automated checks count as electronically supplied services. Work where AMLSync analysts review results by hand (Expert / managed service) is an ordinary service; customers without a VAT number pay Lithuanian VAT on it. Invoice lines are tagged by service type.
    - **AMLSync's own VAT status [verify]:** a State Tax Inspectorate (VMI) presentation indicates that since 1 May 2025 a Lithuanian business providing services whose place of supply is another EU state must register for VAT, possibly under the small-business scheme (SVS) below €45,000. The first reverse-charge invoice may already require registration; confirm Integral Services' status before launch.
    - Threshold monitor in the Backoffice: running total of EU cross-border B2C sales vs. €10,000, with an alert at 80%.
- Dunning for subscriptions: retries, reminders, grace period, suspension rules.
- Refund and dispute workflow with reason codes.

### 9.4 Revenue reporting
Metrics with definitions shown on hover (based on [ChartMogul's metrics library](https://chartmogul.com/saas-metrics/cheat-sheet/)):

| Metric | Definition |
|---|---|
| **MRR / ARR** | Monthly recurring revenue from subscriptions; ARR = MRR × 12 |
| **MRR movements** | New, expansion, contraction, churn, reactivation |
| **Usage revenue** | Credit consumption recognised in the month (separately from cash collected through top-ups) |
| **Cash collected** | Top-ups + subscription payments − refunds |
| **Deferred revenue** | Unused prepaid credits (liability) |
| **Breakage** | Credits expired unused |
| **Gross revenue churn** | (Churned + contraction MRR) ÷ starting MRR |
| **Net revenue retention (NRR)** | Revenue from a starting cohort after 12 months ÷ its starting revenue (include usage revenue) |
| **ARPA** | Revenue ÷ active firms |
| **Gross margin** | (Revenue − vendor check costs − hosting − payment fees) ÷ revenue |
| **Margin per check type** | Credits consumed × € per credit − vendor cost − payment fee share |
| **LTV** | (ARPA × gross margin) ÷ customer churn rate |
| **CAC / payback** | Sales & marketing spend ÷ new paying firms; months of gross margin to recover CAC |

Breakdowns by country, sector, plan, channel, cohort.

### 9.5 Vendor cost reconciliation
- Every check stores vendor, vendor transaction ID, vendor price at that time.
- Monthly reconciliation against vendor invoices (Ondato / iDenfy / Veriff, screening provider, registry fees, eID broker, AI provider); differences flagged.
- Price-change alerts when a vendor's unit cost changes; impact on margin per check.

---

## 10. Security

### 10.1 Security overview dashboard
- Sign-in events: successes, failures, lockouts, MFA challenges, password resets — per hour, per country, per ASN.
- MFA adoption % of users (target 100% for firm admins); passkey adoption.
- Account-takeover signals: impossible travel, new device + new country, password spraying (one IP, many accounts), credential stuffing (many IPs, leaked credentials), session hijack indicators (token reuse from new fingerprint).
- Admin access log (§4.2) with anomalies highlighted.
- Active sessions and API keys (count, oldest, never-used, high-privilege).
- WAF and rate-limit events (from Cloudflare or equivalent): blocked requests by rule, top attacking IPs/ASNs, OWASP categories (SQLi, XSS, path traversal).
- Data export events (who exported what, size).
- Encryption and key management status (KMS key rotation dates).

### 10.2 Vulnerability and change management
- Dependency and container vulnerabilities (Dependabot/Snyk-style), by severity and age; SLA: critical 7 days, high 30 days **[decide]**.
- Secret scanning results.
- Penetration test tracker (yearly external test + after major releases): findings, owner, status.
- Deployment log: who deployed what, when, linked to change ticket; production config changes.

### 10.3 Incidents
- Incident register: detection time, severity, systems, data affected, firms affected, timeline, root cause, actions.
- **GDPR personal data breach workflow:** AMLSync as processor notifies affected firms **without undue delay** (target ≤ 24 h); for AMLSync-controlled data (visitors, leads, own users) the 72-hour authority notification clock to the Lithuanian DPA (VDAI) **[verify competent DPA]** starts at awareness; templates for both.
- NIS2 applicability check (AMLSync is likely below the size thresholds today; re-check as it grows) **[verify]**.
- Post-incident review and customer communication log.

### 10.4 Availability and resilience
- Uptime and SLOs per component (app, client portal, API, each vendor adapter), error budget.
- Public status page with incident history and subscriptions.
- Backups: last successful backup, restore test date and result (monthly restore test), RPO/RTO targets (e.g. RPO 1 h, RTO 4 h **[decide]**).
- Data residency map: where each data type is stored and processed (EU regions only), sub-processor list.

---

## 11. Bot traffic and abuse

### 11.1 Classification
Every request/session is classified (Cloudflare bot score or equivalent + own signals):

| Class | Examples | Default action |
|---|---|---|
| **Verified good bots** | Search engines, uptime monitors, link previews | Allow |
| **AI crawlers** | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot | Policy per section: allow on marketing/docs (visibility in AI answers), block on app and portal; robots.txt + WAF rules |
| **SEO / marketing tools** | Ahrefs, Semrush | Allow with rate limit |
| **Scrapers** | Pricing/docs scraping by competitors, content theft | Rate limit, challenge |
| **Credential stuffing / password spraying** | Login attempts with leaked credentials | Block, Turnstile challenge, lock targeted accounts, notify users |
| **Fake sign-ups** | Disposable emails, scripted forms, free-trial farming | Turnstile on sign-up, email domain checks, firm KYB gate |
| **Card testing** | Many small top-ups with different cards | Provider fraud rules (e.g. Stripe Radar), velocity limits, challenge |
| **API abuse** | Leaked API keys, burst calls | Per-key rate limits, anomaly alerts, auto-revoke option |
| **Unknown automation** | Headless browsers, hosting ASNs | Managed challenge |

Cloudflare documents bot scores (1 = likely bot, 99 = likely human), verified-bot allow lists and free Turnstile for login and sign-up forms ([Cloudflare bot use cases](https://developers.cloudflare.com/use-cases/application-security/bots/)). ClearAML's own login uses a Cloudflare security check (observed on its login page), so this is table stakes in the category.

### 11.2 Bot dashboard
- Share of traffic: human vs. verified bots vs. AI crawlers vs. bad bots, per property, over time.
- AI crawler hits per bot and section; AI-referral visits back to the site (value of being crawled).
- Challenges issued / solved / failed (Turnstile solve rate).
- Top bad-bot sources (ASN, country, user agent, JA4 fingerprint where available).
- Fake sign-ups blocked; sign-ups that passed but failed firm KYB.
- Analytics hygiene: bot traffic excluded from marketing analytics and funnels automatically.

### 11.3 Misuse of the AML product
Specific to a KYC tool — checks can be misused to look up people for non-AML reasons, which breaches purpose limitation (AMLR Art. 76, GDPR):
- Anomaly rules: sudden spike in person checks, checks on many people with no matter or onboarding purpose, repeated checks on the same person by different firms, screening-only use without onboarding, checks outside the firm's sector pattern, checks right after sign-up from a new firm.
- Review queue for flagged firms; outcomes: no issue / ask firm for explanation / suspend / terminate under the Terms.
- Firm KYB failures and sanctions hits on the firm itself (§6.2) block service.

---

## 12. Data protection operations (AMLSync's own GDPR duties)

### 12.1 Records
- Record of processing activities (controller: visitors, leads, own users' account data; processor: customers' client data).
- DPA versions signed per firm; sub-processor list with change notifications (firms notified in advance; objection handling).
- Data processing map (§10.4) and transfer assessments (EU-only by design).
- DPIA register (AMLSync's own DPIA for the platform; template offered to customers).

### 12.2 Data subject requests
- Intake (form/email) → identity check → classify: AMLSync as controller (handle directly) or as processor (forward to the firm without undue delay; AMLSync does not answer for the firm).
- Deadline clock 1 month (+2 if complex), status, evidence pack.
- Note: requests from customers' clients about AML files go to the firm; AML confidentiality and STR rules may restrict what the firm discloses (Art. 73, national law) — the Backoffice never answers these itself.

### 12.3 Retention engine

| Log / data type | Retention | Basis |
|---|---|---|
| Check results and audit trail (who ran what, when, inputs, sources, result) | **Set by the customer firm**; default 5 years; deleted or exported when the contract ends | AMLSync holds these for the firm, which is the obliged entity. AMLR Art. 77: 5 years from end of the relationship, authorities may require up to 5 more. Until 10 July 2027 the Lithuanian AML law sets the period, which may be longer **[verify]** — hence a firm setting, not a fixed rule. |
| Security and access logs (logins, admin actions, API keys) | 12 months | Usual practice; customers will ask for it |
| App and debug logs | 30 days, personal data removed | Data minimisation |
| Error tracking (Sentry) | 30–90 days | Data minimisation |
| Credit ledger and invoices | 10 years | Lithuanian accounting and VAT rules **[confirm with accountant]** |
| Anonymous visitor analytics | 13 months, then aggregated | Privacy-first analytics (§7.6) |

- Deletion jobs log: what was deleted, when, by which rule.

### 12.4 Firm closure and offboarding
- Firm cancels → read-only period → export package (all files, audit log, PDFs) → retention continues for AML records still within 5 years, or hand-over to the firm's own archive **[decide model and price]** → final deletion certificate.
- Offboarding checklist tracked per firm.

---

## 13. Vendors and integrations health

| Vendor type | Monitored per vendor and per country |
|---|---|
| ID verification (Ondato / iDenfy / Veriff) | Success rate, average and p95 latency, document types failing, liveness pass rate, cost per check, outage history |
| eID broker / national eIDs | Availability per scheme (e.g. Smart-ID, itsme), completion rate |
| Sanctions & PEP data (OpenSanctions / commercial) | List freshness per list (EU, UN, national), last ingestion time, records added/removed, matching errors |
| Company and BO registers (BRIS, national registers, KYB aggregator) | Availability, response time, coverage gaps per country, fee per extract |
| Payment provider | Payment success rate, disputes, payout status |
| Email / SMS | Delivery, bounce, spam complaints (portal links to end-clients depend on this) |
| AI provider(s) | Latency, errors, tokens, cost, EU processing confirmation |
| Hosting (Supabase, Vercel, storage) | Region, uptime, quotas, cost |

Alerts when error rate > threshold, latency doubles, or list freshness > 24 h. Fallback routing between vendors where configured. Monthly vendor scorecard.

---

## 14. Rules content: EU Core and Country Packs

The rule content is the product's core asset. The Backoffice is where it is maintained.

- **Rule catalogue:** every EU Core rule and Country Pack parameter (product spec §3A), with legal source, effective date, version, owner, status (draft / in review / published / superseded), and the product modules that use it.
- **Country Pack completeness matrix:** 27 states × all parameters, green / amber / red; a state can only be sold when complete and legally reviewed.
- **Change workflow:** draft → legal review → test against sample cases → publish with effective date → release notes → auto-created tasks for affected firms. Four-eyes required.
- **Impact preview:** how many firms and files are affected by a change (counts only).
- **Regulatory watch inbox:** AMLA standards and guidelines, Commission acts (high-risk third countries, delegated acts), EU sanctions packages, national transposition news, FIU format changes; each item triaged to a rule change or "no action".
- **Provisional parameters** (product spec §3A.4, e.g. the 365-day linked-transaction window): review dates and status shown.
- **Sanctions list ingestion:** last run per list, diffs, failures, re-screening jobs triggered.
- **Templates:** policy builder templates, sector questionnaires, document requests, email texts to end-clients, in 24 languages, with translation status and legal-term review.

---

## 15. AI operations

- Usage by feature (document reading, screening triage, drafting, assistant): calls, tokens, cost per firm and per feature, latency.
- Quality: acceptance rate of AI drafts, edit distance, override rate of AI triage suggestions, user feedback (thumbs up/down with reason), sampled human review results.
- Safety: incidents (wrong extraction, hallucinated citation), prompt-injection attempts detected in uploaded documents, PII leakage checks.
- Evidence for **AMLR Art. 76(5)** (meaningful human intervention, explanations) and the **AI Act** (transparency duties; classification record **[verify]**): per-feature documentation, model versions, change log.
- Data handling: confirmation that prompts/outputs are processed in the EU and not used for model training; retention of AI logs **[decide]**.

---

## 16. Support

- Ticket inbox (email, in-app chat, contact form) with firm and user context auto-attached (plan, recent errors, recent actions — metadata only).
- Priorities and SLAs: P1 (cannot onboard / outage) 1 h response, P2 4 h, P3 1 business day **[decide by plan]**.
- **Consented support access** (§2.2) requested from the ticket; firm approves in-app; session recorded in both audit logs.
- Macros and suggested answers from the help centre; AI-drafted replies reviewed by the agent.
- Help centre / docs CMS with article analytics (views, helpful votes, searches with no result).
- CSAT after ticket close; NPS survey every 6 months per user.
- Status page and incident messages linked to tickets.
- Escalation to AMLSync Expert (paid) when the question is advisory, not technical, with a clear line: AMLSync does not take the firm's risk decisions (Art. 18).

---

## 17. Feature requests and roadmap

- **Capture:** in-app "Suggest a feature" (with screen context), support tickets tagged as requests, sales notes, public board.
- **Deduplicate:** AI suggests matches to existing requests; admin merges, keeping all voters.
- **Score:** votes · number of firms · MRR/usage revenue of requesting firms · strategic fit · regulatory necessity (a request that closes a legal gap jumps to the top) · effort → RICE-style score.
- **Statuses:** New → Under review → Planned → In progress → Released / Declined (with reason).
- **Roadmap view** for internal use and a public version (no revenue data).
- **Changelog** published from released items; automatic notification to every firm and user who requested or voted.
- **Insights:** requests by sector and country; top requests from churned firms; time from request to release.

---

## 18. Communications

- Segments: by country, sector, plan, health band, activation stage, language, feature usage.
- Channels: email, in-app banners/modals, product tours, release notes, status updates.
- Types: onboarding sequences, low-credit warnings, refresh reminders summary (counts), **regulatory alerts** ("AMLA CDD standard adopted — what changes for you"), Country Pack updates, marketing newsletter (consent-based).
- Deliverability and engagement stats; unsubscribe and consent handling.
- Approval step for messages to all firms.

---

## 19. AMLSync Expert and managed-service operations

- Contracts: firms with Expert / managed service, scope, Art. 18 agreement date, supervisor-notification confirmation uploaded by the firm.
- Work queue: tasks the firm assigned (file reviews, screening triage preparation, EDD memo drafts, back-book remediation), due dates, analyst, status.
- Analysts work inside the firm's workspace with a role the firm grants; every action labelled "prepared by AMLSync"; decisions remain the firm's (enforced in the product).
- Time tracking and billing per engagement; quality review sampling; analyst training records (AMLSync's own Art. 12-style evidence).

---

## 20. Reports and exports

- Scheduled reports: weekly business review (funnel, revenue, usage, support, security), monthly board pack, monthly vendor reconciliation, quarterly access review, yearly security and privacy report.
- Self-serve report builder over the analytics warehouse (metadata only).
- Exports: CSV/XLSX with four-eyes above size thresholds; every export logged with purpose.
- Evidence packs for audits (ISO 27001 / SOC 2 later **[decide]**): access reviews, change logs, backups, incidents, vendor reviews, training.

---

## 21. Data model (main entities)

| Entity | Key fields |
|---|---|
| `firm` | id, legal_name, reg_no, vat_id, vies_status, country, sectors[], obliged_category, plan_id, status, health_score, owner_admin_id, created_at |
| `firm_kyb` | firm_id, registry_extract_ref, directors[], bos[], sanctions_result, monitoring_status, checked_at |
| `user` | id, firm_id, email, name, role, mfa_type, status, last_login_at, locale |
| `auth_event` | user_id, type, result, ip_trunc, country, asn, device_fp, bot_score, ts |
| `visitor` | id, first_seen, last_seen, country, device, consent_state, bot_class, lead_id |
| `pageview` / `event` | visitor_id or user_id, firm_id, name, props (non-personal), ts |
| `lead` | id, visitor_id, contact fields, score, stage, owner, source |
| `wallet` / `ledger_entry` | firm_id, type, credits, amount_eur, ref (check_id / payment_id), price_list_version, ts |
| `price_list` | version, credits per check type, € per credit (bundles), valid_from |
| `check_usage` | firm_id, check_type, vendor, vendor_tx_id, unit_cost, price, status, ts (no subject data) |
| `invoice` / `payment` | firm_id, amounts, vat, provider refs, status |
| `ticket` | firm_id, user_id, priority, status, sla_due, csat |
| `support_access` | ticket_id, firm_approval, scope, start, end, admin_id, actions_ref |
| `feature_request` | id, title, votes, firms[], mrr_weight, status, roadmap_item |
| `rule` / `country_pack_param` | id, layer (EU/N), country, value, source, version, status, effective_from |
| `vendor_metric` | vendor, country, metric, value, ts |
| `incident` | id, severity, start, detect, resolve, data_affected, firms[], notifications |
| `admin_audit` | admin_id, action, target, before/after hash, reason, approver_id, ts, chain_hash |

---

## 22. Alerts catalogue (default)

| Alert | Trigger | Owner |
|---|---|---|
| Credential stuffing | > 50 failed logins / 5 min across accounts from shared signals | Security |
| Admin anomaly | Admin sign-in from new device/country; break-glass use | Owner |
| Vendor degraded | Error rate > 5% or p95 latency × 2 for 10 min | DevOps |
| Sanctions list stale | Any list not refreshed > 24 h | Content |
| Firm sanctions hit | Firm, director or BO matches sanctions list | Owner + Legal |
| Check misuse | Firm check volume > 5× its 30-day median, or misuse rule hit | Ops |
| Card testing | > 5 failed top-ups per firm/IP in 10 min | Finance |
| Credits low (firm) | Balance < 10% and usage active | CS |
| Activation stalled | Trial firm, no first check after 72 h | CS |
| Churn risk | Health score red | CS |
| SLA breach | Ticket past SLA | Support |
| Data export large | Export > threshold | Security |
| Backup failure | Missed backup or failed restore test | DevOps |
| Personal data breach suspected | Any incident tagged personal data | Owner + DPO |

---

## 23. Competitor and best-practice analysis

Competitors' admin consoles are private; this draws on what they expose publicly plus established SaaS patterns.

| Source | What they do | What we take |
|---|---|---|
| **ClearAML** (AU) | Pay-per-check with plan credits, CPD training certificates, audit ledger, local hosting, Cloudflare security check on login | Credit wallet and ledger, bot protection on login/sign-up from day one, training evidence per user |
| **First AML** (NZ/UK/AU) | Case-based platform with API, configurable to each firm's programme, dashboards and exports for audits | Firm-level configuration views, export packs |
| **Pigment** (engineering blog) | Read-only, 30-minute, bannered, fully audited impersonation; customers can withdraw support access | Consented support access model (§2.2) |
| **ChartMogul** | Standard MRR movements, churn, NRR/GRR, LTV definitions | Revenue metric definitions (§9.4) |
| **Cloudflare** | Bot scores, verified bots, Turnstile, WAF rules | Bot classification and controls (§11) |
| **Matomo / CNIL guidance** | First-party, consent-exempt audience measurement under conditions | Privacy rules for visitor tracking (§7.6) |
| **Stripe (Radar, billing)** | Card-testing defence, dunning, invoice and tax tooling | Payment fraud and billing workflows (§9) |
| **Canny / Productboard pattern** | Voting, merge, revenue-weighted prioritisation, changelog notifications | Feature requests (§17) |
| **Vanta / trust-centre pattern** | Public trust page, evidence collection | Trust centre and audit evidence (§12, §20) |

**What AMLSync adds that generic admin panels miss:** the STR wall and processor-only access to client data; sanctions KYB of AMLSync's own customers; detection of check misuse; the rules-content workflow for 27 Country Packs; Art. 18 outsourcing controls for Expert services; compliance-health signals per firm shown as counts.

---

## 24. Releases

| | **V1 (by 10 July 2027)** | **V2 (Q4 2027 – Q1 2028)** | **V3 (2028–2029)** |
|---|---|---|---|
| Customers | Firm list + 360 (overview, users, usage, billing, timeline, admin actions), firm KYB + sanctions screening, user search, lock/revoke | Health score, compliance health counts, saved views, contracts tab | Account hierarchies (networks, groups) |
| Visitors & leads | Privacy-first web analytics, sign-up funnel, simple lead list | Lead scoring, light CRM, CRM sync, experiments | Partner/referral tracking |
| Product analytics | Core events, adoption, time-to-value | Cohorts, automation-rate dashboards, session diagnostics (consented) | Self-serve report builder |
| Billing | Wallet + ledger, top-ups, invoices, VAT/VIES, refunds, vendor cost per check | Revenue metrics, reconciliation automation, dunning | Multi-currency if needed |
| Security | Admin SSO + passkeys, admin audit log, auth events, WAF + Turnstile, incidents + breach workflow, backups | ATO signals, vulnerability tracker, status page | ISO 27001 / SOC 2 evidence |
| Bots & abuse | Bot classes, AI crawler policy, fake sign-up and card-testing controls | Check-misuse anomaly rules and review queue | Advanced fingerprinting |
| Vendors | Health and cost per vendor | Scorecards, fallback routing | — |
| Rules content | Rule catalogue, Country Pack matrix, four-eyes publish, sanctions ingestion monitor | Regulatory watch inbox, impact preview | — |
| AI ops | Usage and cost | Quality and override metrics, Art. 76(5)/AI Act evidence | — |
| Support | Ticket inbox, consented access, help centre | SLAs by plan, CSAT/NPS, AI-drafted replies | — |
| Feature requests | In-app capture + list | Dedupe, scoring, roadmap, changelog notifications | Public board |
| Expert services | Contracts list | Work queue, time tracking | — |

---

## 25. Technical notes

- Separate Next.js admin app on its own domain; same Supabase project with **dedicated admin schema and service role used only server-side**; customer AML tables are not readable by admin roles (enforced by row-level security and separate database roles, plus tests that prove it).
- **Analytics: PostHog EU Cloud** for both the website and the product (funnels, sign-up and top-up conversion, adoption, cohorts). Identify users only after login; replay off on check-result screens (§8.3). If only website stats are needed, Plausible or Vercel Web Analytics are simpler and cookie-free.
- Security telemetry from Cloudflare (WAF, bot, Turnstile) and Supabase auth logs into one log store with 12-month retention.
- **Error tracking: Sentry, EU data region**, `sendDefaultPii: false`, a `beforeSend` filter that strips request bodies (names, dates of birth and any other client data), events kept 30–90 days.
- **Sub-processors:** PostHog, Sentry and HubSpot are listed in the customer DPA alongside hosting, ID, screening, registry, eID, payment, email and AI vendors.
- All admin writes go through an API layer that writes the admin audit log in the same transaction.
- Infrastructure-as-code and the same CI checks as the customer app.

---

## 26. Sources

- [Pigment — safe user impersonation](https://engineering.pigment.com/2026/04/08/safe-user-impersonation/)
- [ChartMogul — SaaS metrics library](https://chartmogul.com/saas-metrics/cheat-sheet/)
- [Cloudflare — bot use cases](https://developers.cloudflare.com/use-cases/application-security/bots/)
- [Matomo — privacy regulation changes 2026](https://matomo.org/blog/2026/01/privacy-regulations-changes-2026-analytics/)
- [ClearAML on Capterra](https://www.capterra.com/p/10045616/ClearAML/) · [Source by First AML](https://www.firstaml.com/nz/lp/aml-kyc-software-solution)
- AMLR (EU) 2024/1624 Art. 18, 73, 76 — via [Springlex](https://www.springlex.eu/en/packages/aml/amlr-regulation/)
