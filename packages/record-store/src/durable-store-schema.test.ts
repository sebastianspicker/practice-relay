/** Durable records must pass the canonical WorkRecord parser after JSON decode. */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import test from "node:test";
import { isWorkRecordInvalid } from "@practice-relay/work-record";
import { createDurableRecordStore } from "./index.ts";

const fixture = readFileSync(
  new URL("../fixtures/persisted-work-record-v0.4.json", import.meta.url),
  "utf8",
);

test("durable store accepts the persisted WorkRecord v0.4 compatibility fixture", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "work-record-fixture-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    writeFileSync(path.join(root, "records", "persisted-record.json"), fixture, "utf8");
    assert.equal((await store.get("persisted-record"))?.revision, 7);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("durable store reports schema errors instead of accepting malformed persisted JSON", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "work-record-invalid-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    const malformed = JSON.parse(fixture) as { revision: number };
    malformed.revision = -1;
    writeFileSync(path.join(root, "records", "persisted-record.json"), JSON.stringify(malformed), "utf8");
    await assert.rejects(async () => (await store.get("persisted-record")), /invalid record file.*invalid WorkRecord.*revision/i);
    // Stored-data corruption is an infrastructure failure, not client-attributable validation.
    await assert.rejects(async () => (await store.get("persisted-record")), (err) => !isWorkRecordInvalid(err));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("durable store validates direct persistence inputs through the same boundary", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "work-record-direct-invalid-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    const malformed = JSON.parse(fixture) as { revision: number };
    malformed.revision = 1.5;
    await assert.rejects(async () => (await store.create(malformed as never)), /invalid WorkRecord.*revision/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
