import "server-only";
import { adminDb } from "./db";

export interface WebsiteLead {
  name: string;
  email: string;
  company: string | null;
  need: string | null;
  message: string | null;
  visitor: string;
  country: string | null;
}

/**
 * Store a website enquiry as a lead (§7.3), from the amlsync.com form or the
 * app's own Contact page. A repeat message from an open lead becomes a note.
 */
export async function saveWebsiteLead(lead: WebsiteLead, source = "website-form"): Promise<void> {
  const { email, ...data } = lead;
  const existing = await adminDb.lead.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
  if (existing && existing.stage !== "lost") {
    await adminDb.leadNote.create({ data: { leadId: existing.id, authorEmail: "website", text: `New website message (${data.need ?? "—"}):\n${data.message ?? ""}` } });
    await adminDb.lead.update({ where: { id: existing.id }, data: { visitor: data.visitor } });
  } else {
    await adminDb.lead.create({ data: { ...data, email, source } });
  }
}
