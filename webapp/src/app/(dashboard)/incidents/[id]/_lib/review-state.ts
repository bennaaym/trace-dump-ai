import type { ReviewStatus } from "../../../_lib/types";

export type ReviewDecision = Exclude<ReviewStatus, "pending_review">;

export function reviewState(status: ReviewStatus) {
  const isPending = status === "pending_review";
  const isInvestigating = status === "needs_investigation";
  const isTerminal = status === "confirmed" || status === "dismissed";
  const allDecisions: ReviewDecision[] = [
    "confirmed",
    "dismissed",
    "needs_investigation",
  ];
  const choices = isPending
    ? allDecisions
    : isInvestigating
      ? allDecisions.filter((decision) => decision !== "needs_investigation")
      : allDecisions.filter((decision) => decision !== status);

  return {
    isPending,
    isInvestigating,
    isTerminal,
    reasonRequired: !isPending,
    choices,
  };
}
