import type { ReviewStatus } from "../../_lib/types";

export type InsightsRange = "7" | "30" | "90" | "all";

export interface InsightIncidentRow {
  id: string;
  detection_id: string;
  review_status: ReviewStatus;
  occurred_at: string | null;
  created_at: string;
}

export interface InsightDetectionRow {
  id: string;
  camera_id: string;
}

export interface InsightReviewRow {
  incident_id: string;
  created_at: string;
}

export interface InsightAnalysisRow {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  dumping_detected: "yes" | "no" | "uncertain" | null;
  created_at: string;
}

export interface InsightCameraRow {
  id: string;
  name: string;
}

interface BuildInsightsInput {
  incidents: InsightIncidentRow[];
  detections: InsightDetectionRow[];
  reviews: InsightReviewRow[];
  analyses: InsightAnalysisRow[];
  cameras: InsightCameraRow[];
}

const DAY_MS = 86_400_000;
const REVIEW_STATUSES: ReviewStatus[] = [
  "pending_review",
  "needs_investigation",
  "confirmed",
  "dismissed",
];

export function normalizeInsightsRange(
  value: string | undefined,
): InsightsRange {
  return value === "7" || value === "90" || value === "all" ? value : "30";
}

export function buildInsightsData(
  input: BuildInsightsInput,
  range: InsightsRange,
  referenceTime: string,
) {
  const referenceMs = Date.parse(referenceTime);
  const sinceMs =
    range === "all"
      ? Number.NEGATIVE_INFINITY
      : referenceMs - (Number(range) - 1) * DAY_MS;
  const inRange = (value: string) => {
    const timestamp = Date.parse(value);
    return (
      Number.isFinite(timestamp) &&
      timestamp >= sinceMs &&
      timestamp <= referenceMs
    );
  };
  const incidents = uniqueById(input.incidents).filter((incident) =>
    inRange(incident.occurred_at ?? incident.created_at),
  );
  const incidentIds = new Set(incidents.map((incident) => incident.id));
  const analyses = uniqueById(input.analyses).filter((analysis) =>
    inRange(analysis.created_at),
  );

  const firstReviews = new Map<string, number>();
  for (const review of input.reviews) {
    if (!incidentIds.has(review.incident_id)) continue;
    const timestamp = Date.parse(review.created_at);
    if (!Number.isFinite(timestamp)) continue;
    const current = firstReviews.get(review.incident_id);
    if (current == null || timestamp < current) {
      firstReviews.set(review.incident_id, timestamp);
    }
  }

  const reviewDurations = incidents.flatMap((incident) => {
    const firstReview = firstReviews.get(incident.id);
    const created = Date.parse(incident.created_at);
    return firstReview != null &&
      Number.isFinite(created) &&
      firstReview >= created
      ? [firstReview - created]
      : [];
  });
  const reviewedIncidentCount = firstReviews.size;
  const total = incidents.length;

  const detectionCamera = new Map(
    input.detections.map((detection) => [detection.id, detection.camera_id]),
  );
  const cameraNames = new Map(
    input.cameras.map((camera) => [camera.id, camera.name]),
  );
  const locationCounts = new Map<
    string,
    { total: number; confirmed: number }
  >();
  for (const incident of incidents) {
    const cameraId = detectionCamera.get(incident.detection_id);
    if (!cameraId) continue;
    const current = locationCounts.get(cameraId) ?? { total: 0, confirmed: 0 };
    current.total += 1;
    if (incident.review_status === "confirmed") current.confirmed += 1;
    locationCounts.set(cameraId, current);
  }

  return {
    range,
    recordedIncidentCount: total,
    confirmedIncidentCount: incidents.filter(
      (incident) => incident.review_status === "confirmed",
    ).length,
    reviewCompletionRate: total ? (reviewedIncidentCount / total) * 100 : null,
    reviewedIncidentCount,
    activity: buildActivity(incidents, range, referenceMs),
    aggregation: activityAggregation(incidents, range, referenceMs),
    locations: [...locationCounts.entries()]
      .map(([cameraId, counts]) => ({
        cameraId,
        cameraName: cameraNames.get(cameraId) ?? "Unknown camera",
        total: counts.total,
        confirmed: counts.confirmed,
        percentage: total >= 2 ? (counts.total / total) * 100 : null,
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          left.cameraName.localeCompare(right.cameraName),
      )
      .slice(0, 5),
    outcomes: REVIEW_STATUSES.map((status) => ({
      status,
      count: incidents.filter((incident) => incident.review_status === status)
        .length,
    })),
    pendingWorkload: incidents.filter(
      (incident) => incident.review_status === "pending_review",
    ).length,
    medianFirstReviewMs:
      reviewDurations.length >= 2 ? median(reviewDurations) : null,
    validReviewDurationCount: reviewDurations.length,
    analysisQuality: {
      completed: analyses.filter((analysis) => analysis.status === "completed")
        .length,
      failed: analyses.filter((analysis) => analysis.status === "failed")
        .length,
      uncertain: analyses.filter(
        (analysis) =>
          analysis.status === "completed" &&
          analysis.dumping_detected === "uncertain",
      ).length,
      inProgress: analyses.filter(
        (analysis) =>
          analysis.status === "pending" || analysis.status === "processing",
      ).length,
    },
  };
}

function buildActivity(
  incidents: InsightIncidentRow[],
  range: InsightsRange,
  referenceMs: number,
) {
  if (range === "all" && !incidents.length) return [];
  const aggregation = activityAggregation(incidents, range, referenceMs);
  const earliestIncident = Math.min(
    ...incidents.map((incident) =>
      Date.parse(incident.occurred_at ?? incident.created_at),
    ),
  );
  const rangeStart =
    range === "all"
      ? startOfUtcDay(earliestIncident)
      : startOfUtcDay(referenceMs - (Number(range) - 1) * DAY_MS);
  const start =
    aggregation === "weekly" ? startOfUtcWeek(rangeStart) : rangeStart;
  const end =
    aggregation === "weekly"
      ? startOfUtcWeek(referenceMs)
      : startOfUtcDay(referenceMs);
  const step = aggregation === "weekly" ? 7 * DAY_MS : DAY_MS;
  const counts = new Map<string, number>();
  for (const incident of incidents) {
    const timestamp = Date.parse(incident.occurred_at ?? incident.created_at);
    const bucket =
      aggregation === "weekly"
        ? startOfUtcWeek(timestamp)
        : startOfUtcDay(timestamp);
    const key = isoDay(bucket);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const points = [];
  for (let timestamp = start; timestamp <= end; timestamp += step) {
    const key = isoDay(timestamp);
    points.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return points;
}

function activityAggregation(
  incidents: InsightIncidentRow[],
  range: InsightsRange,
  referenceMs: number,
): "daily" | "weekly" {
  if (range === "90") return "weekly";
  if (range !== "all" || !incidents.length) return "daily";
  const earliest = Math.min(
    ...incidents.map((incident) =>
      Date.parse(incident.occurred_at ?? incident.created_at),
    ),
  );
  return referenceMs - earliest > 45 * DAY_MS ? "weekly" : "daily";
}

function uniqueById<T extends { id: string }>(rows: T[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}

function startOfUtcDay(timestamp: number) {
  const date = new Date(timestamp);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function startOfUtcWeek(timestamp: number) {
  const dayStart = startOfUtcDay(timestamp);
  const weekday = new Date(dayStart).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  return dayStart - daysSinceMonday * DAY_MS;
}

function isoDay(timestamp: number) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
