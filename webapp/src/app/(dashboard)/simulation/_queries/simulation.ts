import { redirect } from "next/navigation";

import { authenticatedClient } from "../../_lib/data";
import type { SimulationCase, SimulationData } from "../_lib/types";

export async function getSimulationData(): Promise<SimulationData> {
  const { supabase, user } = await authenticatedClient();
  if (!["operator", "admin"].includes(user.app_metadata.trace_dump_role)) {
    redirect("/operations");
  }
  const now = new Date();
  const [
    camerasResult,
    runsResult,
    heartbeatResult,
    casesResult,
    latestResolvedCaseResult,
    teamsResult,
  ] = await Promise.all([
    supabase
      .from("cameras")
      .select("id,name,latitude,longitude")
      .eq("enabled", true)
      .eq("is_scene_check_fixture", false)
      .order("name"),
    supabase
      .from("simulation_monitoring_runs")
      .select("id,status,started_at,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("simulation_worker_heartbeats")
      .select("last_seen_at")
      .order("last_seen_at", { ascending: false })
      .limit(1),
    supabase
      .from("cleanup_cases")
      .select(
        "id,incident_id,status,assigned_team_id,assigned_at,sla_hours,due_at",
      )
      .neq("status", "resolved")
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase
      .from("cleanup_cases")
      .select(
        "id,incident_id,status,assigned_team_id,assigned_at,sla_hours,due_at",
      )
      .eq("status", "resolved")
      .order("updated_at", { ascending: false })
      .limit(1),
    supabase.from("cleanup_teams").select("id,name"),
  ]);
  const firstError =
    camerasResult.error ??
    runsResult.error ??
    heartbeatResult.error ??
    casesResult.error ??
    latestResolvedCaseResult.error ??
    teamsResult.error;
  if (firstError)
    throw new Error(`Unable to load Simulation Center: ${firstError.message}`);

  const runRow = runsResult.data?.[0] ?? null;
  const cameraRows = camerasResult.data ?? [];
  const monitorResult = runRow
    ? await supabase
        .from("simulation_camera_monitors")
        .select(
          "camera_id,status,last_worker_activity_at,error_message,last_pipeline_stage,last_pipeline_stage_at,last_segment_id,last_detection_id,last_analysis_id,last_hafnia_summary_id,last_classification,diagnostics",
        )
        .eq("run_id", runRow.id)
    : { data: [], error: null };
  if (monitorResult.error) throw new Error(monitorResult.error.message);
  const monitors = new Map(
    (monitorResult.data ?? []).map((row) => [row.camera_id, row]),
  );

  const incidentCounts = new Map<string, number>();
  if (runRow) {
    const { data: detections, error } = await supabase
      .from("detections")
      .select("id,camera_id")
      .contains("metadata", { simulation_run_id: runRow.id });
    if (error) throw new Error(error.message);
    const detectionIds = (detections ?? []).map((row) => row.id);
    const { data: incidents, error: incidentError } = detectionIds.length
      ? await supabase
          .from("incidents")
          .select("detection_id")
          .in("detection_id", detectionIds)
      : { data: [], error: null };
    if (incidentError) throw new Error(incidentError.message);
    const incidentDetectionIds = new Set(
      (incidents ?? []).map((row) => row.detection_id),
    );
    for (const detection of detections ?? []) {
      if (incidentDetectionIds.has(detection.id)) {
        incidentCounts.set(
          detection.camera_id,
          (incidentCounts.get(detection.camera_id) ?? 0) + 1,
        );
      }
    }
  }

  const caseRows = [
    ...(casesResult.data ?? []),
    ...(latestResolvedCaseResult.data ?? []),
  ];
  const incidentIds = caseRows.map((row) => row.incident_id);
  const incidentsResult = incidentIds.length
    ? await supabase
        .from("incidents")
        .select("id,detection_id")
        .in("id", incidentIds)
    : { data: [], error: null };
  if (incidentsResult.error) throw new Error(incidentsResult.error.message);
  const detectionIds = (incidentsResult.data ?? []).map(
    (row) => row.detection_id,
  );
  const detectionsResult = detectionIds.length
    ? await supabase
        .from("detections")
        .select("id,camera_id")
        .in("id", detectionIds)
    : { data: [], error: null };
  if (detectionsResult.error) throw new Error(detectionsResult.error.message);
  const linkedCameraIds = [
    ...new Set((detectionsResult.data ?? []).map((row) => row.camera_id)),
  ];
  const caseIds = caseRows.map((row) => row.id);
  const [
    linkedCameras,
    sourcesResult,
    statesResult,
    checksResult,
    evidenceResult,
  ] = await Promise.all([
    linkedCameraIds.length
      ? supabase.from("cameras").select("id,name").in("id", linkedCameraIds)
      : Promise.resolve({ data: [], error: null }),
    linkedCameraIds.length
      ? supabase
          .from("camera_scene_sources")
          .select("id,camera_id,name,description,source_type")
          .in("camera_id", linkedCameraIds)
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [], error: null }),
    linkedCameraIds.length
      ? supabase
          .from("camera_scene_state")
          .select(
            "camera_id,scene_source_id,status,verified_at,error_message,capture_camera_id",
          )
          .in("camera_id", linkedCameraIds)
      : Promise.resolve({ data: [], error: null }),
    caseIds.length
      ? supabase
          .from("cleanup_scene_checks")
          .select(
            "id,cleanup_case_id,status,phase,scheduled_for,assessment,confidence,cleanup_score,summary,reported_waste,reported_location,current_observation,key_changes,current_waste_visible,raw_response,follow_up_source,gateway_input_limitations,comparison_reasoning,grounded_observations,limitations,object_region_observable,camera_reference_matched,snapshot_storage_path,captured_at,source_timestamp,analysis_completed_at,model_id,model_version,hafnia_summary_id,capture_camera_id,error_message,created_at",
          )
          .in("cleanup_case_id", caseIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    incidentIds.length
      ? supabase
          .from("evidence")
          .select(
            "incident_id,storage_path,role,captured_at,created_at,metadata",
          )
          .in("incident_id", incidentIds)
          .in("role", ["after", "event", "representative"])
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const detailError =
    linkedCameras.error ??
    sourcesResult.error ??
    statesResult.error ??
    checksResult.error ??
    evidenceResult.error;
  if (detailError) throw new Error(detailError.message);

  const preferredEvidence = new Map<
    string,
    NonNullable<typeof evidenceResult.data>[number]
  >();
  for (const row of evidenceResult.data ?? []) {
    if (!preferredEvidence.has(row.incident_id))
      preferredEvidence.set(row.incident_id, row);
  }
  const latestChecks = new Map<
    string,
    NonNullable<typeof checksResult.data>[number]
  >();
  for (const row of checksResult.data ?? []) {
    if (!latestChecks.has(row.cleanup_case_id))
      latestChecks.set(row.cleanup_case_id, row);
  }
  const snapshotPaths = [...latestChecks.values()].flatMap((row) =>
    row.snapshot_storage_path ? [row.snapshot_storage_path] : [],
  );
  const evidencePaths = [...preferredEvidence.values()].map(
    (row) => row.storage_path,
  );
  const [evidenceUrls, snapshotUrls] = await Promise.all([
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
  const signedEvidence = new Map(
    (evidenceUrls.data ?? []).map((row) => [row.path, row.signedUrl]),
  );
  const signedSnapshots = new Map(
    (snapshotUrls.data ?? []).map((row) => [row.path, row.signedUrl]),
  );
  const incidentMap = new Map(
    (incidentsResult.data ?? []).map((row) => [row.id, row.detection_id]),
  );
  const detectionMap = new Map(
    (detectionsResult.data ?? []).map((row) => [row.id, row.camera_id]),
  );
  const cameraMap = new Map(
    (linkedCameras.data ?? []).map((row) => [row.id, row.name]),
  );
  const teamMap = new Map(
    (teamsResult.data ?? []).map((row) => [row.id, row.name]),
  );
  const sourceRows = sourcesResult.data ?? [];
  const sourceNames = new Map(sourceRows.map((row) => [row.id, row.name]));
  const stateMap = new Map(
    (statesResult.data ?? []).map((row) => [row.camera_id, row]),
  );
  const cases: SimulationCase[] = caseRows.flatMap((row) => {
    const detectionId = incidentMap.get(row.incident_id);
    const cameraId = detectionId ? detectionMap.get(detectionId) : undefined;
    const evidence = preferredEvidence.get(row.incident_id);
    if (!cameraId || !evidence) return [];
    const state = stateMap.get(cameraId);
    const sceneStatus =
      state?.status === "ready" &&
      (!state.verified_at ||
        now.getTime() - new Date(state.verified_at).getTime() > 15 * 60 * 1000)
        ? "unknown"
        : (state?.status ?? "unknown");
    const check = latestChecks.get(row.id);
    return [
      {
        id: row.id,
        incidentId: row.incident_id,
        status: row.status,
        cameraId,
        cameraName: cameraMap.get(cameraId) ?? "Unknown camera",
        assignedTeamName: row.assigned_team_id
          ? (teamMap.get(row.assigned_team_id) ?? "Unknown team")
          : null,
        assignedAt: row.assigned_at,
        slaHours: row.sla_hours,
        dueAt: row.due_at,
        originalEvidenceUrl: signedEvidence.get(evidence.storage_path) ?? null,
        originalEvidenceCapturedAt:
          evidence.captured_at ?? evidence.created_at ?? null,
        originalEvidenceRegion:
          evidence.metadata &&
          typeof evidence.metadata === "object" &&
          !Array.isArray(evidence.metadata) &&
          evidence.metadata.object_region &&
          typeof evidence.metadata.object_region === "object"
            ? (evidence.metadata.object_region as Record<string, unknown>)
            : null,
        sceneSources: sourceRows
          .filter((source) => source.camera_id === cameraId)
          .map((source) => ({
            id: source.id,
            name: source.name,
            description: source.description,
            sourceType: source.source_type,
          })),
        sceneState: {
          sourceId: state?.scene_source_id ?? null,
          sourceName: state?.scene_source_id
            ? (sourceNames.get(state.scene_source_id) ?? "Unknown source")
            : null,
          status: sceneStatus,
          verifiedAt: state?.verified_at ?? null,
          captureCameraId: state?.capture_camera_id ?? null,
          errorMessage: state?.error_message ?? null,
        },
        check: check
          ? {
              id: check.id,
              status: check.status,
              phase: check.phase,
              scheduledFor: check.scheduled_for,
              assessment: check.assessment,
              confidence: check.confidence,
              cleanupScore: check.cleanup_score,
              summary: check.summary,
              reportedWaste: check.reported_waste,
              reportedLocation: check.reported_location,
              currentObservation: check.current_observation,
              keyChanges: Array.isArray(check.key_changes)
                ? (check.key_changes as string[])
                : [],
              comparisonReasoning: Array.isArray(check.comparison_reasoning)
                ? (check.comparison_reasoning as string[])
                : [],
              observations: Array.isArray(check.grounded_observations)
                ? (check.grounded_observations as string[])
                : [],
              limitations: Array.isArray(check.limitations)
                ? (check.limitations as string[])
                : [],
              rawResponse:
                check.raw_response &&
                typeof check.raw_response === "object" &&
                !Array.isArray(check.raw_response)
                  ? (check.raw_response as Record<string, unknown>)
                  : null,
              gatewayInputLimitations: Array.isArray(
                check.gateway_input_limitations,
              )
                ? (check.gateway_input_limitations as string[])
                : [],
              followUpSource: check.follow_up_source,
              currentWasteVisible: check.current_waste_visible,
              cameraReferenceMatched: check.camera_reference_matched,
              sourceTimestamp: check.source_timestamp,
              snapshotUrl: check.snapshot_storage_path
                ? (signedSnapshots.get(check.snapshot_storage_path) ?? null)
                : null,
              capturedAt: check.captured_at,
              analyzedAt: check.analysis_completed_at,
              modelId: check.model_id,
              modelVersion: check.model_version,
              hafniaSummaryId: check.hafnia_summary_id,
              captureCameraId: check.capture_camera_id,
              errorMessage: check.error_message,
            }
          : null,
      },
    ];
  });
  const heartbeat = heartbeatResult.data?.[0]?.last_seen_at ?? null;
  const workerConnected =
    heartbeat !== null &&
    now.getTime() - new Date(heartbeat).getTime() < 15_000;
  const cameras = cameraRows.map((row) => {
    const monitor = monitors.get(row.id);
    return {
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      monitorStatus: monitor?.status ?? "idle",
      lastWorkerActivityAt: monitor?.last_worker_activity_at ?? null,
      incidentCount: incidentCounts.get(row.id) ?? 0,
      errorMessage: monitor?.error_message ?? null,
      pipelineStage:
        (incidentCounts.get(row.id) ?? 0) > 0
          ? "incident_created"
          : (monitor?.last_pipeline_stage ?? "task_pending"),
      pipelineStageAt: monitor?.last_pipeline_stage_at ?? null,
      lastSegmentId: monitor?.last_segment_id ?? null,
      lastDetectionId: monitor?.last_detection_id ?? null,
      lastAnalysisId: monitor?.last_analysis_id ?? null,
      lastHafniaSummaryId: monitor?.last_hafnia_summary_id ?? null,
      lastClassification: monitor?.last_classification ?? null,
      diagnostics:
        monitor?.diagnostics &&
        typeof monitor.diagnostics === "object" &&
        !Array.isArray(monitor.diagnostics)
          ? Object.fromEntries(
              Object.entries(monitor.diagnostics).flatMap(([key, value]) =>
                typeof value === "number" ? [[key, value]] : [],
              ),
            )
          : {},
    };
  });
  return {
    workerConnected,
    workerLastSeenAt: heartbeat,
    run: runRow
      ? {
          id: runRow.id,
          status: runRow.status,
          startedAt: runRow.started_at,
          incidents: [...incidentCounts.values()].reduce(
            (sum, count) => sum + count,
            0,
          ),
          errorMessage: runRow.error_message,
        }
      : null,
    cameras,
    cases,
    referenceTime: now.toISOString(),
  };
}
