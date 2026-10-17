import assert from "node:assert/strict";
import test from "node:test";

import { preparePlaybackSchema } from "./playback.ts";

test("accepts only a database incident UUID for playback preparation", () => {
  assert.equal(
    preparePlaybackSchema.safeParse({
      incidentId: "9b16dda3-cf46-5435-9734-d42495519323",
    }).success,
    true,
  );
  assert.equal(
    preparePlaybackSchema.safeParse({
      incidentId: "xprotect://localhost/arbitrary",
    }).success,
    false,
  );
});
