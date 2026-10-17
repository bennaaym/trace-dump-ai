import { authenticatedClient } from "../../_lib/data";
import type {
  CameraRecord,
  IncidentClassification,
  ReviewStatus,
} from "../../_lib/types";

export async function getCameras() {
  const { supabase } = await authenticatedClient();
  const [camerasResult, detectionsResult] = await Promise.all([
    supabase
      .from("cameras")
      .select(
        "id,name,latitude,longitude,location_source,enabled,status,last_seen_at",
      )
      .order("name"),
    supabase
      .from("detections")
      .select("camera_id,created_at")
      .order("created_at", { ascending: false }),
  ]);
  if (camerasResult.error || detectionsResult.error)
    throw new Error("Unable to load cameras.");
  const lastDetection = new Map<string, string>();
  for (const row of detectionsResult.data ?? [])
    if (!lastDetection.has(row.camera_id))
      lastDetection.set(row.camera_id, row.created_at);
  return (camerasResult.data ?? []).map((camera) => ({
    id: camera.id,
    name: camera.name,
    latitude: camera.latitude,
    longitude: camera.longitude,
    locationSource: camera.location_source as "real" | "simulated",
    enabled: camera.enabled,
    status: camera.status as CameraRecord["status"],
    lastSeenAt: camera.last_seen_at,
    lastDetectionAt: lastDetection.get(camera.id) ?? null,
  }));
}

export async function getCamera(id: string) {
  const { supabase } = await authenticatedClient();
  const { data: camera, error } = await supabase
    .from("cameras")
    .select(
      "id,name,latitude,longitude,location_source,enabled,status,last_seen_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Unable to load camera: ${error.message}`);
  if (!camera) return null;
  const { data: detections, error: detectionError } = await supabase
    .from("detections")
    .select("id,activity_start_at,activity_end_at,created_at")
    .eq("camera_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  if (detectionError)
    throw new Error(`Unable to load detections: ${detectionError.message}`);
  const detectionIds = (detections ?? []).map((item) => item.id);
  const incidentsResult = detectionIds.length
    ? await supabase
        .from("incidents")
        .select("id,detection_id,classification,review_status,occurred_at")
        .in("detection_id", detectionIds)
        .order("occurred_at", { ascending: false })
    : { data: [], error: null };
  if (incidentsResult.error)
    throw new Error(
      `Unable to load camera incidents: ${incidentsResult.error.message}`,
    );
  return {
    camera: {
      id: camera.id,
      name: camera.name,
      latitude: camera.latitude,
      longitude: camera.longitude,
      locationSource: camera.location_source as "real" | "simulated",
      enabled: camera.enabled,
      status: camera.status as CameraRecord["status"],
      lastSeenAt: camera.last_seen_at,
    },
    detections: detections ?? [],
    incidents: (incidentsResult.data ?? []).map((incident) => ({
      ...incident,
      classification: incident.classification as IncidentClassification,
      review_status: incident.review_status as ReviewStatus,
    })),
  };
}
