-- AlterTable (idempotent: the Backoffice migration may already have added "status")
ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "archiveUntil" TEXT,
ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
