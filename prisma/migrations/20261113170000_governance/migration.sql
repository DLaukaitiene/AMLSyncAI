-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "function" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingModule" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAssignment" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "moduleId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueOn" DATE NOT NULL,
    "completedAt" TIMESTAMP(3),
    "attestation" TEXT,

    CONSTRAINT "TrainingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrityDeclaration" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "conflicts" TEXT,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrityDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhistleblowingReport" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "contentEnc" BYTEA NOT NULL,
    "reporterId" UUID,
    "status" TEXT NOT NULL DEFAULT 'received',
    "acknowledgedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhistleblowingReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutsourcingArrangement" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "tasks" TEXT NOT NULL,
    "agreementSignedOn" DATE,
    "supervisorNotifiedOn" DATE,
    "startOn" DATE,
    "endOn" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutsourcingArrangement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Appointment_firmId_idx" ON "Appointment"("firmId");

-- CreateIndex
CREATE INDEX "TrainingModule_firmId_idx" ON "TrainingModule"("firmId");

-- CreateIndex
CREATE INDEX "TrainingAssignment_firmId_idx" ON "TrainingAssignment"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingAssignment_moduleId_userId_dueOn_key" ON "TrainingAssignment"("moduleId", "userId", "dueOn");

-- CreateIndex
CREATE INDEX "IntegrityDeclaration_firmId_idx" ON "IntegrityDeclaration"("firmId");

-- CreateIndex
CREATE INDEX "WhistleblowingReport_firmId_idx" ON "WhistleblowingReport"("firmId");

-- CreateIndex
CREATE INDEX "OutsourcingArrangement_firmId_idx" ON "OutsourcingArrangement"("firmId");

-- AddForeignKey
ALTER TABLE "TrainingAssignment" ADD CONSTRAINT "TrainingAssignment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "TrainingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

