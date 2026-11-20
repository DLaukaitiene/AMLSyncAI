#!/usr/bin/env bash
# Test databases only: an exchange rate for computing prices (the rule's worked-example rate, EUR_PER_USD = 0.86).
# Production fetches the ECB rate itself and never uses this.
psql -q "$DATABASE_URL" -c "INSERT INTO \"FxRate\" (date, \"usdPerEur\", \"fetchedAt\") VALUES ('2026-11-20', 1.1628, now()) ON CONFLICT (date) DO NOTHING"
