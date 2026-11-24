import { redirect } from "next/navigation";

/** Responsibilities are now part of "Roles and duties", together with the appointments. */
export default function ResponsibilitiesPage() {
  redirect("/app/firm/governance#duties");
}
