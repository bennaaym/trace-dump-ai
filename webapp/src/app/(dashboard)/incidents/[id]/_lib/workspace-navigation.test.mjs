import assert from "node:assert/strict";
import test from "node:test";

import {
  incidentWorkspaceHref,
  normalizeIncidentTab,
  safeIncidentListReturn,
} from "./workspace-navigation.ts";

test("normalizes linkable incident tabs", () => {
  assert.equal(normalizeIncidentTab("evidence"), "overview");
  assert.equal(normalizeIncidentTab("unknown"), "overview");
  assert.equal(normalizeIncidentTab(null), "overview");
});

test("removes legacy evidence frame state", () => {
  assert.equal(
    incidentWorkspaceHref(
      "/incidents/123",
      "tab=evidence&frame=event",
      "history",
    ),
    "/incidents/123?tab=history",
  );
});

test("links the AI action to the overview event position", () => {
  assert.equal(
    incidentWorkspaceHref(
      "/incidents/123",
      "tab=analysis",
      "overview",
      "event",
    ),
    "/incidents/123?tab=overview&seek=event",
  );
});

test("accepts only incident-list return locations", () => {
  assert.equal(
    safeIncidentListReturn("/incidents?camera=abc&page=2"),
    "/incidents?camera=abc&page=2",
  );
  assert.equal(safeIncidentListReturn("https://example.com"), "/incidents");
  assert.equal(safeIncidentListReturn("/reports"), "/incidents");
});
