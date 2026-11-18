-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "archiveUntil" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active';

