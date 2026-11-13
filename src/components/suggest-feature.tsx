"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { moduleFromPath } from "@/lib/feedback/rules";

/** "Suggest a feature" on every screen; the module is pre-filled from the current page (spec §4.10). */
export function SuggestFeature() {
  const path = usePathname();
  if (path.startsWith("/app/feature-requests")) return null;
  return (
    <Link href={`/app/feature-requests/new?module=${encodeURIComponent(moduleFromPath(path))}`} className="text-muted underline hover:text-foreground">
      Suggest a feature
    </Link>
  );
}
