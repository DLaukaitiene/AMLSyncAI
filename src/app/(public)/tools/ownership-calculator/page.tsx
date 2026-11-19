import type { Metadata } from "next";
import Link from "next/link";
import { BoCalculator } from "./calculator";

export const metadata: Metadata = {
  title: "Ownership calculator · AMLSync App",
  description: "Free calculator: find who owns 25% or more of a company through every chain of ownership (EU AMLR Art. 51–53), and whether sanctioned persons together own over 50%.",
};

export default function Page() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wider text-accent">Free tool</p>
        <h1 className="text-3xl">Ownership calculator</h1>
        <p className="max-w-2xl text-muted">
          Who really owns your client? List who owns what, and the calculator follows every chain: percentages are multiplied
          down each chain and added across chains. Anyone with 25% or more, or control by other means, is a beneficial owner
          (EU AMLR Art. 51–53). It also flags the client when sanctioned owners together hold more than 50%.
        </p>
        <p className="text-sm text-muted">Nothing you enter here is saved or sent anywhere: it is calculated in your browser.</p>
      </div>
      <BoCalculator />
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-accent/40 bg-brand/10 p-5">
        <div className="max-w-xl space-y-1">
          <h2 className="text-lg font-semibold">Do this for every client, with the evidence kept</h2>
          <p className="text-sm text-muted">In AMLSync App the structure comes from the company register, every owner is screened against sanctions and PEP lists, each branch you stop tracing is recorded with its reason, and the result is ready for your supervisor.</p>
        </div>
        <Link href="/signup" className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-brand-ink hover:brightness-105">Start free trial</Link>
      </section>
    </div>
  );
}
