import { authenticatedClient, signedEvidenceUrls } from "../../../_lib/data";
import type {
  EvidenceRole,
  IncidentClassification,
  IncidentDetail,
  ReviewStatus,
} from "../../../_lib/types";

export async function getIncident(id: string): Promise<IncidentDetail | null> {
  const { supabase } = await authenticatedClient();
  const { data: incident, error } = await supabase
    .from("incidents")
    .select(
      "id,detection_id,source_analysis_id,classification,review_status,description,uncertainty,occurred_at,latitude,longitude,location_source,created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load incident: ${error.message}`);
  if (!incident) return null;

  const [detectionResult, analysisResult, evidenceResult, reviewsResult] =
    await Promise.all([
      supabase
        .from("detections")
        .select(
          "camera_id,activity_start_at,activity_end_at,recording_start_at,recording_end_at,metadata",
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
        .from("evidence")
        .select(
          "id,role,storage_path,captured_at,offset_seconds,sha256,extraction_method",
        )
        .eq("incident_id", id)
        .order("offset_seconds"),
      supabase
        .from("incident_reviews")
        .select("id,reviewer_id,decision,notes,created_at")
        .eq("incident_id", id)
        .order("created_at", { ascending: false }),
    ]);
  for (const result of [
    detectionResult,
    analysisResult,
    evidenceResult,
    reviewsResult,
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

  const evidenceRows = evidenceResult.data ?? [];
  const signed = await signedEvidenceUrls(
    supabase,
    evidenceRows.map((item) => item.storage_path),
  );
  const analysis = analysisResult.data!;
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
    camera: { id: camera.id, name: camera.name },
    thumbnailUrl: null,
    detection: {
      activityStartAt: detection.activity_start_at,
      activityEndAt: detection.activity_end_at,
      recordingStartAt: detection.recording_start_at,
      recordingEndAt: detection.recording_end_at,
      metadata: (detection.metadata ?? {}) as Record<string, unknown>,
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
    },
    evidence: evidenceRows.map((item) => ({
      id: item.id,
      role: item.role as EvidenceRole,
      storagePath: item.storage_path,
      signedUrl: signed.get(item.storage_path) ?? null,
      capturedAt: item.captured_at,
      offsetSeconds: item.offset_seconds,
      sha256: item.sha256,
      extractionMethod: item.extraction_method,
    })),
    reviews: (reviewsResult.data ?? []).map((review) => ({
      id: review.id,
      reviewerId: review.reviewer_id,
      decision: review.decision as Exclude<ReviewStatus, "pending_review">,
      notes: review.notes,
      createdAt: review.created_at,
    })),
  };
}
