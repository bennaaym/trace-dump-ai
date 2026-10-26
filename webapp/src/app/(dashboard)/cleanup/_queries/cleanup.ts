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
        "id,incident_id,status,assigned_team_id,assigned_at,sla_hours,due_at,instructions,completion_report,resolution_outcome,resolution_notes,resolution_source,started_at,resolved_at,resolved_by,reconciliation_required,created_at,updated_at",
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
  const [incidentsResult, historyResult, checksResult, notificationsResult] =
    await Promise.all([
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
      supabase
        .from("cleanup_scene_checks")
        .select(
          "id,cleanup_case_id,trigger_kind,scheduled_for,status,assessment,confidence,cleanup_score,summary,reported_waste,reported_location,current_observation,key_changes,current_waste_visible,raw_response,follow_up_source,gateway_input_limitations,comparison_reasoning,grounded_observations,limitations,object_region_observable,camera_reference_matched,snapshot_storage_path,captured_at,source_timestamp,analysis_completed_at,model_id,model_version,hafnia_summary_id,capture_camera_id,error_message,cancellation_requested,created_at",
        )
        .in("cleanup_case_id", caseIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("cleanup_notifications")
        .select(
          "id,cleanup_case_id,kind,title,message,created_at,acknowledged_at",
        )
        .in("cleanup_case_id", caseIds)
        .order("created_at", { ascending: false }),
    ]);
  if (
    incidentsResult.error ||
    historyResult.error ||
    checksResult.error ||
    notificationsResult.error
  ) {
    throw new Error(
      `Unable to load cleanup details: ${incidentsResult.error?.message ?? historyResult.error?.message ?? checksResult.error?.message ?? notificationsResult.error?.message}`,
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
  const [camerasResult, evidenceResult] = await Promise.all([
    supabase.from("cameras").select("id,name").in("id", cameraIds),
    supabase
      .from("evidence")
      .select("incident_id,role,storage_path,captured_at,created_at,metadata")
      .in("incident_id", incidentIds)
      .in("role", ["after", "event", "representative"])
      .order("created_at", { ascending: false }),
  ]);
  if (camerasResult.error || evidenceResult.error) {
    throw new Error(
      `Unable to load cleanup evidence: ${camerasResult.error?.message ?? evidenceResult.error?.message}`,
    );
  }
  const cameras = camerasResult.data;
  const evidenceByIncident = new Map<
    string,
    NonNullable<typeof evidenceResult.data>[number]
  >();
  const sceneReferences = (evidenceResult.data ?? [])
    .filter(isSceneCheckReference)
    .sort((left, right) => {
      const roleDifference =
        sceneReferenceRank(left.role) - sceneReferenceRank(right.role);
      if (roleDifference !== 0) return roleDifference;
      return right.created_at.localeCompare(left.created_at);
    });
  for (const item of sceneReferences) {
    if (!evidenceByIncident.has(item.incident_id)) {
      evidenceByIncident.set(item.incident_id, item);
    }
  }
  const evidencePaths = [...evidenceByIncident.values()].map(
    (item) => item.storage_path,
  );
  const snapshotPaths = (checksResult.data ?? []).flatMap((item) =>
    item.snapshot_storage_path ? [item.snapshot_storage_path] : [],
  );
  const [evidenceUrlsResult, snapshotUrlsResult] = await Promise.all([
    evidencePaths.length
      ? supabase.storage
          .from("incident-evidence")
          .createSignedUrls(evidencePaths, 300)
      : Promise.resolve({ data: [], error: null }),
    snapshotPaths.length
      ? supabase.storage
          .from("cleanup-scene-checks")
          .createSignedUrls(snapshotPaths, 300)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const evidenceUrls = new Map(
    (evidenceUrlsResult.data ?? []).flatMap((item) =>
      item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
  const snapshotUrls = new Map(
    (snapshotUrlsResult.data ?? []).flatMap((item) =>
      item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );

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
  const checksMap = new Map<string, CleanupCase["sceneChecks"]>();
  for (const item of checksResult.data ?? []) {
    const checks = checksMap.get(item.cleanup_case_id) ?? [];
    checks.push({
      id: item.id,
      triggerKind: item.trigger_kind,
      scheduledFor: item.scheduled_for,
      status: item.status,
      assessment: item.assessment,
      confidence: item.confidence,
      cleanupScore: item.cleanup_score,
      summary: item.summary,
      reportedWaste: item.reported_waste,
      reportedLocation: item.reported_location,
      currentObservation: item.current_observation,
      keyChanges: Array.isArray(item.key_changes)
        ? (item.key_changes as string[])
        : [],
      comparisonReasoning: Array.isArray(item.comparison_reasoning)
        ? (item.comparison_reasoning as string[])
        : [],
      groundedObservations: Array.isArray(item.grounded_observations)
        ? (item.grounded_observations as string[])
        : [],
      limitations: Array.isArray(item.limitations)
        ? (item.limitations as string[])
        : [],
      rawResponse:
        item.raw_response &&
        typeof item.raw_response === "object" &&
        !Array.isArray(item.raw_response)
          ? (item.raw_response as Record<string, unknown>)
          : null,
      gatewayInputLimitations: Array.isArray(item.gateway_input_limitations)
        ? (item.gateway_input_limitations as string[])
        : [],
      followUpSource: item.follow_up_source,
      currentWasteVisible: item.current_waste_visible,
      cameraReferenceMatched: item.camera_reference_matched,
      sourceTimestamp: item.source_timestamp,
      snapshotUrl: item.snapshot_storage_path
        ? (snapshotUrls.get(item.snapshot_storage_path) ?? null)
        : null,
      capturedAt: item.captured_at,
      analyzedAt: item.analysis_completed_at,
      modelId: item.model_id,
      modelVersion: item.model_version,
      hafniaSummaryId: item.hafnia_summary_id,
      captureCameraId: item.capture_camera_id,
      errorMessage: item.error_message,
      cancellationRequested: item.cancellation_requested,
    });
    checksMap.set(item.cleanup_case_id, checks);
  }
  const notificationsMap = new Map<string, CleanupCase["notifications"]>();
  for (const item of notificationsResult.data ?? []) {
    const notifications = notificationsMap.get(item.cleanup_case_id) ?? [];
    notifications.push({
      id: item.id,
      kind: item.kind,
      title: item.title,
      message: item.message,
      createdAt: item.created_at,
      acknowledgedAt: item.acknowledged_at,
    });
    notificationsMap.set(item.cleanup_case_id, notifications);
  }

  const cases = caseRows.flatMap((row): CleanupCase[] => {
    const incident = incidentMap.get(row.incident_id);
    if (!incident) return [];
    const cameraId = detectionMap.get(incident.detection_id);
    const originalEvidence = evidenceByIncident.get(row.incident_id);
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
        resolutionSource: row.resolution_source,
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
          originalEvidenceUrl: originalEvidence
            ? (evidenceUrls.get(originalEvidence.storage_path) ?? null)
            : null,
          originalEvidenceCapturedAt:
            originalEvidence?.captured_at ??
            originalEvidence?.created_at ??
            null,
          originalEvidenceRegion:
            originalEvidence?.metadata &&
            typeof originalEvidence.metadata === "object" &&
            !Array.isArray(originalEvidence.metadata) &&
            originalEvidence.metadata.object_region &&
            typeof originalEvidence.metadata.object_region === "object"
              ? (originalEvidence.metadata.object_region as Record<
                  string,
                  unknown
                >)
              : null,
        },
        sceneChecks: checksMap.get(row.id) ?? [],
        notifications: notificationsMap.get(row.id) ?? [],
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

function isSceneCheckReference(evidence: { role: string; metadata: unknown }) {
  if (!["after", "event", "representative"].includes(evidence.role))
    return false;
  if (
    !evidence.metadata ||
    typeof evidence.metadata !== "object" ||
    Array.isArray(evidence.metadata)
  ) {
    return true;
  }
  const kind = (evidence.metadata as Record<string, unknown>).kind;
  return kind !== "plate_crop" && kind !== "plate_source";
}

function sceneReferenceRank(role: string) {
  if (role === "after") return 0;
  if (role === "event") return 1;
  return 2;
}
