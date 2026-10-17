import assert from "node:assert/strict";
import test from "node:test";

import { preferredEvidence } from "./evidence-viewer-state.ts";

const frame = (id, role, signedUrl = `https://storage.test/${id}`) => ({
  id,
  role,
  signedUrl,
});

test("selects the sole evidence frame", () => {
  assert.equal(preferredEvidence([frame("only", "before")])?.id, "only");
});

test("selects the best available frame from a partial two-frame set", () => {
  assert.equal(
    preferredEvidence([frame("event", "event", null), frame("after", "after")])
      ?.id,
    "after",
  );
});

test("selects the event frame from a complete three-frame set", () => {
  assert.equal(
    preferredEvidence([
      frame("before", "before"),
      frame("event", "event"),
      frame("after", "after"),
    ])?.id,
    "event",
  );
});

test("prefers a representative frame when no event frame exists", () => {
  assert.equal(
    preferredEvidence([
      frame("before", "before"),
      frame("representative", "representative"),
    ])?.id,
    "representative",
  );
});
