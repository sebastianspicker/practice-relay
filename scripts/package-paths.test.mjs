/** Tests for package-manifest path containment. */
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { resolvePackageEntry } from "./package-paths.mjs";

test("package entries remain inside their package and avoid symlinks", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-package-path-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const packageDirectory = join(root, "packages/example");
  mkdirSync(join(packageDirectory, "src"), { recursive: true });
  mkdirSync(join(packageDirectory, "secrets"), { recursive: true });
  writeFileSync(join(packageDirectory, "src/index.ts"), "export {};\n", "utf8");
  writeFileSync(join(packageDirectory, "secrets/internal.ts"), "export {};\n", "utf8");
  symlinkSync(join(packageDirectory, "src/index.ts"), join(packageDirectory, "linked.ts"));
  symlinkSync(join(packageDirectory, "secrets"), join(packageDirectory, "src/internal"));
  const outside = join(root, "outside");
  mkdirSync(outside, { recursive: true });
  writeFileSync(join(outside, "external.ts"), "export {};\n", "utf8");
  symlinkSync(outside, join(packageDirectory, "linked-directory"));

  assert.equal(
    resolvePackageEntry(root, packageDirectory, "./src/index.ts"),
    join(packageDirectory, "src/index.ts"),
  );
  for (const entry of [
    "../outside.ts",
    "/tmp/outside.ts",
    ".env.ts",
    "linked.ts",
    "linked-directory/external.ts",
    "src/internal/internal.ts",
  ]) {
    assert.throws(() => resolvePackageEntry(root, packageDirectory, entry), Error, entry);
  }
});
