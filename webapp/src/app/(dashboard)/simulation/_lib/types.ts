type MonitorStatus =
  | "idle"
  | "connecting"
  | "monitoring"
  | "activity_detected"
  | "analyzing"
  | "error"
  | "stopped";

interface SimulationCamera {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  monitorStatus: MonitorStatus;
  lastWorkerActivityAt: string | null;
  incidentCount: number;
  errorMessage: string | null;
  pipelineStage: string;
  pipelineStageAt: string | null;
  lastSegmentId: string | null;
  lastDetectionId: string | null;
  lastAnalysisId: string | null;
  lastHafniaSummaryId: string | null;
  lastClassification: string | null;
  diagnostics: Record<string, number>;
}

interface SceneSource {
  id: string;
  name: string;
  description: string | null;
  sourceType: string;
}

export interface SimulationCase {
  id: string;
  incidentId: string;
  status: string;
  cameraId: string;
  cameraName: string;
  assignedTeamName: string | null;
  assignedAt: string | null;
  slaHours: number | null;
  dueAt: string | null;
  originalEvidenceUrl: string | null;
  originalEvidenceCapturedAt: string | null;
  originalEvidenceRegion: Record<string, unknown> | null;
  sceneSources: SceneSource[];
  sceneState: {
    sourceId: string | null;
    sourceName: string | null;
    status: "unknown" | "switching" | "ready" | "error";
    verifiedAt: string | null;
    captureCameraId: string | null;
    errorMessage: string | null;
  };
  check: {
    id: string;
    status: string;
    phase: string;
    scheduledFor: string;
    assessment: string | null;
    confidence: number | null;
    cleanupScore: number | null;
    summary: string | null;
    reportedWaste: string | null;
    reportedLocation: string | null;
    currentObservation: string | null;
    keyChanges: string[];
    comparisonReasoning: string[];
    observations: string[];
    limitations: string[];
    rawResponse: Record<string, unknown> | null;
    gatewayInputLimitations: string[];
    followUpSource: string | null;
    currentWasteVisible: boolean | null;
    cameraReferenceMatched: boolean | null;
    sourceTimestamp: string | null;
    snapshotUrl: string | null;
    capturedAt: string | null;
    analyzedAt: string | null;
    modelId: string | null;
    modelVersion: string | null;
    hafniaSummaryId: string | null;
    captureCameraId: string | null;
    errorMessage: string | null;
  } | null;
}

export interface SimulationData {
  workerConnected: boolean;
  workerLastSeenAt: string | null;
  run: {
    id: string;
    status: string;
    startedAt: string | null;
    incidents: number;
    errorMessage: string | null;
  } | null;
  cameras: SimulationCamera[];
  cases: SimulationCase[];
  referenceTime: string;
}
