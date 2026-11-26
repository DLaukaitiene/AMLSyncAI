import { requireUser } from "@/lib/server/session";
import { BoCalculator } from "./calculator";

export const metadata = { title: "Ownership calculator" };

export default async function Page() {
  await requireUser("client.view");
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl">Ownership calculator</h1>
        <p className="max-w-2xl text-muted">
          A quick what-if before you build a client&apos;s structure: list who owns what, and the calculator follows every chain. Percentages are
          multiplied down each chain and added across chains. Anyone with 25% or more, or control by other means, is a beneficial owner
          (EU AML Regulation). It also flags the client when sanctioned owners together hold more than 50%.
        </p>
        <p className="text-sm text-muted">Nothing you enter here is saved: it is calculated in your browser. To keep it with the evidence, add the owners to the client&apos;s file.</p>
      </div>
      <BoCalculator />
    </div>
  );
}
