-- AlterTable
ALTER TABLE "Firm" ADD COLUMN IF NOT EXISTS "txCashLegalLimitEUR" INTEGER NOT NULL DEFAULT 5000,
ADD COLUMN IF NOT EXISTS "txCashLimitCheckedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "txRulesOff" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN IF NOT EXISTS "counterpartyName" TEXT,
ADD COLUMN IF NOT EXISTS "direction" TEXT,
ADD COLUMN IF NOT EXISTS "externalId" TEXT,
ADD COLUMN IF NOT EXISTS "importBatchId" UUID;

-- CreateTable
CREATE TABLE IF NOT EXISTS "TxImportBatch" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "rows" JSONB NOT NULL,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "duplicates" INTEGER NOT NULL DEFAULT 0,
    "rejected" INTEGER NOT NULL DEFAULT 0,
    "flagged" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3),
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "TxImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "HighRiskCountry" (
    "code" CHAR(2) NOT NULL,
    "list" TEXT NOT NULL DEFAULT 'EU high-risk third country',
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HighRiskCountry_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TxImportBatch_firmId_createdAt_idx" ON "TxImportBatch"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_firmId_externalId_idx" ON "Transaction"("firmId", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Transaction_importBatchId_idx" ON "Transaction"("importBatchId");


-- Seed: EU high-risk third countries (list in force from 29 Jan 2026: Delegated Regulations (EU) 2026/46 and 2026/83, src/lib/rules/high-risk-countries.ts)
INSERT INTO "HighRiskCountry" ("code") VALUES ('AF'), ('DZ'), ('AO'), ('BO'), ('CM'), ('CD'), ('CI'), ('HT'), ('IR'), ('KE'), ('KP'), ('LA'), ('LB'), ('MC'), ('MM'), ('NA'), ('NP'), ('SS'), ('SY'), ('TT'), ('RU'), ('VE'), ('VG'), ('VN'), ('VU'), ('YE') ON CONFLICT ("code") DO NOTHING;
