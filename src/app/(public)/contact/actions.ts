"use server";

import { headers } from "next/headers";
import { z } from "zod";
import type { ActionState } from "@/components/form";
import { CONTACT_EMAIL } from "@/lib/billing/plans";
import { notify } from "@/lib/server/email";
import { formToObject, isBot, zodErrors } from "@/lib/server/form";
import { hit } from "@/lib/server/rate-limit";
import { visitorId } from "@/lib/server/backoffice/web";
import { saveWebsiteLead } from "@/lib/server/website-lead";
import { CONTACT_TOPICS } from "./topics";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(120),
  company: z.string().trim().min(1, "Enter your company.").max(160),
  email: z.string().trim().toLowerCase().max(200).email("Enter a valid work email."),
  need: z.enum(CONTACT_TOPICS.map((t) => t.value) as [string, ...string[]]).catch("other"),
  message: z.string().trim().max(4000).optional().default(""),
});

export async function sendContact(_prev: ActionState, fd: FormData): Promise<ActionState> {
  if (isBot(fd)) return { message: "sent" };
  const parsed = schema.safeParse(formToObject(fd));
  if (!parsed.success) return zodErrors(parsed.error);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "0.0.0.0";
  const visitor = visitorId(ip, h.get("user-agent") ?? "");
  if (!(await hit(`lead:${visitor}`, { limit: 5, windowSec: 3600 }))) {
    return { error: `Too many messages from this connection. Please email ${CONTACT_EMAIL} instead.` };
  }
  const { name, company, email, need, message } = parsed.data;
  const topic = CONTACT_TOPICS.find((t) => t.value === need)!.label;
  await saveWebsiteLead({ name, company, email, need: topic, message: message || null, visitor, country: (h.get("x-vercel-ip-country") ?? "").slice(0, 2).toUpperCase() || null }, "app-contact");
  await notify(CONTACT_EMAIL, `New enquiry (${topic}) from ${company}`, `Name: ${name}\nCompany: ${company}\nEmail: ${email}\nTopic: ${topic}\n\n${message || "(no message)"}\n\nAlso saved as a lead in the Backoffice.`);
  return { message: "sent" };
}
