/** Contract tests for lossless complete-WorkRecord RO-Crate transport. */
import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyRecord } from "@practice-relay/work-record";
import { readRoCrate13, writeRoCrate13 } from "../src/ro-crate-record.ts";

test("RO-Crate record transport preserves the complete WorkRecord identity", () => {
  const record = createEmptyRecord("wr-lossless", "Lossless handoff");
  const pkg = writeRoCrate13(record);

  assert.deepEqual(readRoCrate13(pkg), record);
  assert.match(pkg.files["ro-crate-metadata.json"]!, /ro\/crate\/1\.3/);
  assert.equal(JSON.parse(pkg.files["work-record.json"]!).id, "wr-lossless");
});

test("RO-Crate record transport rejects metadata that cannot identify its payload", () => {
  assert.throws(
    () =>
      readRoCrate13({
        files: {
          "work-record.json": JSON.stringify(createEmptyRecord("wr-invalid", "Invalid")),
          "ro-crate-metadata.json": JSON.stringify({ "@graph": [] }),
        },
      }),
    /metadata descriptor is missing/,
  );
});

test("RO-Crate record transport rejects untrusted JSON outside the WorkRecord schema", () => {
  const pkg = writeRoCrate13(createEmptyRecord("wr-invalid-schema", "Invalid schema"));
  const record = JSON.parse(pkg.files["work-record.json"]!) as { revision: number };
  record.revision = -1;
  pkg.files["work-record.json"] = JSON.stringify(record);
  assert.throws(() => readRoCrate13(pkg), /invalid WorkRecord.*revision/i);
});

test("RO-Crate writer rejects malformed runtime WorkRecords before emitting files", () => {
  const cases: Array<[string, (record: Record<string, unknown>) => void]> = [
    ["negative revision", (record) => { record.revision = -1; }],
    ["fractional revision", (record) => { record.revision = 1.5; }],
    ["unsafe revision", (record) => { record.revision = Number.MAX_SAFE_INTEGER + 1; }],
    ["nested track", (record) => { record.tracks = [{ id: "track-1", type: "unknown" }]; }],
  ];
  for (const [name, mutate] of cases) {
    const record = structuredClone(createEmptyRecord("wr-invalid-write", "Invalid write")) as unknown as Record<string, unknown>;
    mutate(record);
    assert.throws(() => writeRoCrate13(record as never), /invalid WorkRecord/, name);
  }
});
