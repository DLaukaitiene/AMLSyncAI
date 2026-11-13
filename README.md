# AMLSyncAI

AML compliance software for EU obliged entities under the AML Regulation (EU) 2024/1624 (AMLR): accountants, real estate agents, high-value goods traders and other non-financial businesses.

The product specification is in [`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md). Section numbers in code comments (for example `§11.6`) refer to it.

## Status

Work in progress. Built so far:

- **EU Core rules engine** (`src/lib/rules`). Pure, tested TypeScript covering the Country Profile and its EU Core floor, beneficial ownership calculation, sanctions > 50% ownership aggregation, CDD triggers and linked transactions, the cash cap, Art. 74 threshold reports, client risk scoring (SDD/EDD), hard gates for clients and matters, and every Compliance Calendar clock (with working days and holidays).
- **Security rules** (`src/lib/security`). Company-email verification at sign-up and the personal-data scan for feature requests.
- **Data model** (`prisma/schema.prisma`). The core data model from spec §8A. `prisma/rls.sql` adds row-level tenant isolation and makes audit events and approvals append-only.
- **Web app shell** (Next.js 15, Tailwind). Strict nonce-based CSP and security headers, plus an interactive beneficial-ownership calculator at `/tools/beneficial-ownership`.

## Development

Requires Node 22 and PostgreSQL 16.

```bash
npm install
cp .env.example .env          # set DATABASE_URL
npx prisma migrate dev        # create tables
psql "$DATABASE_URL" -f prisma/rls.sql   # tenant isolation + append-only audit
npm run dev
```

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest). These include the §11 done-criteria tests for the rules engine |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

Superusers bypass row-level security. Run the app as a normal role and set the tenant per transaction with `SET LOCAL app.firm_id = '<firm uuid>'`.

## Layout

```
docs/PRODUCT_SPEC.md        product specification
prisma/schema.prisma        core data model (§8A)
prisma/rls.sql              tenant isolation and immutability (§8C.7, §11.0)
src/lib/rules/              EU Core rules engine (§3, §3A, §4)
src/lib/security/           sign-up verification, PII scan (§8C, §4.10)
src/middleware.ts           Content-Security-Policy (§8C.8)
src/app/                    Next.js app
```
