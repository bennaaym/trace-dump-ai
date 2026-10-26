"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, Camera, FileClock, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "../../../_components/page-elements";
import { formatDateTime, reviewStatusLabel } from "../../../_lib/format";
import type { IncidentDetail } from "../../../_lib/types";
import { AiAnalysis } from "./ai-analysis";
import { IncidentPriority } from "./incident-priority";
import { PlateEvidence } from "./plate-evidence";
import { IncidentPlayback } from "./incident-playback";
import { LocalDateTime } from "./local-date-time";
import {
  incidentWorkspaceHref,
  normalizeIncidentTab,
  type IncidentTabId,
} from "../_lib/workspace-navigation";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "analysis", label: "AI Analysis" },
  { id: "history", label: "Review History" },
] as const;

export function IncidentTabs({ incident }: { incident: IncidentDetail }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = normalizeIncidentTab(searchParams.get("tab"));
  const requestedSeek = searchParams.get("seek");

  function navigate(tab: IncidentTabId, frame?: string | null) {
    router.replace(
      incidentWorkspaceHref(pathname, searchParams.toString(), tab, frame),
      { scroll: false },
    );
  }

  return (
    <div className="surface min-w-0 overflow-hidden">
      <div
        role="tablist"
        aria-label="Incident detail sections"
        className="overflow-x-auto border-b px-3 sm:px-4"
      >
        <div className="flex min-w-max">
          {tabs.map((tab, index) => (
            <button
              type="button"
              role="tab"
              id={"incident-tab-" + tab.id}
              aria-controls={"incident-panel-" + tab.id}
              aria-selected={active === tab.id}
              tabIndex={active === tab.id ? 0 : -1}
              key={tab.id}
              onClick={() => navigate(tab.id)}
              onKeyDown={(event) => {
                if (
                  !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                    event.key,
                  )
                )
                  return;
                event.preventDefault();
                const nextIndex =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? tabs.length - 1
                      : (index +
                          (event.key === "ArrowRight" ? 1 : -1) +
                          tabs.length) %
                        tabs.length;
                const nextTab = tabs[nextIndex];
                navigate(nextTab.id);
                requestAnimationFrame(() =>
                  document
                    .getElementById("incident-tab-" + nextTab.id)
                    ?.focus(),
                );
              }}
              className={cn(
                "border-b-2 px-4 py-3 text-xs font-semibold outline-none focus-visible:bg-teal-50",
                active === tab.id
                  ? "border-teal-500 text-teal-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id={"incident-panel-" + active}
        role="tabpanel"
        aria-labelledby={"incident-tab-" + active}
        className="p-4 sm:p-5"
      >
        {active === "overview" && (
          <OverviewTab incident={incident} initialSeek={requestedSeek} />
        )}
        {active === "analysis" && (
          <AiAnalysis
            incident={incident}
            onViewEvidence={(offset) => navigate("overview", String(offset))}
          />
        )}
        {active === "history" && <ReviewHistory incident={incident} />}
      </div>
    </div>
  );
}

function OverviewTab({
  incident,
  initialSeek,
}: {
  incident: IncidentDetail;
  initialSeek: string | null;
}) {
  const duration = recordingDuration(
    incident.detection.recordingStartAt,
    incident.detection.recordingEndAt,
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,.8fr)]">
      <div>
        <IncidentPlayback
          key={initialSeek ?? "start"}
          incident={incident}
          initialSeek={initialSeek}
        />
      </div>

      <div className="space-y-4">
        <PlateEvidence incident={incident} />
        <IncidentPriority incident={incident} />
        <section className="rounded-xl border bg-white p-4">
          <p className="text-[10px] font-bold tracking-wide text-teal-700 uppercase">
            Incident narrative
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {incident.description}
          </p>
        </section>

        <section className="rounded-xl border bg-slate-50 p-4">
          <h3 className="text-sm font-bold text-slate-800">Event details</h3>
          <dl className="mt-4 space-y-3 text-xs">
            <OverviewValue icon={Camera} label="Camera">
              {incident.camera.name}
            </OverviewValue>
            <OverviewValue icon={CalendarClock} label="Occurred">
              <LocalDateTime
                value={incident.occurredAt ?? incident.createdAt}
              />
            </OverviewValue>
            <OverviewValue icon={FileClock} label="Recording">
              {duration}
            </OverviewValue>
            <OverviewValue icon={MapPin} label="Location">
              {incident.latitude == null
                ? "Coordinates unavailable"
                : incident.latitude.toFixed(5) +
                  ", " +
                  incident.longitude?.toFixed(5)}
              <span className="mt-0.5 block text-[10px] text-slate-400">
                {incident.locationSource === "simulated"
                  ? "Simulated Bordeaux metadata"
                  : "Source metadata"}
              </span>
            </OverviewValue>
          </dl>
        </section>

        {incident.uncertainty && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-xs font-bold text-amber-900">
              AI-reported uncertainty
            </h3>
            <p className="mt-2 text-xs leading-5 text-amber-950">
              {incident.uncertainty}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function OverviewValue({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Camera;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[24px_82px_1fr] items-start gap-2">
      <Icon className="mt-0.5 size-3.5 text-teal-600" />
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-700">{children}</dd>
    </div>
  );
}

function ReviewHistory({ incident }: { incident: IncidentDetail }) {
  if (!incident.reviews.length) {
    return (
      <EmptyState
        icon={FileClock}
        title="No review history"
        description="This incident has not yet received an operator decision."
      />
    );
  }

  const chronological = [...incident.reviews].reverse();
  const currentId = incident.reviews[0]?.id;

  return (
    <ol className="relative ml-3 border-l border-slate-200">
      {chronological.map((review, index) => {
        const isCurrent = review.id === currentId;
        return (
          <li key={review.id} className="relative pb-6 pl-7 last:pb-0">
            <span
              className={cn(
                "absolute top-1 -left-1.5 size-3 rounded-full border-2 border-white",
                isCurrent ? "bg-teal-500 ring-2 ring-teal-100" : "bg-slate-300",
              )}
            />
            <article className="rounded-xl border bg-white p-4 text-xs shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-slate-800">
                      {reviewStatusLabel(review.decision)}
                    </strong>
                    {isCurrent && (
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                        Current decision
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] font-semibold tracking-wide text-slate-400 uppercase">
                    {index === 0 ? "Original review" : "Subsequent change"}
                  </p>
                </div>
                <time
                  dateTime={review.createdAt}
                  className="text-[11px] text-slate-400"
                >
                  {formatDateTime(review.createdAt)}
                </time>
              </div>
              <p className="mt-3 leading-5 text-slate-600">
                {review.notes || "No notes supplied."}
              </p>
              <p className="mt-2 text-[10px] text-slate-400">
                Reviewer: {review.reviewerLabel}
              </p>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function recordingDuration(start: string, end: string) {
  const seconds = Math.max(0, (Date.parse(end) - Date.parse(start)) / 1000);
  if (!Number.isFinite(seconds)) return "Duration unavailable";
  if (seconds < 60) return seconds.toFixed(seconds % 1 === 0 ? 0 : 1) + " sec";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  return minutes + " min " + remaining + " sec";
}
