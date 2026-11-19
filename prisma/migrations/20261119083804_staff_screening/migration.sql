-- CreateTable
CREATE TABLE "StaffScreening" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "listsChecked" INTEGER NOT NULL,
    "matches" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reviewNote" TEXT,
    "reviewedById" UUID,
    "screenedById" UUID,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffScreening_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffScreening_firmId_userId_idx" ON "StaffScreening"("firmId", "userId");

