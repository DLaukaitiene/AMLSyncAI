#!/usr/bin/env bash
# Vercel build: migrate the database (session pooler), apply row-level security, build the app.
set -euo pipefail
npx prisma generate
# Only production builds change the database. Preview builds (other branches) share it
# and must never run their migrations against it.
if [ -n "${MIGRATE_DATABASE_URL:-}" ] && [ "${VERCEL_ENV:-}" = "production" ]; then
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
  npx prisma db execute --url "$MIGRATE_DATABASE_URL" --file prisma/rls.sql
  npx prisma db execute --url "$MIGRATE_DATABASE_URL" --file prisma/supabase-grants.sql
fi
npx next build
