import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeDetectorMetadata } from "./technical-metadata.ts";

test("keeps detector parameters but removes machine paths and secret-like keys", () => {
  assert.deepEqual(
    sanitizeDetectorMetadata({
      detector: "MOG2+YOLO",
      hit_count: 12,
      internal_path: "C:/private/file",
      detector_config: {
        model: "src/models/yolo.pt",
        confidence: 0.25,
        password: "do-not-expose",
      },
    }),
    {
      detector: "MOG2+YOLO",
      hit_count: 12,
      detector_config: { confidence: 0.25 },
    },
  );
});
