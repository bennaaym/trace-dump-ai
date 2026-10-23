import { formatDateTime, reviewStatusLabel } from "../../_lib/format";
import type { CaseDetail } from "../_queries/cases";
import { escapeHtml } from "./escape-html";
import {
  caseEventLabel,
  caseStatusLabel,
  nextActionLabel,
  siteCheckLabel,
} from "./case-state";

function row(label: string, value: string | null | undefined) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || "Not recorded")}</td></tr>`;
}

/**
 * Builds a self-contained HTML case report (evidence images are inlined as
 * data URIs so the file stays valid after signed URLs expire).
 */
export function buildCaseReportHtml(
  data: CaseDetail,
  images: Map<string, string>,
  generatedBy: string,
  generatedAt: Date,
): string {
  const { incident } = data;
  const title = `Case ${data.id.slice(0, 8)} report`;
  const evidence = incident.evidence
    .map((item) => {
      const src = images.get(item.id);
      const caption = `${item.role}${item.capturedAt ? ` · ${formatDateTime(item.capturedAt)} UTC` : ""}${item.sha256 ? ` · sha256 ${item.sha256}` : ""}`;
      return `<figure>${
        src
          ? `<img src="${src}" alt="${escapeHtml(item.role)} evidence frame">`
          : `<div class="missing">Image unavailable when this report was generated</div>`
      }<figcaption>${escapeHtml(caption)}</figcaption></figure>`;
    })
    .join("");
  const reviews = incident.reviews
    .map(
      (review) =>
        `<li><strong>${escapeHtml(reviewStatusLabel(review.decision))}</strong> by ${escapeHtml(review.reviewerLabel)} on ${escapeHtml(formatDateTime(review.createdAt))} UTC${review.notes ? `<br>${escapeHtml(review.notes)}` : ""}</li>`,
    )
    .join("");
  const siteChecks = data.siteChecks
    .filter((check) => check.status === "completed" && check.result)
    .map(
      (check) =>
        `<li><strong>${escapeHtml(siteCheckLabel(check.result!))}</strong> · footage ${escapeHtml(formatDateTime(check.windowStartAt))} – ${escapeHtml(formatDateTime(check.windowEndAt))} UTC${check.summary ? `<br>${escapeHtml(check.summary)}` : ""}${check.uncertainty ? `<br>Uncertainty: ${escapeHtml(check.uncertainty)}` : ""}</li>`,
    )
    .join("");
  const events = data.events
    .map((event) => {
      const notes =
        typeof event.details.notes === "string"
          ? `<br>${escapeHtml(event.details.notes)}`
          : "";
      const transition =
        event.fromStatus &&
        event.toStatus &&
        event.fromStatus !== event.toStatus
          ? ` (${escapeHtml(caseStatusLabel(event.fromStatus))} → ${escapeHtml(caseStatusLabel(event.toStatus))})`
          : "";
      return `<tr><td>${escapeHtml(formatDateTime(event.createdAt))} UTC</td><td>${escapeHtml(event.actorLabel)}</td><td>${escapeHtml(caseEventLabel(event.type, event.details))}${transition}${notes}</td></tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; color: #0f172a; max-width: 880px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.6rem; margin-bottom: .25rem; }
  h2 { font-size: 1.05rem; margin: 2rem 0 .5rem; border-bottom: 1px solid #cbd5e1; padding-bottom: .25rem; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; vertical-align: top; padding: .35rem .5rem; border-bottom: 1px solid #e2e8f0; }
  th { width: 11rem; color: #475569; font-weight: 600; }
  .notice { background: #fef3c7; border: 1px solid #fde68a; padding: .6rem .8rem; border-radius: .5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1rem; }
  figure { margin: 0; }
  img { width: 100%; border-radius: .5rem; border: 1px solid #cbd5e1; }
  figcaption { font-size: 11px; color: #64748b; word-break: break-all; }
  .missing { padding: 2rem 1rem; background: #f1f5f9; text-align: center; color: #64748b; border-radius: .5rem; }
  @media print { body { margin: 0; } h2 { break-after: avoid; } figure { break-inside: avoid; } }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<p>Generated ${escapeHtml(formatDateTime(generatedAt.toISOString()))} UTC by ${escapeHtml(generatedBy)}</p>
<p class="notice">The AI classification in this report is a lead produced by an automated system. The incident was confirmed by a human reviewer; the AI analysis alone does not establish that an offence occurred.</p>

<h2>Case</h2>
<table>
${row("Case ID", data.id)}
${row("Status", caseStatusLabel(data.status))}
${row("Owner", data.ownerLabel)}
${row("Next action", data.nextAction ? nextActionLabel(data.nextAction) : null)}
${row("Opened", `${formatDateTime(data.openedAt)} UTC`)}
${row("Assigned", data.assignedAt ? `${formatDateTime(data.assignedAt)} UTC` : null)}
${row("Work started", data.startedAt ? `${formatDateTime(data.startedAt)} UTC` : null)}
${row("Resolved", data.resolvedAt ? `${formatDateTime(data.resolvedAt)} UTC` : null)}
${row("Resolution notes", data.resolutionNotes)}
</table>

<h2>Incident</h2>
<table>
${row("Incident ID", incident.id)}
${row("Camera", incident.camera.name)}
${row("Recorded", `${formatDateTime(data.recordedAt)} UTC`)}
${row("Location", incident.latitude != null && incident.longitude != null ? `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)} (${incident.locationSource})` : null)}
${row("AI classification", incident.classification.replaceAll("_", " "))}
${row("AI description", incident.description)}
${row("AI uncertainty", incident.uncertainty)}
${row("Recording interval", `${formatDateTime(incident.detection.recordingStartAt)} – ${formatDateTime(incident.detection.recordingEndAt)} UTC`)}
</table>

<h2>Evidence</h2>
${evidence ? `<div class="grid">${evidence}</div>` : "<p>No evidence frames were stored for this incident.</p>"}

<h2>AI site checks</h2>
${siteChecks ? `<p>Automated re-examination of recent footage from the case camera. These are AI leads, not findings.</p><ul>${siteChecks}</ul>` : "<p>No AI site check has been completed for this case.</p>"}

<h2>Review history</h2>
${reviews ? `<ul>${reviews}</ul>` : "<p>No review decisions recorded.</p>"}

<h2>Audit trail</h2>
<table>
<tr><th>When</th><th>Who</th><th>Action</th></tr>
${events}
</table>
</body>
</html>
`;
}
