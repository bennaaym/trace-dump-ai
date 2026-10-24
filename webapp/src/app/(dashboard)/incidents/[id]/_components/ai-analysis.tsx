import {
  Bot,
  CarFront,
  Clock3,
  Eye,
  Package,
  TriangleAlert,
  Users,
  Wrench,
} from "lucide-react";

import { PlateEvidence } from "./plate-evidence";
import { InvestigationTimeline } from "./investigation-timeline";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "../../../_lib/format";
import type { IncidentDetail } from "../../../_lib/types";
import { ReviewStatusBadge } from "../../_components/incident-status";

export function AiAnalysis({
  incident,
  onViewEvidence,
}: {
  incident: IncidentDetail;
  onViewEvidence: () => void;
}) {
  const details = incident.analysis.investigation;
  const sequence =
    details.sequenceOfEvents ??
    incident.analysis.description ??
    incident.description;
  const incidentNarrative =
    incident.description.trim() !== sequence?.trim()
      ? incident.description.trim()
      : null;
  const entities = [
    {
      icon: Users,
      title: "People involved",
      value: details.peopleInvolved,
    },
    {
      icon: CarFront,
      title: "Vehicles involved",
      value: details.vehiclesInvolved,
    },
    {
      icon: Package,
      title: "Objects involved",
      value: details.objectsInvolved,
    },
  ].filter((entry) => entry.value);
  const uncertainty =
    details.uncertainties ??
    incident.analysis.uncertainty ??
    incident.uncertainty;
  const expectedDetails = [
    details.sequenceOfEvents,
    details.peopleInvolved,
    details.vehiclesInvolved,
    details.objectsInvolved,
    details.visualEvidence,
    details.uncertainties,
  ];
  const isIncomplete = expectedDetails.some((value) => !value);

  return (
    <div className="space-y-4">
      <PlateEvidence incident={incident} />
      <InvestigationTimeline incident={incident} />
      <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-xs leading-5 text-sky-950">
        <Bot className="mr-2 inline size-4 text-sky-700" />
        This is Hafnia&apos;s original assessment of suspected activity. It is
        an investigative lead, not a human-confirmed incident.
      </div>

      <section className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
              AI assessment
            </p>
            <h3 className="mt-1 text-sm font-bold text-slate-900">
              Suspected dumping
            </h3>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
              Human review
            </p>
            <div className="mt-1">
              <ReviewStatusBadge value={incident.reviewStatus} />
            </div>
          </div>
        </div>
        <dl className="mt-4 grid gap-3 sm:max-w-sm">
          <AssessmentValue
            label="Event offset"
            value={
              incident.analysis.eventOffsetSeconds == null
                ? null
                : `${incident.analysis.eventOffsetSeconds} seconds from recording start`
            }
          />
        </dl>
        <button
          type="button"
          onClick={onViewEvidence}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-900"
        >
          <Eye className="size-3.5" />
          View suspected event
        </button>
      </section>

      {sequence && (
        <InvestigationSection
          icon={Clock3}
          title="Event description and chronological sequence"
          value={sequence}
          secondaryLabel="Original incident narrative"
          secondaryValue={incidentNarrative}
        />
      )}
      {entities.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {entities.map((entity) => (
            <InvestigationSection key={entity.title} {...entity} />
          ))}
        </div>
      )}
      {details.visualEvidence && (
        <InvestigationSection
          icon={Eye}
          title="Visual evidence supporting the assessment"
          value={details.visualEvidence}
        />
      )}
      {uncertainty && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-900">
            <TriangleAlert className="size-4" />
            <h3 className="text-xs font-bold">Uncertainties and limitations</h3>
          </div>
          <p className="mt-2 text-xs leading-5 text-amber-950">{uncertainty}</p>
        </section>
      )}

      {isIncomplete && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500">
          {incident.analysis.investigationResponseAvailable
            ? "This analysis contains only some investigation details. Only observations supplied by Hafnia are shown."
            : "Some stored investigation details are not currently available to this view. The original incident narrative is shown where available."}
        </p>
      )}

      {incident.viewer.role === "admin" && (
        <details className="group rounded-xl border bg-slate-50">
          <summary className="cursor-pointer list-none px-4 py-3 marker:hidden">
            <span className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
              <span className="flex items-center gap-2">
                <Wrench className="size-4" />
                Technical details
              </span>
              <Badge tone="neutral">Administrators only</Badge>
            </span>
          </summary>
          <div className="space-y-4 border-t p-4">
            <dl className="grid gap-3 text-xs sm:grid-cols-[150px_1fr]">
              <dt className="text-slate-500">Hafnia model</dt>
              <dd>{incident.analysis.modelId ?? "Unavailable"}</dd>
              <dt className="text-slate-500">Prompt version</dt>
              <dd>{incident.analysis.promptVersion}</dd>
              <dt className="text-slate-500">Summary ID</dt>
              <dd className="font-mono break-all">
                {incident.analysis.hafniaSummaryId ?? "Unavailable"}
              </dd>
              <dt className="text-slate-500">Detection ID</dt>
              <dd className="font-mono break-all">{incident.detectionId}</dd>
              <dt className="text-slate-500">Event offset</dt>
              <dd>
                {incident.analysis.eventOffsetSeconds == null
                  ? "Unavailable"
                  : `${incident.analysis.eventOffsetSeconds} seconds from recording start`}
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
          </div>
        </details>
      )}
    </div>
  );
}

function AssessmentValue({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <dt className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-xs font-semibold text-slate-800">
        {value ?? "Unavailable"}
      </dd>
    </div>
  );
}

function InvestigationSection({
  icon: Icon,
  title,
  value,
  secondaryLabel,
  secondaryValue,
}: {
  icon: typeof Clock3;
  title: string;
  value: string | null;
  secondaryLabel?: string;
  secondaryValue?: string | null;
}) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="flex items-center gap-2 text-slate-800">
        <span className="grid size-7 place-items-center rounded-lg bg-teal-50 text-teal-700">
          <Icon className="size-4" />
        </span>
        <h3 className="text-xs font-bold">{title}</h3>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-600">{value}</p>
      {secondaryValue && (
        <div className="mt-3 border-t pt-3">
          <p className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
            {secondaryLabel}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {secondaryValue}
          </p>
        </div>
      )}
    </section>
  );
}

function TechnicalBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <div>
      <h4 className="text-[11px] font-bold text-slate-600">{title}</h4>
      <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-slate-950 p-3 text-[10px] leading-5 whitespace-pre-wrap text-slate-200">
        {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
