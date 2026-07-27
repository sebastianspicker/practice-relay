/** Tests that repository claim walkers never follow symlinks. */
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
import { walk as collectBrandFiles } from "./assert-kill-switches.mjs";
import { collectFiles as collectLabFiles } from "./assert-lab-only-procurement.mjs";

test("claim walkers ignore file and directory symlinks", (context) => {
  const root = mkdtempSync(join(tmpdir(), "practice-relay-scanner-root-"));
  const outside = mkdtempSync(join(tmpdir(), "practice-relay-scanner-outside-"));
  context.after(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const surface = join(root, "surface");
  mkdirSync(surface, { recursive: true });
  writeFileSync(join(surface, "safe.md"), "safe\n", "utf8");
  writeFileSync(join(outside, "external.md"), "external\n", "utf8");
  symlinkSync(join(outside, "external.md"), join(surface, "linked-file.md"));
  symlinkSync(outside, join(surface, "linked-directory"));

  assert.deepEqual(
    collectBrandFiles(root, root).map((path) => path.slice(root.length + 1)),
    ["surface/safe.md"],
  );
  assert.deepEqual(collectLabFiles("surface", [], root), ["surface/safe.md"]);
});
