-- AlterTable
ALTER TABLE "CddFile" ADD COLUMN     "scope" TEXT NOT NULL DEFAULT 'full',
ADD COLUMN     "scopeNote" TEXT,
ADD COLUMN     "scopeReason" TEXT,
ADD COLUMN     "scopeSetAt" TIMESTAMP(3),
ADD COLUMN     "scopeSetById" UUID;

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "defaultCddScope" TEXT NOT NULL DEFAULT 'full';

