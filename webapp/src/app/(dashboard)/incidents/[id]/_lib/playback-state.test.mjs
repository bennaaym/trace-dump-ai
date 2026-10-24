import assert from "node:assert/strict";
import test from "node:test";

import {
  clampSeekOffset,
  recordingAccessStatus,
  timelinePosition,
  validEventOffset,
} from "./playback-state.ts";

test("accepts a reliable AI event offset inside the recording", () => {
  assert.equal(validEventOffset(6, 20), 6);
});

test("rejects missing and out-of-range AI event offsets", () => {
  assert.equal(validEventOffset(null, 20), null);
  assert.equal(validEventOffset(0, 20), 0);
  assert.equal(validEventOffset(20, 20), null);
  assert.equal(validEventOffset(2, Number.NaN), null);
  assert.equal(validEventOffset(21, 20), null);
});

test("clamps keyframe seeks to the playable interval", () => {
  assert.equal(clampSeekOffset(-2, 20), 0);
  assert.equal(clampSeekOffset(8, 20), 8);
  assert.equal(clampSeekOffset(24, 20), 20);
});

test("positions partial evidence safely on the timeline", () => {
  assert.equal(timelinePosition(null, 20), 0);
  assert.equal(timelinePosition(5, 20), 25);
  assert.equal(timelinePosition(25, 20), 100);
  assert.equal(timelinePosition(5, 0), 0);
});

test("expired derivative timestamps never hide queued preparation or failure", () => {
  const old = "2026-10-23T00:00:00Z",
    now = Date.parse("2026-10-24T00:00:00Z");
  assert.equal(recordingAccessStatus("available", old, now), "expired");
  assert.equal(recordingAccessStatus("pending", old, now), "preparing");
  assert.equal(recordingAccessStatus("preparing", old, now), "preparing");
  assert.equal(recordingAccessStatus("failed", old, now), "failed");
  assert.equal(recordingAccessStatus("expired", null, now), "expired");
  assert.equal(
    recordingAccessStatus("available", "2026-10-25T00:00:00Z", now),
    "available",
  );
});
