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
  if (!url) throw new EmailDeliveryError("SMTP_URL is not set");
  try {
    await nodemailer.createTransport(url).sendMail({
      from: process.env.EMAIL_FROM ?? "AMLSync App <no-reply@amlsync.com>",
      to,
      subject,
      text,
    });
  } catch (e) {
    // Never log the recipient or the message (personal data); the provider's error code is enough.
    // Shape of SMTP_URL only (never the password itself) to help fix configuration mistakes.
    let shape = "unparseable SMTP_URL";
    try {
      const u = new URL(url);
      shape = `${u.protocol}//${decodeURIComponent(u.username)}@${u.hostname}:${u.port} password length ${decodeURIComponent(u.password).length}${/\s/.test(decodeURIComponent(u.password)) ? " (contains spaces)" : ""}`;
    } catch {}
    console.error("email delivery failed:", (e as { code?: string }).code ?? "", String((e as Error).message).split("\n")[0].slice(0, 120), "|", shape);
    throw new EmailDeliveryError((e as Error).message);
  }
}

export class EmailDeliveryError extends Error {}

export const EMAIL_FAILED = "We couldn't send the email just now. Please try again in a few minutes. If it keeps happening, contact contact@amlsync.com.";

/** For notifications that must not block the action that triggered them (sign-in alerts, team notices). */
export async function notify(to: string, subject: string, text: string): Promise<void> {
  try {
    await sendEmail(to, subject, text);
  } catch (e) {
    if (!(e instanceof EmailDeliveryError)) throw e;
  }
}

export function appUrl(path: string): string {
  return new URL(path, process.env.APP_URL ?? "http://localhost:3000").toString();
}
