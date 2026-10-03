/** Characterization of shared database migration and transaction behavior using a fake Database. */
import assert from "node:assert/strict";
import { test } from "node:test";
import pg from "pg";
import {
  createDatabase,
  migrateDatabase,
  requireDatabaseMigrations,
  type Database,
  type DatabaseMigration,
  type DatabaseQueryResult,
} from "./index.ts";

type Call = { text: string; values?: readonly unknown[]; inTransaction: boolean };

/** Fake whose transaction() records calls and keeps already-applied ids in `applied`. */
function fakeDatabase(applied = new Set<string>()): { database: Database; calls: Call[]; transactions: () => number } {
  const calls: Call[] = [];
  let transactions = 0;
  const make = (inTransaction: boolean): Database => ({
    async query(text, values) {
      calls.push({ text, values, inTransaction });
      const result = { rows: [], rowCount: 0 } as DatabaseQueryResult<never>;
      if (text.startsWith("SELECT migration_id FROM practice_relay_migrations WHERE component")) {
        const found = applied.has(`${String(values?.[0])}/${String(values?.[1])}`);
        return { rows: found ? [{ migration_id: String(values?.[1]) }] : [], rowCount: found ? 1 : 0 } as never;
      }
      if (text.startsWith("INSERT INTO practice_relay_migrations")) {
        applied.add(`${String(values?.[0])}/${String(values?.[1])}`);
      }
      return result;
    },
    async transaction(fn) { transactions += 1; return fn(make(true)); },
    async checkHealth() {},
    async close() {},
  });
  return { database: make(false), calls, transactions: () => transactions };
}

const migrations: readonly DatabaseMigration[] = [
  { id: "0001_first", sql: "CREATE TABLE first_table (id int)" },
  { id: "0002_second", sql: "CREATE TABLE second_table (id int)" },
];

test("createDatabase rejects an empty or blank connection string", () => {
  assert.throws(() => createDatabase({ connectionString: "" }), { message: "database connectionString is required" });
  assert.throws(() => createDatabase({ connectionString: "   " }), { message: "database connectionString is required" });
});

test("migrateDatabase runs one transaction: table, advisory lock, then each migration in order", async () => {
  const { database, calls, transactions } = fakeDatabase();
  await migrateDatabase(database, "record-store", migrations);
  assert.equal(transactions(), 1);
  assert.ok(calls.every((call) => call.inTransaction));
  assert.match(calls[0]!.text, /^\s*CREATE TABLE IF NOT EXISTS practice_relay_migrations/u);
  assert.equal(calls[1]!.text, "SELECT pg_advisory_xact_lock(hashtext($1))");
  assert.deepEqual(calls[1]!.values, ["practice-relay:migrate:record-store"]);
  assert.deepEqual(calls.slice(2).map((call) => call.text), [
    "SELECT migration_id FROM practice_relay_migrations WHERE component = $1 AND migration_id = $2",
    "CREATE TABLE first_table (id int)",
    "INSERT INTO practice_relay_migrations (component, migration_id) VALUES ($1, $2)",
    "SELECT migration_id FROM practice_relay_migrations WHERE component = $1 AND migration_id = $2",
    "CREATE TABLE second_table (id int)",
    "INSERT INTO practice_relay_migrations (component, migration_id) VALUES ($1, $2)",
  ]);
  assert.deepEqual(calls[2]!.values, ["record-store", "0001_first"]);
  assert.deepEqual(calls[4]!.values, ["record-store", "0001_first"]);
  assert.deepEqual(calls[7]!.values, ["record-store", "0002_second"]);
});

test("migrateDatabase issues the advisory lock once per component call", async () => {
  const { database, calls } = fakeDatabase();
  await migrateDatabase(database, "media-store", []);
  await migrateDatabase(database, "runtime-state", []);
  const locks = calls.filter((call) => call.text.startsWith("SELECT pg_advisory_xact_lock"));
  assert.deepEqual(locks.map((call) => call.values), [
    ["practice-relay:migrate:media-store"],
    ["practice-relay:migrate:runtime-state"],
  ]);
});

test("migrateDatabase defaults to the database component with no migrations", async () => {
  const { database, calls } = fakeDatabase();
  await migrateDatabase(database);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1]!.values, ["practice-relay:migrate:database"]);
});

test("migrateDatabase skips ids already recorded, making re-application idempotent", async () => {
  const { database, calls } = fakeDatabase();
  await migrateDatabase(database, "record-store", migrations);
  calls.length = 0;
  await migrateDatabase(database, "record-store", migrations);
  assert.deepEqual(calls.map((call) => call.text.slice(0, 20)), [
    "\nCREATE TABLE IF NOT",
    "SELECT pg_advisory_x",
    "SELECT migration_id ",
    "SELECT migration_id ",
  ]);
  assert.ok(!calls.some((call) => call.text.startsWith("CREATE TABLE first") || call.text.startsWith("INSERT")));
});

test("migrateDatabase applies only the migrations that are not yet recorded", async () => {
  const { database, calls } = fakeDatabase(new Set(["record-store/0001_first"]));
  await migrateDatabase(database, "record-store", migrations);
  const sql = calls.map((call) => call.text).filter((text) => text.startsWith("CREATE TABLE ") && !text.includes("IF NOT EXISTS"));
  assert.deepEqual(sql, ["CREATE TABLE second_table (id int)"]);
});

