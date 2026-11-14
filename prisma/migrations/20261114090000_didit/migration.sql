-- AlterEnum
ALTER TYPE "VerificationMethod" ADD VALUE 'DOCUMENT_LIVENESS';

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "autoClearBelow" INTEGER;

-- AlterTable
ALTER TABLE "IdentityVerification" ADD COLUMN     "details" JSONB;

-- CreateTable
CREATE TABLE "DiditSession" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "cddFileId" UUID,
    "kind" TEXT NOT NULL,
    "diditSessionId" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Not Started',
    "sandbox" BOOLEAN NOT NULL DEFAULT true,
    "creditEntryId" UUID,
    "createdVia" TEXT NOT NULL,
    "createdById" UUID,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiditSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "clientRef" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiditSession_diditSessionId_key" ON "DiditSession"("diditSessionId");

-- CreateIndex
CREATE INDEX "DiditSession_firmId_idx" ON "DiditSession"("firmId");

-- CreateIndex
CREATE INDEX "DiditSession_partyId_idx" ON "DiditSession"("partyId");

-- CreateIndex
CREATE INDEX "CreditEntry_firmId_createdAt_idx" ON "CreditEntry"("firmId", "createdAt");

