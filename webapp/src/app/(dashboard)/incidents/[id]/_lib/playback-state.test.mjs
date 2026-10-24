import assert from "node:assert/strict";
import test from "node:test";

import { clampSeekOffset, validEventOffset } from "./playback-state.ts";

test("accepts a reliable AI event offset inside the recording", () => {
  assert.equal(validEventOffset(6, 20), 6);
});

test("rejects missing, zero and out-of-range AI event offsets", () => {
  assert.equal(validEventOffset(null, 20), null);
  assert.equal(validEventOffset(0, 20), null);
  assert.equal(validEventOffset(21, 20), null);
});

test("clamps keyframe seeks to the playable interval", () => {
  assert.equal(clampSeekOffset(-2, 20), 0);
  assert.equal(clampSeekOffset(8, 20), 8);
  assert.equal(clampSeekOffset(24, 20), 20);
});
