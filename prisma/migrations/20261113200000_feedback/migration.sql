-- CreateTable
CREATE TABLE "FeatureComment" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "fromTeam" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureStatusChange" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "status" "FeatureRequestStatus" NOT NULL,
    "note" TEXT,
    "byEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureStatusChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeatureComment_requestId_idx" ON "FeatureComment"("requestId");

-- CreateIndex
CREATE INDEX "FeatureStatusChange_requestId_idx" ON "FeatureStatusChange"("requestId");

-- CreateIndex
CREATE INDEX "FeatureRequest_userId_createdAt_idx" ON "FeatureRequest"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "FeatureComment" ADD CONSTRAINT "FeatureComment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureStatusChange" ADD CONSTRAINT "FeatureStatusChange_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeatureRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

