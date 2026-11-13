-- CreateTable
CREATE TABLE "SupportGrant" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "hours" INTEGER NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'read-only-summary',
    "status" TEXT NOT NULL DEFAULT 'requested',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportGrant_firmId_idx" ON "SupportGrant"("firmId");

