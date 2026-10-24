"use client";
import { useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import type { IncidentDetail } from "../../../_lib/types";
import { assessPriority, type Priority } from "../_lib/priority";
import { setPriorityAction } from "../_actions/priority";
import { LocalDateTime } from "./local-date-time";
export function IncidentPriority({ incident }: { incident: IncidentDetail }) {
  const duration =
    (Date.parse(incident.detection.recordingEndAt) -
      Date.parse(incident.detection.recordingStartAt)) /
    1000;
  const assessment = assessPriority(
    incident.analysis.investigationResponseText,
    duration,
  );
  const history = incident.priorityHistory ?? [];
  const latest = history[0];
  const level = latest?.level ?? assessment.level;
  const [selected, setSelected] = useState(latest?.level ?? "automatic");
  const [reason, setReason] = useState("");
  const action = useAction(setPriorityAction);
  const error =
    action.result.serverError ||
    action.result.data?.error ||
    (action.result.validationErrors
      ? "Select a priority and enter a reason (up to 1000 characters)."
      : null);
  return (
    <section
      aria-label="Incident priority"
      className="rounded-xl border bg-white p-4"
    >
      <h3 className="text-sm font-bold">
        Incident priority:{" "}
        <span
          className={
            level === "high"
              ? "text-red-700"
              : level === "medium"
                ? "text-amber-700"
                : "text-slate-700"
          }
        >
          {level.toUpperCase()}
        </span>
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        {latest?.level ? "Reviewer adjustment" : "Automatic assessment"}.
        Priority helps order review; it does not confirm dumping.
      </p>
      {latest?.level && (
        <p className="mt-2 text-xs">Reviewer reason: {latest.reason}</p>
      )}
      <p className="mt-3 text-xs font-semibold">
        Automatic: {assessment.level.toUpperCase()}
      </p>
      <ul className="mt-1 list-disc pl-4 text-xs">
        {assessment.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer font-semibold">
          Observable risk factors
        </summary>
        <ul className="mt-2 space-y-2">
          {assessment.factors.map((f) => (
            <li key={f.key}>
              <strong>
                {f.label}: {f.status}
              </strong>
              <p className="text-slate-600">
                {f.evidence || "Not reliably assessed in this analysis."}
              </p>
              {f.offset != null && (
                <Link
                  className="text-teal-700 underline"
                  href={`/incidents/${incident.id}?tab=overview&seek=${f.offset}`}
                >
                  View supporting moment ({f.offset.toFixed(1)}s)
                </Link>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-slate-500">
          High: obstruction, smoke or leakage. Medium: large/scattered material
          or near an entrance/crossing. Low: all factors absent. Otherwise
          unknown. Rules: {assessment.ruleVersion}. Findings are AI-reported and
          require review.
        </p>
      </details>
      {incident.priorityAdjustmentsAvailable ? (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            action.execute({
              incidentId: incident.id,
              level:
                selected === "automatic"
                  ? null
                  : (selected as Exclude<Priority, "unknown">),
              reason,
              expectedId: latest?.id ?? null,
            });
          }}
        >
          <label
            className="block text-xs font-semibold"
            htmlFor="priority-level"
          >
            Reviewer priority
          </label>
          <select
            id="priority-level"
            className="w-full rounded border p-2 text-xs"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="automatic">Use automatic assessment</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <label className="block text-xs" htmlFor="priority-reason">
            Reason for adjustment
          </label>
          <textarea
            id="priority-reason"
            className="w-full rounded border p-2 text-xs"
            required
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            className="rounded bg-teal-700 px-3 py-2 text-xs text-white disabled:opacity-50"
            disabled={action.isPending}
          >
            {action.isPending ? "Saving..." : "Save priority"}
          </button>
          {error && (
            <p role="alert" className="text-xs text-red-700">
              {error}
            </p>
          )}
          {action.result.data && !error && (
            <p role="status" className="text-xs text-teal-700">
              Priority adjustment saved.
            </p>
          )}
        </form>
      ) : (
        <p className="mt-3 text-xs text-slate-500">
          Reviewer adjustments unavailable until the priority database migration
          is applied.
        </p>
      )}
      {history.length > 0 && (
        <details className="mt-3 text-xs">
          <summary>Priority adjustment history</summary>
          <ol className="mt-2 space-y-2">
            {history.map((h) => (
              <li key={h.id}>
                <strong>{h.level?.toUpperCase() ?? "AUTOMATIC"}</strong>:{" "}
                {h.reason}
                <p className="text-slate-500">
                  <LocalDateTime value={h.createdAt} /> |{" "}
                  {h.reviewerId === incident.viewer.id
                    ? "You"
                    : `Operator ${h.reviewerId.slice(0, 8)}`}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
