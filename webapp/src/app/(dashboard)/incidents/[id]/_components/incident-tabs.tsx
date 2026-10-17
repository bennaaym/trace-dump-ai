"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  CheckCircle2,
  CircleOff,
  FileClock,
  ImageOff,
  Play,
  SearchCheck,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { EmptyState } from "../../../_components/page-elements";
import { formatDateTime, reviewStatusLabel } from "../../../_lib/format";
import type { IncidentDetail, ReviewStatus } from "../../../_lib/types";
import { cn } from "@/lib/utils";
import { reviewIncidentAction } from "../_actions/review";

const tabs = ["Overview", "Evidence", "AI Analysis", "Review History"] as const;

export function IncidentTabs({ incident }: { incident: IncidentDetail }) {
  const [active, setActive] = useState<(typeof tabs)[number]>("Overview");
  const featured =
    incident.evidence.find((item) => item.role === "event") ??
    incident.evidence[0];
  return (
    <div className="surface overflow-hidden">
      <div
        role="tablist"
        aria-label="Incident detail sections"
        className="overflow-x-auto border-b px-4"
      >
        <div className="flex min-w-max">
          {tabs.map((tab) => (
            <button
              type="button"
              role="tab"
              aria-selected={active === tab}
              key={tab}
              onClick={() => setActive(tab)}
              className={cn(
                "border-b-2 px-4 py-3 text-xs font-semibold",
                active === tab
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      <div role="tabpanel" className="p-5">
        {active === "Overview" && (
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <EvidenceImage item={featured} large />
            <div className="rounded-xl border bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-800">
                Incident information
              </h3>
              <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-3 text-xs">
                <dt className="text-slate-500">Camera</dt>
                <dd>{incident.camera.name}</dd>
                <dt className="text-slate-500">Occurred</dt>
                <dd>{formatDateTime(incident.occurredAt)}</dd>
                <dt className="text-slate-500">Location</dt>
                <dd>
                  {incident.latitude == null
                    ? "Unavailable"
                    : `${incident.latitude.toFixed(5)}, ${incident.longitude?.toFixed(5)}`}
                </dd>
                <dt className="text-slate-500">Coordinates</dt>
                <dd>
                  {incident.locationSource === "simulated"
                    ? "Simulated Bordeaux metadata"
                    : "Source metadata"}
                </dd>
                <dt className="text-slate-500">Activity</dt>
                <dd>
                  {formatDateTime(incident.detection.activityStartAt)} –{" "}
                  {formatDateTime(incident.detection.activityEndAt)}
                </dd>
                <dt className="text-slate-500">Recording</dt>
                <dd>
                  {formatDateTime(incident.detection.recordingStartAt)} –{" "}
                  {formatDateTime(incident.detection.recordingEndAt)}
                </dd>
              </dl>
              <h3 className="mt-5 text-sm font-bold text-slate-800">
                Hafnia description
              </h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                {incident.description}
              </p>
              {incident.uncertainty && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                  <strong>Uncertainty:</strong> {incident.uncertainty}
                </p>
              )}
            </div>
          </div>
        )}
        {active === "Evidence" &&
          (incident.evidence.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {incident.evidence.map((item) => (
                <EvidenceImage item={item} key={item.id} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={ImageOff}
              title="No evidence available"
              description="Evidence extraction may be partial or unavailable for this incident."
            />
          ))}
        {active === "AI Analysis" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs leading-5 text-sky-900">
              <Bot className="mr-2 inline size-4" />
              AI output is an investigative lead and requires human review.
            </div>
            <dl className="grid gap-3 rounded-xl border p-4 text-xs sm:grid-cols-[160px_1fr]">
              <dt className="text-slate-500">Analysis status</dt>
              <dd>{incident.analysis.status}</dd>
              <dt className="text-slate-500">Dumping detected</dt>
              <dd>{incident.analysis.dumpingDetected ?? "Unavailable"}</dd>
              <dt className="text-slate-500">Dumping type</dt>
              <dd>{incident.analysis.dumpingType ?? "Unavailable"}</dd>
              <dt className="text-slate-500">Event offset</dt>
              <dd>
                {incident.analysis.eventOffsetSeconds == null
                  ? "Unavailable"
                  : `${incident.analysis.eventOffsetSeconds} seconds`}
              </dd>
              <dt className="text-slate-500">Model</dt>
              <dd>{incident.analysis.modelId ?? "Unavailable"}</dd>
              <dt className="text-slate-500">Prompt version</dt>
              <dd>{incident.analysis.promptVersion}</dd>
              <dt className="text-slate-500">Completed</dt>
              <dd>{formatDateTime(incident.analysis.completedAt)}</dd>
              <dt className="text-slate-500">Summary ID</dt>
              <dd className="font-mono break-all">
                {incident.analysis.hafniaSummaryId ?? "Unavailable"}
              </dd>
            </dl>
            <div className="rounded-xl border p-4">
              <h3 className="text-sm font-bold">Detector metadata</h3>
              <pre className="mt-3 overflow-x-auto text-[11px] leading-5 whitespace-pre-wrap text-slate-600">
                {JSON.stringify(incident.detection.metadata, null, 2)}
              </pre>
            </div>
          </div>
        )}
        {active === "Review History" &&
          (incident.reviews.length ? (
            <div className="space-y-3">
              {incident.reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-xl border p-4 text-xs"
                >
                  <div className="flex flex-wrap justify-between gap-2">
                    <strong>{reviewStatusLabel(review.decision)}</strong>
                    <time className="text-slate-400">
                      {formatDateTime(review.createdAt)}
                    </time>
                  </div>
                  <p className="mt-2 text-slate-600">
                    {review.notes || "No notes supplied."}
                  </p>
                  <p className="mt-2 font-mono text-[10px] text-slate-400">
                    Reviewer {review.reviewerId}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={FileClock}
              title="No review history"
              description="This incident has not yet received an operator decision."
            />
          ))}
      </div>
    </div>
  );
}

function EvidenceImage({
  item,
  large = false,
}: {
  item: IncidentDetail["evidence"][number] | undefined;
  large?: boolean;
}) {
  if (!item?.signedUrl)
    return (
      <div
        className={cn(
          "grid place-items-center rounded-xl bg-slate-950 text-center text-white",
          large ? "min-h-80" : "min-h-52",
        )}
      >
        <div>
          <Play className="mx-auto size-7 text-slate-500" />
          <p className="mt-3 text-xs">Evidence image unavailable</p>
        </div>
      </div>
    );
  return (
    <figure className="overflow-hidden rounded-xl border bg-slate-950">
      <div className={cn("relative", large ? "min-h-80" : "h-52")}>
        <Image
          src={item.signedUrl}
          alt={`${item.role} incident evidence`}
          fill
          sizes={large ? "(min-width: 1280px) 55vw, 100vw" : "360px"}
          className="object-contain"
        />
      </div>
      <figcaption className="bg-white p-3 text-xs">
        <strong className="capitalize">{item.role}</strong>
        <span className="ml-2 text-slate-400">
          {formatDateTime(item.capturedAt)}
        </span>
        {item.sha256 && (
          <p className="mt-1 truncate font-mono text-[9px] text-slate-400">
            SHA-256 {item.sha256}
          </p>
        )}
      </figcaption>
    </figure>
  );
}

export function ReviewActions({
  incidentId,
  status,
}: {
  incidentId: string;
  status: ReviewStatus;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Exclude<
    ReviewStatus,
    "pending_review"
  > | null>(null);
  const [notes, setNotes] = useState("");
  const { executeAsync, isPending, result } = useAction(reviewIncidentAction);
  async function submitReview() {
    if (!selected) return;
    const response = await executeAsync({
      incidentId,
      decision: selected,
      notes,
    });
    if (response?.data?.success) {
      setSelected(null);
      setNotes("");
      router.refresh();
    }
  }
  const message = result.validationErrors
    ? "Check the review notes and try again."
    : result.serverError;
  return (
    <div className="surface h-fit p-5">
      <div className="flex items-center gap-2">
        <SearchCheck className="size-5 text-teal-600" />
        <h2 className="font-heading text-sm font-bold">Operator review</h2>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Current status: <strong>{reviewStatusLabel(status)}</strong>
      </p>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        maxLength={2000}
        aria-label="Review notes"
        placeholder="Add optional review notes…"
        className="mt-4 min-h-24 w-full resize-y rounded-lg border p-3 text-sm"
      />
      <div className="mt-3 grid gap-2">
        <button
          onClick={() => setSelected("confirmed")}
          type="button"
          className="rounded-lg bg-green-600 px-3 py-2 text-xs font-semibold text-white"
        >
          <CheckCircle2 className="mr-1.5 inline size-4" />
          Confirm
        </button>
        <button
          onClick={() => setSelected("dismissed")}
          type="button"
          className="rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white"
        >
          <CircleOff className="mr-1.5 inline size-4" />
          Dismiss
        </button>
        <button
          onClick={() => setSelected("needs_investigation")}
          type="button"
          className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700"
        >
          Needs investigation
        </button>
      </div>
      {selected && (
        <div
          role="dialog"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <strong>Submit “{reviewStatusLabel(selected)}”?</strong>
          <p className="mt-1">
            This appends an immutable review entry and updates the incident
            atomically.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={isPending}
              onClick={submitReview}
              className="rounded bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
            >
              {isPending ? "Saving…" : "Save decision"}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded border bg-white px-3 py-1.5"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700"
        >
          {message}
        </p>
      )}
    </div>
  );
}
