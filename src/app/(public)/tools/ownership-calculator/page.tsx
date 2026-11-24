import { permanentRedirect } from "next/navigation";

/** The Ownership calculator is part of the app now (sign-in needed). */
export default function Page() {
  permanentRedirect("/app/tools/ownership-calculator");
}
