/** Transactional offline migration and retry checks in disposable PostgreSQL namespaces. */
import assert from "node:assert/strict";
import type { Database } from "@practice-relay/database";
import { importRecordSnapshot, createPostgresRecordStore } from "@practice-relay/record-store";
import { importMediaSnapshot } from "@practice-relay/media-store";
import { createEmptyRecord } from "@practice-relay/work-record";

/** Verify dry-run, revision preservation, audit-only retry rejection, and cross-adapter rollback. */
export async function verifyOfflineMigration(database: Database): Promise<void> {
  const at = new Date().toISOString();
  const auditOnly = { tenantId: "migration-audit-only", records: [], events: [{ at, recordId: "deleted", kind: "delete", actorId: "migration-actor" }] };
  await importRecordSnapshot(database, { ...auditOnly, dryRun: true });
  assert.equal((await createPostgresRecordStore({ database, tenantId: auditOnly.tenantId }).listAllEvents()).length, 0);
  await importRecordSnapshot(database, auditOnly);
  await assert.rejects(importRecordSnapshot(database, auditOnly), /destination conflict/);
  assert.equal((await createPostgresRecordStore({ database, tenantId: auditOnly.tenantId }).listAllEvents()).length, 1);
  const tenantId = "migration-atomic";
  const meta = { storageKey: "migrated/take.bin", recordId: "migrated", takeId: "take", contentType: "application/octet-stream", byteSize: 1, sha256: "a".repeat(64), createdAt: at };
  await database.transaction((transaction) => importMediaSnapshot(transaction, { tenantId, items: [meta], dryRun: false }));
  const record = { ...createEmptyRecord("migrated", "Migrated"), revision: 2 ** 31 + 17, members: [{ userId: "migration-actor", role: "faculty" as const }] };
  const snapshot = { tenantId, records: [record], events: [{ at, recordId: record.id, kind: "import", actorId: "migration-actor" }] };
  await assert.rejects(database.transaction(async (transaction) => {
    await importRecordSnapshot(transaction, snapshot);
    await importMediaSnapshot(transaction, { tenantId, items: [{ ...meta, sha256: "b".repeat(64) }], dryRun: false });
  }), /conflict|not empty/);
  const store = createPostgresRecordStore({ database, tenantId });
  assert.equal(await store.get(record.id), undefined);
  assert.equal((await store.listAllEvents()).length, 0);
  await importRecordSnapshot(database, snapshot);
  assert.deepEqual(await store.get(record.id), record);
  const page = await store.listSummariesByMember("migration-actor", { limit: 1 });
  assert.equal(page.items[0]?.revision, record.revision);
  assert.equal((await store.listAllEvents())[0]?.actorId, "migration-actor");
}
