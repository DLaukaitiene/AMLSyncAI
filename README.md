# AMLSyncAI

AML compliance software for EU obliged entities under the AML Regulation (EU) 2024/1624 (AMLR): accountants, real estate agents, high-value goods traders and other non-financial businesses.

The product specification is in [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md). Section numbers in code comments (for example `§11.6`) refer to it.

## Status

Work in progress — a web-based SaaS (runs in the browser; client portal will be mobile-friendly web). Built so far:

- **Sign-up and login** (§8C): company-email sign-up with confirmation link, sign-up codes (`SIGNUP_MODE=invite`), mandatory two-factor (authenticator app + recovery codes), step-up re-authentication, invitation-only users, password reset, lockout, rate limits, new-device alerts.
- **Country Profile** editor: versioned, Compliance Officer only, rejects anything that relaxes the EU rules; setup checklist on the dashboard.
- **Clients (CDD)**: people and companies, identity verification and register-extract records, ownership tree with automatic beneficial-owner calculation, senior-managing-official fallback, screening of the whole structure with match review, automatic risk scoring (EDD/SDD), EDD checklist, senior-management and PEP approvals, hard gates, accept / refuse / terminate.
- **Matters**: multiple parties with roles (buyer + seller, customer + supplier), transactions with CDD triggers, linked transactions, cash cap, Art. 74 threshold report drafts, completion and funds-transfer gates.
- **Compliance Calendar**, **Screening lists** (firm CSV upload; official lists via `scripts/load-list.mts`; daily re-screen at `POST /api/cron/rescreen`), **Team**, **Security log**, **Records** (5-year deletion, legal hold; the audit log keeps no identifiable data).
- **Rules engine** (`src/lib/rules`) and **security rules** (`src/lib/security`) with unit tests mapped to §11.

Not yet built: client self-service portal and eID/NFC vendors, BRIS/KYB registry lookups, PEP data provider, suspicion-report case management and FIU export, firm risk assessment, Policy Builder, training/integrity/whistleblowing, supervisor-file export, feature requests, AI drafting.

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
| `CODE=… node e2e/auth-flow.cjs` | Browser test: sign-up, MFA, Country Profile, invitations, login |
| `CODE1=… CODE2=… DATABASE_URL=… node e2e/cdd-flow.cjs` | Browser test: CDD, ownership, screening, EDD/PEP, refusal, retention deletion, matters (load `e2e/fixtures/test-sanctions.csv` first) |

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
