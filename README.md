# AMLSyncAI

AML compliance software for EU obliged entities under the AML Regulation (EU) 2024/1624 (AMLR): accountants, real estate agents, high-value goods traders and other non-financial businesses.

The product specification is in [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md). Section numbers in code comments (for example `§11.6`) refer to it.

## Status

Work in progress on branch `feat/foundation`. A web-based SaaS (browser; the client portal is a mobile-friendly web page). Built so far, all V1 modules of the spec at least in a first version:

- **Sign-up and access** (§8C): company-email sign-up with sign-up codes, mandatory two-factor, invitation-only users, step-up re-authentication, sessions list, two-factor reset by a colleague or 72-hour self-recovery, lockout, rate limits, bot honeypot, security log, `security.txt`.
- **Country Profile** (§3A) for the home state and for offices in other member states; the EU Core floor is enforced.
- **Clients and CDD** (§4.2–4.4): data set, identity / register records, ownership tree and beneficial owners, screening of the whole structure, risk scoring, EDD/PEP approvals, Russia/Belarus rule pack, hard gates, accept / refuse / terminate, explanation letter (Art. 76(5)).
- **Client portal** (§4A.1): secure links with one-time codes, questionnaire, uploads, signature, reminders, periodic "nothing changed" refresh.
- **Matters** with multi-party CDD, transactions, linked-transaction and cash rules, threshold reports, per-matter monitoring.
- **Suspicion reporting** (§4.6): internal reports, CO decisions, STR drafts and export, transaction hold, FIU requests, discrepancies, sanctions notices.
- **Firm level**: risk assessment, Policy Builder, governance and annual report, training, integrity declarations, whistleblowing, outsourcing register, privacy notice and DPIA.
- **Records**: supervisor files (client and firm, PDF + ZIP), 5-year deletion with legal hold; the audit log holds no identifiable data.
- **Back-book remediation**, **feature requests** with AMLSyncAI triage, **AI drafting** (STR narrative, policy sections; off by default).

- **Backoffice** (`/admin`, spec in [`docs/BACKOFFICE_SPEC.md`](docs/BACKOFFICE_SPEC.md)): see below.

Not yet connected (need vendor decisions): eID broker, NFC/liveness vendor, BRIS / KYB registry lookups, PEP data provider, ClamAV, SMTP provider, object storage, EU AI provider.

## Backoffice (AMLSync admin)

Internal admin at `/admin` for running the business. Rule one: **AMLSync sees the business, not the customers' AML files.** Backoffice code only counts or groups tenant tables that hold client data, never touches cases, STRs or whistleblowing reports (`src/lib/backoffice/str-wall.test.ts` fails the build otherwise), and the only look inside a firm is the consented, time-limited support view.

| Area | What is built |
|---|---|
| Today | Alerts with owners, firms, MRR, paid checks, overdue invoices, sign-in failures, bot blocks, MFA adoption, 7-day sign-up funnel, at-risk firms, new feature requests, sanctions list freshness |
| Firms | Search, filters, saved views, CSV export (purpose logged; four-eyes above 500 rows); Firm 360 with overview, health score with reasons, AMLSync's own KYB (firm, directors, BOs screened against official lists; confirmed hit suspends), users, usage, compliance health counts, billing and credits, support grants, feature requests, timeline, admin actions; status (active / paused / suspended blocks new checks and screenings, read access stays), trial changes, tags, account manager, internal notes, closure (four-eyes) |
| Users | Global search; sign-in history, sessions, risk signals; lock, unlock, revoke sessions (logged in the firm's security log) |
| Revenue | MRR / ARR, usage revenue, ARPA, invoiced vs cash, receivables, EU cross-border B2C VAT threshold monitor (€10,000, alert at 80 %) |
| Security | Sign-in events, failures by IP, password-spraying detection, lockouts, MFA adoption, sessions, exports; incident and breach register with 24 h firm / 72 h DPA clocks |
| Bots & abuse | Bot / challenge / rate-limit blocks, fake sign-up ratio, screening limits hit, check-misuse rules (spike > 5× median, burst after sign-up, checks without onboarding) |
| Vendors & AI | Didit status mix, webhook and media errors, email failures, list freshness, AI calls and tokens per purpose |
| Rules content | EU Core catalogue with provisional parameters, Country Profile coverage per member state, sanctions list ingestion |
| Privacy | Data subject request register (controller vs processor, 1-month deadline, extension), retention table, sub-processors |
| Admin team, approvals, log | Nine narrow roles (§4.1), four-eyes approvals, quarterly access review, append-only hash-chained admin log with chain check |

Access: admins sign in to the normal app (password + mandatory two-factor, 15-minute idle timeout); every write needs a fresh step-up. Emails in `PLATFORM_ADMIN_EMAILS` are Owners; other admins and roles are managed under **Admin team** (each change needs an Owner's approval). With a single Owner, that Owner may confirm their own four-eyes request after a 15-minute cooling-off (labelled "self-approved" in the log); add a second Owner for real four-eyes control. Non-admins get a 404 on every `/admin` page.

Not built yet (need an integration or a decision): website visitor analytics, leads and CRM (PostHog / HubSpot), Cloudflare WAF and bot scores, Stripe, support tickets, communications, Expert-service queue, VIES checks, vendor cost reconciliation, separate admin domain behind zero-trust access.

## Development

Requires Node 22 and PostgreSQL 16.

```bash
npm install
cp .env.example .env                      # fill in DATABASE_URL, DATABASE_APP_URL, MASTER_KEY
npx prisma migrate deploy
psql "$DATABASE_URL" -f prisma/rls.sql    # tenant isolation + append-only audit
npx tsx scripts/create-signup-code.mts    # prints a sign-up code
npm run dev
```

The app's tenant connection (`DATABASE_APP_URL`) must be a non-superuser role with table privileges, so that row-level security applies.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` / `npm run lint` / `npm run build` | Checks and production build |
| `./e2e/run-all.sh` | Every browser end-to-end suite against a running server (see the script header for the environment it needs) |

## Layout

```
docs/PRODUCT_SPEC.md        product specification
docs/BACKOFFICE_SPEC.md     Backoffice (admin) specification
prisma/schema.prisma        core data model (§8A)
prisma/rls.sql              tenant isolation and immutability (§8C.7, §11.0)
src/lib/rules/              EU Core rules engine (§3, §3A, §4)
src/lib/security/           sign-up verification, PII scan (§8C, §4.10)
src/lib/screening/          name matching and list import (§4.4)
src/lib/server/             database, auth, sessions, CDD service, retention
src/lib/backoffice/         Backoffice roles, four-eyes, hash chain, health score, misuse rules
src/lib/server/backoffice/  Backoffice access, admin log, approvals, count-only metrics, firm KYB
src/app/admin/              Backoffice pages
scripts/                    sign-up codes, official list loading
e2e/                        browser end-to-end tests
src/middleware.ts           Content-Security-Policy (§8C.8)
src/app/                    Next.js app
```
