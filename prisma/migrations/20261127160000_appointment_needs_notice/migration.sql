-- AlterTable: only appointments made or changed from now on ask to inform the regulator
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "needsNotice" BOOLEAN NOT NULL DEFAULT false;
