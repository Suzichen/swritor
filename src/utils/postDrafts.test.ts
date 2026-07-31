import assert from "node:assert/strict";
import test from "node:test";

import { mergePostDraftValues, postDraftValues } from "./postDrafts";

test("normalizes pending tag and category drafts", () => {
  assert.deepEqual(postDraftValues("Frontend Guides, API， 测试"), [
    "Frontend Guides",
    "API",
    "测试",
  ]);
  assert.deepEqual(mergePostDraftValues(["existing", "API"], "API, new"), [
    "existing",
    "API",
    "new",
  ]);
});

test("keeps a duplicate draft visible as pending until it is committed or discarded", () => {
  assert.deepEqual(mergePostDraftValues(["API"], "API"), ["API"]);
});
