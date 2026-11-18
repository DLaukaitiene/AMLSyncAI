-- AlterEnum
ALTER TYPE "MatterType" ADD VALUE 'OTHER';

-- AlterEnum
ALTER TYPE "PartyRole" ADD VALUE 'OTHER';

-- AlterTable
ALTER TABLE "Firm" ADD COLUMN     "sectorOther" TEXT;

-- AlterTable
ALTER TABLE "MatterParty" ADD COLUMN     "roleOther" TEXT;

