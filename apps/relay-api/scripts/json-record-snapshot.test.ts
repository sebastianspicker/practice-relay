/** Offline inventory must preserve source bytes and fail on inconsistent audit copies. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDurableRecordStore } from "@practice-relay/record-store";
import { createEmptyRecord } from "@practice-relay/work-record";
import { readJsonRecordSnapshot } from "./json-record-snapshot.ts";

test("snapshot reads retain revisions and audits without rewriting the source", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "relay-snapshot-test-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    await store.create(createEmptyRecord("snapshot", "Source"));
    await store.mutate("snapshot", (record) => ({ ...record, title: "Edited" }), { actorId: "actor", kind: "rename" });
    const file = path.join(root, "records", "snapshot.json");
    const before = await readFile(file);
    const snapshot = await readJsonRecordSnapshot(root);
    assert.equal(snapshot.records[0].revision, 1);
    assert.equal(snapshot.events.at(-1)?.actorId, "actor");
    assert.deepEqual(await readFile(file), before);
    await writeFile(path.join(root, "events", "snapshot.jsonl"), "", { mode: 0o600 });
    await assert.rejects(readJsonRecordSnapshot(root), /audit disagree/);
    await store.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("snapshot rejects a pending journal even when both audit copies still agree", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "relay-pending-snapshot-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    await store.create(createEmptyRecord("snapshot", "Source"));
    await writeFile(path.join(root, "journal", "pending.json"), "{}", { mode: 0o600 });
    await assert.rejects(readJsonRecordSnapshot(root), /unfinished JSON recovery/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
