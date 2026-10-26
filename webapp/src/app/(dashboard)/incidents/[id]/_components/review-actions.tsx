"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, CircleOff, RotateCcw, SearchCheck } from "lucide-react";
import { useAction } from "next-safe-action/hooks";

import { formatDateTime, reviewStatusLabel } from "../../../_lib/format";
import type { IncidentDetail } from "../../../_lib/types";
import { ReviewStatusBadge } from "../../_components/incident-status";
import { reviewIncidentAction } from "../_actions/review";
import { reviewState, type ReviewChoice } from "../_lib/review-state";
import { incidentWorkspaceHref } from "../_lib/workspace-navigation";

type Decision = ReviewChoice;

export function ReviewActions({ incident }: { incident: IncidentDetail }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const latestReview = incident.reviews[0];
  const status = incident.reviewStatus;
  const { isPending, isInvestigating, isTerminal, reasonRequired, choices } =
    reviewState(status);
  const [editing, setEditing] = useState(!isTerminal);
  const [selected, setSelected] = useState<Decision | null>(null);
  const [notes, setNotes] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const action = useAction(reviewIncidentAction);

  async function submitReview() {
    if (!selected || (reasonRequired && !notes.trim())) return;
    setActionError(null);
    const response = await action.executeAsync({
      incidentId: incident.id,
      expectedStatus: status,
      decision: selected,
      notes,
    });
    if (response?.data?.success) {
      setSelected(null);
      setNotes("");
      setEditing(false);
      router.refresh();
      return;
    }
    if (response?.data?.error) {
      setActionError(response.data.error);
      if (response.data.error.includes("Another operator")) router.refresh();
    }
  }

  const message = actionError
    ? actionError
    : action.result.validationErrors
      ? "Check the review reason and selected decision."
      : action.result.serverError;

  function openReviewHistory() {
    router.replace(
      incidentWorkspaceHref(pathname, searchParams.toString(), "history"),
      { scroll: false },
    );
  }

  return (
    <aside
      className="surface h-fit p-5 xl:sticky xl:top-20"
      aria-label="Operator review"
    >
      <div className="flex items-center gap-2">
        <SearchCheck className="size-5 text-teal-600" />
        <h2 className="font-heading text-sm font-bold">Operator review</h2>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Current state</span>
        <ReviewStatusBadge value={status} />
      </div>
      <button
        type="button"
        onClick={openReviewHistory}
        className="mt-2 text-xs font-semibold text-teal-700 hover:text-teal-900"
      >
        See review history
      </button>

      {isInvestigating && (
        <p className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
          This incident needs further investigation. An operator may record a
          subsequent confirmed or dismissed decision when the review is
          complete.
        </p>
      )}

      {!isPending && <LatestReview review={latestReview} />}

      {isTerminal && !editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RotateCcw className="size-4" />
          Change decision or reopen review
        </button>
      )}

      {editing && (
        <div className="mt-4 border-t pt-4">
          <label
            className="text-xs font-semibold text-slate-700"
            htmlFor="review-notes"
          >
            {reasonRequired ? "Reason for change" : "Review notes (optional)"}
          </label>
          <textarea
            id="review-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            maxLength={2000}
            required={reasonRequired}
            placeholder={
              reasonRequired
                ? "Explain why the existing review decision should change..."
                : "Add optional review notes..."
            }
            className="mt-2 min-h-24 w-full resize-y rounded-lg border p-3 text-sm"
          />
          <div className="mt-3 grid gap-2">
            {choices.map((decision) => (
              <DecisionButton
                key={decision}
                decision={decision}
                onSelect={() => setSelected(decision)}
              />
            ))}
          </div>
          {isTerminal && (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setSelected(null);
                setNotes("");
              }}
              className="mt-3 w-full text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Cancel change
            </button>
          )}
        </div>
      )}

      {selected && (
        <div
          role="alertdialog"
          aria-labelledby="review-confirmation-title"
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950"
        >
          <strong id="review-confirmation-title">
            Record “{reviewStatusLabel(selected)}”?
          </strong>
          <p className="mt-1 leading-5">
            This appends a new immutable audit record. Previous review history
            is preserved.
          </p>
          {reasonRequired && !notes.trim() && (
            <p className="mt-2 font-semibold text-red-700">
              Enter a reason before confirming this change.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button
              disabled={action.isPending || (reasonRequired && !notes.trim())}
              onClick={submitReview}
              className="rounded bg-slate-900 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
            >
              {action.isPending ? "Saving..." : "Confirm decision"}
            </button>
            <button
              type="button"
              disabled={action.isPending}
              onClick={() => setSelected(null)}
              className="rounded border bg-white px-3 py-1.5 font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700"
        >
          {message}
        </p>
      )}
    </aside>
  );
}

function LatestReview({
  review,
}: {
  review: IncidentDetail["reviews"][number] | undefined;
}) {
  if (!review) {
    return (
      <p className="mt-4 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
        The current state has no visible review audit record.
      </p>
    );
  }
  return (
    <section
      className="mt-4 rounded-lg border bg-slate-50 p-3"
      aria-label="Latest review"
    >
      <p className="text-[10px] font-bold tracking-wide text-slate-500 uppercase">
        Latest review
      </p>
      <dl className="mt-2 grid grid-cols-[70px_1fr] gap-y-2 text-xs">
        <dt className="text-slate-500">Decision</dt>
        <dd className="font-semibold">{reviewStatusLabel(review.decision)}</dd>
        <dt className="text-slate-500">Reviewer</dt>
        <dd className="break-words">{review.reviewerLabel}</dd>
        <dt className="text-slate-500">Date</dt>
        <dd>{formatDateTime(review.createdAt)}</dd>
        <dt className="text-slate-500">Notes</dt>
        <dd className="leading-5">{review.notes || "No notes supplied."}</dd>
      </dl>
    </section>
  );
}

function DecisionButton({
  decision,
  onSelect,
}: {
  decision: Decision;
  onSelect: () => void;
}) {
  const styles = {
    confirmed: "bg-green-600 text-white hover:bg-green-700",
    dismissed: "bg-red-500 text-white hover:bg-red-600",
  }[decision];
  const Icon = decision === "confirmed" ? CheckCircle2 : CircleOff;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-lg px-3 py-2 text-xs font-semibold ${styles}`}
    >
      <Icon className="mr-1.5 inline size-4" />
      {decision === "confirmed" ? "Confirm" : "Dismiss"}
    </button>
  );
}
