import { permanentRedirect } from "next/navigation";

/** Old address of the ownership calculator. */
export default function Page() {
  permanentRedirect("/app/tools/ownership-calculator");
}
