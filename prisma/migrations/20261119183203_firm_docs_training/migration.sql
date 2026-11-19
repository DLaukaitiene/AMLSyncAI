-- AlterTable
ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "responsibilities" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE IF NOT EXISTS "ExternalTraining" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "type" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "attendeeIds" UUID[],
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalTraining_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExternalTraining_firmId_idx" ON "ExternalTraining"("firmId");

