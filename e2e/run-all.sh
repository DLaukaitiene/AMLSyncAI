#!/usr/bin/env bash
# Runs every browser e2e suite against a running server (EMAIL_TRANSPORT=dev, SCAN_MODE=basic)
# with a clean database. Needs DATABASE_URL (owner) and the TEST sanctions list loaded:
#   npx tsx scripts/load-list.mts amlsync e2e/fixtures/test-sanctions.csv "TEST sanctions list" 2026-11-13
set -euo pipefail
cd "$(dirname "$0")/.."
reset() { psql -q "$DATABASE_URL" -c 'TRUNCATE "Firm","User","Session","EmailToken","DevEmail","RateLimitBucket","SecurityEvent","Invitation","FeatureRequest","SupportGrant" CASCADE' >/dev/null 2>&1; }
LOG=$(mktemp)
exec > >(tee "$LOG") 2>&1
code() { npx tsx scripts/create-signup-code.mts 1 1 e2e; }
for suite in auth portal cases firm governance backbook monitoring; do
  reset; echo "== $suite"; CODE=$(code) node "e2e/$suite-flow.cjs" | grep -E "✘|errors" || true
done
reset; echo "== cdd"; CODE1=$(code) CODE2=$(code) node e2e/cdd-flow.cjs | grep -E "✘|errors" || true
reset; echo "== feedback (needs PLATFORM_ADMIN_EMAILS=triage@amlsyncai-team.lt)"; CODE1=$(code) CODE2=$(code) CODE3=$(code) node e2e/feedback-flow.cjs | grep -E "✘|errors" || true
reset; echo "== extras"; CODE1=$(code) CODE2=$(code) node e2e/extras-flow.cjs | grep -E "✘|errors" || true
reset; echo "== isolation + accessibility"; CODE1=$(code) CODE2=$(code) node e2e/isolation-a11y.cjs | grep -E "✘|✔|a11y" || true
reset; echo "== support access"; CODE1=$(code) CODE2=$(code) node e2e/support-flow.cjs | grep -E "✘|errors" || true

# Fail when any suite reported a failed check.
sleep 1
if grep -q "✘" "$LOG"; then echo "E2E FAILED"; exit 1; fi
echo "E2E PASSED"
