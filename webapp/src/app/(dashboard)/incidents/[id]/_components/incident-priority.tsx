"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import type { IncidentDetail } from "../../../_lib/types";
import { assessPriority, type Priority } from "../_lib/priority";
import { setPriorityAction } from "../_actions/priority";
export function IncidentPriority({ incident }: { incident: IncidentDetail }) {
  const router = useRouter();
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
  const automaticReason =
    assessment.factors.find((factor) => factor.label === assessment.reasons[0])
      ?.evidence ?? assessment.reasons[0];
  const displayReason = latest?.level ? latest.reason : automaticReason;
  const [selected, setSelected] = useState(latest?.level ?? "automatic");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const action = useAction(setPriorityAction);
  const error =
    action.result.serverError ||
    action.result.data?.error ||
    (action.result.validationErrors
      ? "Select a priority and enter a reason (up to 1000 characters)."
      : null);
  if (level === "unknown") return null;

  return (
    <section
      aria-label="Incident priority"
      className="rounded-xl border bg-white p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">
          Priority Level:{" "}
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
        {incident.priorityAdjustmentsAvailable && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold text-teal-700 hover:bg-teal-50"
          >
            Edit priority
          </button>
        )}
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">
        <span className="font-semibold text-slate-800">Reason:</span>{" "}
        {displayReason ?? "No reason available."}
      </p>
      {incident.priorityAdjustmentsAvailable && editing ? (
        <form
          className="mt-4 space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await action.executeAsync({
              incidentId: incident.id,
              level:
                selected === "automatic"
                  ? null
                  : (selected as Exclude<Priority, "unknown">),
              reason,
              expectedId: latest?.id ?? null,
            });
            if (result?.data && !result.data.error) {
              setEditing(false);
              setReason("");
              router.refresh();
            }
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
          <div className="flex items-center gap-2">
            <button
              className="rounded bg-teal-700 px-3 py-2 text-xs text-white disabled:opacity-50"
              disabled={action.isPending}
            >
              {action.isPending ? "Saving..." : "Save priority"}
            </button>
            <button
              type="button"
              disabled={action.isPending}
              onClick={() => {
                setSelected(latest?.level ?? "automatic");
                setReason("");
                setEditing(false);
              }}
              className="rounded border px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
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
      ) : null}
    </section>
  );
}
