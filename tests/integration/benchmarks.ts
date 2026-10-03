/** Cardinality and query-budget measurements against disposable PostgreSQL. */
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import type { Database } from "@practice-relay/database";
import { createPostgresRecordStore } from "@practice-relay/record-store";
import { createEmptyRecord } from "@practice-relay/work-record";

/** Seed canonical synthetic records, then measure bounded point and page operations. */
export async function benchmarkPostgres(database: Database): Promise<void> {
  const reports: Record<string, number>[] = [];
  for (const count of [100, 1_000, 10_000]) {
    const tenantId = `benchmark-${count}`;
    const documents = Array.from({ length: count }, (_, index) => ({ ...createEmptyRecord(`record-${String(index).padStart(5, "0")}`, "Benchmark"), members: [{ userId: "benchmark-user", role: "faculty" }], revision: 0 }));
    await database.query(`INSERT INTO practice_relay_work_records (tenant_id,record_id,document)
      SELECT $1, document->>'id', document FROM jsonb_array_elements($2::jsonb) AS document`, [tenantId, JSON.stringify(documents)]);
    await database.query("INSERT INTO practice_relay_record_store_counters (tenant_id,record_count,audit_event_count) VALUES ($1,$2,0)", [tenantId, count]);
    let queries = 0;
    const instrument = (connection: Database): Database => ({
      query: (sql, values) => { queries += 1; return connection.query(sql, values); },
      transaction: (operation) => connection.transaction((transaction) => operation(instrument(transaction))),
      checkHealth: () => connection.checkHealth(), close: async () => undefined,
    });
    const store = createPostgresRecordStore({ database: instrument(database), tenantId });
    await store.checkHealth(); queries = 0;
    const start = performance.now();
    await store.mutate("record-00000", (record) => ({ ...record, title: "Measured" }));
    const mutationMs = performance.now() - start, mutationQueries = queries;
    assert.ok(mutationQueries <= 6, "mutation query budget must not grow with collection size");
    queries = 0;
    const readStart = performance.now(); await store.get("record-00000");
    const readMs = performance.now() - readStart;
    assert.equal(queries, 1, "point reads issue one canonical lookup");
    queries = 0;
    const pageStart = performance.now();
    const page = await store.listSummariesByMember("benchmark-user", { limit: 50 });
    const pageMs = performance.now() - pageStart;
    assert.equal(queries, 1); assert.equal(page.items.length, 50); assert.ok(page.hasMore);
    reports.push({ count, mutationMs, mutationQueries, readMs, pageMs });
  }
  console.log(JSON.stringify({ postgresBenchmarks: reports }));
}
