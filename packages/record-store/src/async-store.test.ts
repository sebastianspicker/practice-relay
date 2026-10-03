/** Async adapter contracts for atomic mutation, pagination, and JSON point access. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createEmptyRecord } from "@practice-relay/work-record";
import { createDurableRecordStore, createMemoryRecordStore } from "./index.ts";

test("mutate observes the latest revision and records supplied audit context", async () => {
  for (const store of [createMemoryRecordStore()]) {
    const created = await store.create(createEmptyRecord("atomic", "Initial"));
    const saved = await store.mutate(
      "atomic",
      (latest) => {
        assert.equal(latest.revision, created.revision);
        return { ...latest, title: "Changed" };
      },
      { expectedRevision: 0, actorId: "faculty-1", kind: "rename", detail: "title" },
    );
    assert.equal(saved.revision, 1);
    assert.equal(saved.title, "Changed");
    assert.deepEqual((await store.listEvents("atomic")).at(-1), {
      at: (await store.listEvents("atomic")).at(-1)?.at,
      kind: "rename",
      recordId: "atomic",
      detail: "title",
      actorId: "faculty-1",
    });
    await assert.rejects(
      store.mutate("atomic", (latest) => latest, { expectedRevision: 0 }),
      /revision conflict/i,
    );
    await assert.rejects(
      store.mutate("atomic", (() => Promise.resolve(saved)) as never),
      /transition must be synchronous/i,
    );
  }
});

test("summary keyset traversal uses one code-unit ordering and literal substring filtering", async () => {
  const store = createMemoryRecordStore();
  for (const [id, title] of [["A", "Alpha"], ["B", "Beta"], ["a", "Gamma"], ["a-1", "Alphabet"]]) {
    await store.create({
      ...createEmptyRecord(id, title),
      members: [{ userId: "member", role: "student" }],
    });
  }
  const visited: string[] = [];
  let after: string | undefined;
  do {
    const page = await store.listSummariesByMember("member", { after, limit: 1 });
    visited.push(...page.items.map((item) => item.id));
    after = page.hasMore ? page.items.at(-1)?.id : undefined;
    if (!page.hasMore) break;
  } while (after !== undefined);
  assert.deepEqual(visited, ["A", "B", "a", "a-1"]);
  assert.deepEqual(
    (await store.listSummariesByMember("member", { title: "pha", limit: 10 })).items.map((item) => item.id),
    ["A", "a-1"],
  );
});

test("JSON point operations do not enumerate unrelated corrupt records", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "record-point-operation-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    const created = await store.create(createEmptyRecord("valid", "Valid"));
    writeFileSync(path.join(root, "records", "unrelated.json"), "{", "utf8");
    assert.equal((await store.get("valid"))?.title, "Valid");
    assert.equal((await store.update("valid", { ...created, title: "Updated" })).title, "Updated");
    assert.equal(await store.delete("valid"), true);
    await store.create(createEmptyRecord("new", "New"));
    await assert.rejects(store.list(), /invalid record file.*unrelated/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
