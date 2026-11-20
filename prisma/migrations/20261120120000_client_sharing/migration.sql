-- AlterTable
ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "shareCode" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "ClientShare" (
    "id" UUID NOT NULL,
    "fromFirmId" UUID NOT NULL,
    "toFirmId" UUID NOT NULL,
    "sourceFileId" UUID NOT NULL,
    "clientName" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "legalBasis" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "packageEnc" BYTEA NOT NULL,
    "documents" JSONB NOT NULL,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" UUID,
    "importedFileId" UUID,

    CONSTRAINT "ClientShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientShare_toFirmId_status_idx" ON "ClientShare"("toFirmId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ClientShare_fromFirmId_idx" ON "ClientShare"("fromFirmId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Firm_shareCode_key" ON "Firm"("shareCode");

