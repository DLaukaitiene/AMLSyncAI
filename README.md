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

Internal admin at **https://app.amlsync.com/adminpage1&** (`amlsync.com/adminpage1&` redirects there; `website/public_html/.htaccess`). Spec: [`docs/BACKOFFICE_SPEC.md`](docs/BACKOFFICE_SPEC.md).

**Access.** Only `deimena@amlsync.com` can open it: the normal AMLSync App sign-in with password and two-factor, plus the authenticator code again after one hour in the Backoffice and before every change (step-up). Production ignores any other setting (`VERCEL_ENV=production`); tests set `BACKOFFICE_OWNER_EMAIL`, and `BACKOFFICE_TEAM=on` (never in production) enables the Admin team page and further roles. Everyone else gets a 404; anonymous visitors are sent to sign-in and come back after two-factor.

**Rule one: AMLSync sees the business, not the customers' AML files.** Backoffice code only counts or groups tenant tables that hold client data and never touches cases, STRs or whistleblowing reports (`src/lib/backoffice/str-wall.test.ts` fails the build otherwise). The only look inside a firm is the consented, time-limited support view.

| Area | What is built |
|---|---|
| Today | Alerts with owners (incidents, KYB matches, tickets past SLA, new leads and follow-ups, overdue invoices, misuse, stale lists, data requests), firms, MRR, paid checks, security, funnel from website visitors to first accepted client |
| Firms | List, filters, saved views, CSV export (purpose logged; four-eyes above 500 rows); Firm 360: health score, AMLSync's own KYB against official lists, VIES check of the VAT ID, users, usage and compliance counts, billing and credits, tickets and support access, timeline, admin actions; pause / suspend (blocks new checks, banner in the app), trial, tags, notes, close (four-eyes; read-only archive like a firm's own cancellation) |
| Users | Search, sign-in history, sessions, risk signals; lock, unlock, sign out everywhere |
| Website | Cookieless, first-party audience measurement for amlsync.com and the app's public pages: visitors, pages, channels incl. AI assistants, referrers, UTM campaigns, countries, devices, contact form and app clicks, bots. No cookies, no stored IP (daily-rotating visitor code), Do Not Track respected; privacy policy updated |
| Leads | Own light CRM: website contact form copies (alongside Web3Forms), unfinished sign-ups, manual leads; score with reasons, stages, owner, next steps, notes, linked website visit, auto trial/customer when the firm signs up; erase on request |
| Tickets | Firms raise requests under Help & support in the app (scanned for client data); P1/P2/P3 first-response targets, email notifications both ways, SLA and CSAT figures |
| Messages | In-app banners and service emails to segments (country, plan, status, sector); email to all firms needs approval |
| Expert | Art. 18 engagements, task queue, time logging, billable value |
| Revenue, billing ops | MRR / ARR, usage revenue, receivables, EU B2C VAT threshold; invoices, terms, credits |
| Security | Sign-in events, spraying detection, lockouts, MFA adoption; incident and breach register with 24 h / 72 h clocks; public status page at `/status` for incidents marked public |
| Bots & abuse, Vendors & AI | Bot and rate-limit blocks, check-misuse rules; Didit status mix, unit costs, margin per month and reconciliation against Didit invoices, email failures, list freshness, AI usage |
| Rules content, Privacy | EU Core catalogue, Country Profile coverage, list ingestion; data subject requests, retention, sub-processors |
| Approvals, Admin log | Four-eyes requests (single owner: self-approval after 15 minutes, labelled), append-only hash-chained admin log with chain check |

Not built (needs a paid service or a decision): Cloudflare WAF / bot scores, Stripe, PostHog session replay, Google sign-in for the Backoffice.

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
