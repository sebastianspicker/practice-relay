/** Schema-boundary parity for the swappable JSON and in-memory adapters. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEmptyRecord, isWorkRecordInvalid, parseWorkRecord, type WorkRecord } from "@practice-relay/work-record";
import { createDurableRecordStore, createMemoryRecordStore } from "./index.ts";

type MalformedCase = readonly [name: string, mutate: (record: Record<string, unknown>) => void];

const malformedCases: readonly MalformedCase[] = [
  ["nested member", (record) => { record.members = [{ userId: 42, role: "student" }]; }],
  ["negative revision", (record) => { record.revision = -1; }],
  ["fractional revision", (record) => { record.revision = 1.5; }],
  ["unsafe revision", (record) => { record.revision = 9_007_199_254_740_992; }],
  ["hybrid spine without meter", (record) => {
    record.spine = {
      schemaVersion: "0.1.0",
      mode: "hybrid",
      durationMs: 1_000,
      markers: [],
      regions: [],
    };
  }],
  ["invalid track", (record) => { record.tracks = [{ id: "track-1", type: "unknown" }]; }],
  ["missing preferred take", (record) => { record.preferredTakeId = "take-missing"; }],
  ["duplicate take id", (record) => { record.takeIds = ["take-1", "take-1"]; }],
];

/** Write-side schema rejections carry the stable validation code, not just a message. */
const invalidWrite = (err: unknown): boolean => isWorkRecordInvalid(err) && /invalid WorkRecord/.test(err.message);

function cloneRecord(record: WorkRecord): Record<string, unknown> {
  return structuredClone(record) as unknown as Record<string, unknown>;
}

test("JSON and memory stores reject the same malformed WorkRecords without state changes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "work-record-store-schema-"));
  try {
    const stores = [
      createDurableRecordStore({ rootDir: root }),
      createMemoryRecordStore(),
    ];
    for (const store of stores) {
      const id = `schema-${store.backend}`;
      const created = (await store.create(createEmptyRecord(id, "Schema boundary")));
      assert.equal(created.revision, 0);
      assert.deepEqual(parseWorkRecord(created), created);

      const updated = (await store.update(id, { ...created, title: "Schema boundary updated" }));
      assert.equal(updated.revision, 1);
      assert.deepEqual(parseWorkRecord(updated), updated);

      for (const [name, mutate] of malformedCases) {
        const before = (await store.get(id))!;
        const eventCount = (await store.listAllEvents()).length;
        const createCandidate = cloneRecord(before);
        createCandidate.id = `${id}-${name.replaceAll(" ", "-")}`;
        mutate(createCandidate);
        await assert.rejects(
          async () => (await store.create(createCandidate as never)),
          invalidWrite,
          `${store.backend} create ${name}`,
        );
        assert.equal((await store.get(createCandidate.id as string)), undefined);
        assert.deepEqual((await store.get(id)), before);
        assert.equal((await store.listAllEvents()).length, eventCount);

        const updateCandidate = cloneRecord(before);
        mutate(updateCandidate);
        await assert.rejects(
          async () => (await store.update(id, updateCandidate as never)),
          invalidWrite,
          `${store.backend} update ${name}`,
        );
        await assert.rejects(
          async () => (await store.mutate(id, () => updateCandidate as never)),
          invalidWrite,
          `${store.backend} mutate ${name}`,
        );
        assert.deepEqual((await store.get(id)), before);
        assert.equal((await store.listAllEvents()).length, eventCount);
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
