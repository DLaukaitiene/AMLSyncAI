-- When a suspicion was formed (decision to report) is recorded once and cannot be changed.
ALTER TABLE "Case" ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "suspicionFormedAt" TIMESTAMP(3);

CREATE OR REPLACE FUNCTION case_lock_suspicion_time() RETURNS trigger AS $$
BEGIN
  IF OLD."suspicionFormedAt" IS NOT NULL AND NEW."suspicionFormedAt" IS DISTINCT FROM OLD."suspicionFormedAt" THEN
    RAISE EXCEPTION 'suspicionFormedAt is locked once recorded';
  END IF;
  IF OLD."decidedAt" IS NOT NULL AND NEW."decidedAt" IS DISTINCT FROM OLD."decidedAt" THEN
    RAISE EXCEPTION 'decidedAt is locked once recorded';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS case_lock_suspicion_time ON "Case";
CREATE TRIGGER case_lock_suspicion_time BEFORE UPDATE ON "Case"
  FOR EACH ROW EXECUTE FUNCTION case_lock_suspicion_time();
