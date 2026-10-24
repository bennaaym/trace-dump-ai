import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
// Transpile the renderer, resolving its three pure helpers for Node's test runner.
const source = readFileSync(
  new URL("./investigation-report.ts", import.meta.url),
  "utf8",
).replace(
  /from "(\.\/(?:priority|investigation-timeline|plate-evidence))"/g,
  (_, path) => `from "${new URL(path + ".ts", import.meta.url).href}"`,
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const { investigationReport } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
const fixture = () => ({
  id: "synthetic-incident",
  detectionId: "synthetic-detection",
  camera: { id: "camera-1", name: "Synthetic camera" },
  description: "Synthetic narrative",
  uncertainty: null,
  occurredAt: null,
  createdAt: "2026-10-24T00:00:00Z",
  latitude: 44.8,
  longitude: -0.5,
  locationSource: "simulated",
  reviewStatus: "pending_review",
  detection: {
    recordingStartAt: "2026-10-24T00:00:00Z",
    recordingEndAt: "2026-10-24T00:00:45Z",
    recordingUri: "SECRET-INTERNAL-URI",
  },
  analysis: {
    id: "analysis-1",
    promptVersion: "dumping_v5",
    modelId: "test-model",
    eventOffsetSeconds: null,
    investigationResponseText: null,
  },
  evidence: [],
  reviews: [],
  priorityHistory: [],
  priorityAdjustmentsAvailable: true,
});
test("legacy report preserves unknowns, labels AI versus human and excludes internal access links", () => {
  const html = investigationReport(
    fixture(),
    "2026-10-24T01:00:00Z",
    new Map(),
  );
  assert.match(html, /UNKNOWN/);
  assert.match(html, /No structured observation timeline/);
  assert.match(html, /No human decision recorded/);
  assert.match(html, /Simulated coordinates/);
  assert.match(html, /2026-10-24T01:00:00.000Z/);
  assert.doesNotMatch(html, /SECRET-INTERNAL-URI/);
});
test("untrusted model/review content is escaped and external image URLs rejected", () => {
  const f = fixture();
  f.description = '<script>alert("unsafe")</script>';
  f.reviews = [
    {
      createdAt: f.createdAt,
      reviewerLabel: "<img onerror=bad>",
      decision: "confirmed",
      notes: "<svg/onload=bad>",
    },
  ];
  f.evidence = [
    {
      id: "e1",
      role: "event",
      metadata: {},
      offsetSeconds: 0,
      sha256: "storedhash",
      signedUrl: "SECRET-SIGNED-URL",
      storagePath: "PRIVATE-PATH",
    },
  ];
  const html = investigationReport(
    f,
    f.createdAt,
    new Map([["e1", "https://attacker.test/image"]]),
  );
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<svg|onerror=bad>/);
  assert.doesNotMatch(
    html,
    /SECRET-SIGNED-URL|PRIVATE-PATH|https:\/\/attacker/,
  );
  assert.match(html, /Image unavailable or omitted/);
  assert.match(html, /storedhash/);
});
test("risk, timeline, original images, OCR candidate and human override survive export", () => {
  const f = fixture();
  f.analysis.investigationResponseText = JSON.stringify({
    schema_version: "investigation_v1",
    risk_factors: {
      roadway_blocked: {
        status: "yes",
        evidence: "Synthetic obstruction",
        offset_seconds: 2,
      },
    },
    observations: [
      { id: "obs1", offset_seconds: 2, claim: "Synthetic visible action" },
    ],
  });
  f.evidence = [
    {
      id: "source",
      role: "representative",
      metadata: { kind: "plate_source", observation_id: "obs1" },
      offsetSeconds: 2,
    },
    {
      id: "crop",
      role: "representative",
      metadata: {
        kind: "plate_crop",
        plate_status: "readable",
        plate_text: "TEST123",
        source_frame_id: "source",
      },
      offsetSeconds: 2,
    },
  ];
  f.priorityHistory = [
    {
      id: "p1",
      level: "low",
      reason: "Synthetic operator adjustment",
      reviewerId: "operator-1",
      createdAt: f.createdAt,
    },
  ];
  const html = investigationReport(
    f,
    f.createdAt,
    new Map([
      ["crop", "data:image/jpeg;base64,/9j/"],
      ["source", "data:image/jpeg;base64,/9j/"],
    ]),
  );
  for (const expected of [
    "OCR candidate: TEST123",
    "vehicle involvement is not established",
    "LOW (reviewer adjustment)",
    "Automatic: HIGH",
    "Synthetic visible action",
    "Synthetic operator adjustment",
    "+2.0 seconds",
    "data:image/jpeg;base64,/9j/",
  ])
    assert.ok(html.includes(expected), expected);
});
