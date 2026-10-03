/** Export-policy invariants shared by package and share application commands. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createEmptyRecord } from "@practice-relay/work-record";
import { authorizeShare, packageExport } from "./exports.ts";

test("package export and share apply the same record-release decision", () => {
  const record = createEmptyRecord("policy-check", "Policy check");
  const rejected = /consent|use policy/i;
  assert.throws(() => authorizeShare(record), rejected);
  assert.throws(() => packageExport(record, undefined, process.cwd()), rejected);
});
