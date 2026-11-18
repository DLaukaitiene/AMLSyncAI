import { adminDb } from "@/lib/server/db";
import { inAudience, type Audience } from "@/lib/backoffice/ops";
import { dismissAnnouncementAction } from "@/app/app/support/actions";

/** In-app messages from AMLSync (Backoffice §18): shown until dismissed or expired. */
export async function Announcements({ firmId, userId }: { firmId: string; userId: string }) {
  const now = new Date();
  const [firm, rows] = await Promise.all([
    adminDb.firm.findUnique({ where: { id: firmId }, select: { homeState: true, plan: true, status: true, sectors: true } }),
    adminDb.announcement.findMany({ where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }], dismissals: { none: { userId } } }, orderBy: { startsAt: "desc" }, take: 3 }),
  ]);
  if (!firm) return null;
  const show = rows.filter((a) => inAudience(a.audience as Audience, firm));
  if (!show.length) return null;
  return (
    <div className="mb-4 space-y-2" data-testid="announcements">
      {show.map((a) => (
        <div key={a.id} role="status" className={`flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm ${a.level === "warning" ? "border-orange bg-orange/10" : "border-brand bg-brand/10"}`}>
          <div className="min-w-0 flex-1"><p className="font-semibold">{a.title}</p><p className="whitespace-pre-wrap">{a.body}</p></div>
          <form action={dismissAnnouncementAction.bind(null, a.id)}><button className="text-muted underline">Dismiss</button></form>
        </div>
      ))}
    </div>
  );
}
