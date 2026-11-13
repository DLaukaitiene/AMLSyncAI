import type { Metadata } from "next";
import { BoCalculator } from "./calculator";

export const metadata: Metadata = { title: "Beneficial ownership calculator · AMLSyncAI" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Beneficial ownership calculator</h1>
      <p className="max-w-2xl text-sm text-muted">
        Ownership is multiplied down each chain and added across chains. A person holding 25% or more, or with control by
        other means, is a beneficial owner (AMLR Art. 51–53). The sanctions check flags the client when sanctioned persons
        together own more than 50%.
      </p>
      <BoCalculator />
    </div>
  );
}
