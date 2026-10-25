import Image from "next/image";
import Link from "next/link";
import type { IncidentDetail } from "../../../_lib/types";
import { plateEvidence } from "../_lib/plate-evidence";

export function PlateEvidence({ incident }: { incident: IncidentDetail }) {
  const duration =
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
    1000;
  const { candidates, status, sampled } = plateEvidence(
    incident.evidence,
    duration,
  );
  return (
    <section
      className="space-y-3 rounded-xl border bg-white p-4"
      aria-label="Number plate evidence"
    >
      <h3 className="text-sm font-bold">Number plate evidence</h3>
      <p className="text-xs text-slate-600">
        Automatic readings need human verification. A visible plate does not
        establish that the vehicle was involved in dumping.
      </p>
      {!candidates.length && (
        <p className="text-xs text-slate-500">
          {status === "completed"
            ? `No plate candidates detected in ${sampled ?? "the"} sampled frames. Plates may be missed between samples.`
            : status === "failed"
              ? "Plate processing failed. No reliable plate result is available."
              : "No plate recognition result is available for this incident."}
        </p>
      )}
      {candidates.map(({ crop, source, text, offset }) => (
        <article key={crop.id} className="space-y-2 rounded-lg border p-3">
          <p className="font-mono text-lg font-bold">{text ?? "Unreadable"}</p>
          <p className="text-xs text-slate-500">
            {text
              ? "OCR candidate � not yet verified"
              : "Plate detected, but the text could not be read reliably"}{" "}
            � {offset.toFixed(2)}s into recording
          </p>
          {crop.signedUrl ? (
            <a
              href={crop.signedUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open original plate crop"
            >
              <Image
                src={crop.signedUrl}
                width={384}
                height={128}
                unoptimized
                alt={
                  text
                    ? `Unverified plate crop: ${text}`
                    : "Unreadable detected plate crop"
                }
                className="h-24 w-auto max-w-full rounded border object-contain"
              />
            </a>
          ) : (
            <p className="text-xs">Plate crop unavailable</p>
          )}
          <p className="text-xs text-amber-800">
            Vehicle involvement: not established
          </p>
          <div className="flex flex-wrap gap-3 text-xs text-teal-700">
            {source?.signedUrl ? (
              <a
                className="underline"
                href={source.signedUrl}
                target="_blank"
                rel="noreferrer"
              >
                Inspect original source frame
              </a>
            ) : (
              <span className="text-slate-500">Source frame unavailable</span>
            )}
            <Link
              className="underline"
              href={`/incidents/${incident.id}?tab=overview&seek=${offset}`}
              scroll={false}
            >
              Watch plate moment
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}