test("migrateDatabase rejects invalid component names before opening a transaction", async () => {
  for (const component of ["", "Upper", "1abc", "has space", "a.b", "-lead"]) {
    const { database, transactions } = fakeDatabase();
    await assert.rejects(migrateDatabase(database, component, []), { message: "invalid database migration component" });
    assert.equal(transactions(), 0);
  }
  const { database } = fakeDatabase();
  await migrateDatabase(database, "a-b_c1", []);
});

test("migrateDatabase rejects malformed and duplicate migration ids before opening a transaction", async () => {
  for (const id of ["1_short", "00001_long", "0001_Upper", "0001-dash", "0001_", "0001", "x0001_a", "0001_a b", ""]) {
    const { database, transactions } = fakeDatabase();
    await assert.rejects(
      migrateDatabase(database, "record-store", [{ id, sql: "SELECT 1" }]),
      { message: `invalid or duplicate migration id ${JSON.stringify(id)}` },
    );
    assert.equal(transactions(), 0);
  }
  const { database, transactions } = fakeDatabase();
  await assert.rejects(
    migrateDatabase(database, "record-store", [
      { id: "0001_same", sql: "SELECT 1" },
      { id: "0001_same", sql: "SELECT 2" },
    ]),
    { message: 'invalid or duplicate migration id "0001_same"' },
  );
  assert.equal(transactions(), 0);
});

test("requireDatabaseMigrations passes when every id is recorded", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const database = { async query(text: string, values?: readonly unknown[]) {
    calls.push({ text, values });
    return { rows: [{ migration_id: "0001_a" }, { migration_id: "0002_b" }], rowCount: 2 };
  } } as unknown as Database;
  await requireDatabaseMigrations(database, "media-store", ["0001_a", "0002_b"]);
  assert.deepEqual(calls, [{
    text: "SELECT migration_id FROM practice_relay_migrations WHERE component = $1 AND migration_id = ANY($2::text[])",
    values: ["media-store", ["0001_a", "0002_b"]],
  }]);
});

test("requireDatabaseMigrations lists missing ids in the error message", async () => {
  const database = { async query() { return { rows: [{ migration_id: "0001_a" }], rowCount: 1 }; } } as unknown as Database;
  await assert.rejects(
    requireDatabaseMigrations(database, "record-store", ["0001_a", "0002_b", "0003_c"]),
    { message: "database migrations for record-store are missing: 0002_b, 0003_c" },
  );
});

test("requireDatabaseMigrations wraps query failures and non-Error causes", async () => {
  const failing = (cause: unknown) => ({ async query() { throw cause; } }) as unknown as Database;
  await assert.rejects(
    requireDatabaseMigrations(failing(new Error('relation "practice_relay_migrations" does not exist')), "runtime-state", ["0001_x"]),
    { message: 'database migrations for runtime-state are missing: relation "practice_relay_migrations" does not exist' },
  );
  await assert.rejects(
    requireDatabaseMigrations(failing("boom"), "runtime-state", ["0001_x"]),
    { message: "database migrations for runtime-state are missing: boom" },
  );
});

test("requireDatabaseMigrations with no required ids succeeds on an empty result", async () => {
  const database = { async query() { return { rows: [], rowCount: 0 }; } } as unknown as Database;
  await requireDatabaseMigrations(database, "anything", []);
});

/** Run createDatabase against a pg Pool whose connect() hands out a scripted client. */
async function withScriptedPool<T>(
  failOn: string | undefined,
  run: (database: Database, log: string[]) => Promise<T>,
): Promise<T> {
  const log: string[] = [];
  const client = {
    async query(text: string) {
      log.push(text);
      if (text === failOn) throw new Error(`scripted failure on ${text}`);
      return { rows: [], rowCount: 0 };
    },
    release() { log.push("release"); },
  };
  const original = pg.Pool.prototype.connect;
  (pg.Pool.prototype as unknown as { connect: () => Promise<typeof client> }).connect = async () => client;
  try {
    return await run(createDatabase({ connectionString: "postgres://user:pw@127.0.0.1:1/none" }), log);
  } finally {
    pg.Pool.prototype.connect = original;
  }
}

test("transaction commits, releases the client, and flattens nested transactions", async () => {
  await withScriptedPool(undefined, async (database, log) => {
    const result = await database.transaction(async (outer) => {
      await outer.query("SELECT outer_query");
      const nested = await outer.transaction(async (inner) => {
        assert.equal(inner, outer);
        await inner.query("SELECT inner_query");
        return "inner-result";
      });
      await outer.close();
      return nested;
    });
    assert.equal(result, "inner-result");
    assert.deepEqual(log, ["BEGIN", "SELECT outer_query", "SELECT inner_query", "COMMIT", "release"]);
  });
});

test("transaction rolls back, releases, and rethrows when the callback fails", async () => {
  await withScriptedPool(undefined, async (database, log) => {
    await assert.rejects(
      database.transaction(async (tx) => {
        await tx.query("SELECT before_failure");
        await tx.transaction(async () => { throw new Error("nested failure"); });
      }),
      { message: "nested failure" },
    );
    assert.deepEqual(log, ["BEGIN", "SELECT before_failure", "ROLLBACK", "release"]);
  });
});

test("transaction rolls back and rethrows when COMMIT itself fails", async () => {
  await withScriptedPool("COMMIT", async (database, log) => {
    await assert.rejects(database.transaction(async () => "ok"), { message: "scripted failure on COMMIT" });
    assert.deepEqual(log, ["BEGIN", "COMMIT", "ROLLBACK", "release"]);
  });
});
