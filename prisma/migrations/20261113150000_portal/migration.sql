-- CreateEnum
CREATE TYPE "PortalStatus" AS ENUM ('SENT', 'OPENED', 'SUBMITTED', 'REVOKED');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "fileName" TEXT NOT NULL DEFAULT 'file',
ADD COLUMN     "uploadedBy" TEXT NOT NULL DEFAULT 'staff';

-- CreateTable
CREATE TABLE "PortalLink" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "cddFileId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "status" "PortalStatus" NOT NULL DEFAULT 'SENT',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "sessionHash" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submission" JSONB,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalLink_tokenHash_key" ON "PortalLink"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalLink_firmId_idx" ON "PortalLink"("firmId");

-- CreateIndex
CREATE INDEX "PortalLink_cddFileId_idx" ON "PortalLink"("cddFileId");

