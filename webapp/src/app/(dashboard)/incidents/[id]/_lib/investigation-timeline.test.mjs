import assert from "node:assert/strict";
import test from "node:test";
import { investigationTimeline } from "./investigation-timeline.ts";

test("links only actual matching evidence and keeps invalid times unknown", () => {
  const response = JSON.stringify({
    schema_version: "investigation_v1",
    observations: [
      { id: "late", claim: "Synthetic later action", offset_seconds: 7 },
      { id: "early", claim: "Synthetic initial state", offset_seconds: 0 },
      { id: "outside", claim: "Synthetic invalid time", offset_seconds: 50 },
      { id: "late", claim: "Duplicate", offset_seconds: 2 },
    ],
  });
  const frames = [
    {
      id: "frame",
      offsetSeconds: 7.1,
      metadata: { observation_id: "late" },
      signedUrl: "/synthetic-test.jpg",
    },
  ];
  const result = investigationTimeline(response, 20, frames);
  assert.deepEqual(
    result.observations.map((o) => o.id),
    ["early", "late", "outside"],
  );
  assert.equal(result.observations[1].frame.id, "frame");
  assert.equal(result.observations[1].verifiedOffset, 7);
  assert.equal(result.observations[0].frame, null);
  assert.equal(result.observations[0].verifiedOffset, null);
  assert.equal(result.observations[2].offset, null);
});

test("accepts the underscore observation IDs used by the analysis prompt", () => {
  const response = JSON.stringify({
    schema_version: "investigation_v1",
    observations: [
      {
        id: "object_release",
        claim: "Synthetic release",
        offset_seconds: 3,
      },
    ],
  });

  const result = investigationTimeline(response, 20, []);
  assert.equal(result.observations[0].id, "object_release");
  assert.equal(result.observations[0].offset, 3);
});

test("only distinct stored frames verify timeline timestamps", () => {
  const response = JSON.stringify({
    schema_version: "investigation_v1",
    observations: [
      { id: "release", claim: "Synthetic release", offset_seconds: 0 },
      { id: "aftermath", claim: "Synthetic aftermath", offset_seconds: 0 },
    ],
  });
  const frames = [
    {
      id: "release-frame",
      offsetSeconds: 0,
      sha256: "same-source-frame",
      storagePath: "release.jpg",
      metadata: { observation_id: "release" },
      signedUrl: "/release.jpg",
    },
    {
      id: "aftermath-frame",
      offsetSeconds: 0,
      sha256: "same-source-frame",
      storagePath: "aftermath.jpg",
      metadata: { observation_id: "aftermath" },
      signedUrl: "/aftermath.jpg",
    },
  ];
  const result = investigationTimeline(response, 20, frames);
  assert.equal(result.observations[0].verifiedOffset, 0);
  assert.equal(result.observations[1].verifiedOffset, null);
  assert.equal(result.observations[1].frame, null);
});
test("flags the observed positive-versus-no-deposit conflict in a legacy response", () => {
  const result = investigationTimeline(
    "Dumping detected: Yes\nSequence of events: No objects are visibly released or deposited on the ground.",
    20,
    [],
  );
  assert.equal(result.observations.length, 0);
  assert.equal(result.warnings.length, 1);
});
test("does not manufacture a legacy timeline or flag ordinary negative text", () => {
  assert.equal(
    investigationTimeline(
      "Dumping detected: No\nNo objects are visibly released.",
      20,
      [],
    ).warnings.length,
    0,
  );
  assert.equal(investigationTimeline(null, 20, []).observations.length, 0);
});

test("new event references must support the event time; explicit unknown observations stay untimed", () => {
  const response = JSON.stringify({
    schema_version: "investigation_v1",
    dumping_detected: "yes",
    event_offset_seconds: 0.3,
    event_observation_id: "release",
    observations: [
      { id: "release", claim: "Synthetic release", offset_seconds: 3.4 },
      {
        id: "untimed",
        claim: "Synthetic unclear action",
        offset_seconds: 0,
        timing_basis: "unknown",
      },
    ],
  });
  const result = investigationTimeline(response, 45, [], true);
  assert.ok(result.warnings.some((w) => w.includes("Event time withheld")));
  assert.equal(
    result.observations.find((o) => o.id === "untimed").offset,
    null,
  );
});
