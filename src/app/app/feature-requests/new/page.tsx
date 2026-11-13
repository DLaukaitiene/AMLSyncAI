import { requireUser } from "@/lib/server/session";
import { NewRequestForm } from "./new-form";

export default async function NewFeatureRequestPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  await requireUser();
  const { module } = await searchParams;
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Suggest a feature</h1>
      <NewRequestForm module={(module ?? "General").slice(0, 60)} />
    </div>
  );
}
