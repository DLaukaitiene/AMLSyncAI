import "server-only";
import nodemailer from "nodemailer";
import { adminDb } from "./db";

/**
 * Outbound email. EMAIL_TRANSPORT=dev stores messages in DevEmail (shown at
 * /dev/mailbox) — never in production. Otherwise SMTP_URL is used.
 */
export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const transport = process.env.EMAIL_TRANSPORT ?? (process.env.NODE_ENV === "production" ? "smtp" : "dev");
  if (transport === "dev") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEV_EMAIL !== "1") {
      throw new Error("Dev email transport is not allowed in production");
    }
    await adminDb.devEmail.create({ data: { to, subject, text } });
    return;
  }
  const url = process.env.SMTP_URL;
  if (!url) throw new Error("SMTP_URL is not set");
  await nodemailer.createTransport(url).sendMail({
    from: process.env.EMAIL_FROM ?? "AMLSyncAI <no-reply@amlsyncai.eu>",
    to,
    subject,
    text,
  });
}

export function appUrl(path: string): string {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}
