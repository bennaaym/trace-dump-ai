import assert from "node:assert/strict";
import test from "node:test";

import {
  buildVisibleCleanupActivity,
  calculateCleanupDueAt,
  cleanupKpis,
  filterCleanupCases,
  isCleanupOverdue,
  selectableCleanupTeams,
  sortCleanupCases,
} from "./cleanup-data.ts";

const referenceTime = "2026-10-23T12:00:00.000Z";

function cleanupCase(overrides = {}) {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    incidentId: "20000000-0000-4000-8000-000000000001",
    status: "awaiting_cleanup",
    assignedTeamId: null,
    assignedTeamName: null,
    assignedAt: null,
    slaHours: null,
    dueAt: null,
    instructions: null,
    completionReport: null,
    resolutionOutcome: null,
    resolutionNotes: null,
    startedAt: null,
    resolvedAt: null,
    resolverLabel: null,
    reconciliationRequired: false,
    createdAt: "2026-10-20T12:00:00.000Z",
    updatedAt: "2026-10-20T12:00:00.000Z",
    incident: {
      description: "Waste bags left beside bins",
      occurredAt: "2026-10-20T10:00:00.000Z",
      createdAt: "2026-10-20T11:00:00.000Z",
      latitude: 44.84,
      longitude: -0.58,
      locationSource: "real",
      cameraName: "Riverside Camera",
    },
    history: [],
    ...overrides,
  };
}

test("overdue is derived only for unresolved cases past their deadline", () => {
  assert.equal(
    isCleanupOverdue(
      cleanupCase({ dueAt: "2026-10-22T12:00:00.000Z" }),
      referenceTime,
    ),
    true,
  );
  assert.equal(
    isCleanupOverdue(
      cleanupCase({
        status: "resolved",
        dueAt: "2026-10-22T12:00:00.000Z",
      }),
      referenceTime,
    ),
    false,
  );
});

test("SLA deadlines use the original UTC assignment timestamp", () => {
  const assignedAt = "2026-10-23T12:00:00.000Z";
  assert.equal(
    calculateCleanupDueAt(assignedAt, 24),
    "2026-10-24T12:00:00.000Z",
  );
  assert.equal(
    calculateCleanupDueAt(assignedAt, 72),
    "2026-10-26T12:00:00.000Z",
  );
  assert.equal(calculateCleanupDueAt(null, 48), null);
});

test("team choices exclude inactive teams from new assignments", () => {
  const teams = [
    { id: "active", name: "Cleanup Team A", active: true },
    { id: "inactive", name: "Retired Team", active: false },
  ];
  assert.deepEqual(
    selectableCleanupTeams(teams, null).map((team) => team.id),
    ["active"],
  );
});

test("an inactive team remains visible on its existing assignment", () => {
  const teams = [
    { id: "active", name: "Cleanup Team A", active: true },
    { id: "inactive", name: "Retired Team", active: false },
  ];
  assert.deepEqual(
    selectableCleanupTeams(teams, "inactive").map((team) => team.id),
    ["active", "inactive"],
  );
});

test("cleanup KPI counts reflect actual records", () => {
  const result = cleanupKpis(
    [
      cleanupCase({ dueAt: "2026-10-22T12:00:00.000Z" }),
      cleanupCase({ id: "2", status: "in_progress" }),
      cleanupCase({ id: "3", status: "verification" }),
      cleanupCase({ id: "4", status: "resolved" }),
    ],
    referenceTime,
  );
  assert.deepEqual(result, {
    awaiting: 1,
    inProgress: 1,
    verification: 1,
    overdue: 1,
  });
});

test("filters search case, incident, team, and camera fields", () => {
  const assigned = cleanupCase({
    assignedTeamId: "30000000-0000-4000-8000-000000000001",
    assignedTeamName: "Central Response",
  });
  assert.equal(
    filterCleanupCases([assigned], {
      query: "central response",
      status: "awaiting_cleanup",
    }).length,
    1,
  );
  assert.equal(
    filterCleanupCases([assigned], {
      query: "missing",
      status: "all",
    }).length,
    0,
  );
});

test("default ordering prioritizes overdue, verification, active deadline, resolved", () => {
  const ordered = sortCleanupCases(
    [
      cleanupCase({ id: "resolved", status: "resolved" }),
      cleanupCase({
        id: "active",
        status: "in_progress",
        dueAt: "2026-10-25T12:00:00.000Z",
      }),
      cleanupCase({ id: "verify", status: "verification" }),
      cleanupCase({ id: "overdue", dueAt: "2026-10-22T12:00:00.000Z" }),
    ],
    referenceTime,
  );
  assert.deepEqual(
    ordered.map((item) => item.id),
    ["overdue", "verify", "active", "resolved"],
  );
});

test("activity combines audit rows created by one assignment transaction", () => {
  const createdAt = "2026-10-23T12:00:00.000Z";
  const activity = buildVisibleCleanupActivity([
    historyEvent("status", "status_transition", createdAt, {
      previousStatus: "awaiting_cleanup",
      newStatus: "in_progress",
    }),
    historyEvent("team", "team_assignment", createdAt),
    historyEvent("sla", "sla_change", createdAt),
  ]);
  assert.equal(activity.length, 1);
  assert.equal(activity[0].label, "Cleanup assigned and started");
  assert.equal(activity[0].detail, null);
});

test("activity hides technical notes but keeps operator-authored notes", () => {
  const activity = buildVisibleCleanupActivity([
    historyEvent("team", "team_assignment", referenceTime, {
      notes: "assigned_team_id changed from database value",
    }),
    historyEvent("note", "note", "2026-10-23T11:00:00.000Z", {
      notes: "Gate code confirmed with site owner.",
    }),
  ]);
  assert.equal(activity[0].detail, null);
  assert.equal(activity[1].detail, "Gate code confirmed with site owner.");
});

function historyEvent(id, eventType, createdAt, overrides = {}) {
  return {
    id,
    actorId: "operator-1",
    actorLabel: "Coordinator",
    eventType,
    previousStatus: null,
    newStatus: null,
    notes: null,
    createdAt,
    ...overrides,
  };
}
