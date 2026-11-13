-- AlterTable
ALTER TABLE "CddFile" ADD COLUMN     "remediation" JSONB,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'new';

