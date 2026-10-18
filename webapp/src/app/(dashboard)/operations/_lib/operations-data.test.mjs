import assert from "node:assert/strict";
import test from "node:test";

import { buildOperationsData } from "./operations-data.ts";

const cameras = [
  {
    id: "camera-disabled",
    name: "Disabled camera",
    latitude: 44.84,
    longitude: -0.58,
    location_source: "simulated",
    enabled: false,
  },
  {
    id: "camera-empty",
    name: "No incidents",
    latitude: null,
    longitude: null,
    location_source: "simulated",
    enabled: true,
  },
];

test("keeps disabled cameras and cameras without incidents", () => {
  const result = buildOperationsData(cameras, [], []);
  assert.equal(result.cameras.length, 2);
  assert.equal(result.cameras[0].enabled, false);
  assert.equal(result.cameras[1].incidentCount, 0);
});

test("aggregates incidents only through their detection camera", () => {
  const result = buildOperationsData(
    cameras,
    [
      {
        id: "detection-1",
        camera_id: "camera-disabled",
        created_at: "2026-10-18T09:00:00Z",
      },
    ],
    [
      {
        id: "incident-1",
        detection_id: "detection-1",
        review_status: "pending_review",
        occurred_at: "2026-10-18T08:30:00Z",
        created_at: "2026-10-18T08:40:00Z",
        latitude: 44.84,
        longitude: -0.58,
        location_source: "simulated",
      },
      {
        id: "not-visible-through-detection",
        detection_id: "missing-detection",
        review_status: "confirmed",
        occurred_at: null,
        created_at: "2026-10-18T08:00:00Z",
        latitude: 44.85,
        longitude: -0.57,
        location_source: "simulated",
      },
    ],
  );
  assert.equal(result.incidents.length, 1);
  assert.equal(result.cameras[0].incidentCount, 1);
  assert.equal(result.cameras[0].pendingIncidentCount, 1);
  assert.equal(result.cameras[1].incidentCount, 0);
});
