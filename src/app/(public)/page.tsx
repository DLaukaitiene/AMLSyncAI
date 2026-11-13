import Link from "next/link";
import { EU_CORE } from "@/lib/rules/eu-core";

const MODULES: { name: string; spec: string; status: "engine" | "planned" }[] = [
  { name: "Country Profile and EU Core floor", spec: "§3A", status: "engine" },
  { name: "Beneficial ownership calculation", spec: "§4.2, §11.6", status: "engine" },
  { name: "Sanctions > 50% ownership aggregation", spec: "§4.4, §11.8", status: "engine" },
  { name: "CDD triggers and linked transactions", spec: "§4.2, §11.4", status: "engine" },
  { name: "Client risk scoring, SDD and EDD", spec: "§4.3, §11.7", status: "engine" },
  { name: "Hard gates for clients and matters", spec: "§4.2, §11.4", status: "engine" },
  { name: "Compliance Calendar clocks", spec: "§4.5, §11.9", status: "engine" },
  { name: "Cash cap and Art. 74 threshold reports", spec: "§4.6, §11.10", status: "engine" },
  { name: "Company-email verification at sign-up", spec: "§8C.2, §11.14", status: "engine" },
  { name: "Feature-request personal-data scan", spec: "§4.10, §11.13", status: "engine" },
  { name: "Sign-up, MFA and sessions", spec: "§8C.3", status: "planned" },
  { name: "Client portal and eID", spec: "§4A.1", status: "planned" },
  { name: "Firm risk assessment and Policy Builder", spec: "§4.1, §4.8", status: "planned" },
  { name: "Suspicion reporting and FIU inbox", spec: "§4.6", status: "planned" },
  { name: "Supervisor file export", spec: "§4.7", status: "planned" },
];

export default function Home() {
  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <h1 className="text-2xl font-semibold">AMLSyncAI</h1>
        <p className="text-muted max-w-2xl">
          AML compliance software for EU non-financial obliged entities under Regulation (EU) 2024/1624.
          AMLR applies from {EU_CORE.applicationDate}. EU Core rule set version <code>{EU_CORE.version}</code>.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Build status</h2>
        <ul className="divide-y divide-border rounded-md border border-border">
          {MODULES.map((m) => (
            <li key={m.name} className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span>
                {m.name} <span className="text-muted">({m.spec})</span>
              </span>
              <span className={m.status === "engine" ? "text-accent" : "text-muted"}>
                {m.status === "engine" ? "Rules engine done" : "Planned"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-sm">
        Try the <Link className="text-accent underline" href="/tools/beneficial-ownership">beneficial ownership calculator</Link>.
      </p>
    </div>
  );
}
