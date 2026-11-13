"use client";

import Link from "next/link";
import { useActionResult } from "./form";

/** Shows a "confirm it's you" link when a server action asks for step-up re-authentication. */
export function StepUpLink() {
  const state = useActionResult();
  const next = (state?.data as { stepUp?: string } | undefined)?.stepUp;
  if (!next) return null;
  return (
    <Link href={`/reauth?next=${encodeURIComponent(next)}`} className="inline-block text-sm text-accent underline">
      Confirm with your authenticator code
    </Link>
  );
}
