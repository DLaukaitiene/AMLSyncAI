-- AlterTable
ALTER TABLE "CddFile" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" UUID,
ADD COLUMN     "decisionReason" TEXT,
ADD COLUMN     "eddChecklist" JSONB,
ADD COLUMN     "smoFallback" JSONB;

-- CreateTable
CREATE TABLE "ScreeningList" (
    "id" UUID NOT NULL,
    "firmId" UUID,
    "kind" "ScreeningListKind" NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "loadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScreeningList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningEntry" (
    "id" UUID NOT NULL,
    "listId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "names" TEXT[],
    "normalized" TEXT[],
    "birthDates" TEXT[],
    "countries" TEXT[],
    "reference" TEXT,
    "details" JSONB,

    CONSTRAINT "ScreeningEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScreeningList_firmId_idx" ON "ScreeningList"("firmId");

-- CreateIndex
CREATE INDEX "ScreeningEntry_listId_idx" ON "ScreeningEntry"("listId");

-- CreateIndex
CREATE INDEX "ScreeningEntry_normalized_idx" ON "ScreeningEntry" USING GIN ("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "CddFile_partyId_role_key" ON "CddFile"("partyId", "role");

-- AddForeignKey
ALTER TABLE "ScreeningEntry" ADD CONSTRAINT "ScreeningEntry_listId_fkey" FOREIGN KEY ("listId") REFERENCES "ScreeningList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

