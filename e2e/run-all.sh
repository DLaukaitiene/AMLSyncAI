#!/usr/bin/env bash
# Runs every browser e2e suite against a running server (EMAIL_TRANSPORT=dev, SCAN_MODE=basic)
# with a clean database. Needs DATABASE_URL (owner) and the TEST sanctions list loaded:
#   npx tsx scripts/load-list.mts amlsync e2e/fixtures/test-sanctions.csv "TEST sanctions list" 2026-11-13
set -euo pipefail
cd "$(dirname "$0")/.."
reset() { psql -q "$DATABASE_URL" -c 'TRUNCATE "Firm","User","Session","EmailToken","DevEmail","RateLimitBucket","SecurityEvent","Invitation" CASCADE' >/dev/null 2>&1; }
code() { npx tsx scripts/create-signup-code.mts 1 1 e2e; }
for suite in auth portal cases firm governance backbook monitoring; do
  reset; echo "== $suite"; CODE=$(code) node "e2e/$suite-flow.cjs" | grep -E "✘|errors" || true
done
reset; echo "== cdd"; CODE1=$(code) CODE2=$(code) node e2e/cdd-flow.cjs | grep -E "✘|errors" || true
