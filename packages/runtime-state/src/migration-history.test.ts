/** Persisted-format golden: released runtime-state migrations are immutable history. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { migrateRuntimeState, RUNTIME_STATE_MIGRATIONS } from "./index.ts";

const GOLDEN = [
  { id: "0001_runtime_state", sha256: "c9e400471f35919cbee55dc5ffb9e4deba05da7dbafe9176b64946c3d3fbc079" },
];

test("runtime-state migration ids and SQL hashes match the released history", () => {
  const actual = RUNTIME_STATE_MIGRATIONS.map((migration) => ({
    id: migration.id,
    sha256: createHash("sha256").update(migration.sql).digest("hex"),
  }));
  assert.deepEqual(
    actual.slice(0, GOLDEN.length),
    GOLDEN,
    "historical migrations are immutable: add a new numbered migration instead of editing a released one",
  );
});

test("runtime-state migrations apply under the runtime-state component", async () => {
  const lockValues: unknown[] = [];
  const database = {
    async query(text: string, values?: readonly unknown[]) {
      if (text.startsWith("SELECT pg_advisory_xact_lock")) lockValues.push(values);
      return { rows: [], rowCount: 0 };
    },
    transaction: async <T>(fn: (db: unknown) => Promise<T>) => fn(database),
  };
  await migrateRuntimeState(database as never);
  assert.deepEqual(lockValues, [["practice-relay:migrate:runtime-state"]]);
});
