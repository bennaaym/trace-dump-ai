import assert from "node:assert/strict";
import test from "node:test";

import { reviewIncidentSchema } from "./review.ts";

const incidentId = "11111111-1111-4111-8111-111111111111";

test("allows an initial decision without notes", () => {
  const result = reviewIncidentSchema.safeParse({
    incidentId,
    expectedStatus: "pending_review",
    decision: "confirmed",
    notes: "",
  });
  assert.equal(result.success, true);
});

test("requires a reason to change an existing review", () => {
  const result = reviewIncidentSchema.safeParse({
    incidentId,
    expectedStatus: "needs_investigation",
    decision: "confirmed",
    notes: "",
  });
  assert.equal(result.success, false);
});

test("rejects repeated decisions", () => {
  const result = reviewIncidentSchema.safeParse({
    incidentId,
    expectedStatus: "confirmed",
    decision: "confirmed",
    notes: "Duplicate attempt",
  });
  assert.equal(result.success, false);
});
