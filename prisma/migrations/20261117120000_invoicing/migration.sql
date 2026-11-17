-- AlterTable
ALTER TABLE "CreditEntry" ADD COLUMN     "invoiceId" UUID;

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "billingAddress" TEXT,
ADD COLUMN     "billingCompanyCode" TEXT,
ADD COLUMN     "billingCountry" CHAR(2),
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "monthlyFeeCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "spendLimitCents" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "vatId" TEXT;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "issuedOn" TEXT NOT NULL,
    "dueOn" TEXT NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatRateBp" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "vatNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'issued',
    "paidOn" TEXT,
    "paymentRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_seq_key" ON "Invoice"("seq");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE INDEX "Invoice_firmId_idx" ON "Invoice"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_firmId_period_key" ON "Invoice"("firmId", "period");

-- CreateIndex
CREATE INDEX "CreditEntry_firmId_invoiceId_idx" ON "CreditEntry"("firmId", "invoiceId");

