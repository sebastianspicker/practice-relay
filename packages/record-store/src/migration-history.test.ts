/** Persisted-format golden: released record-store migrations are immutable history. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { migrateRecordStore, RECORD_STORE_MIGRATIONS } from "./index.ts";

const GOLDEN = [
  { id: "0001_record_store", sha256: "2c4c1446face4d5bf037c8b2c229554754b67496d9073cea7e3292126943c74e" },
];

test("record-store migration ids and SQL hashes match the released history", () => {
  const actual = RECORD_STORE_MIGRATIONS.map((migration) => ({
    id: migration.id,
    sha256: createHash("sha256").update(migration.sql).digest("hex"),
  }));
  assert.deepEqual(
    actual.slice(0, GOLDEN.length),
    GOLDEN,
    "historical migrations are immutable: add a new numbered migration instead of editing a released one",
  );
});

test("record-store migrations apply under the record-store component", async () => {
  const lockValues: unknown[] = [];
  const database = {
    async query(text: string, values?: readonly unknown[]) {
      if (text.startsWith("SELECT pg_advisory_xact_lock")) lockValues.push(values);
      return { rows: [], rowCount: 0 };
    },
    transaction: async <T>(fn: (db: unknown) => Promise<T>) => fn(database),
  };
  await migrateRecordStore(database as never);
  assert.deepEqual(lockValues, [["practice-relay:migrate:record-store"]]);
});
