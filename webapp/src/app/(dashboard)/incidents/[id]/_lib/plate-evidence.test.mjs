import assert from "node:assert/strict";
import test from "node:test";
import { plateEvidence } from "./plate-evidence.ts";

const source = {
  id: "source",
  offsetSeconds: 7,
  metadata: { kind: "plate_source" },
  signedUrl: "/synthetic-frame.jpg",
};
const crop = {
  id: "crop",
  offsetSeconds: 7,
  metadata: {
    kind: "plate_crop",
    source_frame_id: "source",
    plate_status: "readable",
    plate_text: "ABC1234",
    vehicle_association: "hafnia_involved_vehicle_and_local_ocr_match",
  },
  signedUrl: "/synthetic-crop.jpg",
};
test("plate candidates link only the matching original frame", () => {
  const result = plateEvidence([source, crop], 20);
  assert.equal(result.candidates[0].text, "ABC1234");
  assert.equal(result.candidates[0].source.id, "source");
  assert.equal(
    plateEvidence([{ ...source, offsetSeconds: 9 }, crop], 20).candidates[0]
      .source,
    null,
  );
});
test("rejects invalid times and does not promote unreadable or malformed OCR", () => {
  assert.equal(
    plateEvidence([{ ...crop, offsetSeconds: 25 }], 20).candidates.length,
    0,
  );
  assert.equal(
    plateEvidence(
      [{ ...crop, metadata: { ...crop.metadata, plate_status: "unreadable" } }],
      20,
    ).candidates[0].text,
    null,
  );
  assert.equal(
    plateEvidence(
      [{ ...crop, metadata: { ...crop.metadata, plate_text: "<fake>" } }],
      20,
    ).candidates[0].text,
    null,
  );
});
test("distinguishes missing results from a completed negative sample", () => {
  assert.equal(plateEvidence([], 20).status, undefined);
  assert.equal(
    plateEvidence(
      [
        {
          ...source,
          metadata: { plate_scan: { status: "completed", sampled_frames: 32 } },
        },
      ],
      20,
    ).sampled,
    32,
  );
});

test("does not display plates without an involved-vehicle association", () => {
  const unassociated = {
    ...crop,
    metadata: { ...crop.metadata, vehicle_association: "unverified" },
  };
  assert.equal(plateEvidence([source, unassociated], 20).candidates.length, 0);
});
