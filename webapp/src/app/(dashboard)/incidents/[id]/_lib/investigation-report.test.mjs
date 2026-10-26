import assert from "node:assert/strict";
import test from "node:test";

import {
  distinctEvidenceClaims,
  investigationUncertainty,
} from "./investigation-report.ts";

test("collapses paraphrased release evidence while preserving aftermath", () => {
  assert.deepEqual(
    distinctEvidenceClaims([
      "A person releases a black plastic bag onto the grass.",
      "The black bag is released by the person onto the grass.",
      "The bag remains on the ground after the person's hand separates.",
    ]),
    [
      "A person releases a black plastic bag onto the grass.",
      "The bag remains on the ground after the person's hand separates.",
    ],
  );
});

test("does not present positive visibility language as uncertainty", () => {
  assert.equal(
    investigationUncertainty(
      "Visibility is clear and the deposit is unambiguous.",
    ),
    "No material visual limitation was reported. The footage alone does not establish whether disposal was authorized.",
  );
});

test("retains actual limitations and unresolved interpretations", () => {
  assert.equal(
    investigationUncertainty(
      "The release is clearly visible. The exact object type cannot be determined.",
    ),
    "The exact object type cannot be determined.",
  );
});
