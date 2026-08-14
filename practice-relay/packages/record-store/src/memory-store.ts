/**
 * In-memory record-store adapter for tests and explicit non-durable deployments.
 *
 * Why: it preserves store semantics without persisting institutional data.
 */
import { randomBytes } from "node:crypto";
import type { WorkRecord } from "@practice-relay/work-record-core";
import type { BackupManifest, RecordEvent, RecordStoreAdapter } from "./types.js";
import { withNextRecordRevision } from "./record-revision.js";
import { safePathSegment } from "./store-safety.js";

function createMemorySnapshot(
  rootDir: string,
  tenantId: string | undefined,
  backupDir: string,
  records: WorkRecord[],
): BackupManifest {
  return {
    createdAt: new Date().toISOString(),
    rootDir,
    recordCount: records.length,
    recordIds: records.map((record) => record.id),
    backupDir,
    tenantId,
  };
}

/** Create an isolated non-durable record store for tests and explicit memory mode. */
export function createMemoryRecordStore(opts?: {
  tenantId?: string;
}): RecordStoreAdapter {
  const tenantId = opts?.tenantId;
  if (tenantId !== undefined) safePathSegment(tenantId);
  const map = new Map<string, WorkRecord>();
  const eventsByRecord = new Map<string, RecordEvent[]>();
  const audit: RecordEvent[] = [];
  const backups: BackupManifest[] = [];

  const store: RecordStoreAdapter = {
    rootDir: tenantId ? `:memory:${tenantId}` : ":memory:",
    tenantId,
    backend: "memory",
    create(record) {
      if (map.has(record.id)) throw new Error(`record ${record.id} already exists`);
      const withRev = {
        ...record,
        revision: 0,
      } as WorkRecord;
      map.set(record.id, withRev);
      this.appendEvent(record.id, "create");
      return withRev;
    },
    get(id) {
      return map.get(id);
    },
    list() {
      return [...map.values()];
    },
    update(id, record) {
      const prev = map.get(id);
      if (!prev) throw new Error(`record ${id} not found`);
      const next = withNextRecordRevision(id, prev, record);
      map.set(id, next);
      this.appendEvent(id, "update");
      return next;
    },
    delete(id) {
      const existed = map.delete(id);
      this.appendEvent(id, "delete");
      return existed;
    },
    listByMember(userId) {
      return this.list().filter((s) =>
        (s.members ?? []).some((m) => m.userId === userId),
      );
    },
    appendEvent(recordId, kind, detail?, actorId?) {
      const ev: RecordEvent = {
        at: new Date().toISOString(),
        kind,
        recordId,
        detail,
        actorId,
      };
      const list = eventsByRecord.get(recordId) ?? [];
      list.push(ev);
      eventsByRecord.set(recordId, list);
      audit.push(ev);
    },
    listEvents(recordId) {
      return [...(eventsByRecord.get(recordId) ?? [])];
    },
    listAllEvents() {
      return [...audit];
    },
    backup(backupRoot?) {
      const records = this.list();
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir =
        backupRoot ?? `:memory-backup:${stamp}-${randomBytes(4).toString("hex")}`;
      const manifest = createMemorySnapshot(
        this.rootDir,
        tenantId,
        backupDir,
        records,
      );
      backups.push(manifest);
      this.appendEvent("_system", "backup", manifest.backupDir);
      return manifest;
    },
    listBackups() {
      return [...backups];
    },
    restoreFromBackup(backupDir: string) {
      // Memory restore is a no-op beyond audit; real restore is JSON/fs path.
      this.appendEvent("_system", "restore", backupDir);
      return createMemorySnapshot(this.rootDir, tenantId, backupDir, this.list());
    },
    healthMetrics() {
      return {
        recordCount: map.size,
        auditEventCount: audit.length,
        rootDir: this.rootDir,
        durable: false,
        tenantId,
        backend: "memory",
      };
    },
  };
  return store;
}
