/** Unit tests for mvei-validate (corpus OK + invalid Motif). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { validateMveiDocument } from "./cli.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../..");
const corpus = join(root, "packages/movement-encode/fixtures/corpus");

const fixtures = [
  "motif-sketch-01.json",
  "motif-partial-02.json",
  "annotation-v0-demo.json",
] as const;

for (const name of fixtures) {
  test(`corpus fixture validates: ${name}`, () => {
    const result = validateMveiDocument(join(corpus, name));
    assert.equal(result.ok, true, result.message);
    assert.match(result.message, /^OK /);
  });
}

test("rejects empty object (unknown document type)", () => {
  const path = join(tmpdir(), `mvei-invalid-empty-${process.pid}.json`);
  writeFileSync(path, "{}");
  try {
    const result = validateMveiDocument(path);
    assert.equal(result.ok, false);
    assert.match(result.message, /Unknown document type/i);
  } finally {
    unlinkSync(path);
  }
});

for (const [name, value] of [
  ["null", null],
  ["array", []],
] as const) {
  test(`rejects non-object JSON root: ${name}`, () => {
    const path = join(tmpdir(), `mvei-invalid-root-${name}-${process.pid}.json`);
    writeFileSync(path, JSON.stringify(value));
    try {
      const result = validateMveiDocument(path);
      assert.equal(result.ok, false);
      assert.match(result.message, /non-null JSON object/i);
    } finally {
      unlinkSync(path);
    }
  });
}

test("rejects motif missing required fields", () => {
  const path = join(tmpdir(), `mvei-invalid-partial-${process.pid}.json`);
  // profile selects motif schema but required fields (id, items, etc.) are missing
  writeFileSync(path, JSON.stringify({ profile: "mvei-motif" }));
  try {
    const result = validateMveiDocument(path);
    assert.equal(result.ok, false);
    assert.ok(result.message.length > 0);
  } finally {
    unlinkSync(path);
  }
});
