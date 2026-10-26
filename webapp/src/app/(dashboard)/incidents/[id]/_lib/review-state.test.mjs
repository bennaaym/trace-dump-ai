import assert from "node:assert/strict";
import test from "node:test";

import { reviewState } from "./review-state.ts";

test("pending review exposes the two terminal decisions without requiring a reason", () => {
  const state = reviewState("pending_review");
  assert.equal(state.isPending, true);
  assert.equal(state.reasonRequired, false);
  assert.deepEqual(state.choices, ["confirmed", "dismissed"]);
});

test("needs investigation allows a subsequent terminal decision", () => {
  const state = reviewState("needs_investigation");
  assert.equal(state.isInvestigating, true);
  assert.equal(state.reasonRequired, true);
  assert.deepEqual(state.choices, ["confirmed", "dismissed"]);
});

test("confirmed is read-only until changing or reopening", () => {
  const state = reviewState("confirmed");
  assert.equal(state.isTerminal, true);
  assert.equal(state.reasonRequired, true);
  assert.deepEqual(state.choices, ["dismissed"]);
});

test("dismissed is read-only until changing or reopening", () => {
  const state = reviewState("dismissed");
  assert.equal(state.isTerminal, true);
  assert.equal(state.reasonRequired, true);
  assert.deepEqual(state.choices, ["confirmed"]);
});
