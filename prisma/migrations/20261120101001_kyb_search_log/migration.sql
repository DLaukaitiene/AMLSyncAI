-- CreateTable
CREATE TABLE IF NOT EXISTS "KybSearch" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "country" CHAR(2) NOT NULL,
    "query" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KybSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "KybSearch_firmId_at_idx" ON "KybSearch"("firmId", "at");

