type CameraStatus = "online" | "offline" | "unknown";
export type ReviewStatus =
  "pending_review" | "confirmed" | "dismissed" | "needs_investigation";
export type IncidentClassification =
  "static_dumping" | "dynamic_dumping" | "unknown_dumping";
export type EvidenceRole = "before" | "event" | "after" | "representative";
export type PlaybackStatus =
  "available" | "preparing" | "unavailable" | "failed" | "expired";

export interface CameraRecord {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: "real" | "simulated";
  enabled: boolean;
  status: CameraStatus;
  lastSeenAt: string | null;
}

interface EvidenceRecord {
  id: string;
  role: EvidenceRole;
  storagePath: string;
  signedUrl: string | null;
  capturedAt: string | null;
  offsetSeconds: number | null;
  sha256: string | null;
  extractionMethod: string | null;
  metadata: Record<string, unknown>;
}

export interface IncidentListItem {
  id: string;
  detectionId: string;
  classification: IncidentClassification;
  reviewStatus: ReviewStatus;
  description: string;
  uncertainty: string | null;
  occurredAt: string | null;
  createdAt: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: "real" | "simulated";
  camera: Pick<CameraRecord, "id" | "name">;
  thumbnailUrl: string | null;
}

export interface IncidentDetail extends IncidentListItem {
  viewer: {
    id: string;
    email: string | null;
    role: "operator" | "admin";
  };
  detection: {
    activityStartAt: string;
    activityEndAt: string;
    recordingStartAt: string;
    recordingEndAt: string;
    recordingUri: string;
    technicalMetadata: Record<string, unknown> | null;
  };
  analysis: {
    id: string;
    status: "pending" | "processing" | "completed" | "failed";
    hafniaSummaryId: string | null;
    promptVersion: string;
    modelId: string | null;
    dumpingDetected: "yes" | "no" | "uncertain" | null;
    dumpingType: "static" | "dynamic" | "unknown" | null;
    eventOffsetSeconds: number | null;
    description: string | null;
    uncertainty: string | null;
    startedAt: string | null;
    completedAt: string | null;
    investigation: {
      sequenceOfEvents: string | null;
      peopleInvolved: string | null;
      vehiclesInvolved: string | null;
      objectsInvolved: string | null;
      visualEvidence: string | null;
      uncertainties: string | null;
    };
    investigationResponseAvailable: boolean;
    rawResponse: string | null;
  };
  playback: {
    status: PlaybackStatus;
    durationSeconds: number | null;
    requestedAt: string | null;
    completedAt: string | null;
    retentionExpiresAt: string | null;
    errorCode: string | null;
  };
  evidence: EvidenceRecord[];
  reviews: Array<{
    id: string;
    reviewerId: string;
    decision: Exclude<ReviewStatus, "pending_review">;
    notes: string | null;
    createdAt: string;
    reviewerLabel: string;
  }>;
}

export interface IncidentPageResult {
  items: IncidentListItem[];
  count: number;
  page: number;
  pageSize: number;
  cameras: Pick<CameraRecord, "id" | "name">[];
}
