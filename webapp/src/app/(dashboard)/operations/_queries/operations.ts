import { authenticatedClient } from "../../_lib/data";
import type { OperationsMapData } from "../../_lib/types";
import {
  buildOperationsData,
  type CameraRow,
  type DetectionRow,
  type IncidentRow,
  type CleanupRow,
} from "../_lib/operations-data";

export async function getOperationsMapData(): Promise<OperationsMapData> {
  const { supabase } = await authenticatedClient();
  const [camerasResult, detectionsResult, incidentsResult, cleanupResult] =
    await Promise.all([
      supabase
        .from("cameras")
        .select("id,name,latitude,longitude,location_source,enabled")
        .order("name"),
      supabase.from("detections").select("id,camera_id,created_at"),
      supabase
        .from("incidents")
        .select(
          "id,detection_id,review_status,occurred_at,created_at,latitude,longitude,location_source",
        ),
      supabase.from("cleanup_cases").select("id,incident_id,status,due_at"),
    ]);
  if (camerasResult.error) {
    throw new Error(`Unable to load cameras: ${camerasResult.error.message}`);
  }
  if (detectionsResult.error) {
    throw new Error(
      `Unable to load camera detections: ${detectionsResult.error.message}`,
    );
  }
  if (incidentsResult.error) {
    throw new Error(
      `Unable to load camera incidents: ${incidentsResult.error.message}`,
    );
  }
  if (cleanupResult.error && cleanupResult.error.code !== "42P01") {
    throw new Error(
      `Unable to load cleanup map data: ${cleanupResult.error.message}`,
    );
  }

  return buildOperationsData(
    (camerasResult.data ?? []) as CameraRow[],
    (detectionsResult.data ?? []) as DetectionRow[],
    (incidentsResult.data ?? []) as IncidentRow[],
    (cleanupResult.data ?? []) as CleanupRow[],
  );
}
