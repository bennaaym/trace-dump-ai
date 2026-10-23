import assert from "node:assert/strict";
import test from "node:test";

import { buildInsightsData } from "./insights-data.ts";

const referenceTime = "2026-10-18T23:59:59Z";
const cameras = [
  { id: "camera-a", name: "Camera A" },
  { id: "camera-b", name: "Camera B" },
];
const detections = [
  { id: "detection-a1", camera_id: "camera-a" },
  { id: "detection-a2", camera_id: "camera-a" },
  { id: "detection-b1", camera_id: "camera-b" },
  { id: "detection-old", camera_id: "camera-b" },
];

test("returns informative zero-data metrics without fabricating activity", () => {
  const result = buildInsightsData(
    { incidents: [], detections, reviews: [], analyses: [], cameras },
    "30",
    referenceTime,
  );

  assert.equal(result.recordedIncidentCount, 0);
  assert.equal(result.reviewCompletionRate, null);
  assert.equal(result.activity.length, 30);
  assert.ok(result.activity.every((point) => point.count === 0));
  assert.deepEqual(result.locations, []);
  assert.equal(result.medianFirstReviewMs, null);
});

test("keeps one-incident counts but hides a misleading location percentage", () => {
  const result = buildInsightsData(
    {
      incidents: [
        incident(
          "incident-1",
          "detection-a1",
          "pending_review",
          "2026-10-18T10:00:00Z",
        ),
      ],
      detections,
      reviews: [],
      analyses: [
        {
          id: "analysis-1",
          status: "completed",
          dumping_detected: "uncertain",
          created_at: "2026-10-18T10:00:00Z",
        },
      ],
      cameras,
    },
    "7",
    referenceTime,
  );

  assert.equal(result.recordedIncidentCount, 1);
  assert.equal(result.locations[0].percentage, null);
  assert.equal(
    result.activity.reduce((sum, point) => sum + point.count, 0),
    1,
  );
  assert.equal(result.analysisQuality.completed, 1);
  assert.equal(result.analysisQuality.uncertain, 1);
});

test("counts distinct reviewed incidents and uses only the first review for the median", () => {
  const result = buildInsightsData(
    {
      incidents: [
        incident(
          "incident-1",
          "detection-a1",
          "confirmed",
          "2026-10-18T09:00:00Z",
        ),
        incident(
          "incident-2",
          "detection-a2",
          "needs_investigation",
          "2026-10-17T09:00:00Z",
        ),
        incident(
          "incident-3",
          "detection-b1",
          "pending_review",
          "2026-10-16T09:00:00Z",
        ),
      ],
      detections,
      reviews: [
        { incident_id: "incident-1", created_at: "2026-10-18T09:10:00Z" },
        { incident_id: "incident-1", created_at: "2026-10-18T10:00:00Z" },
        { incident_id: "incident-2", created_at: "2026-10-17T09:30:00Z" },
      ],
      analyses: [],
      cameras,
    },
    "30",
    referenceTime,
  );

  assert.equal(result.recordedIncidentCount, 3);
  assert.equal(result.confirmedIncidentCount, 1);
  assert.equal(result.reviewedIncidentCount, 2);
  assert.equal(result.reviewCompletionRate, (2 / 3) * 100);
  assert.equal(result.medianFirstReviewMs, 20 * 60_000);
  assert.deepEqual(
    Object.fromEntries(
      result.outcomes.map((outcome) => [outcome.status, outcome.count]),
    ),
    {
      pending_review: 1,
      needs_investigation: 1,
      confirmed: 1,
      dismissed: 0,
    },
  );
  assert.equal(result.locations[0].cameraName, "Camera A");
  assert.equal(result.locations[0].total, 2);
  assert.equal(result.locations[0].percentage, (2 / 3) * 100);
});

test("applies the selected date range to incidents and analysis health", () => {
  const result = buildInsightsData(
    {
      incidents: [
        incident("recent", "detection-a1", "confirmed", "2026-10-18T09:00:00Z"),
        incident("old", "detection-old", "dismissed", "2026-08-01T09:00:00Z"),
      ],
      detections,
      reviews: [],
      analyses: [
        {
          id: "recent-analysis",
          status: "failed",
          dumping_detected: null,
          created_at: "2026-10-18T09:00:00Z",
        },
        {
          id: "old-analysis",
          status: "completed",
          dumping_detected: "yes",
          created_at: "2026-08-01T09:00:00Z",
        },
      ],
      cameras,
    },
    "30",
    referenceTime,
  );

  assert.equal(result.recordedIncidentCount, 1);
  assert.equal(result.analysisQuality.failed, 1);
  assert.equal(result.analysisQuality.completed, 0);
});

test("calculates cleanup operations from real lifecycle timestamps", () => {
  const result = buildInsightsData(
    {
      incidents: [],
      detections,
      reviews: [],
      analyses: [],
      cameras,
      cleanupCases: [
        cleanupCase("active", "in_progress", {
          due_at: "2026-10-17T10:00:00Z",
        }),
        cleanupCase("completed", "resolved", {
          resolution_outcome: "cleanup_completed",
          resolved_at: "2026-10-18T12:00:00Z",
        }),
        cleanupCase("clear", "resolved", {
          resolution_outcome: "site_already_cleared",
          resolved_at: "2026-10-18T14:00:00Z",
        }),
      ],
    },
    "30",
    referenceTime,
  );

  assert.equal(result.cleanupOperations.total, 3);
  assert.equal(result.cleanupOperations.active, 1);
  assert.equal(result.cleanupOperations.overdue, 1);
  assert.equal(result.cleanupOperations.resolved, 2);
  assert.equal(result.cleanupOperations.outcomes.cleanupCompleted, 1);
  assert.equal(result.cleanupOperations.outcomes.siteAlreadyCleared, 1);
  assert.equal(result.cleanupOperations.medianResolutionMs, 37 * 60 * 60_000);
});

function incident(id, detectionId, status, createdAt) {
  return {
    id,
    detection_id: detectionId,
    review_status: status,
    occurred_at: createdAt,
    created_at: createdAt,
  };
}

function cleanupCase(id, status, overrides = {}) {
  return {
    id,
    status,
    due_at: null,
    resolution_outcome: null,
    created_at: "2026-10-17T00:00:00Z",
    resolved_at: null,
    ...overrides,
  };
}
