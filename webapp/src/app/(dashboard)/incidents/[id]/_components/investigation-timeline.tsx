import Link from "next/link";
import type { IncidentDetail } from "../../../_lib/types";
import { investigationTimeline } from "../_lib/investigation-timeline";

export function InvestigationTimeline({
  incident,
}: {
  incident: IncidentDetail;
}) {
  const duration =
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
    1000;
  const { observations, warnings, alternatives } = investigationTimeline(
    incident.analysis.investigationResponseText,
    duration,
    incident.evidence,
    incident.analysis.promptVersion === "dumping_v7",
  );
  return (
    <section
      className="space-y-3 rounded-xl border bg-white p-4"
      aria-label="Evidence-linked investigation timeline"
    >
      <h3 className="text-sm font-bold">Investigation timeline</h3>
      <p className="text-xs text-slate-600">
        AI observations require human review. Linked frames let you inspect the
        recording; they do not confirm the claim.
      </p>
      {warnings.map((warning, index) => (
        <p
          key={index}
          className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900"
        >
          Possible assessment conflict: {warning}
        </p>
      ))}
      {!observations.length && (
        <p className="text-xs text-slate-500">
          No structured observations were supplied for this analysis. Existing
          narrative and evidence remain available.
        </p>
      )}
      <ol className="space-y-3">
        {observations.map((observation) => (
          <li key={observation.id} className="rounded-lg border p-3 text-xs">
            <p className="font-semibold">
              {observation.offset == null
                ? "Time unknown"
                : `Approximately ${observation.offset.toFixed(1)} seconds`}
            </p>
            <p className="my-2 leading-5">{observation.claim}</p>
            <div className="flex flex-wrap gap-3">
              {observation.offset != null && (
                <Link
                  className="text-teal-700 underline"
                  href={`/incidents/${incident.id}?tab=overview&seek=${observation.offset}`}
                  scroll={false}
                >
                  Watch this moment
                </Link>
              )}
              {observation.frame?.signedUrl ? (
                <a
                  className="text-teal-700 underline"
                  href={observation.frame.signedUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Inspect original frame at{" "}
                  {observation.frame.offsetSeconds?.toFixed(2)}s
                </a>
              ) : (
                <span className="text-slate-500">
                  Supporting frame unavailable
                </span>
              )}
            </div>
          </li>
        ))}
      </ol>
      {alternatives.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold">
            Alternative explanations ï¿½ AI hypotheses
          </h4>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
            {alternatives.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
