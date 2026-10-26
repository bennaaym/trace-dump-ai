import type { ReviewStatus } from "../../../_lib/types";

type ReviewDecision = Exclude<ReviewStatus, "pending_review">;
export type ReviewChoice = Exclude<ReviewDecision, "needs_investigation">;

export function reviewState(status: ReviewStatus) {
  const isPending = status === "pending_review";
  const isInvestigating = status === "needs_investigation";
  const isTerminal = status === "confirmed" || status === "dismissed";
  const allDecisions: ReviewChoice[] = ["confirmed", "dismissed"];
  const choices =
    isPending || isInvestigating
      ? allDecisions
      : allDecisions.filter((decision) => decision !== status);

  return {
    isPending,
    isInvestigating,
    isTerminal,
    reasonRequired: !isPending,
    choices,
  };
}
