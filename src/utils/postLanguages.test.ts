import assert from "node:assert/strict";
import test from "node:test";

import {
  isValidPostLanguage,
  isSpagePostLanguage,
  localizedPostFilename,
  normalizePostLanguage,
  parsePostFilename,
  spagePostLanguageName,
} from "./postLanguages";

test("groups default and localized filenames by slug", () => {
  assert.deepEqual(parsePostFilename("my.post.md"), { slug: "my.post", language: null });
  assert.deepEqual(parsePostFilename("my.post.zh-CN.md"), { slug: "my.post", language: "zh-CN" });
  assert.equal(localizedPostFilename("my.post.ja.md", "pt-br"), "my.post.pt-BR.md");
});

test("validates and normalizes supported BCP 47 language tags", () => {
  assert.equal(isValidPostLanguage("zh-Hant-TW"), true);
  assert.equal(normalizePostLanguage("ZH-hant-tw"), "zh-Hant-TW");
  assert.equal(normalizePostLanguage("SL-ROZAJ"), "sl-rozaj");
  assert.equal(normalizePostLanguage("ca-VALENCIA"), "ca-valencia");
  assert.equal(isValidPostLanguage("not-a-valid-language"), false);
  assert.equal(isValidPostLanguage("123"), false);
});

test("only exposes languages supported by the Spage frontend", () => {
  assert.equal(isSpagePostLanguage("en"), true);
  assert.equal(isSpagePostLanguage("zh-CN"), true);
  assert.equal(isSpagePostLanguage("ja"), true);
  assert.equal(isSpagePostLanguage("fr"), false);
  assert.equal(spagePostLanguageName("zh-CN"), "简体中文");
  assert.equal(spagePostLanguageName("ja"), "日本語");
});
