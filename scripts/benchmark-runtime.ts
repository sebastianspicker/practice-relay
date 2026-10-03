/** Synthetic local performance comparisons; never reads configured user data. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { scryptSync } from "node:crypto";
import { createDurableRecordStore } from "@practice-relay/record-store";
import { addMember, createEmptyRecord } from "@practice-relay/work-record";
import { createAuthService } from "@practice-relay/auth";

async function measure(operation: () => Promise<unknown>): Promise<number> {
  const start = performance.now();
  await operation();
  return Number((performance.now() - start).toFixed(3));
}

async function benchmarkRecords(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "relay-record-benchmark-"));
  try {
    for (const count of [100, 1_000, 10_000]) {
      const fixtureRoot = path.join(root, String(count));
      for (const name of ["records", "events", "audit"]) await mkdir(path.join(fixtureRoot, name), { recursive: true, mode: 0o700 });
      const template = addMember(createEmptyRecord("template", "Synthetic"), { userId: "teacher-1", role: "faculty" });
      // Generate fixture files before opening the measured adapter; fixture creation is not a benchmark.
      for (let start = 0; start < count; start += 32) {
        await Promise.all(Array.from({ length: Math.min(32, count - start) }, (_, offset) => {
          const id = `record-${start + offset}`;
          return writeFile(path.join(fixtureRoot, "records", `${id}.json`), JSON.stringify({ ...template, id, revision: 0 }), { mode: 0o600 });
        }));
      }
      const store = createDurableRecordStore({ rootDir: fixtureRoot });
      try {
        const enumerateThenMutateMs = await measure(async () => {
          await store.list();
          await store.mutate("record-0", (record) => ({ ...record, title: "before" }));
        });
        const mutateMs = await measure(() => store.mutate("record-0", (record) => ({ ...record, title: "after" })));
        const getMs = await measure(() => store.get("record-0"));
        assert.equal((await store.get("record-0"))?.title, "after");
        assert.equal((await store.healthMetrics()).recordCount, count);
        console.log(JSON.stringify({ kind: "json-record", count, enumerateThenMutateMs, mutateMs, getMs }));
      } finally { await store.close(); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
}

async function benchmarkLogin(): Promise<void> {
  const salt = Buffer.alloc(16, 7);
  const syncStart = performance.now();
  for (let index = 0; index < 8; index += 1) scryptSync("incorrect", salt, 32, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const synchronousBlockMs = performance.now() - syncStart;
  const auth = createAuthService("benchmark-only-secret", []);
  const start = performance.now();
  const pending = Array.from({ length: 8 }, () => auth.login("unknown-user", "incorrect"));
  await new Promise((resolve) => setImmediate(resolve));
  const eventLoopYieldMs = performance.now() - start;
  await Promise.all(pending);
  console.log(JSON.stringify({ kind: "login", attempts: 8, synchronousBlockMs, eventLoopYieldMs, asyncTotalMs: performance.now() - start }));
}

await benchmarkRecords();
await benchmarkLogin();
