import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { normalizeHafniaResponse } from "./hafnia-response.ts";

test("normalizes the actual fully structured Hafnia response fixture", () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL("./_fixtures/hafnia-response-complete.json", import.meta.url),
      "utf8",
    ),
  );
  const result = normalizeHafniaResponse(fixture.Response);

  assert.deepEqual(result, {
    sequenceOfEvents:
      "A black sedan traveling along the roadway releases an orange object from its interior, which falls onto the pavement and remains visible on the road surface. The vehicle continues forward without stopping or slowing noticeably.",
    peopleInvolved:
      "No pedestrians are visible; the driver remains inside the vehicle and is not seen exiting or interacting with the object.",
    vehiclesInvolved:
      "A black sedan moving along the roadway; parked vehicles line both curbs and do not move.",
    objectsInvolved:
      "An orange object (likely a bag or container) is released from the moving vehicle and lands on the roadway.",
    visualEvidence:
      "The orange object is seen falling from the black sedan and resting on the pavement, consistent with an object being thrown or released from a moving vehicle. No other objects are deposited, and the vehicle maintains steady motion.",
    uncertainties:
      "The exact nature of the orange object and whether it was intentionally discarded or accidentally released cannot be determined from the visible footage.",
  });
});

test("preserves multiline field content", () => {
  const result = normalizeHafniaResponse(`Sequence of events: First event.
Second event continues the sequence.
Evidence: Visible object movement.`);
  assert.equal(
    result.sequenceOfEvents,
    "First event. Second event continues the sequence.",
  );
});

test("returns unavailable fields without inventing content", () => {
  assert.deepEqual(normalizeHafniaResponse("People involved: Unknown"), {
    sequenceOfEvents: null,
    peopleInvolved: null,
    vehiclesInvolved: null,
    objectsInvolved: null,
    visualEvidence: null,
    uncertainties: null,
  });
});

test("preserves only fields supplied by a partial response", () => {
  assert.deepEqual(
    normalizeHafniaResponse(`Dumping detected: No
Sequence of events: A vehicle passes without depositing an object.
Uncertainties: The view is briefly occluded.`),
    {
      sequenceOfEvents: "A vehicle passes without depositing an object.",
      peopleInvolved: null,
      vehiclesInvolved: null,
      objectsInvolved: null,
      visualEvidence: null,
      uncertainties: "The view is briefly occluded.",
    },
  );
});

test("uses a narrative-only response as the event narrative", () => {
  assert.deepEqual(
    normalizeHafniaResponse(
      "A person approaches the curb. Visibility is insufficient to determine whether an object was left behind.",
    ),
    {
      sequenceOfEvents:
        "A person approaches the curb. Visibility is insufficient to determine whether an object was left behind.",
      peopleInvolved: null,
      vehiclesInvolved: null,
      objectsInvolved: null,
      visualEvidence: null,
      uncertainties: null,
    },
  );
});

test("returns empty details for a missing response", () => {
  assert.deepEqual(normalizeHafniaResponse(null), {
    sequenceOfEvents: null,
    peopleInvolved: null,
    vehiclesInvolved: null,
    objectsInvolved: null,
    visualEvidence: null,
    uncertainties: null,
  });
});

test("does not turn negative classification metadata into observations", () => {
  assert.deepEqual(
    normalizeHafniaResponse(`Dumping detected: No
Dumping type: Unknown
Event timestamp: Unknown`),
    {
      sequenceOfEvents: null,
      peopleInvolved: null,
      vehiclesInvolved: null,
      objectsInvolved: null,
      visualEvidence: null,
      uncertainties: null,
    },
  );
});

test("preserves evidence and limitations in an uncertain response", () => {
  const result = normalizeHafniaResponse(`Dumping detected: Uncertain
Evidence: An object is visible beside the vehicle after it departs.
Uncertainties: The release itself is obscured.`);

  assert.equal(
    result.visualEvidence,
    "An object is visible beside the vehicle after it departs.",
  );
  assert.equal(result.uncertainties, "The release itself is obscured.");
  assert.equal(result.sequenceOfEvents, null);
});

test("normalizes a structured JSON response without adding fields", () => {
  assert.deepEqual(
    normalizeHafniaResponse(
      JSON.stringify({
        sequence: "A vehicle stops and then leaves.",
        people: null,
        vehicles: "One van.",
        evidence: "A parcel remains after departure.",
      }),
    ),
    {
      sequenceOfEvents: "A vehicle stops and then leaves.",
      peopleInvolved: null,
      vehiclesInvolved: "One van.",
      objectsInvolved: null,
      visualEvidence: "A parcel remains after departure.",
      uncertainties: null,
    },
  );
});
