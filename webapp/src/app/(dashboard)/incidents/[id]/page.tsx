import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getIncidentById } from "../../_queries/dashboard";
import { IncidentTabs, ReviewActions } from "./_components/incident-tabs";

export const metadata: Metadata = { title: "Incident Detail" };

export default async function IncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const incident = await getIncidentById(id);
  return (
    <>
      <Link
        href="/incidents"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="size-4" />
        Back to incidents
      </Link>
      <header className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-slate-900">
              Incident {id}
            </h1>
            <Badge tone="warning">Unavailable</Badge>
          </div>
          <p className="mt-2 text-sm text-slate-500">
            {incident
              ? "Incident record loaded."
              : "This incident could not be loaded because the data source is not configured or the ID is invalid."}
          </p>
        </div>
        <Badge tone="teal">Investigation workspace</Badge>
      </header>
      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <IncidentTabs incidentId={id} />
        <ReviewActions />
      </div>
    </>
  );
}
