import { authenticatedClient } from "../../_lib/data";
import type {
  CleanupCase,
  CleanupHistoryItem,
  CleanupStatus,
  CleanupTeam,
  CleanupWorkspaceData,
  ResolutionOutcome,
} from "../_lib/types";

type ActorRow = { id: string; email: string | null };

export async function getCleanupWorkspaceData(): Promise<CleanupWorkspaceData> {
  const { supabase, user } = await authenticatedClient();
  const [casesResult, teamsResult, actorsResult] = await Promise.all([
    supabase
      .from("cleanup_cases")
      .select(
        "id,incident_id,status,assigned_team_id,assigned_at,sla_hours,due_at,instructions,completion_report,resolution_outcome,resolution_notes,started_at,resolved_at,resolved_by,reconciliation_required,created_at,updated_at",
      ),
    supabase
      .from("cleanup_teams")
      .select("id,name,active,created_at")
      .order("name"),
    supabase.rpc("list_cleanup_assignees"),
  ]);
  const workspaceError = casesResult.error ?? teamsResult.error;
  if (workspaceError) {
    throw new Error(
      `Unable to load cleanup workspace: ${workspaceError.message}`,
    );
  }
  if (actorsResult.error) {
    throw new Error(
      `Unable to load cleanup activity actors: ${actorsResult.error.message}`,
    );
  }

  const teams: CleanupTeam[] = (teamsResult.data ?? []).map((team) => ({
    id: team.id,
    name: team.name,
    active: team.active,
  }));
  const caseRows = casesResult.data ?? [];
  if (!caseRows.length) {
    return { cases: [], teams, referenceTime: new Date().toISOString() };
  }

  const incidentIds = caseRows.map((item) => item.incident_id);
  const caseIds = caseRows.map((item) => item.id);
  const [incidentsResult, historyResult] = await Promise.all([
    supabase
      .from("incidents")
      .select(
        "id,detection_id,description,occurred_at,created_at,latitude,longitude,location_source",
      )
      .in("id", incidentIds),
    supabase
      .from("cleanup_case_history")
      .select(
        "id,cleanup_case_id,actor_id,event_type,previous_status,new_status,notes,created_at",
      )
      .in("cleanup_case_id", caseIds)
      .order("created_at", { ascending: false }),
  ]);
  if (incidentsResult.error || historyResult.error) {
    throw new Error(
      `Unable to load cleanup details: ${incidentsResult.error?.message ?? historyResult.error?.message}`,
    );
  }

  const incidents = incidentsResult.data ?? [];
  const detectionIds = incidents.map((item) => item.detection_id);
  const { data: detections, error: detectionsError } = await supabase
    .from("detections")
    .select("id,camera_id")
    .in("id", detectionIds);
  if (detectionsError) {
    throw new Error(
      `Unable to load cleanup cameras: ${detectionsError.message}`,
    );
  }
  const cameraIds = [
    ...new Set((detections ?? []).map((item) => item.camera_id)),
  ];
  const { data: cameras, error: camerasError } = await supabase
    .from("cameras")
    .select("id,name")
    .in("id", cameraIds);
  if (camerasError) {
    throw new Error(
      `Unable to load cleanup locations: ${camerasError.message}`,
    );
  }

  const actors = mapActors(actorsResult.data as ActorRow[], user.id);
  const people = new Map(actors.map((person) => [person.id, person.label]));
  const teamNames = new Map(teams.map((team) => [team.id, team.name]));
  const incidentMap = new Map(incidents.map((item) => [item.id, item]));
  const detectionMap = new Map(
    (detections ?? []).map((item) => [item.id, item.camera_id]),
  );
  const cameraMap = new Map(
    (cameras ?? []).map((item) => [item.id, item.name]),
  );
  const historyMap = new Map<string, CleanupHistoryItem[]>();
  for (const event of historyResult.data ?? []) {
    const history = historyMap.get(event.cleanup_case_id) ?? [];
    history.push({
      id: event.id,
      actorId: event.actor_id,
      actorLabel: event.actor_id
        ? (people.get(event.actor_id) ??
          `Operator ${event.actor_id.slice(0, 8)}`)
        : "System",
      eventType: event.event_type,
      previousStatus: event.previous_status as CleanupStatus | null,
      newStatus: event.new_status as CleanupStatus | null,
      notes: event.notes,
      createdAt: event.created_at,
    });
    historyMap.set(event.cleanup_case_id, history);
  }

  const cases = caseRows.flatMap((row): CleanupCase[] => {
    const incident = incidentMap.get(row.incident_id);
    if (!incident) return [];
    const cameraId = detectionMap.get(incident.detection_id);
    return [
      {
        id: row.id,
        incidentId: row.incident_id,
        status: row.status as CleanupStatus,
        assignedTeamId: row.assigned_team_id,
        assignedTeamName: row.assigned_team_id
          ? (teamNames.get(row.assigned_team_id) ?? "Unknown cleanup team")
          : null,
        assignedAt: row.assigned_at,
        slaHours: row.sla_hours as 24 | 48 | 72 | null,
        dueAt: row.due_at,
        instructions: row.instructions,
        completionReport: row.completion_report,
        resolutionOutcome: row.resolution_outcome as ResolutionOutcome | null,
        resolutionNotes: row.resolution_notes,
        startedAt: row.started_at,
        resolvedAt: row.resolved_at,
        resolverLabel: row.resolved_by
          ? (people.get(row.resolved_by) ??
            `Operator ${row.resolved_by.slice(0, 8)}`)
          : null,
        reconciliationRequired: row.reconciliation_required,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        incident: {
          description: incident.description,
          occurredAt: incident.occurred_at,
          createdAt: incident.created_at,
          latitude: incident.latitude,
          longitude: incident.longitude,
          locationSource: incident.location_source as "real" | "simulated",
          cameraName: cameraId
            ? (cameraMap.get(cameraId) ?? "Unknown camera")
            : "Unknown camera",
        },
        history: historyMap.get(row.id) ?? [],
      },
    ];
  });
  return { cases, teams, referenceTime: new Date().toISOString() };
}

function mapActors(rows: ActorRow[], currentUserId: string) {
  return rows.map((row) => ({
    id: row.id,
    label:
      row.id === currentUserId
        ? `${row.email ?? "Current operator"} (you)`
        : (row.email ?? `Operator ${row.id.slice(0, 8)}`),
  }));
}
