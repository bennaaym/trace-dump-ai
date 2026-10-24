import type { IncidentDetail } from "../../../_lib/types";
import { assessPriority } from "./priority";
import { investigationTimeline } from "./investigation-timeline";
import { plateEvidence } from "./plate-evidence";

function escape(value: unknown) {
  return String(value ?? "Unknown").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function utc(value: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : "Unknown";
}
function offset(value: number | null) {
  return value == null ? "Time unknown" : `+${value.toFixed(1)} seconds`;
}
export function investigationReport(
  incident: IncidentDetail,
  generatedAt: string,
  images: ReadonlyMap<string, string>,
) {
  const duration =
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
    1000;
  const priority = assessPriority(
    incident.analysis.investigationResponseText,
    duration,
  );
  const timeline = investigationTimeline(
    incident.analysis.investigationResponseText,
    duration,
    incident.evidence,
    incident.analysis.promptVersion === "dumping_v7",
  );
  const plates = plateEvidence(incident.evidence, duration);
  const latest = incident.priorityHistory?.[0];
  const effective = latest?.level ?? priority.level;
  const text = (value: unknown) => `<p>${escape(value)}</p>`;
  const list = (values: string[]) =>
    `<ul>${values.map((v) => `<li>${escape(v)}</li>`).join("")}</ul>`;
  const image = (id: string, caption: string) => {
    const src = images.get(id);
    return `<figure>${src && /^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(src) ? `<img src="${src}" alt="${escape(caption)}">` : "<p>Image unavailable or omitted from export.</p>"}<figcaption>${escape(caption)}</figcaption></figure>`;
  };
  const section = (title: string, body: string) =>
    `<section><h2>${escape(title)}</h2>${body}</section>`;
  const body = [
    `<h1>TraceDump AI investigation report</h1>${text("Incident " + incident.id)}${text("Generated " + utc(generatedAt))}<p class="notice">AI findings are investigative leads, not confirmation of wrongdoing. Human decisions are recorded separately. This report is a snapshot; it does not include the source video.</p>`,
    section(
      "Incident details",
      `<dl><dt>Camera</dt><dd>${escape(incident.camera.name)} (${escape(incident.camera.id)})</dd><dt>Occurred (UTC)</dt><dd>${escape(utc(incident.occurredAt))}</dd><dt>Created (UTC)</dt><dd>${escape(utc(incident.createdAt))}</dd><dt>Coordinates</dt><dd>${escape(incident.latitude == null ? "Unavailable" : `${incident.latitude}, ${incident.longitude}`)} (${escape(incident.locationSource === "simulated" ? "Simulated coordinates" : "Source metadata")})</dd><dt>Recording interval (UTC)</dt><dd>${escape(utc(incident.detection.recordingStartAt))} to ${escape(utc(incident.detection.recordingEndAt))}</dd><dt>AI classification</dt><dd>${escape(incident.analysis.dumpingDetected ?? "Unknown")} / ${escape(incident.analysis.dumpingType ?? "Unknown")}</dd><dt>Approximate AI event time</dt><dd>${escape(offset(incident.analysis.eventOffsetSeconds))}</dd><dt>Human review state</dt><dd>${escape(incident.reviewStatus)}</dd></dl>`,
    ),
    section(
      "AI narrative and limitations",
      text(incident.description) +
        text(
          "AI uncertainty: " +
            (incident.uncertainty ||
              "Not supplied; absence of reported uncertainty is not proof of certainty."),
        ),
    ),
    section(
      "Priority",
      text(
        `${effective.toUpperCase()} (${latest?.level ? "reviewer adjustment" : "automatic assessment"})`,
      ) +
        (latest?.level ? text("Reviewer reason: " + latest.reason) : "") +
        text(
          `Automatic: ${priority.level.toUpperCase()} / ${priority.ruleVersion}`,
        ) +
        list(priority.reasons) +
        list(
          priority.factors.map(
            (f) =>
              `${f.label}: ${f.status}. ${f.evidence || "Not reliably assessed."} (${offset(f.offset)})`,
          ),
        ),
    ),
    section(
      "AI observation timeline",
      timeline.observations.length
        ? timeline.observations
            .map(
              (o) =>
                `<article><h3>${escape(offset(o.offset))}</h3>${text(o.claim)}${o.frame ? image(o.frame.id, "Supporting source frame: " + o.frame.id) : text("Supporting source frame unavailable.")}</article>`,
            )
            .join("")
        : text(
            "No structured observation timeline was supplied. No timeline has been inferred.",
          ),
    ),
    section(
      "AI contradictions and alternative explanations",
      text("Contradictions reported or flagged:") +
        (timeline.warnings.length
          ? list(timeline.warnings)
          : text(
              "None supplied or flagged; this does not establish consistency.",
            )) +
        text("Alternative interpretations (hypotheses):") +
        (timeline.alternatives.length
          ? list(timeline.alternatives)
          : text("None supplied.")),
    ),
    section(
      "Number plate evidence",
      plates.candidates.length
        ? plates.candidates
            .map(
              (p) =>
                `<article><h3>${escape(p.text ? "OCR candidate: " + p.text : "Unreadable")}</h3>${text(offset(p.offset) + ". Human verification required; vehicle involvement is not established.")}${image(p.crop.id, "Plate crop")}${p.source ? image(p.source.id, "Original plate source frame") : text("Original plate source frame unavailable.")}</article>`,
            )
            .join("")
        : text(
            "No plate candidates recorded. This does not establish that no plate was visible.",
          ),
    ),
    section(
      "Human review history",
      incident.reviews.length
        ? incident.reviews
            .map(
              (r) =>
                text(
                  `${utc(r.createdAt)} | ${r.reviewerLabel} | ${r.decision}`,
                ) + text(r.notes || "No notes supplied."),
            )
            .join("")
        : text("No human decision recorded."),
    ),
    section(
      "Human priority adjustment history",
      incident.priorityHistory?.length
        ? incident.priorityHistory
            .map(
              (h) =>
                text(
                  `${utc(h.createdAt)} | Reviewer ${h.reviewerId} | ${h.level ?? "Return to automatic"}`,
                ) + text(h.reason),
            )
            .join("")
        : text(
            incident.priorityAdjustmentsAvailable
              ? "No priority adjustments recorded."
              : "Priority adjustment history unavailable.",
          ),
    ),
    section(
      "Evidence inventory and provenance",
      text(
        `Analysis ${incident.analysis.id}; prompt ${incident.analysis.promptVersion}; model ${incident.analysis.modelId ?? "Unknown"}. Detection ${incident.detectionId}.`,
      ) +
        text(
          "Image hashes are stored provenance metadata; this export does not independently verify them. Unavailable or omitted images remain listed below.",
        ) +
        incident.evidence
          .map(
            (e) =>
              `<article><h3>${escape(e.id)}</h3>${text(`${e.role} | ${offset(e.offsetSeconds)} | captured ${utc(e.capturedAt)}`)}${text("SHA-256: " + (e.sha256 ?? "Unavailable"))}${text("Extraction: " + (e.extractionMethod ?? "Unknown"))}${image(e.id, "Evidence " + e.id)}</article>`,
          )
          .join(""),
    ),
  ].join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>Investigation ${escape(incident.id)}</title><style>body{font:14px/1.6 system-ui,sans-serif;color:#172b40;max-width:960px;margin:32px auto;padding:0 24px}h1{font-size:26px}h2{border-bottom:1px solid #ccd6df;padding-bottom:8px;margin-top:32px}h3{font-size:14px}p,dd,li{overflow-wrap:anywhere;white-space:pre-wrap}dt{font-weight:bold}dd{margin:0 0 12px}img{max-width:100%;max-height:360px;object-fit:contain}figure{margin:16px 0}figcaption{font-size:12px;color:#526579}.notice{background:#fff4d6;padding:16px}article{border-bottom:1px solid #ddd;padding:12px 0} @media print{body{margin:0;max-width:none}img{max-height:240px}figure{break-inside:avoid}h2,h3{break-after:avoid}}</style></head><body>${body}</body></html>`;
}
