import test from "node:test";
import assert from "node:assert/strict";
import { assessPriority } from "./priority.ts";
// All model responses below are synthetic contract fixtures, not live findings.
const response = (updates = {}) =>
  JSON.stringify({
    schema_version: "investigation_v1",
    risk_factors: Object.fromEntries(
      assessPriority(null, 45)
        .factors.map((f) => f.key)
        .map((k) => [
          k,
          {
            status: updates[k] ?? "no",
            evidence: "Synthetic visible assessment",
            offset_seconds: 2,
          },
        ]),
    ),
  });
test("legacy, malformed, missing and unsupported risks remain unknown", () => {
  for (const text of [
    null,
    "not JSON",
    "{}",
    JSON.stringify({
      risk_factors: {
        roadway_blocked: { status: "yes", evidence: "Synthetic" },
      },
    }),
  ])
    assert.equal(assessPriority(text, 45).level, "unknown");
});
test("all factors explicitly absent is low", () =>
  assert.equal(assessPriority(response(), 45).level, "low"));
test("each high-risk factor escalates priority", () => {
  for (const key of [
    "roadway_blocked",
    "pedestrian_path_blocked",
    "visible_smoke",
    "visible_leakage",
  ])
    assert.equal(assessPriority(response({ [key]: "yes" }), 45).level, "high");
});
test("each medium-risk factor escalates priority", () => {
  for (const key of [
    "large_material",
    "scattered_material",
    "near_entrance_or_crossing",
  ])
    assert.equal(
      assessPriority(response({ [key]: "yes" }), 45).level,
      "medium",
    );
});
test("unknown never becomes low; high outranks medium", () => {
  assert.equal(
    assessPriority(response({ large_material: "unknown" }), 45).level,
    "unknown",
  );
  const assessment = assessPriority(
    response({ roadway_blocked: "yes", large_material: "yes" }),
    45,
  );
  assert.equal(assessment.level, "high");
  assert.deepEqual(assessment.reasons, ["Roadway blocked"]);
});
test("unexplained, invalid and boolean statuses remain unknown", () => {
  for (const item of [
    { status: "yes" },
    { status: true, evidence: "Synthetic" },
    { status: "no", evidence: " " },
    { status: "maybe", evidence: "Synthetic" },
  ]) {
    const assessed = assessPriority(
      JSON.stringify({
        schema_version: "investigation_v1",
        risk_factors: { roadway_blocked: item },
      }),
      45,
    );
    assert.equal(assessed.level, "unknown");
    assert.equal(assessed.factors[0].status, "unknown");
  }
});
test("only bounded real timestamps produce supporting links", () => {
  for (const offset of [-1, 45, true, "2", null]) {
    const assessed = assessPriority(
      JSON.stringify({
        schema_version: "investigation_v1",
        risk_factors: {
          roadway_blocked: {
            status: "yes",
            evidence: "Synthetic",
            offset_seconds: offset,
          },
        },
      }),
      45,
    );
    assert.equal(assessed.level, "high");
    assert.equal(assessed.factors[0].offset, null);
  }
  assert.equal(assessPriority(response(), 45).factors[0].offset, 2);
});
