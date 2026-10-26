import Image from "next/image";
import {
  AlertTriangle,
  BadgeCheck,
  CarFront,
  Clock3,
  FileText,
  Package,
  UserRound,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "../../../_lib/format";
import type { IncidentDetail } from "../../../_lib/types";
import {
  distinctEvidenceClaims,
  investigationUncertainty,
} from "../_lib/investigation-report";
import { investigationTimeline } from "../_lib/investigation-timeline";
import { plateEvidence } from "../_lib/plate-evidence";
import { PlateEvidence } from "./plate-evidence";

export function AiAnalysis({
  incident,
  onViewEvidence,
}: {
  incident: IncidentDetail;
  onViewEvidence: (offset: number) => void;
}) {
  const details = incident.analysis.investigation;
  const duration =
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
    1000;
  const timeline = investigationTimeline(
    incident.analysis.investigationResponseText,
    duration,
    incident.evidence,
    incident.analysis.promptVersion === "dumping_v7",
  );
  const eventSummary = conciseText(
    incident.analysis.description ??
      details.sequenceOfEvents ??
      incident.description,
  );
  const supportingEvidence = distinctEvidenceClaims([
    ...timeline.observations.map((observation) => observation.claim),
    ...sentences(details.visualEvidence),
  ]);
  const distinctTimelineClaims = new Set(
    distinctEvidenceClaims(
      timeline.observations.map((observation) => observation.claim),
      3,
    ),
  );
  const timelineItems = timeline.observations.filter((observation) =>
    distinctTimelineClaims.has(observation.claim),
  );
  const uncertainty = investigationUncertainty(
    details.uncertainties ??
      incident.analysis.uncertainty ??
      incident.uncertainty,
  );
  const entities = [
    ["Person", details.peopleInvolved],
    ["Vehicle", details.vehiclesInvolved],
    ["Object", details.objectsInvolved],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));
  const hasPlateEvidence =
    plateEvidence(incident.evidence, duration).candidates.length > 0;
  const review = reviewPresentation(incident.reviewStatus);
  const fullSequence = details.sequenceOfEvents?.trim();
  const hasFullSequence =
    Boolean(fullSequence) &&
    cleanText(fullSequence!) !== cleanText(eventSummary);
  const evidenceMetadata = incident.evidence.filter(
    (item) => item.metadata.kind !== "plate_crop",
  );
  const showAdditional =
    hasFullSequence ||
    Boolean(details.visualEvidence) ||
    timeline.alternatives.length > 0 ||
    timeline.warnings.length > 0 ||
    evidenceMetadata.length > 0 ||
    incident.viewer.role === "admin";

  return (
    <article className="space-y-3 text-sm text-slate-700">
      <section className="rounded-xl border bg-white p-4">
        <header className="border-b pb-4">
          <p className="text-[11px] font-bold tracking-[0.16em] text-teal-700 uppercase">
            Hafnia analysis
          </p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl font-bold text-slate-950">
                {assessmentTitle(incident.analysis.dumpingDetected)}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                AI-generated assessment · {review.description}
              </p>
            </div>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {review.label}
            </span>
          </div>
        </header>

        <section className="grid gap-3 border-b py-4 sm:grid-cols-[44px_1fr]">
          <SectionIcon icon={FileText} />
          <div>
            <h3 className="font-heading text-base font-bold text-slate-900">
              Event summary
            </h3>
            <p className="mt-1 leading-6">{eventSummary}</p>
          </div>
        </section>

        {supportingEvidence.length > 0 && (
          <section className="grid gap-3 pt-4 sm:grid-cols-[44px_1fr]">
            <SectionIcon icon={BadgeCheck} />
            <div>
              <h3 className="font-heading text-base font-bold text-slate-900">
                Why Hafnia flagged this
              </h3>
              <ul className="mt-2 space-y-1.5">
                {supportingEvidence.map((observation) => (
                  <li key={observation} className="flex gap-2 leading-6">
                    <BadgeCheck className="mt-1 size-4 shrink-0 text-teal-600" />
                    <span>{observation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </section>

      {timelineItems.length > 0 && (
        <section className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <SectionIcon icon={Clock3} />
              <div>
                <h3 className="font-heading text-base font-bold text-slate-900">
                  Evidence timeline
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Only unique stored-frame matches show a timestamp and image.
                </p>
              </div>
            </div>
            <span className="text-xs text-slate-500">
              {timelineItems.length}{" "}
              {timelineItems.length === 1 ? "observation" : "observations"}
            </span>
          </div>
          <ol className="mt-3 divide-y pl-1">
            {timelineItems.map((moment, index) => {
              const verified = moment.verifiedOffset !== null;
              return (
                <li
                  key={moment.id}
                  className="grid gap-3 py-3 first:pt-0 sm:grid-cols-[28px_128px_58px_1fr_auto] sm:items-center"
                >
                  <span className="grid size-6 place-items-center rounded-full bg-teal-600 text-[11px] font-bold text-white">
                    {index + 1}
                  </span>
                  {verified && moment.frame?.signedUrl ? (
                    <Image
                      src={moment.frame.signedUrl}
                      width={128}
                      height={72}
                      unoptimized
                      alt="Stored evidence from the incident recording"
                      className="aspect-video w-32 rounded-md border object-contain"
                    />
                  ) : (
                    <span className="text-xs text-slate-400 sm:w-32">
                      Frame unavailable
                    </span>
                  )}
                  <span
                    className={
                      verified
                        ? "text-sm font-bold text-teal-700"
                        : "text-xs text-slate-400"
                    }
                  >
                    {verified
                      ? formatMomentTime(moment.verifiedOffset!)
                      : "Time unavailable"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {observationTitle(moment.id)}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-slate-600">
                      {moment.claim}
                    </p>
                  </div>
                  {verified && (
                    <button
                      type="button"
                      onClick={() => onViewEvidence(moment.verifiedOffset!)}
                      className="rounded-lg bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-100"
                    >
                      View evidence
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {(entities.length > 0 || hasPlateEvidence) && (
        <div
          className={
            hasPlateEvidence && entities.length > 0
              ? "grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]"
              : "grid gap-3"
          }
        >
          {entities.length > 0 && (
            <section className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2">
                <SectionIcon icon={UserRound} small />
                <h3 className="font-heading text-base font-bold text-slate-900">
                  Entities observed
                </h3>
              </div>
              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                {entities.map(([label, value]) => (
                  <div key={label} className="rounded-lg border p-3">
                    <dt className="flex items-center gap-2 text-xs font-bold text-slate-900">
                      <EntityIcon label={label} /> {label}
                    </dt>
                    <dd className="mt-2 text-xs leading-5 text-slate-600">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {hasPlateEvidence && <PlateEvidence incident={incident} />}
        </div>
      )}

      <details className="rounded-xl border bg-white p-4" open>
        <summary className="flex cursor-pointer list-none items-center gap-3 marker:hidden">
          <span className="grid size-8 place-items-center rounded-full bg-amber-50 text-amber-700">
            <AlertTriangle className="size-4" />
          </span>
          <span className="font-heading text-base font-bold text-slate-900">
            Uncertainty and limitations
          </span>
        </summary>
        <p className="mt-2 pl-11 leading-6 text-slate-600">{uncertainty}</p>
      </details>

      {showAdditional && (
        <details className="rounded-xl border bg-white p-4">
          <summary className="cursor-pointer font-semibold text-teal-700">
            Additional evidence and analysis
          </summary>
          <div className="mt-4 grid gap-5 border-l pl-4 lg:grid-cols-2">
            {hasFullSequence && (
              <TextDetail title="Full chronological account">
                {fullSequence}
              </TextDetail>
            )}
            {details.visualEvidence && (
              <TextDetail title="Full evidence narrative">
                {details.visualEvidence}
              </TextDetail>
            )}
            {timeline.alternatives.length > 0 && (
              <DetailList
                title="Alternative explanations"
                values={timeline.alternatives}
              />
            )}
            {timeline.warnings.length > 0 && (
              <DetailList
                title="Assessment checks"
                values={timeline.warnings}
              />
            )}
            {evidenceMetadata.length > 0 && (
              <section>
                <h4 className="text-xs font-bold text-slate-900">
                  Stored evidence metadata
                </h4>
                <ul className="mt-2 space-y-2 text-xs text-slate-600">
                  {evidenceMetadata.slice(0, 8).map((item) => (
                    <li key={item.id}>
                      <span className="font-semibold text-slate-800 capitalize">
                        {item.role}
                      </span>
                      {item.offsetSeconds === null
                        ? " · Time unavailable"
                        : ` · ${formatMomentTime(item.offsetSeconds)}`}
                      {item.extractionMethod
                        ? ` · ${item.extractionMethod}`
                        : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {incident.viewer.role === "admin" && (
              <section className="border-t pt-4 lg:col-span-2">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-900">
                    Technical details
                  </h4>
                  <Badge tone="neutral">Administrators only</Badge>
                </div>
                <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-[150px_1fr]">
                  <dt className="text-slate-500">Hafnia model</dt>
                  <dd>{incident.analysis.modelId ?? "Unavailable"}</dd>
                  <dt className="text-slate-500">Prompt version</dt>
                  <dd>{incident.analysis.promptVersion}</dd>
                  <dt className="text-slate-500">Summary ID</dt>
                  <dd className="font-mono break-all">
                    {incident.analysis.hafniaSummaryId ?? "Unavailable"}
                  </dd>
                  <dt className="text-slate-500">Detection ID</dt>
                  <dd className="font-mono break-all">
                    {incident.detectionId}
                  </dd>
                  <dt className="text-slate-500">Processing started</dt>
                  <dd>{formatDateTime(incident.analysis.startedAt)}</dd>
                  <dt className="text-slate-500">Processing completed</dt>
                  <dd>{formatDateTime(incident.analysis.completedAt)}</dd>
                </dl>
                {incident.detection.technicalMetadata && (
                  <TechnicalBlock
                    title="Detector configuration"
                    value={incident.detection.technicalMetadata}
                  />
                )}
                {incident.analysis.rawResponse && (
                  <TechnicalBlock
                    title="Original Hafnia response"
                    value={incident.analysis.rawResponse}
                  />
                )}
              </section>
            )}
          </div>
        </details>
      )}
    </article>
  );
}

function SectionIcon({
  icon: Icon,
  small = false,
}: {
  icon: typeof FileText;
  small?: boolean;
}) {
  return (
    <span
      className={`grid place-items-center rounded-full bg-teal-50 text-teal-700 ${small ? "size-8" : "size-10"}`}
    >
      <Icon className={small ? "size-4" : "size-5"} />
    </span>
  );
}

function EntityIcon({ label }: { label: string }) {
  const Icon =
    label === "Vehicle" ? CarFront : label === "Object" ? Package : UserRound;
  return (
    <span className="grid size-6 place-items-center rounded-full bg-teal-50 text-teal-700">
      <Icon className="size-3.5" />
    </span>
  );
}

function observationTitle(identifier: string) {
  const title = identifier
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim();
  return title && title.length <= 80 ? title : "Observed activity";
}

function TextDetail({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="text-xs font-bold text-slate-900">{title}</h4>
      <p className="mt-2 text-xs leading-5 text-slate-600">{children}</p>
    </section>
  );
}

function DetailList({ title, values }: { title: string; values: string[] }) {
  return (
    <section>
      <h4 className="text-xs font-bold text-slate-900">{title}</h4>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  );
}

function TechnicalBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div className="mt-4">
      <h4 className="text-[11px] font-bold text-slate-600">{title}</h4>
      <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-5 whitespace-pre-wrap text-slate-200">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function assessmentTitle(value: IncidentDetail["analysis"]["dumpingDetected"]) {
  if (value === "yes") return "Suspected Dumping";
  if (value === "no") return "No Dumping Detected";
  if (value === "uncertain") return "Uncertain Activity";
  return "Assessment Unavailable";
}

function reviewPresentation(status: IncidentDetail["reviewStatus"]) {
  if (status === "confirmed")
    return { label: "Confirmed", description: "human confirmed" };
  if (status === "dismissed")
    return { label: "Dismissed", description: "human dismissed" };
  return {
    label: "Needs review",
    description:
      status === "needs_investigation"
        ? "further investigation required"
        : "human confirmation required",
  };
}

function formatMomentTime(offset: number) {
  const minutes = Math.floor(offset / 60);
  const seconds = Math.floor(offset % 60);
  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function conciseText(value: string) {
  const normalized = cleanText(value);
  const firstSentences = sentences(normalized).slice(0, 2).join(" ");
  const concise = firstSentences || normalized;
  return concise.length <= 500 ? concise : `${concise.slice(0, 497).trim()}…`;
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function sentences(value: string | null) {
  if (!value) return [];
  return (
    cleanText(value)
      .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? []
  );
}
