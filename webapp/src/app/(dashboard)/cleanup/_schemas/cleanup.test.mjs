import assert from "node:assert/strict";
import test from "node:test";

import { cleanupMutationSchema } from "./cleanup.ts";

const base = {
  caseId: "10000000-0000-4000-8000-000000000001",
  expectedUpdatedAt: "2026-10-23T12:00:00.000Z",
};

test("assignment requires a team and one supported SLA", () => {
  assert.equal(
    cleanupMutationSchema.safeParse({ ...base, action: "assign_cleanup" })
      .success,
    false,
  );
  for (const slaHours of [24, 48, 72]) {
    assert.equal(
      cleanupMutationSchema.safeParse({
        ...base,
        action: "assign_cleanup",
        teamId: "20000000-0000-4000-8000-000000000001",
        slaHours,
      }).success,
      true,
    );
  }
  assert.equal(
    cleanupMutationSchema.safeParse({
      ...base,
      action: "assign_cleanup",
      teamId: "20000000-0000-4000-8000-000000000001",
      slaHours: 36,
    }).success,
    false,
  );
});

test("marking a site cleaned needs no fabricated completion report", () => {
  assert.equal(
    cleanupMutationSchema.safeParse({ ...base, action: "mark_cleaned" })
      .success,
    true,
  );
});

test("verification resolution requires outcome and notes", () => {
  assert.equal(
    cleanupMutationSchema.safeParse({
      ...base,
      action: "resolve",
      notes: "Site visually checked by the coordinator.",
    }).success,
    false,
  );
  for (const resolutionOutcome of [
    "cleanup_completed",
    "site_already_cleared",
  ]) {
    assert.equal(
      cleanupMutationSchema.safeParse({
        ...base,
        action: "resolve",
        resolutionOutcome,
        notes: "Site visually checked by the coordinator.",
      }).success,
      true,
    );
  }
});

test("reopening and manual notes require an explanation", () => {
  for (const action of ["reopen", "add_note"]) {
    assert.equal(
      cleanupMutationSchema.safeParse({ ...base, action }).success,
      false,
    );
  }
});
