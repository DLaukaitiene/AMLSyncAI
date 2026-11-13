-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'COMPLIANCE_OFFICER', 'STAFF', 'EXTERNAL_REVIEWER', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('ACCOUNTANT', 'ESTATE_AGENT', 'HVG_TRADER', 'PRECIOUS_METALS', 'TCSP', 'LEGAL', 'ART_TRADER', 'GAMBLING', 'CROWDFUNDING', 'CREDIT_INTERMEDIARY', 'INVESTMENT_MIGRATION', 'FOOTBALL', 'OTHER');

-- CreateEnum
CREATE TYPE "PartyKind" AS ENUM ('NATURAL', 'LEGAL', 'ARRANGEMENT');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('CLIENT', 'BUYER', 'SELLER', 'LANDLORD', 'TENANT', 'SUPPLIER', 'REPRESENTATIVE', 'BENEFICIARY');

-- CreateEnum
CREATE TYPE "MatterType" AS ENUM ('ENGAGEMENT', 'PROPERTY_SALE', 'LETTING', 'GOODS_SALE', 'COMPANY_FORMATION', 'TRANSACTION');

-- CreateEnum
CREATE TYPE "MatterStatus" AS ENUM ('OPEN', 'ON_HOLD', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CddStatus" AS ENUM ('OPEN', 'COMPLETE', 'SDD', 'EDD', 'REFUSED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "RiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('EID', 'IN_PERSON', 'DOCUMENT_NFC_LIVENESS');

-- CreateEnum
CREATE TYPE "OwnershipLinkType" AS ENUM ('SHAREHOLDING', 'CONTROL', 'TRUST_SETTLOR', 'TRUSTEE', 'TRUST_PROTECTOR', 'TRUST_BENEFICIARY', 'NOMINEE', 'SENIOR_MANAGING_OFFICIAL');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('REGISTER', 'DECLARATION', 'UPLOADED_EXTRACT');

-- CreateEnum
CREATE TYPE "ScreeningListKind" AS ENUM ('SANCTIONS', 'PEP', 'ADVERSE_MEDIA');

-- CreateEnum
CREATE TYPE "MatchDecision" AS ENUM ('PENDING', 'TRUE_MATCH', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "CaseType" AS ENUM ('INTERNAL_SUSPICION', 'SANCTIONS_HIT', 'DISCREPANCY', 'FIU_REQUEST');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('STR', 'THRESHOLD', 'CASH', 'DISCREPANCY', 'SANCTIONS_NOTICE', 'SUPERVISOR_NOTICE');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'EXPORTED', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'IN_FORCE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "FeatureRequestStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'RELEASED', 'NOT_PLANNED');

-- CreateEnum
CREATE TYPE "SessionStage" AS ENUM ('MFA_SETUP', 'MFA_PENDING', 'ACTIVE');

-- CreateTable
CREATE TABLE "Firm" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "homeState" CHAR(2) NOT NULL,
    "sectors" "Sector"[],
    "size" INTEGER,
    "services" TEXT[],
    "clientTypes" TEXT[],
    "usesCash" BOOLEAN NOT NULL DEFAULT false,
    "crossBorderPct" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Office" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "memberState" CHAR(2) NOT NULL,
    "isHome" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Office_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "Role"[],
    "external" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "mfaEnrolledAt" TIMESTAMP(3),
    "totpSecretEnc" BYTEA,
    "recoveryCodeHashes" TEXT[],
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailDomainVerification" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "firmName" TEXT NOT NULL,
    "emailDomain" TEXT NOT NULL,
    "freeOrDisposable" BOOLEAN NOT NULL,
    "hasMx" BOOLEAN NOT NULL,
    "domainAgeDays" INTEGER,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailDomainVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryProfileVersion" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "officeId" UUID,
    "memberState" CHAR(2) NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "enteredById" UUID NOT NULL,
    "source" TEXT,
    "approvalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CountryProfileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FirmRiskAssessment" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "answers" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "euCoreVersion" TEXT NOT NULL,
    "countryProfileVersion" INTEGER NOT NULL,
    "aiSections" JSONB,
    "approvalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FirmRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "euCoreVersion" TEXT NOT NULL,
    "approvalId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgement" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "policyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Party" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "kind" "PartyKind" NOT NULL,
    "displayName" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "nationalIdEnc" BYTEA,
    "taxIdEnc" BYTEA,
    "bearerShares" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OwnershipLink" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "ownedId" UUID NOT NULL,
    "type" "OwnershipLinkType" NOT NULL,
    "pct" DECIMAL(9,6),
    "controlDescription" TEXT,
    "source" "DataSource" NOT NULL,
    "heldFrom" TIMESTAMP(3),
    "heldUntil" TIMESTAMP(3),

    CONSTRAINT "OwnershipLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Matter" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "officeId" UUID,
    "type" "MatterType" NOT NULL,
    "sector" "Sector" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MatterStatus" NOT NULL DEFAULT 'OPEN',
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatterParty" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "role" "PartyRole" NOT NULL,

    CONSTRAINT "MatterParty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "matterId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "amountEUR" DECIMAL(14,2) NOT NULL,
    "originalAmount" DECIMAL(14,2),
    "originalCurrency" CHAR(3),
    "fxRate" DECIMAL(14,6),
    "method" TEXT NOT NULL,
    "occasional" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CddFile" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "role" "PartyRole" NOT NULL,
    "status" "CddStatus" NOT NULL DEFAULT 'OPEN',
    "purpose" TEXT,
    "nextRefreshOn" DATE,
    "sddVerifyBy" DATE,
    "endedOn" DATE,
    "retentionUntil" DATE,
    "legalHoldUntil" DATE,
    "gateOverride" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CddFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityVerification" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "method" "VerificationMethod" NOT NULL,
    "assuranceLevel" TEXT,
    "provider" TEXT,
    "providerRef" TEXT,
    "fallbackReason" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdentityVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryExtract" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "register" TEXT NOT NULL,
    "source" "DataSource" NOT NULL,
    "data" JSONB NOT NULL,
    "documentId" UUID,
    "retrievedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistryExtract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScreeningResult" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID NOT NULL,
    "listKind" "ScreeningListKind" NOT NULL,
    "listName" TEXT NOT NULL,
    "listVersion" TEXT NOT NULL,
    "matchData" JSONB NOT NULL,
    "decision" "MatchDecision" NOT NULL DEFAULT 'PENDING',
    "reviewerId" UUID,
    "comment" TEXT,
    "screenedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "ScreeningResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientRiskAssessment" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "cddFileId" UUID NOT NULL,
    "calculated" "RiskLevel" NOT NULL,
    "final" "RiskLevel" NOT NULL,
    "score" INTEGER NOT NULL,
    "factors" JSONB NOT NULL,
    "overrideReason" TEXT,
    "overrideById" UUID,
    "rulesetVersion" TEXT NOT NULL,
    "euCoreVersion" TEXT NOT NULL,
    "countryProfileVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "partyId" UUID,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "malwareScan" TEXT NOT NULL DEFAULT 'pending',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "type" "CaseType" NOT NULL,
    "partyIds" UUID[],
    "matterIds" UUID[],
    "contentEnc" BYTEA NOT NULL,
    "decision" TEXT,
    "decisionReasons" TEXT,
    "privilegeApplies" BOOLEAN NOT NULL DEFAULT false,
    "privilegeReason" TEXT,
    "holdStartedOn" DATE,
    "holdEndsOn" DATE,
    "ownerVisible" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "caseId" UUID,
    "matterId" UUID,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "format" TEXT NOT NULL,
    "contentEnc" BYTEA NOT NULL,
    "submissionRef" TEXT,
    "receiptDocumentId" UUID,
    "euCoreVersion" TEXT NOT NULL,
    "countryProfileVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" UUID NOT NULL,
    "dueOn" DATE NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "assigneeId" UUID,
    "article" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" UUID NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "reason" TEXT,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "euCoreVersion" TEXT NOT NULL,
    "countryProfileVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" BIGSERIAL NOT NULL,
    "firmId" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "fields" TEXT[],
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvent" (
    "id" BIGSERIAL NOT NULL,
    "firmId" UUID,
    "userId" UUID,
    "kind" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "details" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureRequest" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "importance" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "regulatory" BOOLEAN NOT NULL DEFAULT false,
    "legalReference" TEXT,
    "status" "FeatureRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "statusReason" TEXT,
    "releaseNoteUrl" TEXT,
    "mergedIntoId" UUID,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureVote" (
    "id" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeatureVote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "stage" "SessionStage" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "mfaAt" TIMESTAMP(3),
    "ip" TEXT,
    "userAgent" TEXT,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailToken" (
    "id" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "firmId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roles" "Role"[],
    "external" BOOLEAN NOT NULL DEFAULT false,
    "invitedById" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignupCode" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "maxUses" INTEGER NOT NULL DEFAULT 1,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignupCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DevEmail" (
    "id" UUID NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevEmail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Firm_emailDomain_key" ON "Firm"("emailDomain");

-- CreateIndex
CREATE INDEX "Office_firmId_idx" ON "Office"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_firmId_idx" ON "User"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailDomainVerification_firmId_key" ON "EmailDomainVerification"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "CountryProfileVersion_approvalId_key" ON "CountryProfileVersion"("approvalId");

-- CreateIndex
CREATE INDEX "CountryProfileVersion_firmId_idx" ON "CountryProfileVersion"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "CountryProfileVersion_firmId_officeId_version_key" ON "CountryProfileVersion"("firmId", "officeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "FirmRiskAssessment_approvalId_key" ON "FirmRiskAssessment"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "FirmRiskAssessment_firmId_version_key" ON "FirmRiskAssessment"("firmId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_approvalId_key" ON "PolicyDocument"("approvalId");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDocument_firmId_kind_version_key" ON "PolicyDocument"("firmId", "kind", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAcknowledgement_policyId_userId_key" ON "PolicyAcknowledgement"("policyId", "userId");

-- CreateIndex
CREATE INDEX "Party_firmId_idx" ON "Party"("firmId");

-- CreateIndex
CREATE INDEX "OwnershipLink_firmId_idx" ON "OwnershipLink"("firmId");

-- CreateIndex
CREATE INDEX "OwnershipLink_ownedId_idx" ON "OwnershipLink"("ownedId");

-- CreateIndex
CREATE INDEX "Matter_firmId_idx" ON "Matter"("firmId");

-- CreateIndex
CREATE INDEX "MatterParty_firmId_idx" ON "MatterParty"("firmId");

-- CreateIndex
CREATE UNIQUE INDEX "MatterParty_matterId_partyId_role_key" ON "MatterParty"("matterId", "partyId", "role");

-- CreateIndex
CREATE INDEX "Transaction_firmId_customerId_date_idx" ON "Transaction"("firmId", "customerId", "date");

-- CreateIndex
CREATE INDEX "CddFile_firmId_idx" ON "CddFile"("firmId");

-- CreateIndex
CREATE INDEX "IdentityVerification_firmId_idx" ON "IdentityVerification"("firmId");

-- CreateIndex
CREATE INDEX "RegistryExtract_firmId_idx" ON "RegistryExtract"("firmId");

-- CreateIndex
CREATE INDEX "ScreeningResult_firmId_partyId_idx" ON "ScreeningResult"("firmId", "partyId");

-- CreateIndex
CREATE INDEX "ClientRiskAssessment_firmId_idx" ON "ClientRiskAssessment"("firmId");

-- CreateIndex
CREATE INDEX "Document_firmId_idx" ON "Document"("firmId");

-- CreateIndex
CREATE INDEX "Case_firmId_idx" ON "Case"("firmId");

-- CreateIndex
CREATE INDEX "Report_firmId_idx" ON "Report"("firmId");

-- CreateIndex
CREATE INDEX "Task_firmId_status_dueOn_idx" ON "Task"("firmId", "status", "dueOn");

-- CreateIndex
CREATE INDEX "Approval_firmId_objectType_objectId_idx" ON "Approval"("firmId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "AuditEvent_firmId_objectType_objectId_idx" ON "AuditEvent"("firmId", "objectType", "objectId");

-- CreateIndex
CREATE INDEX "SecurityEvent_firmId_at_idx" ON "SecurityEvent"("firmId", "at");

-- CreateIndex
CREATE INDEX "FeatureRequest_status_idx" ON "FeatureRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureVote_requestId_userId_key" ON "FeatureVote"("requestId", "userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "EmailToken_email_idx" ON "EmailToken"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_firmId_idx" ON "Invitation"("firmId");

-- AddForeignKey
ALTER TABLE "Office" ADD CONSTRAINT "Office_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailDomainVerification" ADD CONSTRAINT "EmailDomainVerification_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryProfileVersion" ADD CONSTRAINT "CountryProfileVersion_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FirmRiskAssessment" ADD CONSTRAINT "FirmRiskAssessment_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDocument" ADD CONSTRAINT "PolicyDocument_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "PolicyDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Party" ADD CONSTRAINT "Party_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipLink" ADD CONSTRAINT "OwnershipLink_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnershipLink" ADD CONSTRAINT "OwnershipLink_ownedId_fkey" FOREIGN KEY ("ownedId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_officeId_fkey" FOREIGN KEY ("officeId") REFERENCES "Office"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterParty" ADD CONSTRAINT "MatterParty_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatterParty" ADD CONSTRAINT "MatterParty_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CddFile" ADD CONSTRAINT "CddFile_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityVerification" ADD CONSTRAINT "IdentityVerification_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryExtract" ADD CONSTRAINT "RegistryExtract_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScreeningResult" ADD CONSTRAINT "ScreeningResult_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientRiskAssessment" ADD CONSTRAINT "ClientRiskAssessment_cddFileId_fkey" FOREIGN KEY ("cddFileId") REFERENCES "CddFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Case" ADD CONSTRAINT "Case_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureRequest" ADD CONSTRAINT "FeatureRequest_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureVote" ADD CONSTRAINT "FeatureVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "FeatureRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
