import type { Metadata } from "next";
import { Suspense } from "react";

import { SimulationControlCenter } from "./_components/simulation-control-center";
import { getSimulationData } from "./_queries/simulation";

export const metadata: Metadata = { title: "Demo Lab" };

export default function SimulationPage() {
  return (
    <Suspense fallback={<SimulationPageFallback />}>
      <SimulationPageContent />
    </Suspense>
  );
}

async function SimulationPageContent() {
  return <SimulationControlCenter data={await getSimulationData()} />;
}

function SimulationPageFallback() {
  return (
    <div
      className="mx-auto max-w-[1700px] space-y-5"
      aria-busy="true"
      aria-label="Loading Demo Lab"
    >
      <header>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900">
          Demo Lab
        </h1>
      </header>
      {["Monitoring Session", "AI Scene Check"].map((title) => (
        <section className="surface p-5" key={title}>
          <h2 className="font-heading text-lg font-bold text-slate-900">
            {title}
          </h2>
          <div className="mt-4 grid animate-pulse gap-3 sm:grid-cols-3">
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
            <div className="h-20 rounded-xl bg-slate-100" />
          </div>
          <div className="mt-4 h-32 animate-pulse rounded-xl bg-slate-100" />
        </section>
      ))}
    </div>
  );
}
