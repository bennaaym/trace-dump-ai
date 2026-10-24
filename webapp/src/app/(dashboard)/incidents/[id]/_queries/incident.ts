import { authenticatedClient } from "../../../_lib/data";
import type {
  IncidentClassification,
  IncidentDetail,
  ReviewStatus,
} from "../../../_lib/types";
import { normalizeHafniaResponse } from "../_lib/hafnia-response";
import { sanitizeDetectorMetadata } from "../_lib/technical-metadata";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getIncident(id: string): Promise<IncidentDetail | null> {
  if (!UUID.test(id)) return null;
  const { supabase, user } = await authenticatedClient();
  const { data: incident, error } = await supabase
    .from("incidents")
    .select(
      "id,detection_id,source_analysis_id,classification,review_status,description,uncertainty,occurred_at,latitude,longitude,location_source,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load incident: ${error.message}`);
  if (!incident) return null;

  const [detectionResult, analysisResult, reviewsResult, cleanupResult] =
    await Promise.all([
      supabase
        .from("detections")
        .select(
          "camera_id,activity_start_at,activity_end_at,recording_start_at,recording_end_at,recording_uri,metadata",
        )
        .eq("id", incident.detection_id)
        .single(),
      supabase
        .from("analyses")
        .select(
          "id,status,hafnia_summary_id,prompt_version,model_id,dumping_detected,dumping_type,event_offset_seconds,description,uncertainty,started_at,completed_at",
        )
        .eq("id", incident.source_analysis_id)
        .single(),
      supabase
        .from("incident_reviews")
        .select("id,reviewer_id,decision,notes,created_at")
        .eq("incident_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("cleanup_cases")
        .select("id,status,assigned_team_id,due_at,resolution_outcome")
        .eq("incident_id", id)
        .maybeSingle(),
    ]);
  for (const result of [
    detectionResult,
    analysisResult,
    reviewsResult,
    ...(cleanupResult.error?.code === "42P01" ? [] : [cleanupResult]),
  ]) {
    if (result.error)
      throw new Error(
        `Unable to load incident details: ${result.error.message}`,
      );
  }
  const detection = detectionResult.data!;
  const { data: camera, error: cameraError } = await supabase
    .from("cameras")
    .select("id,name")
    .eq("id", detection.camera_id)
    .single();
  if (cameraError)
    throw new Error(`Unable to load incident camera: ${cameraError.message}`);

  const analysis = analysisResult.data!;
  const cleanup = cleanupResult.error ? null : cleanupResult.data;
  let assignedTeamName: string | null = null;
  if (cleanup?.assigned_team_id) {
    const { data: team } = await supabase
      .from("cleanup_teams")
      .select("name")
      .eq("id", cleanup.assigned_team_id)
      .maybeSingle();
    assignedTeamName = team?.name ?? "Unknown cleanup team";
  }
  const viewerRole = user.app_metadata.trace_dump_role;
  if (viewerRole !== "operator" && viewerRole !== "admin") {
    throw new Error("Operator authorization is required.");
  }
  const { data: responseText, error: responseError } = await supabase.rpc(
    "get_analysis_investigation_response",
    { p_analysis_id: analysis.id },
  );
  if (
    responseError &&
    responseError.code !== "PGRST202" &&
    responseError.code !== "42883"
  ) {
    throw new Error("Unable to load the structured AI investigation response.");
  }
  const { data: playbackRows, error: playbackError } = await supabase.rpc(
    "get_incident_recording_access",
    { p_incident_id: id },
  );
  if (
    playbackError &&
    playbackError.code !== "PGRST202" &&
    playbackError.code !== "42883"
  ) {
    throw new Error("Unable to load incident playback state.");
  }
  const playback = Array.isArray(playbackRows) ? playbackRows[0] : null;
  const playbackExpired =
    playback?.retention_expires_at &&
    Date.parse(playback.retention_expires_at) <= Date.now();
  return {
    id: incident.id,
    detectionId: incident.detection_id,
    classification: incident.classification as IncidentClassification,
    reviewStatus: incident.review_status as ReviewStatus,
    description: incident.description,
    uncertainty: incident.uncertainty,
    occurredAt: incident.occurred_at,
    createdAt: incident.created_at,
    latitude: incident.latitude,
    longitude: incident.longitude,
    locationSource: incident.location_source as "real" | "simulated",
    viewer: {
      id: user.id,
      email: user.email ?? null,
      role: viewerRole,
    },
    camera: { id: camera.id, name: camera.name },
    thumbnailUrl: null,
    detection: {
      activityStartAt: detection.activity_start_at,
      activityEndAt: detection.activity_end_at,
      recordingStartAt: detection.recording_start_at,
      recordingEndAt: detection.recording_end_at,
      recordingUri: detection.recording_uri,
      technicalMetadata:
        viewerRole === "admin"
          ? sanitizeDetectorMetadata(
              (detection.metadata ?? {}) as Record<string, unknown>,
            )
          : null,
    },
    analysis: {
      id: analysis.id,
      status: analysis.status as IncidentDetail["analysis"]["status"],
      hafniaSummaryId: analysis.hafnia_summary_id,
      promptVersion: analysis.prompt_version,
      modelId: analysis.model_id,
      dumpingDetected:
        analysis.dumping_detected as IncidentDetail["analysis"]["dumpingDetected"],
      dumpingType:
        analysis.dumping_type as IncidentDetail["analysis"]["dumpingType"],
      eventOffsetSeconds: analysis.event_offset_seconds,
      description: analysis.description,
      uncertainty: analysis.uncertainty,
      startedAt: analysis.started_at,
      completedAt: analysis.completed_at,
      investigation: normalizeHafniaResponse(
        responseError ? null : responseText,
      ),
      investigationResponseAvailable: !responseError && Boolean(responseText),
      rawResponse:
        viewerRole === "admin" && !responseError ? responseText : null,
    },
    playback: {
      status: playbackExpired
        ? "expired"
        : playback?.status === "pending"
          ? "preparing"
          : (playback?.status ?? "unavailable"),
      durationSeconds: playback?.duration_seconds ?? null,
      requestedAt: playback?.requested_at ?? null,
      completedAt: playback?.completed_at ?? null,
      retentionExpiresAt: playback?.retention_expires_at ?? null,
      errorCode: playback?.error_code ?? null,
    },
    reviews: (reviewsResult.data ?? []).map((review) => ({
      id: review.id,
      reviewerId: review.reviewer_id,
      decision: review.decision as Exclude<ReviewStatus, "pending_review">,
      notes: review.notes,
      createdAt: review.created_at,
      reviewerLabel:
        review.reviewer_id === user.id
          ? (user.email ?? "Current operator")
          : `Operator ${review.reviewer_id.slice(0, 8)}`,
    })),
    cleanup: cleanup
      ? {
          id: cleanup.id,
          status: cleanup.status as NonNullable<
            IncidentDetail["cleanup"]
          >["status"],
          assignedTeamId: cleanup.assigned_team_id,
          assignedTeamName,
          dueAt: cleanup.due_at,
          resolutionOutcome: cleanup.resolution_outcome as
            "cleanup_completed" | "site_already_cleared" | null,
        }
      : null,
  };
}
