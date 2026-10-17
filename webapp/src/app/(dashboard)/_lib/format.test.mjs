import assert from "node:assert/strict";
import test from "node:test";

import { reviewStatusLabel } from "./format.ts";

test("uses investigation-focused incident status labels", () => {
  assert.equal(reviewStatusLabel("pending_review"), "Suspected dumping");
  assert.equal(reviewStatusLabel("confirmed"), "Confirmed incident");
  assert.equal(reviewStatusLabel("dismissed"), "Dismissed");
  assert.equal(reviewStatusLabel("needs_investigation"), "Needs investigation");
});
