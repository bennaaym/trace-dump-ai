import assert from "node:assert/strict";
import test from "node:test";

import { isOverdue, overdueLabel } from "./overdue.ts";

const now = Date.parse("2026-10-21T12:00:00Z");
const hoursAgo = (hours) => new Date(now - hours * 3_600_000).toISOString();

test("a pending review is overdue only after 24 hours", () => {
  const input = (hours) => ({
    recordedAt: hoursAgo(hours),
    reviewStatus: "pending_review",
    caseStatus: null,
  });
  assert.equal(isOverdue(input(23.9), now), false);
  assert.equal(isOverdue(input(24), now), false);
  assert.equal(isOverdue(input(24.1), now), true);
});

test("dismissed incidents and started or resolved cases are never overdue", () => {
  const old = hoursAgo(100);
  const overdue = (reviewStatus, caseStatus) =>
    isOverdue({ recordedAt: old, reviewStatus, caseStatus }, now);
  assert.equal(overdue("dismissed", null), false);
  assert.equal(overdue("confirmed", "in_progress"), false);
  assert.equal(overdue("confirmed", "resolved"), false);
  assert.equal(overdue("confirmed", "open"), true);
  assert.equal(overdue("confirmed", "assigned"), true);
  assert.equal(overdue("needs_investigation", null), true);
});

test("an assigned case that has not started still becomes overdue", () => {
  assert.equal(
    isOverdue(
      {
        recordedAt: hoursAgo(30),
        reviewStatus: "confirmed",
        caseStatus: "assigned",
      },
      now,
    ),
    true,
  );
  assert.equal(
    isOverdue(
      {
        recordedAt: hoursAgo(30),
        reviewStatus: "confirmed",
        caseStatus: "in_progress",
      },
      now,
    ),
    false,
  );
});

test("overdue labels switch from hours to days after 48 hours", () => {
  assert.equal(overdueLabel(hoursAgo(30), now), "Overdue 30h");
  assert.equal(overdueLabel(hoursAgo(75), now), "Overdue 3d");
});
