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

Not yet connected (need vendor decisions): eID broker, NFC/liveness vendor, BRIS / KYB registry lookups, PEP data provider, ClamAV, SMTP provider, object storage, EU AI provider.

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
prisma/schema.prisma        core data model (§8A)
prisma/rls.sql              tenant isolation and immutability (§8C.7, §11.0)
src/lib/rules/              EU Core rules engine (§3, §3A, §4)
src/lib/security/           sign-up verification, PII scan (§8C, §4.10)
src/lib/screening/          name matching and list import (§4.4)
src/lib/server/             database, auth, sessions, CDD service, retention
scripts/                    sign-up codes, official list loading
e2e/                        browser end-to-end tests
src/middleware.ts           Content-Security-Policy (§8C.8)
src/app/                    Next.js app
```
