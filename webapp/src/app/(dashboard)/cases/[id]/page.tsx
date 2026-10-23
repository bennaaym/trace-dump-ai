import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Download, TriangleAlert } from "lucide-react";

import { formatDateTime, reviewStatusLabel } from "../../_lib/format";
import { OVERDUE_AFTER_HOURS, currentTime } from "../../_lib/overdue";
import { CaseStatusBadge, OverdueBadge } from "../_components/case-badges";
import {
  CASE_STATUSES,
  caseEventLabel,
  caseStatusLabel,
  nextActionLabel,
} from "../_lib/case-state";
import { getCase } from "../_queries/cases";
import { SiteCheckPanel } from "../_components/site-check-panel";
import { CaseActions } from "./_components/case-actions";

export const metadata: Metadata = { title: "Case Detail" };

export default async function CasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getCase(id);
  if (!data) notFound();
  const { incident } = data;
  const now = currentTime();
  const reached: Record<string, string | null> = {
    open: data.openedAt,
    assigned: data.assignedAt,
    in_progress: data.startedAt,
    resolved: data.resolvedAt,
  };
  return (
    <>
      <Link
        href="/cases"
        className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-900"
      >
        <ChevronLeft className="size-4" />
        Back to cases
      </Link>
      <header className="mb-5 flex flex-col justify-between gap-3 rounded-xl border bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-bold text-slate-900">
              Case {data.id.slice(0, 8)}
            </h1>
            <CaseStatusBadge value={data.status} />
            {data.overdue && (
              <OverdueBadge recordedAt={data.recordedAt} now={now} />
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {incident.camera.name} · recorded {formatDateTime(data.recordedAt)}{" "}
            UTC ·{" "}
            <Link
              href={`/incidents/${incident.id}`}
              className="font-semibold text-teal-700 hover:text-teal-900"
            >
              View incident
            </Link>
          </p>
        </div>
        <a
          href={`/api/cases/${data.id}/report`}
          download
          className="inline-flex items-center justify-center gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
        >
          <Download className="size-4" />
          Download case report
        </a>
      </header>

      {data.overdue && (
        <p className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          <TriangleAlert className="size-4" />
          More than {OVERDUE_AFTER_HOURS} hours have passed since the recording
          and work has not started.
        </p>
      )}

      <ol
        aria-label="Case progress"
        className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {CASE_STATUSES.map((status) => {
          const at = reached[status];
          return (
            <li
              key={status}
              aria-current={data.status === status ? "step" : undefined}
              className={
                at
                  ? "rounded-xl border border-teal-200 bg-teal-50 px-3 py-2"
                  : "rounded-xl border bg-white px-3 py-2 text-slate-400"
              }
            >
              <p className="text-xs font-bold">{caseStatusLabel(status)}</p>
              <p className="text-[11px]">{at ? formatDateTime(at) : "—"}</p>
            </li>
          );
        })}
      </ol>

      <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
        <div className="space-y-5">
          <section className="surface p-4">
            <h2 className="font-heading text-sm font-bold text-slate-900">
              Case summary
            </h2>
            <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-slate-500">Owner</dt>
                <dd className="mt-0.5 text-slate-800">
                  {data.ownerLabel ?? "Unassigned"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-500">Next action</dt>
                <dd className="mt-0.5 text-slate-800">
                  {data.nextAction
                    ? nextActionLabel(data.nextAction)
                    : "Not chosen"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold text-slate-500">
                  AI description (a lead, confirmed by human review)
                </dt>
                <dd className="mt-0.5 text-slate-800">
                  {incident.description}
                </dd>
              </div>
              {data.resolutionNotes && (
                <div className="sm:col-span-2">
                  <dt className="font-semibold text-slate-500">
                    Resolution notes
                  </dt>
                  <dd className="mt-0.5 text-slate-800">
                    {data.resolutionNotes}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          <SiteCheckPanel
            checks={data.siteChecks}
            resolved={data.status === "resolved"}
            overdue={data.overdue}
          />

          <section className="surface p-4">
            <h2 className="font-heading text-sm font-bold text-slate-900">
              Evidence
            </h2>
            {incident.evidence.length ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {incident.evidence.map((item) => (
                  <figure key={item.id}>
                    <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100">
                      {item.signedUrl && (
                        <Image
                          src={item.signedUrl}
                          alt={`${item.role} evidence frame`}
                          fill
                          sizes="260px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <figcaption className="mt-1 text-[11px] text-slate-500 capitalize">
                      {item.role}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">
                No evidence frames were stored for this incident.
              </p>
            )}
          </section>

          <section className="surface p-4">
            <h2 className="font-heading text-sm font-bold text-slate-900">
              Review history
            </h2>
            <ul className="mt-3 space-y-2 text-xs text-slate-700">
              {incident.reviews.map((review) => (
                <li key={review.id}>
                  <span className="font-semibold">
                    {reviewStatusLabel(review.decision)}
                  </span>{" "}
                  by {review.reviewerLabel} · {formatDateTime(review.createdAt)}{" "}
                  UTC
                  {review.notes && (
                    <p className="mt-0.5 text-slate-500">{review.notes}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section className="surface p-4">
            <h2 className="font-heading text-sm font-bold text-slate-900">
              Audit trail
            </h2>
            <ol className="mt-3 space-y-3 border-l pl-4 text-xs">
              {data.events.map((event) => (
                <li key={event.id}>
                  <p className="font-semibold text-slate-800">
                    {caseEventLabel(event.type, event.details)}
                    {event.fromStatus &&
                      event.toStatus &&
                      event.fromStatus !== event.toStatus &&
                      ` (${caseStatusLabel(event.fromStatus)} → ${caseStatusLabel(event.toStatus)})`}
                  </p>
                  <p className="text-slate-500">
                    {event.actorLabel} · {formatDateTime(event.createdAt)} UTC
                  </p>
                  {typeof event.details.notes === "string" && (
                    <p className="mt-0.5 text-slate-600">
                      {event.details.notes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <CaseActions
          key={`${data.id}:${data.status}:${data.ownerId ?? "none"}:${data.nextAction ?? "none"}`}
          caseId={data.id}
          status={data.status}
          ownerId={data.ownerId}
          nextAction={data.nextAction}
          assignees={data.assignees}
        />
      </div>
    </>
  );
}
