-- AlterTable
ALTER TABLE "Case" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "dueOn" DATE,
ADD COLUMN     "fiuInstruction" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';

