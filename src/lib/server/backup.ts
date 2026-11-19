import "server-only";
import { adminDb } from "./db";
import { dumpDatabase } from "@/lib/backup/dump";

export const createBackup = () => dumpDatabase(adminDb);
