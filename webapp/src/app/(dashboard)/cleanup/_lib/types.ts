export type CleanupStatus =
  "awaiting_cleanup" | "in_progress" | "verification" | "resolved";
export type ResolutionOutcome = "cleanup_completed" | "site_already_cleared";

export interface CleanupTeam {
  id: string;
  name: string;
  active: boolean;
}

export interface CleanupHistoryItem {
  id: string;
  actorId: string | null;
  actorLabel: string;
  eventType: string;
  previousStatus: CleanupStatus | null;
  newStatus: CleanupStatus | null;
  notes: string | null;
  createdAt: string;
}

export interface CleanupCase {
  id: string;
  incidentId: string;
  status: CleanupStatus;
  assignedTeamId: string | null;
  assignedTeamName: string | null;
  assignedAt: string | null;
  slaHours: 24 | 48 | 72 | null;
  dueAt: string | null;
  instructions: string | null;
  completionReport: string | null;
  resolutionOutcome: ResolutionOutcome | null;
  resolutionNotes: string | null;
  startedAt: string | null;
  resolvedAt: string | null;
  resolverLabel: string | null;
  reconciliationRequired: boolean;
  createdAt: string;
  updatedAt: string;
  incident: {
    description: string;
    occurredAt: string | null;
    createdAt: string;
    latitude: number | null;
    longitude: number | null;
    locationSource: "real" | "simulated";
    cameraName: string;
  };
  history: CleanupHistoryItem[];
}

export interface CleanupWorkspaceData {
  cases: CleanupCase[];
  teams: CleanupTeam[];
  referenceTime: string;
}
