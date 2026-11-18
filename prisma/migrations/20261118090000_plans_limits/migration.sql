-- AlterTable
ALTER TABLE "Firm" DROP COLUMN "monthlyFeeCents",
ADD COLUMN     "customFeeCents" INTEGER,
ADD COLUMN     "screenLimitDay" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "screenLimitMinute" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "screenLimitMonth" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "trialEndsOn" TEXT;

-- CreateTable
CREATE TABLE "ScreeningEvent" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScreeningEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreeningEvent_firmId_createdAt_idx" ON "ScreeningEvent"("firmId", "createdAt");

