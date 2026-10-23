import type {
  OperationsCamera,
  OperationsCleanupCase,
  OperationsIncident,
  ReviewStatus,
} from "../../_lib/types";

export interface CameraRow {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  location_source: "real" | "simulated";
  enabled: boolean;
}

export interface DetectionRow {
  id: string;
  camera_id: string;
  created_at: string;
}

export interface IncidentRow {
  id: string;
  detection_id: string;
  review_status: ReviewStatus;
  occurred_at: string | null;
  created_at: string;
  latitude: number | null;
  longitude: number | null;
  location_source: "real" | "simulated";
}

export interface CleanupRow {
  id: string;
  incident_id: string;
  status: "awaiting_cleanup" | "in_progress" | "verification" | "resolved";
  due_at: string | null;
}

export function buildOperationsData(
  cameraRows: CameraRow[],
  detectionRows: DetectionRow[],
  incidentRows: IncidentRow[],
  cleanupRows: CleanupRow[] = [],
) {
  const detectionCamera = new Map(
    detectionRows.map((detection) => [detection.id, detection.camera_id]),
  );
  const lastDetection = new Map<string, string>();
  for (const detection of detectionRows) {
    const current = lastDetection.get(detection.camera_id);
    if (!current || detection.created_at > current) {
      lastDetection.set(detection.camera_id, detection.created_at);
    }
  }

  const incidents: OperationsIncident[] = incidentRows.flatMap((incident) => {
    const cameraId = detectionCamera.get(incident.detection_id);
    return cameraId
      ? [
          {
            id: incident.id,
            cameraId,
            reviewStatus: incident.review_status,
            occurredAt: incident.occurred_at,
            createdAt: incident.created_at,
            latitude: incident.latitude,
            longitude: incident.longitude,
            locationSource: incident.location_source,
          },
        ]
      : [];
  });
  const incidentsByCamera = new Map<string, OperationsIncident[]>();
  for (const incident of incidents) {
    const current = incidentsByCamera.get(incident.cameraId) ?? [];
    current.push(incident);
    incidentsByCamera.set(incident.cameraId, current);
  }

  const cameras: OperationsCamera[] = cameraRows.map((camera) => {
    const cameraIncidents = incidentsByCamera.get(camera.id) ?? [];
    return {
      id: camera.id,
      name: camera.name,
      latitude: camera.latitude,
      longitude: camera.longitude,
      locationSource: camera.location_source,
      enabled: camera.enabled,
      lastDetectionAt: lastDetection.get(camera.id) ?? null,
      incidentCount: cameraIncidents.length,
      pendingIncidentCount: countStatus(cameraIncidents, "pending_review"),
    };
  });

  const incidentRowsById = new Map(incidentRows.map((item) => [item.id, item]));
  const cameraNames = new Map(cameraRows.map((item) => [item.id, item.name]));
  const cleanupCases: OperationsCleanupCase[] = cleanupRows.flatMap((item) => {
    if (item.status === "resolved") return [];
    const incident = incidentRowsById.get(item.incident_id);
    const cameraId = incident
      ? detectionCamera.get(incident.detection_id)
      : null;
    if (!incident || !cameraId) return [];
    return [
      {
        id: item.id,
        incidentId: item.incident_id,
        cameraId,
        cameraName: cameraNames.get(cameraId) ?? "Unknown camera",
        status: item.status,
        dueAt: item.due_at,
        latitude: incident.latitude,
        longitude: incident.longitude,
        locationSource: incident.location_source,
      },
    ];
  });

  return { cameras, incidents, cleanupCases };
}

function countStatus(incidents: OperationsIncident[], status: ReviewStatus) {
  return incidents.filter((incident) => incident.reviewStatus === status)
    .length;
}
