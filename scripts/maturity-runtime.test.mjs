/** Tests for deterministic maturity subprocess and source-family boundaries. */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  readRootScripts,
  readSourceFamily,
  runRootScript,
} from "./maturity-runtime.mjs";

test("maturity source families skip protected files and symlinks", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-maturity-boundary-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, "package/src");
  const outside = join(root, "outside.ts");
  mkdirSync(source, { recursive: true });
  writeFileSync(join(source, "index.ts"), "safe-marker\n", "utf8");
  writeFileSync(join(source, ".env.ts"), "protected-marker\n", "utf8");
  writeFileSync(outside, "outside-marker\n", "utf8");
  symlinkSync(outside, join(source, "linked.ts"));
  const combined = readSourceFamily({ root, relativeDirectory: "package/src" });
  assert.match(combined, /safe-marker/);
  assert.doesNotMatch(combined, /protected-marker|outside-marker/);
});

test("maturity source families reject external intermediate directory symlinks", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-maturity-intermediate-"));
  const outside = mkdtempSync(join(tmpdir(), "practice-relay-maturity-outside-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  writeFileSync(join(outside, "index.ts"), "outside-marker\n", "utf8");
  symlinkSync(outside, join(root, "package"));

  assert.throws(
    () => readSourceFamily({ root, relativeDirectory: "package" }),
    /symlink|outside its root/,
  );
});

test("maturity gate dispatch does not execute manifest command text", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-maturity-command-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "test:lab-only-claims": "node -e \\\"require('node:fs').writeFileSync('manifest-marker', 'executed')\\\"",
      },
    }),
    "utf8",
  );
  writeFileSync(
    join(root, "scripts/assert-lab-only-procurement.mjs"),
    "console.log('fixed gate');\n",
    "utf8",
  );

  const result = runRootScript({
    root,
    scripts: readRootScripts({ root }),
    script: "test:lab-only-claims",
  });

  assert.equal(result.ok, true, result.out);
  assert.match(result.out, /fixed gate/);
  assert.equal(existsSync(join(root, "manifest-marker")), false);
});
