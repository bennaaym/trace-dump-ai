type CameraStatus = "online" | "offline" | "unknown";
type ReviewStatus =
  "pending_review" | "confirmed" | "dismissed" | "needs_investigation";
type DumpingClassification = "static" | "dynamic" | "unknown";

interface Camera {
  id: string;
  name: string;
  locationName: string | null;
  latitude: number | null;
  longitude: number | null;
  status: CameraStatus;
  monitoringEnabled: boolean;
  recordingAvailable: boolean | null;
  lastSeenAt: string | null;
  lastAnalyzedAt: string | null;
}
interface Detection {
  id: string;
  cameraId: string;
  activityStartAt: string;
  activityEndAt: string;
  recordingStartAt: string | null;
  recordingEndAt: string | null;
  createdAt: string;
}
interface Analysis {
  id: string;
  detectionId: string;
  status: "pending" | "processing" | "completed" | "failed";
  classification: DumpingClassification | null;
  description: string | null;
  people: string[];
  vehicles: string[];
  objects: string[];
  supportingEvidence: string[];
  uncertainty: string | null;
}
interface Incident {
  id: string;
  detectionId: string;
  cameraId: string;
  classification: DumpingClassification;
  reviewStatus: ReviewStatus;
  description: string | null;
  eventAt: string;
  latitude: number | null;
  longitude: number | null;
  camera?: Camera;
}
interface Evidence {
  id: string;
  incidentId: string;
  role: "before" | "event" | "after" | "other";
  capturedAt: string | null;
  objectPath: string;
  mimeType: string | null;
}
interface IncidentReview {
  id: string;
  incidentId: string;
  reviewerId: string;
  decision: Exclude<ReviewStatus, "pending_review">;
  notes: string | null;
  createdAt: string;
}

export interface DashboardSnapshot {
  cameras: Camera[];
  incidents: Incident[];
  detections: Detection[];
  analyses: Analysis[];
  evidence: Evidence[];
  reviews: IncidentReview[];
  source: "not_configured";
}
