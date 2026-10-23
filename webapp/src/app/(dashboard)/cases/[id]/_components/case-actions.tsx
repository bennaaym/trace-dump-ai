"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAction } from "next-safe-action/hooks";

import {
  CASE_NEXT_ACTIONS,
  nextActionLabel,
  nextStatus,
  type CaseNextAction,
  type CaseStatus,
} from "../../_lib/case-state";
import { advanceCaseAction, assignCaseAction } from "../_actions/case";

interface Props {
  caseId: string;
  status: CaseStatus;
  ownerId: string | null;
  nextAction: CaseNextAction | null;
  assignees: Array<{ id: string; email: string }>;
}

const field =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";
const primary =
  "bg-primary rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-50";

export function CaseActions({
  caseId,
  status,
  ownerId,
  nextAction,
  assignees,
}: Props) {
  const router = useRouter();
  const [owner, setOwner] = useState(ownerId ?? "");
  const [action, setAction] = useState<CaseNextAction | "">(nextAction ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const assign = useAction(assignCaseAction);
  const advance = useAction(advanceCaseAction);
  const step = nextStatus(status);
  const changed = owner !== (ownerId ?? "") || action !== (nextAction ?? "");

  async function submitAssignment() {
    if (!owner || !action) return;
    setError(null);
    const response = await assign.executeAsync({
      caseId,
      expectedStatus: status,
      ownerId: owner,
      nextAction: action,
    });
    if (response?.data?.success) return router.refresh();
    setError(
      response?.data?.error ??
        response?.serverError ??
        "Check the owner and next action.",
    );
    if (response?.data?.error?.includes("Another operator")) router.refresh();
  }

  async function submitAdvance() {
    if (!step) return;
    setError(null);
    const response = await advance.executeAsync({
      caseId,
      expectedStatus: status,
      toStatus: step.to,
      notes,
    });
    if (response?.data?.success) {
      setNotes("");
      return router.refresh();
    }
    setError(
      response?.data?.error ??
        response?.serverError ??
        "Resolution notes are required.",
    );
    if (response?.data?.error?.includes("Another operator")) router.refresh();
  }

  const busy = assign.isPending || advance.isPending;

  return (
    <section className="surface space-y-5 p-4" aria-label="Case actions">
      {status !== "resolved" && (
        <div className="space-y-3">
          <h2 className="font-heading text-sm font-bold text-slate-900">
            Owner and next action
          </h2>
          <label className="block text-xs font-semibold text-slate-600">
            Owner
            <select
              className={`${field} mt-1`}
              value={owner}
              onChange={(event) => setOwner(event.target.value)}
            >
              <option value="">Choose an operator…</option>
              {assignees.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.email}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold text-slate-600">
            Next action
            <select
              className={`${field} mt-1`}
              value={action}
              onChange={(event) =>
                setAction(event.target.value as CaseNextAction | "")
              }
            >
              <option value="">Choose an action…</option>
              {CASE_NEXT_ACTIONS.map((item) => (
                <option key={item} value={item}>
                  {nextActionLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={primary}
            disabled={busy || !owner || !action || !changed}
            onClick={submitAssignment}
          >
            {status === "open" ? "Assign case" : "Update assignment"}
          </button>
        </div>
      )}

      {step && (
        <div className="space-y-3 border-t pt-4">
          <h2 className="font-heading text-sm font-bold text-slate-900">
            Progress
          </h2>
          {step.to === "resolved" && (
            <label className="block text-xs font-semibold text-slate-600">
              Resolution notes (required)
              <textarea
                className={`${field} mt-1 min-h-24`}
                maxLength={2000}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="What was done, and what was the outcome?"
              />
            </label>
          )}
          <button
            type="button"
            className={primary}
            disabled={busy || (step.to === "resolved" && !notes.trim())}
            onClick={submitAdvance}
          >
            {step.label}
          </button>
        </div>
      )}

      {status === "open" && !step && (
        <p className="text-xs text-slate-500">
          Assign an owner and a next action to move this case forward.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
