#!/usr/bin/env bash
# Vercel build: migrate the database (session pooler), apply row-level security, build the app.
set -euo pipefail
npx prisma generate
if [ -n "${MIGRATE_DATABASE_URL:-}" ]; then
  DATABASE_URL="$MIGRATE_DATABASE_URL" npx prisma migrate deploy
  npx prisma db execute --url "$MIGRATE_DATABASE_URL" --file prisma/rls.sql
  npx prisma db execute --url "$MIGRATE_DATABASE_URL" --file prisma/supabase-grants.sql
fi
npx next build
