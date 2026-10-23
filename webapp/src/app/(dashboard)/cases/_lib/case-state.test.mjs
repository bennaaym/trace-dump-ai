import assert from "node:assert/strict";
import test from "node:test";

import { caseEventLabel, nextStatus, siteCheckLabel } from "./case-state.ts";

test("cases advance Assigned to In progress to Resolved only", () => {
  assert.equal(nextStatus("open"), null);
  assert.deepEqual(nextStatus("assigned"), {
    to: "in_progress",
    label: "Start work",
  });
  assert.deepEqual(nextStatus("in_progress"), {
    to: "resolved",
    label: "Resolve case",
  });
  assert.equal(nextStatus("resolved"), null);
});

test("audit labels distinguish first assignment from reassignment", () => {
  assert.equal(
    caseEventLabel("assignment_updated", { previous_owner_id: null }),
    "Owner assigned and next action chosen",
  );
  assert.equal(
    caseEventLabel("assignment_updated", { previous_owner_id: "abc" }),
    "Owner or next action changed",
  );
});

test("site check results are labelled as leads, never as resolutions", () => {
  assert.equal(siteCheckLabel("cleared"), "Looks cleared");
  assert.equal(siteCheckLabel("still_present"), "Waste still visible");
  assert.equal(siteCheckLabel("uncertain"), "Inconclusive");
  assert.equal(
    caseEventLabel("site_check_completed", { result: "cleared" }),
    "AI site check: looks cleared",
  );
});
