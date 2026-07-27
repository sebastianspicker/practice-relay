/** Regression tests for contained release-script inputs and outputs. */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  readContainedText,
  writeContainedText,
} from "./contained-output.mjs";

test("contained I/O rejects external inputs and intermediate symlinks", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-contained-root-"));
  const outside = mkdtempSync(join(tmpdir(), "practice-relay-contained-outside-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  mkdirSync(join(root, "fixtures"), { recursive: true });
  writeFileSync(join(root, "fixtures/input.json"), "{}\n", "utf8");
  writeFileSync(join(outside, "external.json"), "{}\n", "utf8");
  symlinkSync(outside, join(root, "fixtures/linked"), "dir");

  assert.equal(readContainedText(root, "fixtures/input.json"), "{}\n");
  assert.throws(
    () => readContainedText(root, join(outside, "external.json")),
    /escapes repository root/,
  );
  assert.throws(
    () => readContainedText(root, "fixtures/linked/external.json"),
    /symlink component/,
  );
});

test("contained writes reject linked output directories", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-output-root-"));
  const outside = mkdtempSync(join(tmpdir(), "practice-relay-output-outside-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  mkdirSync(join(root, "fixtures"), { recursive: true });
  symlinkSync(outside, join(root, "fixtures/output"), "dir");

  assert.throws(
    () => writeContainedText(root, "fixtures/output/result.json", "{}\n"),
    /symlink component/,
  );
  assert.throws(
    () => writeContainedText(root, join(outside, "result.json"), "{}\n"),
    /escapes repository root/,
  );
  assert.equal(existsSync(join(outside, "result.json")), false);
});

test("contained writes create safe repository output directories", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-output-safe-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const result = writeContainedText(root, "fixtures/generated/result.json", "{}\n");
  assert.equal(readFileSync(result, "utf8"), "{}\n");
  assert.throws(
    () => writeContainedText(root, "logs/result.json", "{}\n"),
    /protected/,
  );
});
