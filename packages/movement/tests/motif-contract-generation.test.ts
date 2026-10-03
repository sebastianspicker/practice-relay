/** Generated Motif artifacts must remain byte-identical to their sole source. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { generatedMotifContractFiles } from "../scripts/generate-motif-contract.mjs";

test("Motif runtime, declarations, and schema enum match generated output exactly", () => {
  for (const [path, expected] of generatedMotifContractFiles()) {
    assert.equal(readFileSync(path, "utf8"), expected, path);
  }
});
