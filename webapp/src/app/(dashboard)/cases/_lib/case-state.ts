export type CaseStatus = "open" | "assigned" | "in_progress" | "resolved";
export type CaseNextAction =
  "cleanup" | "further_investigation" | "enforcement_referral";
export type CaseEventType =
  | "case_opened"
  | "assignment_updated"
  | "status_changed"
  | "incident_review_changed"
  | "report_generated"
  | "site_check_completed";

export type SiteCheckResult = "still_present" | "cleared" | "uncertain";

export const CASE_STATUSES: readonly CaseStatus[] = [
  "open",
  "assigned",
  "in_progress",
  "resolved",
];
export const CASE_NEXT_ACTIONS: readonly CaseNextAction[] = [
  "cleanup",
  "further_investigation",
  "enforcement_referral",
];

export function caseStatusLabel(value: CaseStatus): string {
  return {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In progress",
    resolved: "Resolved",
  }[value];
}

export function siteCheckLabel(value: SiteCheckResult): string {
  return {
    still_present: "Waste still visible",
    cleared: "Looks cleared",
    uncertain: "Inconclusive",
  }[value];
}

export function nextActionLabel(value: CaseNextAction): string {
  return {
    cleanup: "Cleanup",
    further_investigation: "Further investigation",
    enforcement_referral: "Enforcement referral",
  }[value];
}

/** The only status an operator can advance a case to, with the label for the button. */
export function nextStatus(
  status: CaseStatus,
): { to: "in_progress" | "resolved"; label: string } | null {
  if (status === "assigned") return { to: "in_progress", label: "Start work" };
  if (status === "in_progress") {
    return { to: "resolved", label: "Resolve case" };
  }
  return null;
}

export function caseEventLabel(
  type: CaseEventType,
  details: Record<string, unknown>,
): string {
  switch (type) {
    case "case_opened":
      return "Case opened after the incident was confirmed";
    case "assignment_updated":
      return details.previous_owner_id
        ? "Owner or next action changed"
        : "Owner assigned and next action chosen";
    case "status_changed":
      return "Status changed";
    case "incident_review_changed":
      return `Incident review changed to ${String(details.decision ?? "a new decision").replaceAll("_", " ")}`;
    case "report_generated":
      return "Case report downloaded";
    case "site_check_completed":
      return details.result === "cleared"
        ? "AI site check: looks cleared"
        : details.result === "still_present"
          ? "AI site check: waste still visible"
          : "AI site check: inconclusive";
  }
}
