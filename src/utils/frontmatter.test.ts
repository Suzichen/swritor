import assert from "node:assert/strict";
import test from "node:test";
import { Document } from "yaml";

import { parsePostSource, serializePostSource } from "./frontmatter";

test("keeps an absent preview absent instead of freezing an auto summary", () => {
  const parsed = parsePostSource("---\ntitle: Hello\ndraft: true\n---\nBody summary");
  assert.equal(parsed.metadata.preview, undefined);

  const result = serializePostSource(parsed.document, {
    title: "Hello",
    date: "",
    tags: [],
    categories: [],
    preview: "",
  }, parsed.body);

  assert.doesNotMatch(result, /^preview:/m);
  assert.match(result, /^draft: true/m);
});

test("quotes titles and dates safely without mutating the parsed document", () => {
  const document = new Document({ custom: "keep" });
  const result = serializePostSource(document, {
    title: "Release: #1",
    date: "2026-07-31 12:30",
    tags: ["news"],
    categories: [],
    preview: "A: summary",
  }, "Content");
  const reparsed = parsePostSource(result);

  assert.equal(reparsed.metadata.title, "Release: #1");
  assert.equal(reparsed.metadata.date, "2026-07-31 12:30:00");
  assert.equal(document.has("title"), false);
  assert.equal(document.get("custom"), "keep");
});

test("rejects invalid frontmatter field shapes", () => {
  assert.throws(
    () => parsePostSource("---\ntitle: [not, text]\n---\nBody"),
    /title 必须是文本/,
  );
  assert.throws(() => parsePostSource("---\n- invalid\n- root\n---\nBody"), /必须是键值对象/);
});

test("accepts the tag and category forms supported by Spage", () => {
  const parsed = parsePostSource([
    "---",
    "title: Compatible post",
    "tags: rust, api testing",
    "categories: Frontend Guides",
    "---",
    "Body",
  ].join("\n"));

  assert.deepEqual(parsed.metadata.tags, ["rust", "api", "testing"]);
  assert.deepEqual(parsed.metadata.categories, ["Frontend", "Guides"]);

  const sequence = parsePostSource("---\ntags: [one, 2, true, null, { nested: value }]\n---\nBody");
  assert.deepEqual(sequence.metadata.tags, ["one", "2", "true"]);
});

test("recognizes BOM, leading whitespace, and empty frontmatter without duplicating it", () => {
  for (const raw of [
    "\uFEFF---\ntitle: BOM post\n---\nBody",
    "\n  ---\ntitle: Indented post\n---\nBody",
    "---\n---\nBody",
  ]) {
    const parsed = parsePostSource(raw);
    assert.equal(parsed.body, "Body");
    const result = serializePostSource(parsed.document, {
      title: parsed.metadata.title ?? "Empty post",
      date: "",
      tags: [],
      categories: [],
      preview: "",
    }, parsed.body);
    assert.equal((result.match(/^---$/gm) ?? []).length, 2);
    assert.equal(parsePostSource(result).body, "Body");
  }
});
