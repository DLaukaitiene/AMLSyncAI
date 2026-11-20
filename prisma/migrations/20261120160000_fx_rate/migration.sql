-- CreateTable
CREATE TABLE IF NOT EXISTS "FxRate" (
    "date" TEXT NOT NULL,
    "usdPerEur" DECIMAL(10,4) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("date")
);

