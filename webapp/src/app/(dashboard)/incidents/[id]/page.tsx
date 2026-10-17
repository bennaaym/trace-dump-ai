import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { ReviewStatusBadge } from "../_components/incident-status";
import { IncidentTabs } from "./_components/incident-tabs";
import { LocalDateTime } from "./_components/local-date-time";
import { ReviewActions } from "./_components/review-actions";
import { safeIncidentListReturn } from "./_lib/workspace-navigation";
import { getIncident } from "./_queries/incident";

export const metadata: Metadata = { title: "Incident Detail" };

export default async function IncidentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const incident = await getIncident(id);
  if (!incident) notFound();
  const requestedReturnTo = stringValue(query.returnTo);
  const returnTo = safeIncidentListReturn(requestedReturnTo);
  return (
    <>
      <Link
        href={returnTo}
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="size-4" />
        Back to incidents
      </Link>
      <header className="mb-5 flex flex-col justify-between gap-3 rounded-xl border bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-slate-900">
              Incident {id.slice(0, 8)}
            </h1>
            <ReviewStatusBadge value={incident.reviewStatus} />
          </div>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{incident.camera.name}</span>
            {incident.latitude != null && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  {incident.latitude.toFixed(5)},{" "}
                  {incident.longitude?.toFixed(5)}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <LocalDateTime value={incident.occurredAt ?? incident.createdAt} />
          </p>
        </div>
        <Badge tone="teal">Investigation workspace</Badge>
      </header>
      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <IncidentTabs incident={incident} />
        <ReviewActions
          key={`${incident.id}:${incident.reviewStatus}:${incident.reviews[0]?.id ?? "none"}`}
          incident={incident}
        />
      </div>
    </>
  );
}

function stringValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
