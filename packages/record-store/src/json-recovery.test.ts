/** Reopen durable on-disk crash states and verify idempotent JSON recovery. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createEmptyRecord } from "@practice-relay/work-record";
import { createDurableRecordStore } from "./durable-store.js";

function privateJson(file: string, value: unknown): void {
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
}

for (const phase of ["intent", "record", "partial-event", "partial-audit", "counters"] as const) {
  test(`JSON WAL recovers ${phase} exactly once, including interrupted UTF-8`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "relay-wal-crash-"));
    try {
      const store = createDurableRecordStore({ rootDir: root });
      const before = await store.create(createEmptyRecord("record", "Before"));
      const next = { ...before, title: "Après", revision: 1 };
      const eventFile = path.join(root, "events/record.jsonl");
      const auditFile = path.join(root, "audit/audit.jsonl");
      const oldEvent = readFileSync(eventFile), oldAudit = readFileSync(auditFile);
      const operationId = randomUUID();
      const event = { at: new Date().toISOString(), kind: "rename", recordId: "record", detail: "café", actorId: "actor", operationId };
      const counters = { recordCount: 1, auditEventCount: 2 };
      privateJson(path.join(root, "journal/pending.json"), { version: 1, operationId, recordId: "record", nextRecord: next, event, counters, eventLogLength: oldEvent.length, auditLogLength: oldAudit.length });
      const line = Buffer.from(`${JSON.stringify(event)}\n`);
      const cut = line.indexOf(Buffer.from("é")) + 1;
      if (phase !== "intent") privateJson(path.join(root, "records/record.json"), next);
      if (phase === "partial-event") writeFileSync(eventFile, Buffer.concat([oldEvent, line.subarray(0, cut)]));
      if (phase === "partial-audit" || phase === "counters") {
        writeFileSync(eventFile, Buffer.concat([oldEvent, line]));
        writeFileSync(auditFile, Buffer.concat([oldAudit, phase === "partial-audit" ? line.subarray(0, cut) : line]));
      }
      if (phase === "counters") privateJson(path.join(root, "journal/counters.json"), counters);
      const recovered = createDurableRecordStore({ rootDir: root });
      assert.deepEqual(await recovered.get("record"), next);
      assert.equal((await recovered.listEvents("record")).length, 2);
      assert.equal((await recovered.listAllEvents()).at(-1)?.detail, "café");
      assert.equal((await recovered.healthMetrics()).auditEventCount, 2);
      const again = createDurableRecordStore({ rootDir: root });
      assert.equal((await again.listAllEvents()).length, 2);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

for (const swaps of [0, 1, 2, 3, 4, 5, 6]) {
  test(`JSON restore reopens safely after ${swaps} directory rename steps`, async () => {
    const root = mkdtempSync(path.join(tmpdir(), "relay-restore-crash-"));
    try {
      const original = createDurableRecordStore({ rootDir: root });
      await original.create(createEmptyRecord("old", "Previous snapshot"));
      const stageName = `restore-${randomUUID()}`;
      const stage = path.join(root, "journal", stageName);
      mkdirSync(stage, { mode: 0o700 });
      for (const name of ["records", "events", "audit"]) mkdirSync(path.join(stage, `next-${name}`), { mode: 0o700 });
      const restored = { ...createEmptyRecord("restored", "Validated snapshot"), revision: 7 };
      privateJson(path.join(stage, "next-records/restored.json"), restored);
      privateJson(path.join(root, "journal/restore.json"), { version: 1, stageName, operationId: randomUUID(), source: "offline-backup", recordIds: ["restored"], auditEventCount: 0, event: { at: new Date().toISOString(), recordId: "_system", kind: "restore", detail: "offline-backup" } });
      let step = 0;
      for (const name of ["records", "events", "audit"]) {
        if (step++ < swaps) renameSync(path.join(root, name), path.join(stage, `previous-${name}`));
        if (step++ < swaps) renameSync(path.join(stage, `next-${name}`), path.join(root, name));
      }
      const recovered = createDurableRecordStore({ rootDir: root });
      assert.equal(await recovered.get("old"), undefined);
      assert.deepEqual(await recovered.get("restored"), restored);
      assert.equal((await recovered.listAllEvents()).length, 1);
      assert.equal((await recovered.healthMetrics()).recordCount, 1);
      assert.equal((await createDurableRecordStore({ rootDir: root }).listAllEvents()).length, 1);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}

test("JSON backups retain deleted-record and system events in both audit representations", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "relay-backup-audit-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    await store.create(createEmptyRecord("deleted", "Deleted"));
    await store.delete("deleted");
    await store.appendEvent("_system", "maintenance");
    const backup = await store.backup();
    await store.restoreFromBackup(backup.backupDir);
    assert.equal((await store.listEvents("deleted")).length, 2);
    assert.equal((await store.listAllEvents()).filter((event) => event.kind === "maintenance").length, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test("startup removes recognized abandoned publication, deletion, and restore data", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "relay-json-orphans-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    await store.create(createEmptyRecord("keep", "Keep"));
    const temporary = path.join(root, "records/.keep.json.123.0123456789abcdefab.tmp");
    const quarantine = path.join(root, "records/.deleted.json.123.0123456789abcdefab.removing");
    const unknown = path.join(root, "records/.user-note");
    for (const file of [temporary, quarantine, unknown]) privateJson(file, { private: "previous content" });
    const stage = path.join(root, "journal", `restore-${randomUUID()}`);
    mkdirSync(stage, { mode: 0o700 });
    privateJson(path.join(stage, "private.json"), { private: "old snapshot" });
    const reopened = createDurableRecordStore({ rootDir: root });
    assert.equal((await reopened.get("keep"))?.title, "Keep");
    for (const file of [temporary, quarantine, stage]) assert.equal(existsSync(file), false);
    assert.equal(existsSync(unknown), true, "unrecognized user files are retained");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("restore rejects misattributed or malformed audit copies before replacing records", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "relay-json-bad-audit-"));
  try {
    const store = createDurableRecordStore({ rootDir: root });
    await store.create(createEmptyRecord("source", "Source"));
    const backup = await store.backup();
    const correct = { at: new Date().toISOString(), kind: "create", recordId: "source" };
    for (const event of [{ ...correct, recordId: "other" }, { ...correct, at: "not-a-date" }, { ...correct, actorId: {} }, { ...correct, hidden: { participant: "private" } }]) {
      const line = `${JSON.stringify(event)}\n`;
      writeFileSync(path.join(backup.backupDir, "events/source.jsonl"), line);
      writeFileSync(path.join(backup.backupDir, "audit/audit.jsonl"), line);
      await assert.rejects(store.restoreFromBackup(backup.backupDir), /invalid event log/);
      assert.equal((await store.get("source"))?.title, "Source");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
