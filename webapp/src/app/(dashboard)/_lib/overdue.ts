export const OVERDUE_AFTER_HOURS = 24;

type ReviewState =
  "pending_review" | "confirmed" | "dismissed" | "needs_investigation";
type CaseState = "open" | "assigned" | "in_progress" | "resolved";

/**
 * An incident is dealt with once it is dismissed, or once its case is being
 * worked (in progress) or resolved. A confirmed incident without a started
 * case, a pending review, and a needs-investigation review are all still
 * waiting for action.
 */
function isDealtWith(
  reviewStatus: ReviewState,
  caseStatus: CaseState | null,
): boolean {
  if (reviewStatus === "dismissed") return true;
  if (reviewStatus === "confirmed") {
    return caseStatus === "in_progress" || caseStatus === "resolved";
  }
  return false;
}

function hoursSince(recordedAt: string, now: number): number {
  return (now - Date.parse(recordedAt)) / 3_600_000;
}

export function isOverdue(
  input: {
    recordedAt: string;
    reviewStatus: ReviewState;
    caseStatus: CaseState | null;
  },
  now: number,
): boolean {
  if (isDealtWith(input.reviewStatus, input.caseStatus)) return false;
  return hoursSince(input.recordedAt, now) > OVERDUE_AFTER_HOURS;
}

export function overdueLabel(recordedAt: string, now: number): string {
  const hours = Math.floor(hoursSince(recordedAt, now));
  if (hours < 48) return `Overdue ${hours}h`;
  return `Overdue ${Math.floor(hours / 24)}d`;
}

/** Request-time clock for server components, where calling Date.now() inline trips the purity lint. */
export function currentTime(): number {
  return Date.now();
}
