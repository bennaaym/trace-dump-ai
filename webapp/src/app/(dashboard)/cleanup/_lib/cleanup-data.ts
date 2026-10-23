import type {
  CleanupCase,
  CleanupHistoryItem,
  CleanupStatus,
  CleanupTeam,
} from "./types";

export interface VisibleCleanupActivity {
  id: string;
  label: string;
  actorLabel: string;
  createdAt: string;
  detail: string | null;
}

export function isCleanupOverdue(
  cleanupCase: Pick<CleanupCase, "dueAt" | "status">,
  referenceTime: string,
) {
  return (
    cleanupCase.status !== "resolved" &&
    cleanupCase.dueAt != null &&
    Date.parse(cleanupCase.dueAt) < Date.parse(referenceTime)
  );
}

export function calculateCleanupDueAt(
  assignedAt: string | null,
  slaHours: 24 | 48 | 72,
) {
  if (!assignedAt) return null;
  return new Date(Date.parse(assignedAt) + slaHours * 3_600_000).toISOString();
}

export function selectableCleanupTeams(
  teams: CleanupTeam[],
  assignedTeamId: string | null,
) {
  return teams.filter((team) => team.active || team.id === assignedTeamId);
}

export function cleanupKpis(cases: CleanupCase[], referenceTime: string) {
  return {
    awaiting: cases.filter((item) => item.status === "awaiting_cleanup").length,
    inProgress: cases.filter((item) => item.status === "in_progress").length,
    verification: cases.filter((item) => item.status === "verification").length,
    overdue: cases.filter((item) => isCleanupOverdue(item, referenceTime))
      .length,
  };
}

export function filterCleanupCases(
  cases: CleanupCase[],
  filters: {
    query: string;
    status: "all" | CleanupStatus;
  },
) {
  const needle = filters.query.trim().toLocaleLowerCase();
  return cases.filter((item) => {
    const searchable = [
      item.id,
      item.incidentId,
      item.incident.cameraName,
      item.incident.description,
      item.assignedTeamName ?? "unassigned",
    ]
      .join(" ")
      .toLocaleLowerCase();
    return (
      (!needle || searchable.includes(needle)) &&
      (filters.status === "all" || item.status === filters.status)
    );
  });
}

export function sortCleanupCases(cases: CleanupCase[], referenceTime: string) {
  const rank = (item: CleanupCase) => {
    if (isCleanupOverdue(item, referenceTime)) return 0;
    if (item.status === "verification") return 1;
    if (item.status !== "resolved") return 2;
    return 3;
  };
  return [...cases].sort((left, right) => {
    const rankDifference = rank(left) - rank(right);
    if (rankDifference) return rankDifference;
    if (rank(left) === 2) {
      const leftDue = left.dueAt ? Date.parse(left.dueAt) : Number.MAX_VALUE;
      const rightDue = right.dueAt ? Date.parse(right.dueAt) : Number.MAX_VALUE;
      if (leftDue !== rightDue) return leftDue - rightDue;
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export function cleanupStatusLabel(status: CleanupStatus) {
  return {
    awaiting_cleanup: "Awaiting Cleanup",
    in_progress: "In Progress",
    verification: "Pending Verification",
    resolved: "Resolved",
  }[status];
}

export function cleanupOutcomeLabel(outcome: CleanupCase["resolutionOutcome"]) {
  if (!outcome) return null;
  return outcome === "cleanup_completed"
    ? "Cleanup Completed"
    : "Site Already Cleared";
}

export function buildVisibleCleanupActivity(
  history: CleanupHistoryItem[],
): VisibleCleanupActivity[] {
  const groups: CleanupHistoryItem[][] = [];
  for (const event of history) {
    const group = groups.at(-1);
    const first = group?.[0];
    if (
      group &&
      first &&
      Math.abs(Date.parse(first.createdAt) - Date.parse(event.createdAt)) <=
        5_000
    ) {
      group.push(event);
    } else {
      groups.push([event]);
    }
  }

  return groups.flatMap((group) => {
    const types = new Set(group.map((event) => event.eventType));
    if (
      types.has("team_assignment") &&
      group.some(
        (event) =>
          event.eventType === "status_transition" &&
          event.newStatus === "in_progress",
      )
    ) {
      return [
        visibleActivity(group, "Cleanup assigned and started"),
        ...mapRemainingActivity(group, [
          "team_assignment",
          "sla_change",
          "instructions",
          "status_transition",
        ]),
      ];
    }
    if (types.has("verification_completed") && types.has("resolution")) {
      return [
        visibleActivity(group, "Cleanup verified and resolved"),
        ...mapRemainingActivity(group, [
          "verification_completed",
          "resolution",
        ]),
      ];
    }
    if (types.has("verification_rejected") && types.has("reopened")) {
      const rejection = group.find(
        (event) => event.eventType === "verification_rejected",
      );
      return [
        visibleActivity(
          group,
          "Verification rejected — cleanup reopened",
          rejection?.notes ?? null,
        ),
        ...mapRemainingActivity(group, ["verification_rejected", "reopened"]),
      ];
    }
    return group.map((event) =>
      visibleActivity(
        [event],
        activityLabel(event),
        ["note", "verification_rejected"].includes(event.eventType)
          ? event.notes
          : null,
      ),
    );
  });
}

function mapRemainingActivity(
  group: CleanupHistoryItem[],
  groupedTypes: string[],
) {
  return group
    .filter((event) => !groupedTypes.includes(event.eventType))
    .map((event) =>
      visibleActivity(
        [event],
        activityLabel(event),
        event.eventType === "note" ? event.notes : null,
      ),
    );
}

function visibleActivity(
  events: CleanupHistoryItem[],
  label: string,
  detail: string | null = null,
): VisibleCleanupActivity {
  const event = events[0];
  if (!event) throw new Error("An activity requires at least one audit event.");
  return {
    id: events.map((item) => item.id).join(":"),
    label,
    actorLabel: event.actorLabel,
    createdAt: event.createdAt,
    detail,
  };
}

function activityLabel(event: CleanupHistoryItem) {
  if (
    event.eventType === "status_transition" &&
    event.newStatus === "verification"
  ) {
    return "Submitted for verification";
  }
  return (
    {
      creation: "Case created",
      assignment: "Assignment updated",
      team_assignment: "Cleanup team changed",
      sla_change: "Resolution time updated",
      deadline_change: "Resolution deadline updated",
      priority_change: "Priority updated",
      status_transition: "Cleanup started",
      cleanup_marked_complete: "Site marked cleaned",
      verification_completed: "Cleanup verified",
      verification_rejected: "Verification rejected",
      reopened: "Case reopened",
      resolution: "Case resolved",
      note: "Note added",
      instructions: "Instructions updated",
      reconciliation_required: "Reconciliation required",
    }[event.eventType] ?? "Case updated"
  );
}
