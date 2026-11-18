-- AlterTable
-- "status" is added by 20261118190000_firm_archive (one column, shared by the archive and the Backoffice).
ALTER TABLE "Firm" ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT;

-- CreateTable
CREATE TABLE "AdminMember" (
    "email" TEXT NOT NULL,
    "roles" TEXT[],
    "addedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "AdminMember_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "AdminAuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "reason" TEXT,
    "details" JSONB,
    "approverEmail" TEXT,
    "prevHash" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminApproval" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "result" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmAdminMeta" (
    "firmId" UUID NOT NULL,
    "tags" TEXT[],
    "accountManager" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FirmAdminMeta_pkey" PRIMARY KEY ("firmId")
);

-- CreateTable
CREATE TABLE "FirmNote" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmKyb" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "registryRef" TEXT,
    "directors" TEXT[],
    "beneficialOwners" TEXT[],
    "russiaBelarus" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "matches" JSONB NOT NULL,
    "decision" TEXT,
    "decisionNote" TEXT,
    "checkedBy" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmKyb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "personalData" BOOLEAN NOT NULL DEFAULT false,
    "controllerData" BOOLEAN NOT NULL DEFAULT false,
    "systems" TEXT[],
    "firmIds" TEXT[],
    "summary" TEXT NOT NULL,
    "rootCause" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "firmsNotifiedAt" TIMESTAMP(3),
    "dpaNotifiedAt" TIMESTAMP(3),
    "dpaNotRequiredReason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentUpdate" (
    "id" UUID NOT NULL,
    "incidentId" UUID NOT NULL,
    "authorEmail" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSubjectRequest" (
    "id" UUID NOT NULL,
    "receivedOn" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "firmId" UUID,
    "status" TEXT NOT NULL DEFAULT 'received',
    "dueOn" TEXT NOT NULL,
    "extended" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataSubjectRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminAuditEvent_hash_key" ON "AdminAuditEvent"("hash");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_targetType_targetId_idx" ON "AdminAuditEvent"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AdminAuditEvent_adminEmail_at_idx" ON "AdminAuditEvent"("adminEmail", "at");

-- CreateIndex
CREATE INDEX "AdminApproval_status_createdAt_idx" ON "AdminApproval"("status", "createdAt");

-- CreateIndex
CREATE INDEX "FirmNote_firmId_createdAt_idx" ON "FirmNote"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX "FirmKyb_firmId_checkedAt_idx" ON "FirmKyb"("firmId", "checkedAt");

-- CreateIndex
CREATE INDEX "IncidentUpdate_incidentId_idx" ON "IncidentUpdate"("incidentId");

-- AddForeignKey
ALTER TABLE "IncidentUpdate" ADD CONSTRAINT "IncidentUpdate_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

