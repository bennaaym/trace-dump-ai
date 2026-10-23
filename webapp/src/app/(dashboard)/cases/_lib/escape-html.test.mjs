import assert from "node:assert/strict";
import test from "node:test";

import { escapeHtml } from "./escape-html.ts";

test("report text is HTML-escaped so incident descriptions cannot inject markup", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('1')">&`),
    "&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;",
  );
});
