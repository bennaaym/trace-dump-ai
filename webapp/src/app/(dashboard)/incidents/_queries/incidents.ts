import { authenticatedClient, signedEvidenceUrls } from "../../_lib/data";
import type {
  CameraRecord,
  IncidentClassification,
  IncidentListItem,
  IncidentPageResult,
  ReviewStatus,
} from "../../_lib/types";

const PAGE_SIZE = 10;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface IncidentRow {
  id: string;
  detection_id: string;
  classification: IncidentClassification;
  review_status: ReviewStatus;
  description: string;
  uncertainty: string | null;
  occurred_at: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_source: "real" | "simulated";
  detection: { camera: { id: string; name: string } };
}

export interface IncidentFilters {
  q?: string;
  status?: string;
  camera?: string;
  from?: string;
  page?: string;
}

export async function getIncidents(
  filters: IncidentFilters = {},
): Promise<IncidentPageResult> {
  const { supabase } = await authenticatedClient();
  const requestedPage = Math.max(
    1,
    Number.parseInt(filters.page ?? "1", 10) || 1,
  );
  const from = (requestedPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  let query = supabase
    .from("incidents")
    .select(
      "id,detection_id,classification,review_status,description,uncertainty,occurred_at,created_at,latitude,longitude,location_source,detection:detections!incidents_detection_fk!inner(camera_id,camera:cameras!detections_camera_fk!inner(id,name))",
      { count: "exact" },
    )
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .range(from, to);

  if (isReviewStatus(filters.status)) {
    query = query.eq("review_status", filters.status);
  }
  if (filters.camera && UUID.test(filters.camera)) {
    query = query.eq("detection.camera_id", filters.camera);
  }
  if (filters.from && /^\d{4}-\d{2}-\d{2}$/.test(filters.from)) {
    query = query.gte("occurred_at", `${filters.from}T00:00:00Z`);
  }
  const search = filters.q?.trim();
  if (search) {
    const escaped = search.replaceAll('"', '\\"');
    const clauses = [`description.ilike."%${escaped}%"`];
    if (UUID.test(search)) clauses.push(`id.eq.${search}`);
    const { data: matchingCameras, error: cameraSearchError } = await supabase
      .from("cameras")
      .select("id")
      .eq("is_scene_check_fixture", false)
      .ilike("name", `%${search}%`);
    if (cameraSearchError) {
      throw new Error(`Unable to search cameras: ${cameraSearchError.message}`);
    }
    const cameraIds = (matchingCameras ?? []).map((camera) => camera.id);
    if (cameraIds.length) {
      const { data: matchingDetections, error: detectionSearchError } =
        await supabase
          .from("detections")
          .select("id")
          .in("camera_id", cameraIds);
      if (detectionSearchError) {
        throw new Error(
          `Unable to search camera incidents: ${detectionSearchError.message}`,
        );
      }
      const detectionIds = (matchingDetections ?? []).map(
        (detection) => detection.id,
      );
      if (detectionIds.length)
        clauses.push(`detection_id.in.(${detectionIds.join(",")})`);
    }
    query = query.or(clauses.join(","));
  }

  const [{ data, count, error }, camerasResult] = await Promise.all([
    query,
    supabase
      .from("cameras")
      .select("id,name")
      .eq("is_scene_check_fixture", false)
      .order("name"),
  ]);
  if (error) throw new Error(`Unable to load incidents: ${error.message}`);
  if (camerasResult.error) {
    throw new Error(
      `Unable to load camera filters: ${camerasResult.error.message}`,
    );
  }

  const rows = (data ?? []) as unknown as IncidentRow[];
  const evidenceResult = rows.length
    ? await supabase
        .from("evidence")
        .select("incident_id,role,storage_path")
        .in(
          "incident_id",
          rows.map((row) => row.id),
        )
    : { data: [], error: null };
  if (evidenceResult.error) {
    throw new Error(
      `Unable to load evidence thumbnails: ${evidenceResult.error.message}`,
    );
  }
  const evidenceRows = (evidenceResult.data ?? []) as Array<{
    incident_id: string;
    role: string;
    storage_path: string;
  }>;
  const preferred = new Map<string, { role: string; path: string }>();
  const priority = ["event", "representative", "before", "after"];
  for (const row of evidenceRows) {
    const current = preferred.get(row.incident_id);
    if (
      !current ||
      priority.indexOf(row.role) < priority.indexOf(current.role)
    ) {
      preferred.set(row.incident_id, {
        role: row.role,
        path: row.storage_path,
      });
    }
  }
  const signed = await signedEvidenceUrls(
    supabase,
    [...preferred.values()].map((item) => item.path),
  );

  return {
    items: rows.map((row) =>
      mapIncident(row, signed.get(preferred.get(row.id)?.path ?? "") ?? null),
    ),
    count: count ?? 0,
    page: requestedPage,
    pageSize: PAGE_SIZE,
    cameras: (camerasResult.data ?? []).map((camera) => ({
      id: camera.id,
      name: camera.name,
    })) as Pick<CameraRecord, "id" | "name">[],
  };
}

function mapIncident(
  row: IncidentRow,
  thumbnailUrl: string | null,
): IncidentListItem {
  return {
    id: row.id,
    detectionId: row.detection_id,
    classification: row.classification,
    reviewStatus: row.review_status,
    description: row.description,
    uncertainty: row.uncertainty,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    latitude: row.latitude,
    longitude: row.longitude,
    locationSource: row.location_source,
    camera: row.detection.camera,
    thumbnailUrl,
  };
}

function isReviewStatus(value: string | undefined): value is ReviewStatus {
  return [
    "pending_review",
    "confirmed",
    "dismissed",
    "needs_investigation",
  ].includes(value ?? "");
}
