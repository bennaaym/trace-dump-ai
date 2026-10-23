import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FolderKanban } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { currentTime, isOverdue } from "../../_lib/overdue";
import { OverdueBadge } from "../../cases/_components/case-badges";
import { getCaseSummaryForIncident } from "../../cases/_queries/cases";
import { ReviewStatusBadge } from "../_components/incident-status";
import { IncidentTabs } from "./_components/incident-tabs";
import { LocalDateTime } from "./_components/local-date-time";
import { ReviewActions } from "./_components/review-actions";
import { CleanupStatusBadge } from "../../cleanup/_components/cleanup-status";
import { cleanupOutcomeLabel } from "../../cleanup/_lib/cleanup-data";
import { formatDateTime } from "../../_lib/format";
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
  const linkedCase = await getCaseSummaryForIncident(incident.id);
  const recordedAt = incident.occurredAt ?? incident.createdAt;
  const now = currentTime();
  const overdue = isOverdue(
    {
      recordedAt,
      reviewStatus: incident.reviewStatus,
      caseStatus: linkedCase?.status ?? null,
    },
    now,
  );
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
            {overdue && <OverdueBadge recordedAt={recordedAt} now={now} />}
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
        <div className="flex flex-wrap items-center gap-2">
          {linkedCase && (
            <Link
              href={`/cases/${linkedCase.id}`}
              className="bg-primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white"
            >
              <FolderKanban className="size-4" />
              Open case
            </Link>
          )}
          <Badge tone="teal">Investigation workspace</Badge>
        </div>
      </header>
      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <IncidentTabs incident={incident} />
        <div className="space-y-5">
          <ReviewActions
            key={`${incident.id}:${incident.reviewStatus}:${incident.reviews[0]?.id ?? "none"}`}
            incident={incident}
          />
          {incident.reviewStatus === "confirmed" && incident.cleanup && (
            <aside className="surface p-5" aria-label="Linked cleanup case">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-heading text-sm font-bold">Cleanup</h2>
                <CleanupStatusBadge status={incident.cleanup.status} />
              </div>
              <dl className="mt-4 grid grid-cols-[82px_1fr] gap-y-2 text-xs">
                <dt className="text-slate-500">Case</dt>
                <dd className="font-mono">
                  CL-{incident.cleanup.id.slice(0, 8).toUpperCase()}
                </dd>
                <dt className="text-slate-500">Cleanup team</dt>
                <dd>{incident.cleanup.assignedTeamName ?? "Unassigned"}</dd>
                <dt className="text-slate-500">Deadline</dt>
                <dd>
                  {incident.cleanup.dueAt
                    ? formatDateTime(incident.cleanup.dueAt)
                    : "Not set"}
                </dd>
                {incident.cleanup.resolutionOutcome && (
                  <>
                    <dt className="text-slate-500">Outcome</dt>
                    <dd>
                      {cleanupOutcomeLabel(incident.cleanup.resolutionOutcome)}
                    </dd>
                  </>
                )}
              </dl>
              <Link
                href={`/cleanup?case=${incident.cleanup.id}`}
                className="mt-4 inline-flex rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white hover:bg-teal-700"
              >
                Open cleanup case
              </Link>
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

function stringValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}
